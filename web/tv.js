// The TV page. It owns the connection and the lobby screen, and hands every
// other screen to the active game's module (/games/<id>/tv.js).
// On a home server it connects to the server like any other screen. On the website (online mode) there is no server:
// the page runs the game engine itself (/tvhost.js, the same engine as the Apple TV app) and phones reach it through
// the Supabase relay.
import { h, ink, connect, unitById, qrImg, setQrKey, setQrSvg, keepAwake } from './common.js';
import { audio } from './audio.js';
import { menuScreen } from './menu.js';

keepAwake();

const app = document.getElementById('app');
const conn = document.getElementById('conn');
let info = { joinUrl: location.origin + '/' };
let last = null;
let lastKey = '';
let seq = 0; // drops a render that was overtaken by a newer state while its module loaded
const modules = {};
const loaded = {};   // id -> module, once it has loaded (so sound cues can run without waiting)
const load = (id) => (modules[id] ??= import(`/games/${id}/tv.js`).then((m) => (loaded[id] = m)));
const sound = { play: (n) => audio.play(n), music: (n, o) => audio.music(n, o), stopMusic: (owner) => audio.stopMusic(owner), musicPlaying: () => audio.musicPlaying,
  speak: (text, done) => audio.speak(text, done), stopSpeaking: () => audio.stopSpeaking(), volume: () => audio.level };
const badge = h('div', { class: 'soundbadge hidden' }, '🔇 Click or press any key to turn sound on');
document.body.append(badge);
audio.init();
const unlock = () => { audio.init(); badge.classList.toggle('hidden', !audio.blocked || !audio.enabled); if (last) lobbyMusic(last); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
setInterval(unlock, 1000);

const online = !!globalThis.GN_RELAY;
let hosted = null;   // online: the engine running in this page

function onState(v) {
  const k = JSON.stringify(v);
  if (k === lastKey) return;
  lastKey = k;
  const prev = last;
  last = v;
  effects(prev, v);
  render(v);
}

if (online) startOnline();
else {
  // The address in the QR code can change (the server joined another network), so ask again now and then
  // and redraw if it did. The QR image itself is fetched fresh each time the screen is drawn.
  const refreshInfo = async () => {
    try {
      const i = await (await fetch('/api/info')).json();
      const changed = i.joinUrl !== info.joinUrl;
      info = i;
      setQrKey(i.joinUrl);
      if (changed && last) render(last);
    } catch { /* offline: try again next time */ }
  };
  refreshInfo();
  setInterval(refreshInfo, 5000);
  connect({ hello: { t: 'hello', role: 'tv' }, onStatus: (up) => conn.classList.toggle('down', !up), onState });
}

async function startOnline() {
  document.body.classList.add('browser-tv');
  const want = new URLSearchParams(location.search).get('game');
  try {
    const { hostTv } = await import('/tvhost.js');
    hosted = await hostTv({
      config: globalThis.GN_RELAY,
      game: want === 'jeopardy' || want === 'feud' ? want : null,
      onState,
      onStatus: (up) => conn.classList.toggle('down', !up),
    });
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'lobby' }, h('h1', {}, 'Could not start the game'), h('p', {}, String(e.message ?? e))));
    return;
  }
  info = { joinUrl: hosted.joinUrl, code: hosted.code, site: location.host };
  setQrSvg(hosted.qrSvg);
  document.body.append(menu());
  if (last) render(last);
}

/** Full screen on and off (a laptop or a smart TV's browser on the TV). */
function fullScreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Online: the corner menu with the host PIN (kept off the main screen, like the Apple TV's Play/Pause menu). */
function menu() {
  const panel = h('div', { class: 'tvmenu-panel hidden' },
    h('p', {}, 'Room code ', h('b', {}, hosted.code)),
    h('p', {}, 'Host PIN ', h('b', {}, hosted.pin)),
    h('p', {}, 'Host page: ', h('b', {}, `${location.host}/host`)),
    h('button', { onclick: () => hosted.newRoom() }, 'New room code'),
    h('button', { onclick: () => hosted.changeGame() }, 'Change game'),
    h('button', { onclick: fullScreen }, 'Full screen (F)'),
  );
  const toggle = () => panel.classList.toggle('hidden');
  addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M' || e.key === 'Escape') toggle();
    if ((e.key === 'f' || e.key === 'F') && !e.target.closest?.('input, textarea')) fullScreen();
  });
  // The button fades away when nobody is using the mouse or keyboard, so it never sits on a score during play.
  let idle = null;
  const wake = () => { document.body.classList.remove('tv-idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('tv-idle'), 4000); };
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'touchstart']) addEventListener(ev, wake, { passive: true });
  wake();
  return h('div', { class: 'tvmenu' }, h('button', { class: 'tvmenu-btn', onclick: toggle }, 'Menu (M)'), panel);
}

