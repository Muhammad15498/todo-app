const DB_NAME = "gloss-db";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) {
        const s = db.createObjectStore("docs", { keyPath: "id" });
        s.createIndex("byOpened", "lastOpened");
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("words")) {
        const s = db.createObjectStore("words", { keyPath: "id" });
        s.createIndex("byWord", "word");
        s.createIndex("bySaved", "savedAt");
      }
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv", { keyPath: "k" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqAs(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  async allDocs() {
    const dbx = await openDB();
    const rows = await reqAs(dbx.transaction("docs").objectStore("docs").getAll());
    return (rows || []).sort((a, b) => (b.lastOpened || b.addedAt || 0) - (a.lastOpened || a.addedAt || 0));
  },
  async getDoc(id) {
    const dbx = await openDB();
    return reqAs(dbx.transaction("docs").objectStore("docs").get(id));
  },
  async putDoc(doc) {
    const dbx = await openDB();
    const tx = dbx.transaction("docs", "readwrite");
    tx.objectStore("docs").put(doc);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res(doc);
      tx.onerror = () => rej(tx.error);
    });
  },
  async deleteDoc(id) {
    const dbx = await openDB();
    const tx = dbx.transaction(["docs", "files"], "readwrite");
    tx.objectStore("docs").delete(id);
    tx.objectStore("files").delete(id);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async putFile(id, blob) {
    const dbx = await openDB();
    const tx = dbx.transaction("files", "readwrite");
    tx.objectStore("files").put({ id, blob });
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async getFile(id) {
    const dbx = await openDB();
    const row = await reqAs(dbx.transaction("files").objectStore("files").get(id));
    return row?.blob || null;
  },
  async allWords() {
    const dbx = await openDB();
    const rows = await reqAs(dbx.transaction("words").objectStore("words").getAll());
    return (rows || []).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  },
  async putWord(row) {
    const dbx = await openDB();
    const tx = dbx.transaction("words", "readwrite");
    tx.objectStore("words").put(row);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res(row);
      tx.onerror = () => rej(tx.error);
    });
  },
  async deleteWord(id) {
    const dbx = await openDB();
    const tx = dbx.transaction("words", "readwrite");
    tx.objectStore("words").delete(id);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async getKV(k, fallback = null) {
    const dbx = await openDB();
    const row = await reqAs(dbx.transaction("kv").objectStore("kv").get(k));
    return row ? row.v : fallback;
  },
  async setKV(k, v) {
    const dbx = await openDB();
    const tx = dbx.transaction("kv", "readwrite");
    tx.objectStore("kv").put({ k, v });
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
};

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
