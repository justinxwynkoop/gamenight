// The TV page. It owns the connection and the lobby screen, and hands every
// other screen to the active game's module (/games/<id>/tv.js).
import { h, ink, connect, unitById, qrImg } from './common.js';

const app = document.getElementById('app');
const conn = document.getElementById('conn');
let info = { joinUrl: location.origin + '/' };
let last = null;
let lastKey = '';
let seq = 0; // drops a render that was overtaken by a newer state while its module loaded
const modules = {};
const load = (id) => (modules[id] ??= import(`/games/${id}/tv.js`));

fetch('/api/info').then((r) => r.json()).then((i) => { info = i; if (last) render(last); }).catch(() => {});
connect({
  hello: { t: 'hello', role: 'tv' },
  onStatus: (up) => conn.classList.toggle('down', !up),
  onState: (v) => { const k = JSON.stringify(v); if (k !== lastKey) { lastKey = k; last = v; render(v); } },
});

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
    try { const m = await load(v.game.game); el = m.render(v, { info }); } catch (e) {
      console.error(e);
      el = h('div', { class: 'lobby' }, h('h1', {}, 'Could not load this game'));
    }
  }
  if (mine !== seq) return;
  document.title = `Game Night – ${v.game?.lobbyTitle ?? 'TV'}`;
  app.replaceChildren(el);
}
