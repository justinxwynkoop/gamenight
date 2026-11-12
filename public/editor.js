// The editor page. It owns the PIN and choosing a game; the editor for each
// game's content comes from /games/<id>/editor.js.
import { h, store, apiFetch, onlineHostConnect } from './common.js';
import { importSets } from './importer.js';

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

/** "Import": a link to a set (or a GitHub folder of them) or pasted text, saved for this game. */
function importCard(api) {
  const input = h('textarea', { rows: 3, placeholder: 'Paste a link (a .json file, or a GitHub folder or repository) or the text of a set', style: { width: '100%' } });
  const out = h('div', { class: 'dim' });
  const go = async () => {
    out.textContent = 'Importing…';
    try {
      const { saved, failed } = await importSets(input.value, api, gameId);
      out.replaceChildren(saved.length ? `Imported ${saved.length}: ${saved.join(', ')}. Reload the page to see them in the list.` : 'Nothing was imported.',
        ...failed.map((f) => h('div', { class: 'err' }, f)));
    } catch (e) { out.replaceChildren(h('div', { class: 'err' }, e.message)); }
  };
  return h('div', { class: 'card' }, h('h2', {}, 'Import sets'), input,
    h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: go }, 'Import'), out);
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
    app.replaceChildren(h('div', { class: 'wrap' },
      h('div', { class: 'card bar' },
        h('div', { class: 'row' }, h('a', { class: 'btn small', href: '/host', style: { textDecoration: 'none' } }, '← Host'), h('strong', {}, 'Question editor')),
        games.length > 1 && h('select', { style: { width: 'auto' }, onchange: (e) => { location.search = `?game=${e.target.value}`; } },
          games.map((g) => h('option', { value: g.id, selected: g.id === gameId }, g.name)))),
      box));
    const api = apiFor(gameId);
    mod.mount(box, api);
    app.firstChild.append(importCard(api));
  } catch (e) {
    error = e instanceof AuthError ? (pin ? e.message : '') : e.message;
    login();
  }
}

boot();
