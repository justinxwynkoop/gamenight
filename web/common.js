// Shared by every page: DOM helper, auto-reconnecting game socket, formatting.
import { connectRelay, cleanCode, createClockSync } from './relay/client.js';

/** h('div', {class:'x', onclick: fn}, 'text', childEl) — builds DOM without innerHTML, so names can't inject markup. */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // CSS custom properties ('--col') are ignored by plain assignment, so they go through setProperty.
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
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
export const scoreText = (view, n) => (view?.game?.scoreFormat === 'none' ? '' : view?.game?.scoreFormat === 'points' ? String(n) : money(n));

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
  const raw = (msg) => { if (ws?.readyState === 1) { ws.send(JSON.stringify(msg)); return true; } return false; };
  // The room's clock, kept in step (see createClockSync), so the buzzer turns gold with everyone else's.
  const clock = createClockSync({ hires: () => performance.now(), probe: (c) => raw({ t: 'sync', c }) });
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { retry = 500; onStatus(true); ws.send(JSON.stringify(typeof hello === 'function' ? hello() : hello)); clock.restart(); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'state') onState(msg.view);
      else if (msg.t === 'sync') clock.answer(msg);
      else if (msg.t === 'who') { ws.send(JSON.stringify(typeof hello === 'function' ? hello() : hello)); clock.restart(); }
      else if (msg.t !== 'pong') onMessage(msg);
    };
    ws.onclose = () => { onStatus(false); if (!closed) setTimeout(open, retry = Math.min(retry * 1.6, 3000)); };
    ws.onerror = () => ws.close();
  };
  open();
  const beat = setInterval(() => { const lag = clock.lag(); raw({ t: 'ping', ...(lag != null ? { lag: Math.round(lag) } : {}) }); clock.probeNow(); }, 8000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !closed && ws?.readyState === 1) clock.restart(); });
  return {
    send: raw,
    act: (action, args = {}) => raw({ t: 'act', action, args }),
    clock,
    close: () => { closed = true; clearInterval(beat); clock.stop(); ws.close(); },
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
      h('div', {}, h('h1', {}, 'Game Night'), h('p', {}, problem ?? 'Type the four-digit room code shown on the TV.'), input, h('p', {}, h('button', { onclick: go, style: { font: 'inherit', fontSize: '22px', fontWeight: '800', padding: '14px 48px', marginTop: '18px', border: '0', borderRadius: '14px', background: '#ffd23f', color: '#0e0f1a', cursor: 'pointer' } }, 'Join'))));
    document.body.append(overlay);
    input.focus();
  });
}

function connectOnline({ hello, onState, onMessage, onStatus }) {
  let link = null; let closed = false;
  // One id per browser tab, so a host page and a player page on one phone do not look like the same screen.
  // ?seat=2 (play.js) is a second player on the same phone: it gets its own id even in a tab copied from the first.
  const seat = /^[2-9]$/.test(new URLSearchParams(location.search).get('seat') ?? '') ? new URLSearchParams(location.search).get('seat') : '';
  const CLIENT = seat ? `gn-client-${seat}` : 'gn-client';
  let clientId = null;
  try { clientId = sessionStorage.getItem(CLIENT); } catch { /* private mode: a new id each time */ }
  if (!clientId) {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    clientId = 'c' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem(CLIENT, clientId); } catch { /* fine */ }
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
    /** The room's clock, kept in step (null answers until the first sync comes back). */
    clock: {
      now: () => link?.clock.now() ?? null,
      toLocal: (t) => link?.clock.toLocal(t) ?? null,
      synced: () => !!link?.clock.synced(),
      lag: () => link?.clock.lag() ?? null,
      error: () => link?.clock.error() ?? null,
    },
    close: () => { closed = true; link?.close(); },
  };
  onlineConnection = connection;
  return connection;
}

let onlineConnection = null;
let onlineHostPin = null;

/** Asks the TV something that is not an action (host only), through the relay. Resolves with { ok, data | error }. */
export const hostRpc = (op, args = {}) => (onlineConnection ? onlineConnection.rpc(op, args) : Promise.resolve({ ok: false, error: 'Not available here' }));

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

/** The room code this page is using when it runs on the online relay, or null on a home server. */
export const onlineRoom = () => (globalThis.GN_RELAY ? roomFromPage() : null);
/** Forget the room code and ask for another one. */
export function changeRoom() {
  store('gn-room', null);
  location.replace(location.pathname);
}
const reply = (ok, body, status = ok ? 200 : 400) => ({ ok, status, json: async () => body });
/**
 * fetch() for the host's /api calls. On a home server that is plain fetch. Online there is no server to ask, so the few calls
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
let qrSvg = null;   // online, the TV page draws its own QR code (there is no server to ask)
export const setQrSvg = (svg) => { qrSvg = svg || null; };
let hostQrSvg = null;   // the browser TV's host code (opens the host page already signed in)
export const setHostQrSvg = (svg) => { hostQrSvg = svg || null; };
export const hostQrImg = () => (hostQrSvg ? h('img', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(hostQrSvg)}`, alt: 'Host QR code' }) : null);
export const qrImg = () => h('img', {
  src: qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : `/api/qr.svg?for=${encodeURIComponent(qrKey)}`,
  alt: 'Join QR code',
});

/**
 * Keeps the screen on while the page is open (phones dim and lock between clues otherwise, and a laptop on the TV
 * goes to sleep). Uses the Screen Wake Lock API where the browser has it (iPhone Safari 16.4+, Chrome, Edge); the
 * lock is dropped by the browser whenever the page is hidden, so it is asked for again when the page comes back.
 */
export function keepAwake() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const ask = async () => {
    if (document.visibilityState !== 'visible' || lock) return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { /* not allowed right now (battery saver, no tap yet) */ }
  };
  ask();
  document.addEventListener('visibilitychange', ask);
  // Some browsers only grant it after the person has touched the page.
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, ask, { passive: true });
}
