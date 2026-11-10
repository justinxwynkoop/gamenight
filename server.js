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
import { Game, GameError, validateSet } from './game.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(here, 'data');
const SETS_DIR = path.join(DATA_DIR, 'sets');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PUBLIC_DIR = path.join(here, 'public');
const PORT = Number(process.env.PORT ?? 3000);
mkdirSync(SETS_DIR, { recursive: true });

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
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
const joinUrl = (process.env.PUBLIC_URL ?? `http://${lanAddress()}${PORT === 80 ? '' : `:${PORT}`}`).replace(/\/?$/, '/');
const wifiString = process.env.WIFI_SSID
  ? `WIFI:T:${process.env.WIFI_PASSWORD ? 'WPA' : 'nopass'};S:${process.env.WIFI_SSID};${process.env.WIFI_PASSWORD ? `P:${process.env.WIFI_PASSWORD};` : ''};`
  : null;

// ---------- question sets on disk ----------
const SET_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const setPath = (id) => path.join(SETS_DIR, `${id}.json`);
function readSet(id) {
  if (!SET_ID.test(id) || !existsSync(setPath(id))) return null;
  try { return JSON.parse(readFileSync(setPath(id), 'utf8')); } catch { return null; }
}
function listSets() {
  return readdirSync(SETS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((id) => SET_ID.test(id))
    .map((id) => ({ id, title: readSet(id)?.title ?? id })).sort((a, b) => a.title.localeCompare(b.title));
}

// ---------- the game, saved to disk so a restart does not lose it ----------
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
function saveNow() {
  try {
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(game));
    renameSync(tmp, STATE_FILE);
  } catch (e) { console.error('Could not save state:', e.message); }
}
let broadcastQueued = false;
const game = new Game({
  loadSet: readSet,
  onChange() {
    saveSoon();
    if (!broadcastQueued) { broadcastQueued = true; queueMicrotask(() => { broadcastQueued = false; broadcast(); }); }
  },
});
try { game.restore(JSON.parse(readFileSync(STATE_FILE, 'utf8'))); } catch { /* fresh start */ }
if (!game.setId) {
  const first = listSets()[0];
  if (first) { try { game.chooseSet(first.id); } catch { /* ignore */ } }
}

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

