// The question editor page: sign-in, the frame (top bar, a Save bar pinned to the bottom) and the import card.
// What is edited, and the editing screens, come from /games/<id>/editor.js (see that file's mount()).
import { h, store, apiFetch, onlineHostConnect } from './common.js';
import { icon } from './ui.js';
import { importSets, TEXT_HELP } from './importer.js';
import { btn } from './editkit.js';

const app = document.getElementById('app');
let pin = store('gn-pin') ?? '';
let games = [];
let gameId = new URLSearchParams(location.search).get('game');
let error = '';
let controller = null;     // what the game's editor hands back: { save, remove, canDelete, dirty }

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

function toast(text, kind = '') {
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

/** "Import": drop a file here, or pick one, or paste a link or the text of a set. Saved for this game. */
function importCard(api) {
  const input = h('textarea', { rows: 3, placeholder: 'Paste a link (a .json file, or a GitHub folder or repository) or the text of a set' });
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
  const zone = h('div', { style: { border: '2px dashed #4b5fd0', borderRadius: '12px', padding: '16px', textAlign: 'center' } },
    h('div', {}, 'Drop a file here (.json or .txt)'),
    h('div', { style: { marginTop: '8px' } }, btn('Choose a file…', () => picker.click(), { small: true })), picker);
  const card = h('details', { class: 'card' }, h('summary', {}, 'Import sets (drop a file, paste a link or paste text)'),
    zone, h('div', { class: 'tag' }, 'or paste a link or the text of a set'), input,
    btn('Import', () => run([{ name: 'pasted text', text: input.value }])), out,
    h('details', {}, h('summary', { style: { cursor: 'pointer', color: '#a3b0ee' } }, 'How to write a set in a plain text file'),
      h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '.8rem', marginTop: '8px' } }, TEXT_HELP[gameId] ?? 'Use a .json file for this game.')));
  // Dropping anywhere on the card works, even while it is folded: it opens and imports.
  const over = (on) => { zone.style.background = on ? '#1d2a7a' : ''; };
  for (const ev of ['dragenter', 'dragover']) card.addEventListener(ev, (e) => { e.preventDefault(); card.open = true; over(true); });
  card.addEventListener('dragleave', () => over(false));
  card.addEventListener('drop', (e) => { e.preventDefault(); over(false); card.open = true; readFiles(e.dataTransfer?.files ?? []); });
  return card;
}

function login() {
  const input = h('input', { type: 'password', inputMode: 'numeric', placeholder: 'Host PIN', autocomplete: 'current-password' });
  const go = () => { pin = input.value.trim(); store('gn-pin', pin); error = ''; boot(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  app.replaceChildren(h('div', { class: 'login' }, h('h1', {}, 'Question editor'), h('div', { class: 'dim' }, 'Type the host PIN.'), input,
    error && h('div', { class: 'err' }, error), btn('Enter', go, { kind: 'primary' })));
}

async function boot() {
  try {
    games = await call('/api/games');
    if (!games.some((g) => g.id === gameId)) gameId = games[0]?.id ?? null;
    if (!gameId) { app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, 'No games installed.'))); return; }
    const api = apiFor(gameId);
    await api.list(); // checks the PIN before showing anything
    const mod = await import(`/games/${gameId}/editor.js`);

    const box = h('div', { style: { display: 'contents' } });
    const status = h('div', { class: 'ed-status' });
    const saveBtn = btn('Save', () => act('save'), { kind: 'primary', iconName: 'check' });
    const delBtn = btn('', () => act('remove'), { kind: 'bad', iconName: 'trash', aria: 'Delete this set' });
    const dock = h('footer', { class: 'ed-dock' }, h('div', { class: 'ed-dock-inner' }, status, delBtn, saveBtn));
    const top = h('header', { class: 'ed-top' },
      h('a', { class: 'btn btn-sm', href: '/host', 'aria-label': 'Back to the host page' }, icon('chevron', 16), h('span', {}, 'Host')),
      h('div', { class: 'ed-title' }, 'Question editor'),
      games.length > 1 && h('select', { style: { width: 'auto', minHeight: '38px', padding: '4px 10px' }, 'aria-label': 'Game', onchange: (e) => { location.search = `?game=${e.target.value}`; } },
        games.map((g) => h('option', { value: g.id, selected: g.id === gameId }, g.name))));
    // The back chevron should point left.
    top.querySelector('a svg').style.transform = 'rotate(180deg)';
    app.replaceChildren(h('div', { class: 'ed-shell' }, top, h('main', { class: 'ed-main' }, h('div', { class: 'ed-content' }, importCard(api), box)), dock));

    const sync = () => {
      const dirty = controller?.dirty?.() ?? false;
      status.textContent = dirty ? 'Unsaved changes' : (controller?.label?.() ?? '');
      status.classList.toggle('dirty', dirty);
      delBtn.classList.toggle('hidden', !controller?.canDelete?.());
    };
    const act = async (what) => {
      if (!controller) return;
      saveBtn.disabled = true;
      try { const r = await controller[what](); if (r) toast(r.text, r.ok ? 'good' : 'bad'); } catch (e) { toast(e.message, 'bad'); }
      saveBtn.disabled = false;
      sync();
    };
    controller = mod.mount(box, api, { changed: sync, toast });
    sync();
    window.addEventListener('beforeunload', (e) => { if (controller?.dirty?.()) { e.preventDefault(); e.returnValue = ''; } });
  } catch (e) {
    error = e instanceof AuthError ? (pin ? e.message : '') : e.message;
    login();
  }
}

boot();
