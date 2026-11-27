// The phone page. It owns joining and the header (name, score), and hands the
// rest of the screen to the active game's module (/games/<id>/player.js).
import { h, scoreText, ink, COLORS, connect, store, unitById, onlineRoom, changeRoom, keepAwake } from './common.js';

keepAwake();

const screen = document.getElementById('screen');
const you = document.getElementById('you');
const scoreEl = document.getElementById('score');
const teamEl = document.getElementById('team');
const offline = document.getElementById('offline');

let view = null;
let offlineHint = null;
let needJoin = false;
let joinError = '';
let shown = '';        // 'join' | 'waiting' | 'game'
let gameId = null;
let instance = null;
const modules = {};
const load = (id) => (modules[id] ??= import(`/games/${id}/player.js`));
// ?seat=2 (3, 4...) is another player on this same phone, in another tab: it keeps its own seat in the room.
const seat = /^[2-9]$/.test(new URLSearchParams(location.search).get('seat') ?? '') ? new URLSearchParams(location.search).get('seat') : '';
const TOKEN = seat ? `gn-token-${seat}` : 'gn-token';
const form = { name: seat ? '' : store('gn-name') ?? '', color: seat ? '' : store('gn-color') ?? '' };

const net = connect({
  hello: () => ({ t: 'hello', role: 'player', token: store(TOKEN) }),
  onStatus: (up) => {
    offline.classList.toggle('hidden', up);
    if (up) { clearTimeout(offlineHint); offlineHint = null; offline.textContent = 'Reconnecting…'; return; }
    // Still down after a few seconds: say what to try, and link the connection check.
    // (Every retry reports "down" again, so the timer is only started once per outage.)
    if (!offlineHint) offlineHint = setTimeout(() => offline.replaceChildren(...(onlineRoom()
      ? [`Can’t reach the TV in room ${onlineRoom()}. Is the TV showing the game? `, h('a', { href: '#', onclick: (e) => { e.preventDefault(); changeRoom(); }, style: { color: '#fff', fontWeight: '800' } }, 'Change room code')]
      : ['Can’t reach the game. Same Wi-Fi as the TV? Try turning off mobile data or a VPN. ', h('a', { href: '/check', style: { color: '#fff', fontWeight: '800' } }, 'Test my connection')])), 5000);
  },
  onState: (v) => { view = v; if (v.room.me) needJoin = false; update(); },
  onMessage: (m) => {
    if (m.t === 'need-join') { needJoin = true; update(); }
    else if (m.t === 'joined') { store(TOKEN, m.token); needJoin = false; joinError = ''; }
    else if (m.t === 'profile-ok') { closeProfile(true); }
    else if (m.t === 'error') { if (needJoin) { joinError = m.message; update(true); } else if (profileErr) profileErr(m.message); else flash(m.message); }
    else instance?.onMessage?.(m);
  },
});

// Before the first update arrives the page is blank. If it never arrives, say why and what to do.
setTimeout(() => {
  if (view) return;
  const room = onlineRoom();
  screen.replaceChildren(room
    ? h('div', { class: 'card' },
      h('h2', {}, 'Waiting for the TV'),
      h('p', {}, `Looking for room ${room}. On the Apple TV, open the game (Jeopardy or Family Feud) and the room code is on the lobby screen and in the Play/Pause menu. Check the four digits, then try again.`),
      (() => { const line = h('p', { class: 'dim' }, net.status()); const t = setInterval(() => { if (!line.isConnected) clearInterval(t); else line.textContent = net.status(); }, 700); return line; })(),
      h('button', { class: 'btn primary', style: { display: 'block', width: '100%', marginTop: '12px' }, onclick: changeRoom }, 'Enter a different room code'))
    : h('div', { class: 'card' },
      h('h2', {}, 'Can’t reach the game yet'),
      h('p', {}, 'Make sure this phone is on the same Wi-Fi as the TV (not a guest network). Turn off mobile data and any VPN or ad-blocker app, then reload.'),
      h('a', { class: 'btn primary', href: '/check', style: { display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '12px' } }, 'Test my connection')));
}, 6000);