async function handleApi(req, res, url) {
  if (url.pathname === '/api/info') return send(res, 200, { joinUrl, wifi: !!wifiString });
  if (url.pathname === '/api/qr.svg') return send(res, 200, await QRCode.toString(joinUrl, { type: 'svg', margin: 1 }), 'image/svg+xml');
  if (url.pathname === '/api/wifi-qr.svg') {
    if (!wifiString) return send(res, 404, { error: 'Wi-Fi QR not configured (set WIFI_SSID)' });
    return send(res, 200, await QRCode.toString(wifiString, { type: 'svg', margin: 1 }), 'image/svg+xml');
  }
  // Everything below exposes answers: host PIN required.
  if (!pinOk(req.headers['x-host-pin'])) return send(res, 401, { error: 'Wrong or missing host PIN' });
  if (url.pathname === '/api/sets' && req.method === 'GET') return send(res, 200, listSets());
  const m = url.pathname.match(/^\/api\/sets\/([^/]+)$/);
  if (!m) return send(res, 404, { error: 'Not found' });
  const id = m[1];
  if (!SET_ID.test(id)) return send(res, 400, { error: 'Set id must be lowercase letters, numbers and dashes' });
  if (req.method === 'GET') {
    const set = readSet(id);
    return set ? send(res, 200, set) : send(res, 404, { error: 'No such set' });
  }
  if (req.method === 'PUT') {
    let set;
    try { set = JSON.parse(await readBody(req)); validateSet(set); } catch (e) { return send(res, 400, { error: e.message }); }
    writeFileSync(setPath(id), JSON.stringify(set, null, 2));
    if (game.setId === id) game.refreshSet();
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE') {
    if (game.setId === id && game.run.status !== 'lobby') return send(res, 409, { error: 'That set is in play' });
    if (existsSync(setPath(id))) unlinkSync(setPath(id));
    if (game.setId === id) { game.setId = null; game.set = null; game.refreshSet(); }
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: 'Method not allowed' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
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
  if (ws.role === 'host') return (cache.host ??= game.hostView());
  const pub = (cache.pub ??= game.publicView());
  if (ws.role === 'player') {
    const p = game.players.find((x) => x.id === ws.playerId);
    return { ...pub, me: p ? { id: p.id, name: p.name, color: p.color, unitId: game.unitOf(p)?.id ?? null } : null };
  }
  return pub;
}
function broadcast() {
  const cache = {};
  for (const ws of sockets) if (ws.role) sendJson(ws, { t: 'state', view: viewFor(ws, cache) });
}
function sendState(ws) { sendJson(ws, { t: 'state', view: viewFor(ws, {}) }); }

function attachPlayer(ws, player) {
  ws.playerId = player.id;
  game.setConnected(player.id, true);
}
const liveSockets = (playerId) => [...sockets].filter((s) => s.playerId === playerId).length;

const HOST_ACTIONS = {
  setMode: (a) => game.setMode(a.mode),
  addTeam: (a) => game.addTeam(a.name),
  removeTeam: (a) => game.removeTeam(a.id),
  setPlayerTeam: (a) => game.setPlayerTeam(a.playerId, a.teamId),
  renameUnit: (a) => game.renameUnit(a.id, a.name),
  removePlayer: (a) => game.removePlayer(a.id),
  clearRoster: () => game.clearRoster(),
  setSettings: (a) => game.setSettings(a),
  chooseSet: (a) => game.chooseSet(a.id),
  startGame: () => game.startGame(),
  endGame: () => game.endGame(),
  setView: (a) => game.setView(a.view),
  adjustScore: (a) => game.adjustScore(a.id, { delta: a.delta, set: a.set }),
  select: (a) => game.select(Number(a.c), Number(a.r)),
  setDailyDoubleUnit: (a) => game.setDailyDoubleUnit(a.id),
  setDailyDoubleWager: (a) => game.setDailyDoubleWager(a.amount),
  openBuzzers: () => game.openBuzzers(),
  awardBuzz: (a) => game.awardBuzz(a.id),
  reopen: () => game.reopen(),
  correct: () => game.correct(),
  wrong: () => game.wrong(),
  reveal: () => game.reveal(),
  closeClue: () => game.closeClue(),
  startFinal: () => game.startFinal(),
  setFinalWager: (a) => game.setFinalWager(a.id, a.amount),
  finalNext: () => game.finalNext(),
  finalJudge: (a) => game.finalJudge(a.id, !!a.ok),
  finishFinal: () => game.finishFinal(),
  finishGame: () => game.finishGame(),
};

function handle(ws, msg) {
  switch (msg.t) {
    case 'hello': {
      if (msg.role === 'tv') ws.role = 'tv';
      else if (msg.role === 'host') {
        if (!pinOk(msg.pin)) { sendJson(ws, { t: 'bad-pin' }); return; }
        ws.role = 'host';
      } else if (msg.role === 'player') {
        ws.role = 'player';
        const p = game.playerByToken(msg.token);
        if (p) attachPlayer(ws, p);
        else sendJson(ws, { t: 'need-join' });
      } else return;
      sendState(ws);
      return;
    }
    case 'join': {
      if (ws.role !== 'player') return;
      const p = game.join({ name: msg.name, color: msg.color, teamId: msg.teamId, kind: msg.kind === 'buzzer' ? 'buzzer' : 'phone' });
      attachPlayer(ws, p);
      sendJson(ws, { t: 'joined', token: p.token });
      return;
    }
    case 'buzz': {
      if (ws.role !== 'player' || !ws.playerId) return;
      const r = game.buzz(ws.playerId); // stamped with the server clock inside
      sendJson(ws, { t: 'buzz-result', ...r });
      return;
    }
    case 'final-wager':
      if (ws.role === 'player' && ws.playerId) { game.finalWagerFrom(ws.playerId, msg.amount); sendJson(ws, { t: 'ack', what: 'wager' }); }
      return;
    case 'final-answer':
      if (ws.role === 'player' && ws.playerId) { game.finalAnswerFrom(ws.playerId, msg.text); sendJson(ws, { t: 'ack', what: 'answer' }); }
      return;
    case 'act': {
      if (ws.role !== 'host') return;
      const fn = HOST_ACTIONS[msg.action];
      if (!fn) throw new GameError(`Unknown action ${msg.action}`);
      fn(msg.args ?? {});
      return;
    }
    case 'ping': sendJson(ws, { t: 'pong' }); return;
    default:
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
    if (ws.playerId && !liveSockets(ws.playerId)) game.setConnected(ws.playerId, false);
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

const stop = () => { saveNow(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

server.listen(PORT, () => {
  console.log(`\nGame Night is running.`);
  console.log(`  TV board : ${joinUrl}tv`);
  console.log(`  Players  : ${joinUrl}   (this is what the QR code opens)`);
  console.log(`  Host     : ${joinUrl}host   PIN ${config.pin}`);
  console.log(`  Editor   : ${joinUrl}editor\n`);
});
