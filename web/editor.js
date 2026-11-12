// The editor page. It owns the PIN and choosing a game; the editor for each
// game's content comes from /games/<id>/editor.js.
import { h, store, apiFetch, onlineHostConnect } from './common.js';
import { importSets, TEXT_HELP } from './importer.js';

const app = document.getElementById('app');
let pin = store('gn-pin') ?? '';
let games = [];
let gameId = new URLSearchParams(location.search).get('game');
let error = '';

class AuthError extends Error {}

async function call(path, opts = {}) {
  if (globalThis.GN_RELAY) {   // online, the host connects to the TV first (with the PIN), then asks it
    try { await onlineHostConnect(pin); } catch (e) { throw e.code === 401 ? new AuthError(e.message) : e; }
  }
  const r = await apiFetch(path, { ...opts, headers: { 'x-host-pin': pin, 'content-type': 'application/json' } });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) throw new AuthError(body.error ?? 'Wrong or missing host PIN');
  if (!r.ok) throw new Error(body.error ?? `Error ${r.status}`);
  return body;
}

/** What a game's editor module is handed, scoped to one game's sets. */
const apiFor = (id) => ({
  list: () => call(`/api/games/${id}/sets`),
  get: (setId) => call(`/api/games/${id}/sets/${setId}`),
  put: (setId, doc) => call(`/api/games/${id}/sets/${setId}`, { method: 'PUT', body: JSON.stringify(doc) }),
  del: (setId) => call(`/api/games/${id}/sets/${setId}`, { method: 'DELETE' }),
});

/** "Import": drop a file here, or pick one, or paste a link or the text of a set. Saved for this game. */
function importCard(api) {
  const input = h('textarea', { rows: 3, placeholder: 'Paste a link (a .json file, or a GitHub folder or repository) or the text of a set', style: { width: '100%' } });
  const out = h('div', { class: 'dim' });
  const report = ({ saved, failed }, where) => out.replaceChildren(
    saved.length ? `Imported ${saved.length}${where ? ` from ${where}` : ''}: ${saved.join(', ')}. Reload the page to see them in the list.` : 'Nothing was imported.',
    ...failed.map((f) => h('div', { class: 'err' }, f)));
  const run = async (texts, where) => {
    out.textContent = 'Importing…';
    const total = { saved: [], failed: [] };
    for (const { name, text } of texts) {
      try { const r = await importSets(text, api, gameId); total.saved.push(...r.saved); total.failed.push(...r.failed.map((f) => (texts.length > 1 ? `${name}: ${f}` : f))); }
      catch (e) { total.failed.push(texts.length > 1 ? `${name}: ${e.message}` : e.message); }
    }
    report(total, where);
  };
  const readFiles = async (files) => {
    const list = [...files].filter((f) => f.size < 2_000_000);
    if (!list.length) { out.replaceChildren(h('div', { class: 'err' }, 'Those files are too big to be question sets.')); return; }
    await run(await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() }))), list.length === 1 ? list[0].name : `${list.length} files`);
  };
  const picker = h('input', { type: 'file', multiple: true, accept: '.json,.txt,.text,text/plain,application/json', style: { display: 'none' } });
  picker.addEventListener('change', () => { readFiles(picker.files); picker.value = ''; });
  const zone = h('div', { style: { border: '2px dashed #4b5fd0', borderRadius: '12px', padding: '18px', textAlign: 'center', margin: '10px 0' } },
    h('div', {}, 'Drop a file here (.json or .txt)'),
    h('button', { class: 'btn small', style: { marginTop: '8px' }, onclick: () => picker.click() }, 'Choose a file…'), picker);
  const card = h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer', fontWeight: '700' } }, 'Import sets (drop a file, paste a link or paste text)'),
    h('div', { style: { marginTop: '10px' } }, zone,
      h('div', { class: 'tag' }, 'or paste a link or the text of a set'), input,
      h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: () => run([{ name: 'pasted text', text: input.value }]) }, 'Import'), out,
      h('details', { style: { marginTop: '12px' } }, h('summary', { style: { cursor: 'pointer' } }, 'How to write a set in a plain text file'),
        h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '.8rem', marginTop: '8px' } }, TEXT_HELP[gameId] ?? 'Use a .json file for this game.'))));
  // Dropping anywhere on the card works, even while it is folded: it opens and imports.
  const over = (on) => { zone.style.background = on ? '#1d2a7a' : ''; };
  for (const ev of ['dragenter', 'dragover']) card.addEventListener(ev, (e) => { e.preventDefault(); card.open = true; over(true); });
  card.addEventListener('dragleave', () => over(false));
  card.addEventListener('drop', (e) => { e.preventDefault(); over(false); card.open = true; readFiles(e.dataTransfer?.files ?? []); });
  return card;
}

function login() {
  const input = h('input', { type: 'password', inputMode: 'numeric', placeholder: 'Host PIN' });
  const go = () => { pin = input.value.trim(); store('gn-pin', pin); error = ''; boot(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  app.replaceChildren(h('div', { class: 'login' }, h('h1', {}, 'Question editor'), input,
    error && h('div', { class: 'err' }, error), h('button', { class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: go }, 'Enter')));
}

async function boot() {
  try {
    games = await call('/api/games');
    if (!games.some((g) => g.id === gameId)) gameId = games[0]?.id ?? null;
    if (!gameId) { app.replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'card' }, 'No games installed.'))); return; }
    await apiFor(gameId).list(); // checks the PIN before showing anything
    const mod = await import(`/games/${gameId}/editor.js`);
    const box = h('div', { style: { display: 'contents' } });
    const api = apiFor(gameId);
    app.replaceChildren(h('div', { class: 'wrap' },
      h('div', { class: 'card bar' },
        h('div', { class: 'row' }, h('a', { class: 'btn small', href: '/host', style: { textDecoration: 'none' } }, '← Host'), h('strong', {}, 'Question editor')),
        games.length > 1 && h('select', { style: { width: 'auto' }, onchange: (e) => { location.search = `?game=${e.target.value}`; } },
          games.map((g) => h('option', { value: g.id, selected: g.id === gameId }, g.name)))),
      importCard(api),
      box));
    mod.mount(box, api);
  } catch (e) {
    error = e instanceof AuthError ? (pin ? e.message : '') : e.message;
    login();
  }
}

boot();