/**
 * While players are joining (before the game starts) loop the lobby music: a file called "lobby" if
 * there is one, otherwise "think". It stops when the game starts. Safe to call on every update.
 */
let lobbyOwner = null;
function lobbyMusic(v) {
  audio.setGame(v.game?.game ?? null);   // each game can have its own sounds in data/sounds/<game>/
  const inLobby = !v.game || !v.room.inProgress;
  if (!inLobby) { if (lobbyOwner) audio.stopMusic(lobbyOwner); lobbyOwner = null; return; }
  const owner = `lobby:${v.game?.game ?? ''}`;   // a different game's lobby music replaces this one
  if (lobbyOwner && lobbyOwner !== owner) audio.stopMusic(lobbyOwner);
  lobbyOwner = owner;
  if (audio.musicOwner !== owner || audio.upgrade('lobby')) audio.music('lobby', { owner, loop: true, fallback: 'think' });
}
audio.ready.then(() => { if (last) lobbyMusic(last); });

/** Sound cues: the settings, the host's test button, then whatever the active game wants to play. */
function effects(prev, v) {
  audio.configure(v.room.settings);
  audio.setGame(v.game?.game ?? null);
  lobbyMusic(v);
  if (!prev) return;
  if (prev.room.settings?.ping !== v.room.settings?.ping) audio.play('correct');
  const mod = v.game && loaded[v.game.game];
  if (mod?.onChange && prev.game?.game === v.game.game) mod.onChange(prev, v, sound);
}

function lobby(v) {
  const { room, game } = v;
  const chips = room.mode === 'teams'
    ? room.units.map((u) => h('div', { class: 'teamcard', style: { background: u.color, color: ink(u.color) } },
      `${u.name} · ${u.members}`, u.memberNames?.length ? h('small', {}, u.memberNames.join(', ')) : null))
    : room.units.map((u) => h('span', { class: `chip ${u.connected ? '' : 'off'}`, style: { background: u.color, color: ink(u.color) } }, u.name));
  return h('div', { class: 'tv-layout full' }, h('div', { class: 'tv-main' }, h('div', { class: 'lobby' },
    h('div', {},
      h('h1', {}, game?.lobbyTitle ?? 'Game Night'),
      h('p', {}, 'Scan the code with your phone camera,'),
      info.code
        ? h('p', {}, 'or open ', h('b', {}, info.site), ' and type ', h('b', { class: 'roomcode' }, info.code))
        : h('p', {}, `or open ${info.joinUrl.replace(/^https?:\/\//, '')}`),
      h('p', {}, !game ? (hosted ? 'Pick a game here, or let the host pick one.' : 'Waiting for the host to pick a game.')
        : room.mode === 'teams' ? 'Pick a team and get ready to play.' : 'Enter a name, pick a colour and get ready to play.'),
      h('div', { class: 'chips' }, chips)),
    h('div', { class: 'qr-big' }, qrImg()))));
}

let shownGame = null;
async function render(v) {
  const mine = ++seq;
  let el;
  // A game may draw its own lobby (Jeopardy shows its packs, era and board preview there).
  // ctx.act lets the TV act on the game itself, only when this page runs the game (the website's TV page).
  const ctx = { info, sound, qr: qrImg, act: hosted ? (action, args) => hosted.act(action, args) : null };
  const id = v.game?.game ?? null;
  if (shownGame && shownGame !== id) loaded[shownGame]?.leave?.();
  shownGame = id;
  if (!v.game) el = menuScreen(v, { info, qr: qrImg, music: audio.enabled, choose: hosted ? (gameId) => hosted.chooseGame(gameId) : null });
  else {
    try {
      const m = await load(v.game.game);
      el = !v.room.inProgress ? (m.lobby ? m.lobby(v, ctx) : lobby(v)) : m.render(v, ctx);
    } catch (e) {
      console.error(e);
      el = h('div', { class: 'lobby' }, h('h1', {}, 'Could not load this game'));
    }
  }
  if (mine !== seq) return;
  document.title = `Game Night – ${v.game?.lobbyTitle ?? 'TV'}`;
  app.replaceChildren(el);
}
