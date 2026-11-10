// The TV page. It owns the connection and the lobby screen, and hands every
// other screen to the active game's module (/games/<id>/tv.js).
import { h, ink, connect, unitById, qrImg } from './common.js';
import { audio } from './audio.js';

const app = document.getElementById('app');
const conn = document.getElementById('conn');
let info = { joinUrl: location.origin + '/' };
let last = null;
let lastKey = '';
let seq = 0; // drops a render that was overtaken by a newer state while its module loaded
const modules = {};
const loaded = {};   // id -> module, once it has loaded (so sound cues can run without waiting)
const load = (id) => (modules[id] ??= import(`/games/${id}/tv.js`).then((m) => (loaded[id] = m)));
const sound = { play: (n) => audio.play(n), music: (n) => audio.music(n), stopMusic: () => audio.stopMusic(), musicPlaying: () => audio.musicPlaying };
const badge = h('div', { class: 'soundbadge hidden' }, '🔇 Click or press any key to turn sound on');
document.body.append(badge);
audio.init();
const unlock = () => { audio.init(); badge.classList.toggle('hidden', !audio.blocked || !audio.enabled); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
setInterval(unlock, 1000);

fetch('/api/info').then((r) => r.json()).then((i) => { info = i; if (last) render(last); }).catch(() => {});
connect({
  hello: { t: 'hello', role: 'tv' },
  onStatus: (up) => conn.classList.toggle('down', !up),
  onState: (v) => {
    const k = JSON.stringify(v);
    if (k === lastKey) return;
    lastKey = k;
    const prev = last;
    last = v;
    effects(prev, v);
    render(v);
  },
});

/** Sound cues: the settings, the host's test button, then whatever the active game wants to play. */
function effects(prev, v) {
  audio.configure(v.room.settings);
  if (!prev) return;
  if (prev.room.settings?.ping !== v.room.settings?.ping) audio.play('correct');
  const mod = v.game && loaded[v.game.game];
  if (mod?.onChange && prev.game?.game === v.game.game) mod.onChange(prev, v, sound);
}

function lobby(v) {
  const { room, game } = v;
  const chips = room.mode === 'teams'
    ? room.teams.map((t) => h('span', { class: 'chip', style: { background: t.color, color: ink(t.color) } },
      `${t.name} · ${unitById(room, t.id)?.members ?? 0}`))
    : room.units.map((u) => h('span', { class: `chip ${u.connected ? '' : 'off'}`, style: { background: u.color, color: ink(u.color) } }, u.name));
  return h('div', { class: 'tv-layout full' }, h('div', { class: 'tv-main' }, h('div', { class: 'lobby' },
    h('div', {},
      h('h1', {}, game?.lobbyTitle ?? 'Game Night'),
      h('p', {}, 'Scan the code with your phone camera,'),
      h('p', {}, `or open ${info.joinUrl.replace(/^https?:\/\//, '')}`),
      h('p', {}, !game ? 'Waiting for the host to pick a game.'
        : room.mode === 'teams' ? 'Pick a team and get ready to play.' : 'Enter a name, pick a colour and get ready to play.'),
      h('div', { class: 'chips' }, chips)),
    h('div', { class: 'qr-big' }, qrImg()))));
}

async function render(v) {
  const mine = ++seq;
  let el;
  if (!v.game || !v.room.inProgress) el = lobby(v);
  else {
    try { const m = await load(v.game.game); el = m.render(v, { info, sound }); } catch (e) {
      console.error(e);
      el = h('div', { class: 'lobby' }, h('h1', {}, 'Could not load this game'));
    }
  }
  if (mine !== seq) return;
  document.title = `Game Night – ${v.game?.lobbyTitle ?? 'TV'}`;
  app.replaceChildren(el);
}
