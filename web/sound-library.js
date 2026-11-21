// A copy of every sound file this browser has sent to the TV, kept in this browser only (IndexedDB), so the host page can
// put them back if the Apple TV clears its storage. Nothing here is uploaded anywhere. Every call is safe to make when
// the browser will not keep data (a private window): it just finds nothing.
const DB = 'gn-own-sounds';
const STORE = 'files';

const open = () => new Promise((ok, no) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((ok, no) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => no(tx.error);
      tx.onabort = () => no(tx.error);
    });
  } finally { db.close(); }
}

const key = (game, name) => `${game}/${name}`;

export const library = {
  /** Keeps (or replaces) the file for a game's sound: { game, name, ext, bytes: Uint8Array }. */
  async remember(game, name, ext, bytes) {
    try { await run('readwrite', (s) => s.put({ game, name, ext, bytes }, key(game, name))); } catch { /* not kept: the TV still has it */ }
  },
  async forget(game, name) {
    try { await run('readwrite', (s) => s.delete(key(game, name))); } catch { /* nothing to forget */ }
  },
  /** Every kept file. */
  async all() {
    try { return (await run('readonly', (s) => s.getAll())) ?? []; } catch { return []; }
  },
};
