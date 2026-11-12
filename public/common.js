// Shared by every page: DOM helper, auto-reconnecting game socket, formatting.
import { connectRelay, cleanCode } from './relay/client.js';

/** h('div', {class:'x', onclick: fn}, 'text', childEl) — builds DOM without innerHTML, so names can't inject markup. */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** Puts these in the container, like replaceChildren, but accepts lists, null and false the way h() does (replaceChildren would print them as text). */
export function setKids(container, ...kids) {
  container.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false).map((k) => (k instanceof Node ? k : document.createTextNode(String(k)))));
}

export const money = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US');
/** A score as the active game shows it: dollars for Jeopardy, plain points for Family Feud. */
export const scoreText = (view, n) => (view?.game?.scoreFormat === 'points' ? String(n) : money(n));

/** Readable text colour (black or white) for a background hex colour. */
export function ink(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0b1020' : '#ffffff';
}

export const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#a3e635', '#f8fafc',
];

/**
 * Opens /ws, says hello, and keeps reconnecting. Calls onState(view) for every
 * state push and onMessage(msg) for everything else.
 */
export function connect({ hello, onState, onMessage = () => {}, onStatus = () => {} }) {
  if (globalThis.GN_RELAY) return connectOnline({ hello, onState, onMessage, onStatus });
  let ws; let retry = 500; let closed = false;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { retry = 500; onStatus(true); ws.send(JSON.stringify(typeof hello === 'function' ? hello() : hello)); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'state') onState(msg.view); else onMessage(msg);
    };
    ws.onclose = () => { onStatus(false); if (!closed) setTimeout(open, retry = Math.min(retry * 1.6, 3000)); };
    ws.onerror = () => ws.close();
  };
  open();
  return {
    send: (msg) => { if (ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; } return false; },
    act: (action, args = {}) => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'act', action, args })); },
    close: () => { closed = true; ws.close(); },
  };
}

// ---------- the online relay (the Vercel site): the same connection, carried by Supabase Realtime ----------
const roomFromPage = () => {
  const typed = new URLSearchParams(location.search).get('r');
  return cleanCode(typed) || cleanCode(store('gn-room'));
};

/** Asks for the room code shown on the TV. Resolves with 4 letters. */
function askForRoom(problem) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'gn-room-input', maxLength: 4, placeholder: '1234', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, inputMode: 'numeric',
      style: { fontSize: '40px', textAlign: 'center', letterSpacing: '0.3em', width: '6em', textTransform: 'uppercase' } });
    const go = () => { const code = cleanCode(input.value); if (code.length === 4) { overlay.remove(); resolve(code); } };
    input.addEventListener('input', () => { input.value = cleanCode(input.value); if (input.value.length === 4) go(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const overlay = h('div', { style: { position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(8,12,40,.96)', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '24px' } },
      h('div', {}, h('h1', {}, 'Game Night'), h('p', {}, problem ?? 'Type the four-digit room code shown on the TV.'), input, h('p', {}, h('button', { onclick: go }, 'Join'))));
    document.body.append(overlay);
    input.focus();
  });
}

function connectOnline({ hello, onState, onMessage, onStatus }) {
  let link = null; let closed = false;
  // One id per browser tab, so a host page and a player page on one phone do not look like the same screen.
  let clientId = null;
  try { clientId = sessionStorage.getItem('gn-client'); } catch { /* private mode: a new id each time */ }
  if (!clientId) {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    clientId = 'c' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem('gn-client', clientId); } catch { /* fine */ }
  }
  const start = async () => {
    let room = roomFromPage();
    if (!room) room = await askForRoom();
    if (closed) return;
    store('gn-room', room);
    link = connectRelay({
      config: globalThis.GN_RELAY, room, clientId, hello, onState, onMessage, onStatus,
      WebSocketImpl: globalThis.WebSocket,
    });
  };
  start();
  const connection = {
    send: (msg) => !!link?.send(msg),
    act: (action, args = {}) => link?.act(action, args),
    rpc: (op, args) => (link ? link.rpc(op, args) : Promise.resolve({ ok: false, error: 'Not connected' })),
    status: () => link?.status() ?? 'Starting…',
    close: () => { closed = true; link?.close(); },
  };
  onlineConnection = connection;
  return connection;
}

let onlineConnection = null;
let onlineHostPin = null;

/** Online, makes sure there is a host connection with this PIN (the editor page has none until it is given the PIN). */
export async function onlineHostConnect(pin) {
  if (onlineConnection && onlineHostPin === pin) return;
  onlineConnection?.close();
  onlineConnection = null; onlineHostPin = pin;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The TV did not answer. Is it showing the game?')), 12000);
    connectOnline({
      hello: { t: 'hello', role: 'host', pin },
      onState: () => { clearTimeout(timer); resolve(); },
      onMessage: (m) => { if (m.t === 'bad-pin') { clearTimeout(timer); reject(Object.assign(new Error('Wrong or missing host PIN'), { code: 401 })); } },
      onStatus: () => {},
    });
  });
}

/** The room code this page is using when it runs on the online relay, or null on the Pi. */
export const onlineRoom = () => (globalThis.GN_RELAY ? roomFromPage() : null);
/** Forget the room code and ask for another one. */
export function changeRoom() {
  store('gn-room', null);
  location.replace(location.pathname);
}
const reply = (ok, body, status = ok ? 200 : 400) => ({ ok, status, json: async () => body });
/**
 * fetch() for the host's /api calls. On the Pi that is plain fetch. Online there is no server to ask, so the few calls
 * the host page makes (which sets exist, what is in one) go to the TV through the relay instead.
 */
export async function apiFetch(url, init = {}) {
  if (!globalThis.GN_RELAY) return fetch(url, init);
  const method = init.method ?? 'GET';
  if (String(url) === '/api/games' && onlineConnection) {
    const r = await onlineConnection.rpc('games', {});
    return reply(r.ok, r.ok ? r.data : { error: r.error });
  }
  const sets = String(url).match(/^\/api\/games\/([a-z0-9-]+)\/sets(?:\/([^/?]+))?$/);
  if (sets && onlineConnection) {
    let op; let args = { game: sets[1], id: sets[2] };
    if (method === 'GET') op = sets[2] ? 'getSet' : 'listSets';
    else if (method === 'PUT' && sets[2]) { op = 'putSet'; try { args.doc = JSON.parse(init.body); } catch { return reply(false, { error: 'That is not a question set' }); } }
    else if (method === 'DELETE' && sets[2]) op = 'deleteSet';
    if (op) {
      const r = await onlineConnection.rpc(op, args);
      return reply(r.ok, r.ok ? r.data : { error: r.error }, r.ok ? 200 : (/^No such/.test(r.error ?? '') ? 404 : 400));
    }
  }
  if (/^\/api\/games\/[a-z0-9-]+\/random$/.test(String(url))) {
    return method === 'GET' ? reply(true, { available: false }) : reply(false, { error: 'Random boards are not available online yet' });
  }
  return reply(false, { error: 'Not available online' });
}

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* private mode: fine */ }
  return null;
}

/** Spots a unit in view.units by id. */
export const unitById = (view, id) => view.units.find((u) => u.id === id) ?? null;

/**
 * The join QR code (served by the server). The address it encodes can change while the page stays
 * open, and a browser reuses an image it already has for the same URL, so the address goes into the
 * URL (the server ignores it) to force a fresh image when it changes.
 */
let qrKey = '';
export const setQrKey = (key) => { qrKey = key; };
export const qrImg = () => h('img', { src: `/api/qr.svg?for=${encodeURIComponent(qrKey)}`, alt: 'Join QR code' });
