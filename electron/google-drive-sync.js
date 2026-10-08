const { getDriveClient } = require('./oauth-handler');
const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const library = require('./library-store');

class GoogleDriveSync {
    constructor(assertCurrent = () => {}) { this.drive = null; this.assertCurrent = assertCurrent; this.remoteVersion = new Map(); }
    createSession(assertCurrent) { return new GoogleDriveSync(assertCurrent); }
    async initialize() {
        this.assertCurrent();
        if (!this.drive) this.drive = await getDriveClient();
        this.assertCurrent();
        return !!this.drive;
    }
    async findFile(name) {
        this.assertCurrent();
        if (!this.drive) return null;
        const response = await this.drive.files.list({ spaces: 'appDataFolder', q: `name = '${name}' and trashed = false`, fields: 'files(id, name, modifiedTime)', pageSize: 100 });
        this.assertCurrent();
        if (response.data.files.length > 1) throw new Error('Duplicate cloud libraries found. Preserve both copies and contact support to resolve them.');
        return response.data.files[0] || null;
    }
    async uploadFile(name, localPath) {
        if (!(await this.initialize())) throw new Error('Google Drive is not connected');
        const existing = await this.findFile(name);
        const expected = this.remoteVersion.get(name);
        if (expected && expected.id !== (existing?.id || null)) throw new Error('Cloud library changed during sync. Retry sync.');
        const media = { mimeType: 'application/json', body: fs.createReadStream(localPath) };
        try {
            this.assertCurrent();
            if (existing) {
                if (!expected?.etag) throw new Error('Drive did not supply a revision token; refusing to overwrite a library without conflict protection.');
                await this.drive.files.update({ fileId: existing.id, media }, { headers: { 'If-Match': expected.etag } });
            } else {
                await this.drive.files.create({ requestBody: { name, parents: ['appDataFolder'] }, media, fields: 'id' });
            }
            this.assertCurrent();
            return true;
        } finally { media.body.destroy(); }
    }
    validateData(name, data, options) { return library.documentFrom(name, data, options); }
    attachmentDir(localPath) {
        const dir = path.join(path.dirname(localPath), 'template-files');
        fs.mkdirSync(dir, { recursive: true });
        if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('Template storage cannot be a symbolic link');
        return fs.realpathSync(dir);
    }
    packTemplates(localPath, data) {
        library.validateData('user-templates.json', data);
        const root = this.attachmentDir(localPath);
        return data.map(item => {
            if (item.type !== 'file') return item;
            if (item.attachment) return item;
            const file = fs.realpathSync(item.filePath);
            if (path.dirname(file) !== root) throw new Error('Template attachment is outside storage');
            if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('Template attachment exceeds 20 MB');
            const bytes = fs.readFileSync(file), ext = item.ext.toLowerCase();
            const { filePath, ...record } = item;
            return { ...record, ext, attachment: { id: createHash('sha256').update(bytes).digest('hex'), ext, base64: bytes.toString('base64') } };
        });
    }
    materializeTemplates(localPath, data) {
        // Validate every record and every attachment before creating any files.
        library.validateData('user-templates.json', data, { remote: true });
        const root = this.attachmentDir(localPath);
        return data.map(item => {
            if (item.type !== 'file') return item;
            const { id, ext, base64 } = item.attachment;
            const file = path.join(root, id + '.' + ext);
            if (fs.existsSync(file) && fs.realpathSync(file) !== file) throw new Error('Invalid attachment destination');
            if (fs.existsSync(file) && createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== id) throw new Error('Stored attachment checksum failed');
            if (!fs.existsSync(file)) library.atomicWrite(file, Buffer.from(base64, 'base64'));
            const { attachment, ...record } = item;
            return { ...record, filePath: file };
        });
    }
    mapRecords(document, map) {
        const records = map(library.values(document));
        const byId = new Map(records.map(item => [item.id, item]));
        return { ...document, entries: document.entries.map(item => item.value === null ? item : { ...item, value: byId.get(item.key) }) };
    }
    writeLocal(localPath, data) { this.assertCurrent(); library.writeJson(localPath, data, fs); }
    async getRemoteData(name) {
        if (!(await this.initialize())) throw new Error('Google Drive is not connected');
        const file = await this.findFile(name);
        if (!file) { this.remoteVersion.set(name, { id: null }); return null; }
        const metadata = await this.drive.files.get({ fileId: file.id, fields: 'id,version' });
        this.assertCurrent();
        const etag = metadata.headers?.get?.('etag') || metadata.headers?.etag;
        const response = await this.drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'text' });
        this.assertCurrent();
        const after = await this.drive.files.get({ fileId: file.id, fields: 'id,version' });
        this.assertCurrent();
        if (metadata.data.version !== after.data.version) throw new Error('Cloud library changed during download. Retry sync.');
        this.remoteVersion.set(name, { id: file.id, etag });
        const content = response.data;
        if (typeof content === 'string') {
            if (Buffer.byteLength(content) > 100 * 1024 * 1024) throw new Error('Cloud library exceeds 100 MB');
            return JSON.parse(content);
        }
        return content;
    }
    async downloadFile(name, localPath) { return this.sync(name, localPath, 'pull'); }
    async sync(name, localPath, strategy = 'merge') {
        if (!['merge', 'push', 'pull'].includes(strategy)) throw new Error('Invalid sync strategy');
        if (!(await this.initialize())) throw new Error('Google Drive is not connected');
        const before = fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8') : null;
        let local = strategy === 'pull' ? null : library.documentFrom(name, before === null ? [] : JSON.parse(before));
        if (local && name.includes('templates')) local = this.mapRecords(local, data => this.packTemplates(localPath, data));
        const rawRemote = await this.getRemoteData(name);
        this.assertCurrent();
        const remote = rawRemote === null ? null : library.documentFrom(name, rawRemote, { remote: true });
        let next;
        if (strategy === 'pull') {
            if (!remote) throw new Error('Cloud file is missing');
            next = remote;
        } else if (strategy === 'push') {
            if (before === null) throw new Error('Local file is missing');
            // An explicit replacement supersedes all known branches, including deletions.
            next = library.updatedDocument(name, remote || [], library.values(local));
        } else next = remote ? library.mergeDocuments(name, local, remote) : local;
        this.assertCurrent();
        if ((fs.existsSync(localPath) ? fs.readFileSync(localPath, 'utf8') : null) !== before) throw new Error('Local library changed during sync. Retry sync.');
        const localNext = name.includes('templates') ? this.mapRecords(next, data => this.materializeTemplates(localPath, data)) : next;
        this.writeLocal(localPath, localNext);
        if (strategy !== 'pull') {
            const temporary = localPath + '.' + randomUUID() + '.upload';
            try {
                library.writeJson(temporary, next);
                if (!(await this.uploadFile(name, temporary))) throw new Error('Cloud upload failed');
            } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
        }
        return true;
    }
}
module.exports = new GoogleDriveSync();
