// Game Night server: one Node process serves the web pages, the WebSocket
// game connection, and the question-set editor API. Runs on a Raspberry Pi.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { Room } from './room.js';
import { GameError, pickAddress } from './lib.js';
import { GAMES } from './games/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(here, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PUBLIC_DIR = path.join(here, 'public');
const SOUNDS_DIR = path.join(DATA_DIR, 'sounds');
const PORT = Number(process.env.PORT ?? 3000);
for (const id of Object.keys(GAMES)) mkdirSync(path.join(DATA_DIR, id), { recursive: true });
mkdirSync(SOUNDS_DIR, { recursive: true });

// ---------- config: host PIN ----------
function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch { /* first run */ }
  if (process.env.HOST_PIN) cfg.pin = String(process.env.HOST_PIN);
  if (!cfg.pin) {
    cfg.pin = String(crypto.randomInt(1000, 10000));
    writeFileSync(CONFIG_FILE, JSON.stringify({ pin: cfg.pin }));
  }
  return cfg;
}
const config = loadConfig();
const pinOk = (given) => {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(config.pin);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// ---------- the join address that goes in the QR code ----------
// The address in the QR code. Worked out on every request (not once at startup) so that when the
// Pi joins a different network, the QR code follows it. PUBLIC_URL pins it and turns that off.
const currentJoinUrl = () => (process.env.PUBLIC_URL ?? `http://${pickAddress(os.networkInterfaces())}${PORT === 80 ? '' : `:${PORT}`}`).replace(/\/?$/, '/');
const wifiString = process.env.WIFI_SSID
  ? `WIFI:T:${process.env.WIFI_PASSWORD ? 'WPA' : 'nopass'};S:${process.env.WIFI_SSID};${process.env.WIFI_PASSWORD ? `P:${process.env.WIFI_PASSWORD};` : ''};`
  : null;

// ---------- question sets on disk: data/<game>/<id>.json ----------
const SET_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const setPath = (gameId, id) => path.join(DATA_DIR, gameId, `${id}.json`);
function readSet(gameId, id) {
  if (!GAMES[gameId] || !SET_ID.test(id) || !existsSync(setPath(gameId, id))) return null;
  try { return JSON.parse(readFileSync(setPath(gameId, id), 'utf8')); } catch { return null; }
}
function listSets(gameId) {
  if (!GAMES[gameId]) return [];
  return readdirSync(path.join(DATA_DIR, gameId)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((id) => SET_ID.test(id))
    .map((id) => ({ id, title: readSet(gameId, id)?.title ?? id })).sort((a, b) => a.title.localeCompare(b.title));
}

// ---------- the room, saved to disk so a restart does not lose the game ----------
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
function saveNow() {
  try {
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(room));
    renameSync(tmp, STATE_FILE);
  } catch (e) { console.error('Could not save state:', e.message); }
}
let broadcastQueued = false;
const room = new Room({
  games: GAMES,
  loadContent: readSet,
  listContent: listSets,
  onChange() {
    saveSoon();
    if (!broadcastQueued) { broadcastQueued = true; queueMicrotask(() => { broadcastQueued = false; broadcast(); }); }
  },
});
try { room.restore(JSON.parse(readFileSync(STATE_FILE, 'utf8'))); } catch { /* fresh start */ }
// With a single game installed there is nothing to choose, so pick it.
if (!room.gameId && Object.keys(GAMES).length === 1) room.chooseGame(Object.keys(GAMES)[0]);

// ---------- custom sounds: data/sounds/<name>.mp3|wav|ogg|m4a replace the built-in ones ----------
const SOUND_FILE = /^[a-z0-9-]+\.(mp3|wav|ogg|m4a)$/;
const SOUND_TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
const listSounds = () => readdirSync(SOUNDS_DIR).filter((f) => SOUND_FILE.test(f)).map((f) => ({ name: f.replace(/\.[^.]+$/, ''), url: `/sounds/${f}` }));

// ---------- HTTP ----------
const PAGES = { '/': 'play.html', '/play': 'play.html', '/tv': 'tv.html', '/host': 'host.html', '/editor': 'editor.html' };
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req, limit = 1_000_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

// ---------- host info: only for a browser on the Pi itself ----------
// Shows the host page address, a QR code for it, and the PIN, so the host never needs a terminal to
// find them. Anyone on the network is refused: the PIN is for the person at the Pi's screen.
const isLocalRequest = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function hostInfoPage() {
  const hostUrl = `${currentJoinUrl()}host`;
  const qr = await QRCode.toString(hostUrl, { type: 'svg', margin: 1 });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game Night – Host info</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#0a1030;color:#f4f6ff;display:grid;place-items:center;min-height:100vh;text-align:center}
main{padding:24px;max-width:520px}h1{margin:0 0 4px}p{color:#9aa8e6;line-height:1.4}.pin{font-size:56px;font-weight:800;letter-spacing:.15em;margin:8px 0}
.qr{background:#fff;padding:12px;border-radius:12px;width:260px;margin:12px auto}.qr svg{display:block;width:100%;height:auto}code{background:#16225f;padding:2px 8px;border-radius:6px;color:#fff}
</style></head><body><main><h1>Host controls</h1>
<p>On your phone or tablet, scan this or open <code>${escapeHtml(hostUrl)}</code></p>
<div class="qr">${qr}</div><p>Then enter the host PIN:</p><div class="pin">${escapeHtml(config.pin)}</div>
<p>Close this window before guests arrive; the PIN shows answers to anyone who has it.</p></main></body></html>`;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/info') return send(res, 200, { joinUrl: currentJoinUrl(), wifi: !!wifiString });
  if (url.pathname === '/api/sounds') return send(res, 200, listSounds());
  if (url.pathname === '/api/qr.svg') return send(res, 200, await QRCode.toString(currentJoinUrl(), { type: 'svg', margin: 1 }), 'image/svg+xml');
  if (url.pathname === '/api/wifi-qr.svg') {
    if (!wifiString) return send(res, 404, { error: 'Wi-Fi QR not configured (set WIFI_SSID)' });
    return send(res, 200, await QRCode.toString(wifiString, { type: 'svg', margin: 1 }), 'image/svg+xml');
  }
  if (url.pathname === '/api/games') return send(res, 200, Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, description: g.description })));
  // Everything below exposes answers: host PIN required.
  if (!pinOk(req.headers['x-host-pin'])) return send(res, 401, { error: 'Wrong or missing host PIN' });
  const m = url.pathname.match(/^\/api\/games\/([a-z0-9-]+)\/sets(?:\/([^/]+))?$/);
  if (!m || !GAMES[m[1]]) return send(res, 404, { error: 'Not found' });
  const [, gameId, id] = m;
  if (!id) return req.method === 'GET' ? send(res, 200, listSets(gameId)) : send(res, 405, { error: 'Method not allowed' });
  if (!SET_ID.test(id)) return send(res, 400, { error: 'Set id must be lowercase letters, numbers and dashes' });
  if (req.method === 'GET') {
    const set = readSet(gameId, id);
    return set ? send(res, 200, set) : send(res, 404, { error: 'No such set' });
  }
  if (req.method === 'PUT') {
    let set;
    try { set = JSON.parse(await readBody(req)); GAMES[gameId].validateContent(set); } catch (e) { return send(res, 400, { error: e.message }); }
    writeFileSync(setPath(gameId, id), JSON.stringify(set, null, 2));
    room.contentChanged(gameId, id);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE') {
    if (room.gameId === gameId && room.inProgress() && room.game?.usesContent?.(id)) return send(res, 409, { error: 'That set is in play' });
    if (existsSync(setPath(gameId, id))) unlinkSync(setPath(gameId, id));
    room.contentChanged(gameId, id);
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: 'Method not allowed' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/host-info') {
      if (!isLocalRequest(req)) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, await hostInfoPage(), 'text/html; charset=utf-8');
    }
    if (url.pathname.startsWith('/sounds/')) {
      const file = url.pathname.slice('/sounds/'.length);
      if (!SOUND_FILE.test(file) || !existsSync(path.join(SOUNDS_DIR, file))) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, readFileSync(path.join(SOUNDS_DIR, file)), SOUND_TYPES[path.extname(file)]);
    }
    const file = PAGES[url.pathname] ?? decodeURIComponent(url.pathname.slice(1));
    const full = path.resolve(PUBLIC_DIR, file);
    if (!full.startsWith(PUBLIC_DIR + path.sep) || !existsSync(full)) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, readFileSync(full), TYPES[path.extname(full)] ?? 'application/octet-stream');
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Server error' });
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const sockets = new Set();
const sendJson = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function viewFor(ws, cache) {
  if (ws.role === 'host') return (cache.host ??= room.hostView());
  const pub = (cache.pub ??= room.publicView());
  return ws.role === 'player' ? room.playerView(ws.playerId, pub) : pub;
}
function broadcast() {
  const cache = {};
  for (const ws of sockets) if (ws.role) sendJson(ws, { t: 'state', view: viewFor(ws, cache) });
}
function sendState(ws) { sendJson(ws, { t: 'state', view: viewFor(ws, {}) }); }

function attachPlayer(ws, player) {
  ws.playerId = player.id;
  room.setConnected(player.id, true);
}
const liveSockets = (playerId) => [...sockets].filter((s) => s.playerId === playerId).length;

function handle(ws, msg) {
  switch (msg.t) {
    case 'hello': {
      if (msg.role === 'tv') ws.role = 'tv';
      else if (msg.role === 'host') {
        if (!pinOk(msg.pin)) { sendJson(ws, { t: 'bad-pin' }); return; }
        ws.role = 'host';
      } else if (msg.role === 'player') {
        ws.role = 'player';
        const p = room.playerByToken(msg.token);
        if (p) attachPlayer(ws, p);
        else sendJson(ws, { t: 'need-join' });
      } else return;
      sendState(ws);
      return;
    }
    case 'join': {
      if (ws.role !== 'player') return;
      const p = room.join({ name: msg.name, color: msg.color, teamId: msg.teamId, kind: msg.kind === 'buzzer' ? 'buzzer' : 'phone' });
      attachPlayer(ws, p);
      sendJson(ws, { t: 'joined', token: p.token });
      return;
    }
    case 'act': {
      if (ws.role !== 'host') return;
      room.act(msg.action, msg.args ?? {});
      return;
    }
    case 'ping': sendJson(ws, { t: 'pong' }); return;
    default: {
      // Anything else from a joined player belongs to the active game (a buzz, a wager, ...).
      if (ws.role === 'player' && ws.playerId) {
        const reply = room.playerMessage(ws.playerId, msg);
        if (reply) sendJson(ws, reply);
      }
    }
  }
}

wss.on('connection', (ws) => {
  ws._socket.setNoDelay(true); // do not let Nagle batch up a buzz
  ws.isAlive = true;
  sockets.add(ws);
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    try { handle(ws, msg); } catch (e) {
      if (e instanceof GameError) sendJson(ws, { t: 'error', message: e.message });
      else { console.error(e); sendJson(ws, { t: 'error', message: 'Something went wrong' }); }
    }
  });
  ws.on('close', () => {
    sockets.delete(ws);
    if (ws.playerId && !liveSockets(ws.playerId)) room.setConnected(ws.playerId, false);
  });
  ws.on('error', () => {});
});
setInterval(() => {
  for (const ws of sockets) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* closing */ }
  }
}, 10_000).unref();

// Games with timers (answer countdowns) expire them from here.
setInterval(() => room.tick(), 250).unref();

const stop = () => { saveNow(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function printAddresses(joinUrl) {
  console.log(`  TV board : ${joinUrl}tv`);
  console.log(`  Players  : ${joinUrl}   (this is what the QR code opens)`);
  console.log(`  Host     : ${joinUrl}host   PIN ${config.pin}`);
  console.log(`  Editor   : ${joinUrl}editor\n`);
}
server.listen(PORT, () => {
  console.log('\nGame Night is running.');
  printAddresses(currentJoinUrl());
  // If the network changes (the Pi joins another Wi-Fi), say so in the log. The QR code updates itself.
  let shown = currentJoinUrl();
  setInterval(() => {
    const now = currentJoinUrl();
    if (now !== shown) { shown = now; console.log('Network address changed:'); printAddresses(now); }
  }, 5000).unref();
});
