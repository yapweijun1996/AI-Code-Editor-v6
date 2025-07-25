// === IndexedDB Manager for API Keys                            ===
// =================================================================
export const DbManager = {
    db: null,
    dbName: 'CodeEditorDB',
    stores: {
        keys: 'apiKeys',
        handles: 'fileHandles',
        codeIndex: 'codeIndex',
    },
    async openDb() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);
            const request = indexedDB.open(this.dbName, 3); // Version 3 for new store
            request.onerror = () => reject('Error opening IndexedDB.');
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.stores.keys)) {
                    db.createObjectStore(this.stores.keys, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.stores.handles)) {
                    db.createObjectStore(this.stores.handles, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.stores.codeIndex)) {
                    db.createObjectStore(this.stores.codeIndex, { keyPath: 'id' });
                }
            };
        });
    },
    async getKeys() {
        const db = await this.openDb();
        return new Promise((resolve) => {
            const request = db
            .transaction(this.stores.keys, 'readonly')
            .objectStore(this.stores.keys)
            .get('userApiKeys');
            request.onerror = () => resolve('');
            request.onsuccess = () =>
            resolve(request.result ? request.result.keys : '');
        });
    },
    async saveKeys(keysString) {
        const db = await this.openDb();
        return new Promise((resolve, reject) => {
            const request = db
            .transaction(this.stores.keys, 'readwrite')
            .objectStore(this.stores.keys)
            .put({ id: 'userApiKeys', keys: keysString });
            request.onerror = () => reject('Error saving keys.');
            request.onsuccess = () => resolve();
        });
    },
    async saveDirectoryHandle(handle) {
        const db = await this.openDb();
        return new Promise((resolve, reject) => {
            const request = db
            .transaction(this.stores.handles, 'readwrite')
            .objectStore(this.stores.handles)
            .put({ id: 'rootDirectory', handle });
            request.onerror = () => reject('Error saving directory handle.');
            request.onsuccess = () => resolve();
        });
    },
    async getDirectoryHandle() {
        const db = await this.openDb();
        return new Promise((resolve) => {
            const request = db
            .transaction(this.stores.handles, 'readonly')
            .objectStore(this.stores.handles)
            .get('rootDirectory');
            request.onerror = () => resolve(null);
            request.onsuccess = () =>
            resolve(request.result ? request.result.handle : null);
        });
    },
    async clearDirectoryHandle() {
        const db = await this.openDb();
        return new Promise((resolve, reject) => {
            const request = db
            .transaction(this.stores.handles, 'readwrite')
            .objectStore(this.stores.handles)
            .delete('rootDirectory');
            request.onerror = () => reject('Error clearing directory handle.');
            request.onsuccess = () => resolve();
        });
    },
    async saveCodeIndex(index) {
        const db = await this.openDb();
        return new Promise((resolve, reject) => {
            const request = db
            .transaction(this.stores.codeIndex, 'readwrite')
            .objectStore(this.stores.codeIndex)
            .put({ id: 'fullCodeIndex', index });
            request.onerror = () => reject('Error saving code index.');
            request.onsuccess = () => resolve();
        });
    },
    async getCodeIndex() {
        const db = await this.openDb();
        return new Promise((resolve) => {
            const request = db
            .transaction(this.stores.codeIndex, 'readonly')
            .objectStore(this.stores.codeIndex)
            .get('fullCodeIndex');
            request.onerror = () => resolve(null);
            request.onsuccess = () =>
            resolve(request.result ? request.result.index : null);
        });
    },
};