function flash(text, kind = '') {
  const t = h('div', { class: `toast ${kind}` }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

function joinScreen() {
  const teams = view.room.mode === 'teams';
  const nameIn = h('input', { value: form.name, maxLength: 20, placeholder: 'Your name', autocomplete: 'off', oninput: (e) => { form.name = e.target.value; } });
  const colorBtns = COLORS.map((c) => h('button', {
    type: 'button', class: form.color === c ? 'sel' : '', style: { background: c }, 'aria-label': c,
    onclick: () => { form.color = c; update(true); },
  }));
  return h('div', { class: 'card' },
    h('h2', {}, view.game?.lobbyTitle ?? 'Join the game'),
    view.room.away?.length ? [
      h('label', {}, 'Already playing? Tap your name to get your seat and score back'),
      h('div', { class: 'rejoin' }, view.room.away.map((p) => h('button', {
        type: 'button', style: { background: p.color, color: ink(p.color) },
        onclick: () => { joinError = ''; net.send({ t: 'join', reclaim: p.id }); },
      }, p.name))),
    ] : null,
    h('label', {}, view.room.away?.length ? 'New player? Your name' : 'Name'), nameIn,
    !teams && [h('label', {}, 'Colour'), h('div', { class: 'colors' }, colorBtns)],
    teams && h('p', { class: 'tag' }, 'You’ll be put on a team. Your team’s colour lights up on this screen.'),
    joinError && h('div', { class: 'err' }, joinError),
    h('button', {
      class: 'btn primary', style: { width: '100%', marginTop: '16px' }, onclick: () => {
        if (!seat) { store('gn-name', form.name); if (form.color) store('gn-color', form.color); }
        joinError = '';
        net.send({ t: 'join', name: form.name, color: form.color || undefined });
      },
    }, 'Join'));
}

// ---------- fix your name, or change your colour (in every game) ----------
let profileBox = null;
let profileErr = null;
let profileSaved = null;   // what was sent, remembered on this phone once the room accepts it
function closeProfile(saved = false) {
  profileBox?.remove(); profileBox = null; profileErr = null;
  if (saved && profileSaved) {
    if (!seat) { store('gn-name', profileSaved.name); if (profileSaved.color) store('gn-color', profileSaved.color); }
    flash('Saved', 'ok');
  }
  profileSaved = null;
}
function openProfile() {
  const me = view?.room.me;
  if (!me || profileBox) return;
  const teams = view.room.mode === 'teams';
  let color = me.color;
  const nameIn = h('input', { value: me.name, maxLength: 20, placeholder: 'Your name', autocomplete: 'off', 'aria-label': 'Your name' });
  const err = h('div', { class: 'err', role: 'alert' });
  profileErr = (message) => { err.textContent = message; };
  const swatches = COLORS.map((c) => h('button', {
    type: 'button', class: c === color ? 'sel' : '', style: { background: c }, 'aria-label': c,
    onclick: () => { color = c; swatches.forEach((b, i) => b.classList.toggle('sel', COLORS[i] === c)); },
  }));
  const save = () => { err.textContent = ''; profileSaved = { name: nameIn.value.trim(), color: teams ? null : color }; net.send({ t: 'profile', name: nameIn.value, color: teams ? undefined : color }); };
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  profileBox = h('div', { class: 'profile-overlay', onclick: (e) => { if (e.target === profileBox) closeProfile(); } },
    h('div', { class: 'card profile', role: 'dialog', 'aria-label': 'Your name and colour' },
      h('h2', {}, 'Your name'),
      h('label', {}, 'Name'), nameIn,
      !teams && [h('label', {}, 'Colour'), h('div', { class: 'colors' }, swatches)],
      teams && h('p', { class: 'tag' }, 'Your team’s colour stays the same.'),
      err,
      h('button', { class: 'btn primary', style: { width: '100%', marginTop: '14px' }, onclick: save }, 'Save'),
      h('button', { class: 'btn', style: { width: '100%', marginTop: '8px' }, onclick: () => closeProfile() }, 'Cancel')));
  document.body.append(profileBox);
  nameIn.focus();
  nameIn.select();
}
you.addEventListener('click', () => { if (view?.room.me) openProfile(); });
you.setAttribute('role', 'button');
you.setAttribute('tabindex', '0');
you.addEventListener('keydown', (e) => { if (e.key === 'Enter' && view?.room.me) openProfile(); });

function updateHeader() {
  const me = view.room.me;
  const mine = unitById(view.room, me.unitId);
  you.replaceChildren(h('span', { class: 'swatch', style: { background: mine?.color ?? me.color } }), ' ', me.name, h('span', { class: 'edit-hint', 'aria-hidden': 'true' }, ' ✎'));
  if (view.room.mode === 'teams' && mine) you.append(h('span', { class: 'tag' }, ` · ${mine.name}`));
  scoreEl.textContent = mine ? scoreText(view, mine.score) : '';
  showTeam(view.room.mode === 'teams' ? mine : null);
}

/** In team play the whole screen takes on your team's colour: a frame round the edge and a banner under the header. */
function showTeam(team) {
  if (!team) {
    teamEl.className = 'team-banner hidden';
    document.body.style.removeProperty('--team');
    return;
  }
  teamEl.className = 'team-banner';
  teamEl.style.background = team.color;
  teamEl.style.color = ink(team.color);
  teamEl.replaceChildren(h('strong', {}, `${team.name.toUpperCase()} TEAM`),
    team.memberNames?.length ? h('span', {}, team.memberNames.join(' · ')) : null);
  document.body.style.setProperty('--team', team.color);
}

function dropGame() { instance?.destroy?.(); instance = null; gameId = null; }

async function showGame(id) {
  if (gameId === id && instance) { instance.update(view); return; }
  if (gameId === id) return; // still loading
  dropGame();
  gameId = id;
  const mod = await load(id);
  if (gameId !== id) return; // the host switched games while this one loaded
  const box = h('div', { style: { display: 'contents' } });
  screen.replaceChildren(box);
  instance = mod.mount(box, { send: net.send, flash, clock: net.clock });
  instance.update(view);
}

function update(force = false) {
  if (!view) return;
  if (needJoin || !view.room.me) {
    if (shown !== 'join' || force) { shown = 'join'; dropGame(); screen.replaceChildren(joinScreen()); }
    you.textContent = 'Game Night'; scoreEl.textContent = '';
    showTeam(null);
    return;
  }
  if (shown === 'join') { shown = ''; screen.replaceChildren(); }
  updateHeader();
  if (!view.game) {
    if (shown !== 'waiting') { shown = 'waiting'; dropGame(); screen.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'You’re in!'), h('p', {}, 'Waiting for the host to pick a game.'))); }
    return;
  }
  shown = 'game';
  showGame(view.game.game).catch((e) => { console.error(e); flash('Could not load this game'); });
}
