const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');

const FILES = ['user-dictionary.json', 'user-keywords.json', 'user-templates.json'];
const MAX_BYTES = 100 * 1024 * 1024;
const attachmentPattern = /^(docx?|pdf|rtf|txt|odt)$/i;
const kindFor = name => name.includes('keywords') ? 'keywords' : name.includes('templates') ? 'templates' : 'dictionary';
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value, max, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0);
const hash = value => createHash('sha256').update(value).digest('hex');
function atomicWrite(file, data, io = fs) {
    io.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = path.join(path.dirname(file), '.' + path.basename(file) + '.' + randomUUID() + '.tmp');
    try {
        io.writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 });
        // Windows requires write access for FlushFileBuffers (fsync).
        const descriptor = io.openSync(temporary, 'r+');
        try { io.fsyncSync(descriptor); } finally { io.closeSync(descriptor); }
        io.renameSync(temporary, file);
    } finally {
        if (io.existsSync(temporary)) io.unlinkSync(temporary);
    }
}
function writeJson(file, value, io = fs) { atomicWrite(file, JSON.stringify(value, null, 2), io); }
function readJson(file, io = fs) {
    if (io.statSync(file).size > MAX_BYTES) throw new Error('Library exceeds 100 MB');
    try { return JSON.parse(io.readFileSync(file, 'utf8')); }
    catch (error) { throw new Error(`Cannot read ${path.basename(file)}. The original file is preserved for recovery: ${error.message}`); }
}
function validateData(name, data, { remote = false } = {}) {
    if (!Array.isArray(data) || data.length > 10000) throw new Error('Sync data must be an array with at most 10000 entries');
    const kind = kindFor(name), seen = new Set();
    for (const item of data) {
        const key = kind === 'dictionary' ? item : item?.id;
        if (!string(key, 256) || seen.has(key)) throw new Error('Invalid or duplicate library entry ID');
        seen.add(key);
        if (kind === 'dictionary') continue;
        if (!plain(item)) throw new Error('Invalid library record');
        if (kind === 'keywords') {
            if (!string(item.keyword, 256) || !string(item.description, 1000000)) throw new Error('Invalid keyword or description');
        } else {
            if (!string(item.name, 256) || !string(item.category, 256) || !['text', 'file'].includes(item.type)) throw new Error('Invalid template name, category or type');
            if (item.type === 'text' && !string(item.content, 1000000)) throw new Error('Invalid template content');
            if (item.type === 'file') {
                if (!attachmentPattern.test(item.ext)) throw new Error('Unsupported template attachment');
                if (item.attachment !== undefined) {
                    const attachment = item.attachment;
                    if (!plain(attachment) || !/^[a-f0-9]{64}$/.test(attachment.id) || !attachmentPattern.test(attachment.ext) || attachment.ext.toLowerCase() !== item.ext.toLowerCase() || typeof attachment.base64 !== 'string' || attachment.base64.length > 28 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.base64)) throw new Error('Invalid template attachment');
                    const bytes = Buffer.from(attachment.base64, 'base64');
                    if (bytes.length > 20 * 1024 * 1024 || hash(bytes) !== attachment.id) throw new Error('Template attachment checksum or size failed');
                } else if (remote || !string(item.filePath, 4096)) throw new Error('A template attachment is missing. Sync again from the device that owns the file.');
            }
            for (const field of ['createdAt', 'updatedAt']) if (item[field] !== undefined && (!Number.isSafeInteger(item[field]) || item[field] < 0)) throw new Error('Invalid template timestamp');
            if (item.originalFilename != null && !string(item.originalFilename, 256)) throw new Error('Invalid template filename');
        }
    }
    if (Buffer.byteLength(JSON.stringify(data)) > MAX_BYTES) throw new Error('Library exceeds 100 MB');
}
function documentFrom(name, value, options) {
    const kind = kindFor(name);
    if (Array.isArray(value)) {
        validateData(name, value, options);
        return { schemaVersion: 2, kind, entries: value.map(item => ({ key: kind === 'dictionary' ? item : item.id, revision: hash(JSON.stringify(item)), ancestors: [], value: item })) };
    }
    if (!plain(value) || value.schemaVersion !== 2 || value.kind !== kind || !Array.isArray(value.entries) || value.entries.length > 50000) throw new Error('Invalid library revision document');
    const keys = new Set();
    for (const item of value.entries) {
        if (!plain(item) || !string(item.key, 256) || keys.has(item.key) || !/^[a-zA-Z0-9-]{1,128}$/.test(item.revision) || !Array.isArray(item.ancestors) || item.ancestors.length > 10000 || item.ancestors.some(a => typeof a !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(a)) || new Set(item.ancestors).size !== item.ancestors.length || item.ancestors.includes(item.revision)) throw new Error('Invalid library revision');
        keys.add(item.key);
        if (item.value !== null && item.key !== (kind === 'dictionary' ? item.value : item.value?.id)) throw new Error('Library key does not match record');
    }
    validateData(name, values(value), options);
    return value;
}
function values(document) { return document.entries.filter(item => item.value !== null).map(item => item.value); }
function updatedDocument(name, before, next) {
    validateData(name, next);
    const previous = documentFrom(name, before);
    const incoming = new Map(next.map(item => [previous.kind === 'dictionary' ? item : item.id, item]));
    const entries = previous.entries.map(item => {
        const value = incoming.has(item.key) ? incoming.get(item.key) : null;
        incoming.delete(item.key);
        if (JSON.stringify(value) === JSON.stringify(item.value)) return item;
        if (item.ancestors.length >= 10000) throw new Error('Library revision history is full; export and contact support.');
        return { key: item.key, revision: randomUUID(), ancestors: [...item.ancestors, item.revision], value };
    });
    for (const [key, value] of incoming) entries.push({ key, revision: randomUUID(), ancestors: [], value });
    return documentFrom(name, { ...previous, entries });
}
function mergeDocuments(name, local, remote) {
    local = documentFrom(name, local); remote = documentFrom(name, remote);
    const incoming = new Map(remote.entries.map(item => [item.key, item]));
    const conflicts = [];
    const entries = local.entries.map(item => {
        const other = incoming.get(item.key); incoming.delete(item.key);
        if (!other) return item;
        if (item.revision === other.revision) {
            if (JSON.stringify(item.value) !== JSON.stringify(other.value)) conflicts.push(item.key);
            return item;
        }
        if (other.ancestors.includes(item.revision)) return other;
        if (item.ancestors.includes(other.revision)) return item;
        // Identical concurrent additions/edits can converge without losing either branch.
        if (JSON.stringify(item.value) === JSON.stringify(other.value)) return { ...item, revision: randomUUID(), ancestors: [...new Set([...item.ancestors, item.revision, ...other.ancestors, other.revision])] };
        conflicts.push(item.key); return item;
    });
    if (conflicts.length) throw new Error(`${conflicts.length} sync conflict(s). No library was replaced. Choose Upload or Download to explicitly resolve this library after reviewing both devices.`);
    entries.push(...incoming.values());
    return documentFrom(name, { ...local, entries });
}
class AccountLibraries {
    constructor(root, io = fs) { this.root = root; this.io = io; this.uid = null; }
    directory(uid) {
        if (!string(uid, 128)) throw new Error('Sign in before opening your libraries.');
        return path.join(this.root, 'accounts', hash(uid));
    }
    select(uid) { this.uid = uid || null; if (uid) this.io.mkdirSync(this.directory(uid), { recursive: true }); }
    file(name) { if (!FILES.includes(name)) throw new Error('Unknown library'); return path.join(this.directory(this.uid), name); }
    read(name) { const file = this.file(name); return this.io.existsSync(file) ? documentFrom(name, readJson(file, this.io)) : documentFrom(name, []); }
    get(name) { return values(this.read(name)); }
    save(name, next) { const document = updatedDocument(name, this.read(name), next); writeJson(this.file(name), document, this.io); return values(document); }
    legacyStatus() {
        const marker = path.join(this.root, 'legacy-library-owner.json');
        const owner = this.io.existsSync(marker) ? readJson(marker, this.io) : null;
        return { available: FILES.some(name => this.io.existsSync(path.join(this.root, name))) && (!owner || (owner.uid === this.uid && !owner.complete)), ownedByAnotherAccount: !!owner && owner.uid !== this.uid };
    }
    importLegacy(copyTemplates) {
        this.directory(this.uid);
        if (!this.legacyStatus().available) throw new Error('No unclaimed legacy libraries are available for this account.');
        // Claim before copying so a crash can be resumed only by the same account.
        const marker = path.join(this.root, 'legacy-library-owner.json');
        writeJson(marker, { uid: this.uid, complete: false }, this.io);
        for (const name of FILES) {
            const source = path.join(this.root, name);
            if (!this.io.existsSync(source)) continue;
            let records = values(documentFrom(name, readJson(source, this.io)));
            if (kindFor(name) === 'templates') records = copyTemplates(source, this.file(name), records);
            const current = this.get(name), key = item => kindFor(name) === 'dictionary' ? item : item.id;
            const combined = new Map(current.map(item => [key(item), item]));
            for (const item of records) {
                const existing = combined.get(key(item));
                if (existing && JSON.stringify(existing) !== JSON.stringify(item)) throw new Error('Legacy import conflicts with an existing record. Original files are preserved.');
                combined.set(key(item), item);
            }
            this.save(name, [...combined.values()]);
        }
        writeJson(marker, { uid: this.uid, complete: true }, this.io);
    }
}
module.exports = { AccountLibraries, FILES, atomicWrite, writeJson, readJson, validateData, documentFrom, values, updatedDocument, mergeDocuments, kindFor };
