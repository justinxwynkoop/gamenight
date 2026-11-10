// Shared by every page: DOM helper, auto-reconnecting game socket, formatting.

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

export const money = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US');

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

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* private mode: fine */ }
  return null;
}

/** Spots a unit in view.units by id. */
export const unitById = (view, id) => view.units.find((u) => u.id === id) ?? null;
