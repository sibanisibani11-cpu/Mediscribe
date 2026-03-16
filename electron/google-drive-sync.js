const { getDriveClient } = require('./oauth-handler');
const fs = require('fs');
const path = require('path');

/**
 * Cloud Sync Manager for Google Drive
 */
class GoogleDriveSync {
    constructor() {
        this.drive = null;
    }

    async initialize() {
        this.drive = await getDriveClient();
        return !!this.drive;
    }

    /**
     * Find a file in the appDataFolder on Drive
     */
    async findFile(name) {
        if (!this.drive) return null;
        try {
            const response = await this.drive.files.list({
                spaces: 'appDataFolder',
                q: `name = '${name}'`,
                fields: 'files(id, name, modifiedTime)',
            });
            return response.data.files[0] || null;
        } catch (error) {
            console.error(`[DriveSync] Error finding ${name}:`, error.message);
            return null;
        }
    }

    /**
     * Upload a local file to Drive (overwrite if exists)
     */
    async uploadFile(name, localPath) {
        if (!(await this.initialize())) return false;

        try {
            const existingFile = await this.findFile(name);
            const media = {
                mimeType: 'application/json',
                body: fs.createReadStream(localPath),
            };

            if (existingFile) {
                // Update
                await this.drive.files.update({
                    fileId: existingFile.id,
                    media: media,
                });
                console.log(`[DriveSync] ✓ Updated ${name} on Drive`);
            } else {
                // Create
                await this.drive.files.create({
                    requestBody: {
                        name: name,
                        parents: ['appDataFolder'],
                    },
                    media: media,
                    fields: 'id',
                });
                console.log(`[DriveSync] ✓ Created ${name} on Drive`);
            }
            return true;
        } catch (error) {
            console.error(`[DriveSync] Error uploading ${name}:`, error.message);
            return false;
        }
    }

    /**
     * Download a file from Drive to local path
     */
    async downloadFile(name, localPath) {
        if (!(await this.initialize())) return false;

        try {
            const driveFile = await this.findFile(name);
            if (!driveFile) return false;

            const dest = fs.createWriteStream(localPath);
            const response = await this.drive.files.get(
                { fileId: driveFile.id, alt: 'media' },
                { responseType: 'stream' }
            );

            return new Promise((resolve, reject) => {
                response.data
                    .on('end', () => {
                        console.log(`[DriveSync] ✓ Downloaded ${name} from Drive`);
                        resolve(true);
                    })
                    .on('error', (err) => {
                        reject(err);
                    })
                    .pipe(dest);
            });
        } catch (error) {
            console.error(`[DriveSync] Error downloading ${name}:`, error.message);
            return false;
        }
    }

    /**
     * Get remote data without saving to file
     */
    async getRemoteData(name) {
        if (!(await this.initialize())) return null;
        try {
            const driveFile = await this.findFile(name);
            if (!driveFile) return null;

            const response = await this.drive.files.get(
                { fileId: driveFile.id, alt: 'media' }
            );

            // Handle string data (parse it) or buffer
            let content = response.data;
            if (typeof content === 'string') {
                try {
                    return JSON.parse(content);
                } catch (e) {
                    console.error(`[DriveSync] Failed to parse remote data for ${name}:`, e.message);
                    return null;
                }
            }
            return content;
        } catch (error) {
            console.error(`[DriveSync] Error getting remote data for ${name}:`, error.message);
            return null;
        }
    }

    /**
     * Bidirectional Merge Sync with Strategy Support
     * @param {string} strategy - 'merge', 'push', or 'pull'
     */
    async sync(name, localPath, strategy = 'merge') {
        if (!(await this.initialize())) return;

        // Strategy: PUSH (Local -> Cloud) - STRICT OVERWRITE
        if (strategy === 'push') {
            const localExists = fs.existsSync(localPath);
            if (localExists) {
                console.log(`[DriveSync] PUSH: Overwriting Cloud ${name} with Local copy.`);
                await this.uploadFile(name, localPath);
            } else {
                console.warn(`[DriveSync] PUSH: Local file ${name} missing. Cannot push.`);
            }
            return;
        }

        const remoteData = await this.getRemoteData(name);
        const localExists = fs.existsSync(localPath);
        let localData = [];

        if (localExists) {
            try {
                localData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
            } catch (e) {
                console.error(`[DriveSync] Error reading local ${name}:`, e);
            }
        }

        // Strategy: PULL (Cloud -> Local)
        if (strategy === 'pull') {
            if (remoteData) {
                console.log(`[DriveSync] PULL: Overwriting Local ${name} with Cloud copy.`);
                await this.downloadFile(name, localPath);
            }
            return;
        }

        // Strategy: MERGE (Default)
        // 1. If only local exists, upload it
        if (!remoteData && localExists) {
            console.log(`[DriveSync] MERGE: Initializing cloud with local ${name}.`);
            await this.uploadFile(name, localPath);
            return;
        }

        // 2. If only remote exists, download it
        if (remoteData && !localExists) {
            console.log(`[DriveSync] MERGE: Downloading fresh cloud copy of ${name} to Local.`);
            await this.downloadFile(name, localPath);
            return;
        }

        // 3. Both exist: Perform a Merged Sync
        if (remoteData && localExists) {
            console.log(`[DriveSync] MERGE: Merging Cloud and Local data for ${name}...`);
            let merged;

            if (name.includes('keywords')) {
                // Merge Keywords by ID (prefer local for duplicates)
                const map = new Map();
                remoteData.forEach(k => map.set(k.id, k));
                localData.forEach(k => map.set(k.id, k));
                merged = Array.from(map.values());
            } else {
                // Merge Dictionary (Simple unique array)
                merged = Array.from(new Set([...remoteData, ...localData])).sort();
            }

            // Save merged version locally
            fs.writeFileSync(localPath, JSON.stringify(merged, null, 2));

            // Upload merged version to Cloud
            await this.uploadFile(name, localPath);
            console.log(`[DriveSync] ✓ ${name} merged and updated on both devices.`);
        }
    }
}

const syncManager = new GoogleDriveSync();

module.exports = syncManager;
