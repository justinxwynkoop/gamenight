// Jeopardy on a TV that is a web browser, in the show look shared with the Apple TV app: a dark stage under blue
// spotlights, the blue board with gold money, the clue on a big blue card, and a strip of player podiums along the
// bottom. Gold is the show's own voice (values, "buzz in now", the champion); a player's colour only ever means that
// player; green and red only ever mean right and wrong.
// The show beats come from the engine (games/jeopardy/game.js, publicView()): the round's opening titles, the clue
// read with a filling bar, the buzzers opening, who buzzed, the ruling on their answer, the answer, the Daily Double
// bet, Final Jeopardy's category, clue and a reveal one player at a time, then the champion.
// The TV page (public/tv.js) swaps in whatever lobby() or render() returns. When ctx.act is given (the website's TV
// page runs the game itself) the TV also has its own controls: buttons in the corner, keyboard shortcuts and clickable
// tiles and packs.
import { h, money } from '../../common.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Outfit:wght@400;600;800&display=swap';
function loadStyles() {
  if (document.getElementById('bw-tv-css')) return;
  document.head.append(
    h('link', { id: 'bw-tv-fonts', rel: 'stylesheet', href: FONTS }),
    h('link', { id: 'bw-tv-css', rel: 'stylesheet', href: '/games/jeopardy/tv.css' }));
}

// The game screens are drawn on a 1920 x 1080 stage, scaled to fit the screen, so they look the same on any TV.
function fitStage() { document.documentElement.style.setProperty('--bw-s', String(Math.min(innerWidth / 1920, innerHeight / 1080))); }
addEventListener('resize', fitStage);
fitStage();

const COLS = ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
const CONFETTI = ['#FFC940', '#F6F4EE', '#2A4BD8', '#FFE08A', '#34D399', '#FF5A5F'];
const ERA_LABELS = { any: 'Any era', classic: 'Classic 80s & 90s', '2000s': '2000s', recent: 'Recent' };
const seasonLabel = (n) => (n ? `Season ${n} (${1983 + n}-${String((1984 + n) % 100).padStart(2, '0')})` : '');
const signed = (n) => (n >= 0 ? '+' : '−') + money(Math.abs(n));
const minus = (n) => money(n).replace('-', '−');

// ---------- icons (drawn, so no font or image is needed) ----------
const NS = 'http://www.w3.org/2000/svg';
function icon(paths, { size = 48, stroke = 'currentColor', width = 2.6 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  for (const d of paths) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.append(p); }
  return svg;
}
const BELL = ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'];
const CHECK = ['M5 12.5l4.5 4.5L19 7.5'];
const CROSS = ['M6 6l12 12M18 6L6 18'];
const CROWN = ['M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z', 'M5 21h14'];
const ARROW = ['M5 12h14M13 6l6 6-6 6'];
const LOCK = ['M7 11V8a5 5 0 0 1 10 0v3', 'M5 11h14v10H5z'];

// ---------- clocks: the ring and the reading bar count down between updates ----------
// The engine sends how much time is left when something changes; between updates the TV counts down by itself.
let live = null; // { leftMs, totalMs, at, ring, num, bar, shown, zero, label }
let play = () => {};
let musicPlaying = () => false;
setInterval(() => {
  if (!live) return;
  const left = Math.max(0, live.leftMs - (performance.now() - live.at));
  const frac = live.totalMs ? left / live.totalMs : 0;
  if (live.ring) { live.ring.style.setProperty('--p', `${frac * 100}%`); live.ring.classList.toggle('low', left < 4000); }
  if (live.bar) live.bar.style.width = `${(1 - frac) * 100}%`;
  if (live.drain) live.drain.style.width = `${frac * 100}%`;
  const secs = Math.ceil(left / 1000);
  if (live.num) live.num.textContent = secs > 0 ? String(secs) : live.zero;
  if (live.label) live.label.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  if (secs !== live.shown) { live.shown = secs; if (live.ticks && secs > 0 && secs <= 5 && left < live.totalMs && !musicPlaying()) play('tick'); }
}, 100);

function clock(timer, extra = {}) {
  if (!timer || !timer.totalMs) return null;
  live = { leftMs: timer.leftMs, totalMs: timer.totalMs, at: performance.now(), shown: Math.ceil(timer.leftMs / 1000), zero: '0', ticks: false, ...extra };
  return live;
}
/** The countdown ring, in the colour of whoever the clock is for. */
function ring(timer, zero = '0') {
  if (!timer || !timer.totalMs) return null;
  const num = h('span', {}, String(Math.ceil(timer.leftMs / 1000)));
  const el = h('div', { class: 'ring', style: { '--p': `${(timer.leftMs / timer.totalMs) * 100}%` } }, num);
  clock(timer, { ring: el, num, zero, ticks: true });
  return el;
}
/** A bar that fills while the clue is read; the buzzers open when it is full. */
function readingBar(timer) {
  const fill = h('i', { style: { width: timer?.totalMs ? `${(1 - timer.leftMs / timer.totalMs) * 100}%` : '0%' } });
  if (timer?.kind === 'reading') clock(timer, { bar: fill });
  return h('div', { class: 'readbar' }, fill);
}
/** A bar that empties, with the time left as m:ss (wagers). */
function drainBar(timer, after) {
  if (!timer?.totalMs) return null;
  const fill = h('i', { style: { width: `${(timer.leftMs / timer.totalMs) * 100}%` } });
  const label = h('span', {}, '');
  clock(timer, { drain: fill, label });
  const s = Math.ceil(timer.leftMs / 1000); label.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return h('div', { class: 'drain' }, h('div', { class: 'track' }, fill), h('span', {}, label, ` ${after}`));
}

// ---------- sounds ----------
const clueKey = (c) => (c ? `${c.ci}:${c.ri}` : '');
/** Sound cues for a change of state. prev and view are the whole { room, game } views. */
export function onChange(prev, view, sound) {
  play = sound.play; musicPlaying = sound.musicPlaying;
  const p = prev.game; const g = view.game;
  if (!p || !g) return;
  const was = p.phase; const now = g.phase;
  phaseNow = now;
  const newClue = clueKey(g.clue) !== clueKey(p.clue);
  // A new player steps up to a podium in the lobby.
  if (now === 'lobby' && was === 'lobby' && g.players.length > p.players.length) sound.play('join');
  if (now === 'round-intro' && was !== 'round-intro') sound.play('roundstart');
  if (now === 'board' && was === 'round-intro') sound.play('board');   // the board fills in
  if (now === 'reading' && (was !== 'reading' || newClue)) sound.play('pick');
  if (now === 'dd-answer' && was === 'dd-wager') sound.play('bet');
  if (now === 'round-end' && was !== 'round-end') sound.play('applause');
  if (now === 'dd-wager' && (was !== 'dd-wager' || newClue)) sound.play('dd');
  else if (now === 'open' && was !== 'open') sound.play('open');
  else if (now === 'answering' && was !== 'answering') sound.play('buzz');
  if (now === 'ruling' && was !== 'ruling') sound.play(g.lastResult?.correct ? 'correct' : 'wrong');
  if (now === 'reveal' && was !== 'reveal') {
    const r = g.lastResult;
    if (!r) sound.play('timeup');                        // nobody buzzed in
    else if (was !== 'ruling') sound.play(r.correct ? 'correct' : 'wrong');
  } else if (g.lastResult && p.lastResult && g.lastResult.overridden !== p.lastResult.overridden) sound.play(g.lastResult.correct ? 'correct' : 'wrong');
  if (now === 'final-wager' && was !== 'final-wager') sound.play('final');
  // Each Final Jeopardy wager and answer locking in (the last answer goes straight on to the reveal, which has its own sound).
  if (['final-wager', 'final-answer'].includes(now) && g.final && p.final && ((g.final.wagered?.length ?? 0) > (p.final.wagered?.length ?? 0)
    || (g.final.answered?.length ?? 0) > (p.final.answered?.length ?? 0))) sound.play('lock');
  // Final Jeopardy's "think" music runs while answers are typed.
  if (now === 'final-answer' && was !== 'final-answer') sound.music('think', { owner: 'final', loop: false });
  else if (now !== 'final-answer') sound.stopMusic('final');
  if (now === 'final-reveal') {
    const f = g.final; const pf = p.final;
    if (f?.stage === 'answer' && (pf?.stage !== 'answer' || pf?.revealIndex !== f.revealIndex)) sound.play('reveal');
    if (f?.stage === 'verdict' && pf?.stage !== 'verdict') { const r = f.reveals.at(-1); if (r) sound.play(r.correct ? 'correct' : 'wrong'); }
    if (f?.stage === 'done' && pf?.stage !== 'done') sound.play('reveal');
  }
  if (now === 'gameover' && was !== 'gameover') {
    sound.play('fanfare'); sound.play('applause');
    // Once the fanfare has played out, the theme comes back over the champion's podium.
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => { if (phaseNow === 'gameover') sound.music('lobby', { owner: 'gameover', loop: true }); }, THEME_AFTER_WIN_MS);
  } else if (now !== 'gameover') { clearTimeout(themeTimer); sound.stopMusic('gameover'); }
}
const THEME_AFTER_WIN_MS = 5500;
let themeTimer = null;
let phaseNow = null;   // the phase in the latest view, for the theme's delayed start

// ---------- state shared by the screens ----------
let g = null;          // the game's view
let act = null;        // (action, args) => void, when this TV may act
let ctxInfo = {};      // { joinUrl, code, site }
let lastReact = 0;
let screenKey = '';
let scores = new Map(); // id -> the score last drawn, for the "+$1,000" that floats up from a podium
let introKey = '';
let cardKey = '';       // the clue (or Final) whose card is on screen: the card zooms in only when it changes
/** ' enter' the first time a card for this clue is drawn, so its entrance plays once per clue, not at every step. */
function enterOnce(key) { const first = key !== cardKey; cardKey = key; return first ? ' enter' : ''; }

const player = (id) => g.players.find((p) => p.id === id) ?? null;
const nameOf = (id) => player(id)?.name ?? 'Someone';
const initial = (name) => String(name || '?').trim().slice(0, 1).toUpperCase();
const av = (p, size) => h('span', { class: 'av', style: { '--c': p ? p.color : '#AEB3D6', ...(size ? { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.43)}px` } : {}) } }, initial(p?.name));
const byScore = () => g.players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
const secs = (ms) => (ms / 1000).toFixed(2);
const isFinal = () => g.phase.startsWith('final');
const hot = (n) => n >= (g.hotStreak ?? 3);
const named = (p, text = p?.name ?? 'Someone') => h('b', { class: 'pname', style: { color: p ? p.color : 'inherit' } }, text);
/** A button that acts on the game, or plain text on a TV that may not act. */
const actBtn = (cls, label, action, args = {}, title = null) => h('button', { type: 'button', class: cls, title, onclick: act ? () => act(action, args) : null }, label);

// ---------- the frame: header, the screen, podiums, controls ----------
function roundLabel() {
  if (g.phase === 'lobby') return 'Lobby';
  if (g.phase === 'gameover') return 'Game over';
  if (isFinal()) return 'Final Jeopardy';
  return g.round === 2 ? 'Round 2 · Double values' : `Round ${g.round}`;
}
function cluesLeft() {
  if (!g.board) return null;
  const n = g.board.reduce((s, c) => s + c.clues.filter((cl) => !cl.used).length, 0);
  return h('div', { class: 'aside' }, h('b', {}, String(n)), n === 1 ? ' clue left' : ' clues left');
}
function frame(kids, { podiums = true, cls = '', right = null, tag = roundLabel() } = {}) {
  // A screen is redrawn on every update (a buzz, a reaction); its entrance animations only play the first time.
  const f = g.final;
  const key = [g.phase, g.round, clueKey(g.clue), g.clue?.tried?.length, g.clue?.buzzes?.length, g.lastResult?.correct, g.lastResult?.overridden,
    f?.revealIndex, f?.stage, g.players.map((p) => p.id).join(','), g.awards?.length].join('|');
  const still = key === screenKey;
  screenKey = key;
  const stage = h('div', { class: `bw-stage ${cls}` },
    h('header', {}, h('div', { class: 'wm' }, h('i', {}, 'JEOP'), 'ARDY'), tag && h('div', { class: 'roundtag' }, tag), right ?? joinInfo()),
    h('main', {}, kids),
    podiums ? podiumStrip() : null);
  return h('div', { class: `bw ${act ? 'can-act' : ''} ${still ? 'still' : ''}` }, stage, controls());
}
function joinInfo() {
  const join = (ctxInfo.site || ctxInfo.joinUrl || '').replace(/^https?:\/\//, '').replace(/\?.*$/, '').replace(/\/$/, '');
  if (!join) return null;
  return h('div', { class: 'aside joininfo' }, 'Join at ', h('span', {}, join), ctxInfo.code && h('b', {}, ctxInfo.code));
}

/** One podium per player along the bottom: their colour on top, name and score, and what they are doing now. */
function podiumStrip() {
  const ph = g.phase;
  const f = g.final;
  const buzzed = ['answering', 'ruling'].includes(ph) ? g.clue?.buzzedId : ph === 'dd-answer' ? g.controllerId : null;
  const tried = new Set(g.clue && ['open', 'answering', 'ruling'].includes(ph) ? g.clue.tried ?? [] : []);
  const changed = new Map();
  for (const p of g.players) {
    const before = scores.get(p.id);
    if (before != null && before !== p.score) changed.set(p.id, p.score - before);
    scores.set(p.id, p.score);
  }
  const current = ph === 'final-reveal' && f && f.stage !== 'done' ? f.order?.[f.revealIndex] : null;
  const shown = new Map((f?.reveals ?? []).map((r) => [r.id, r]));
  const n = g.players.length;
  return h('div', { class: `podiums ${n > 6 ? 'many' : n > 4 ? 'mid' : ''}`, style: { gridTemplateColumns: `repeat(${Math.max(n, 4)}, minmax(0, 1fr))` } }, g.players.map((p) => {
    let tag = null; let mark = null; let cls = '';
    if (ph === 'board' && p.id === g.controllerId) { tag = 'PICKING'; cls = 'pick'; }
    if (buzzed === p.id) cls = 'up';
    else if (tried.has(p.id)) cls = 'out';
    if (ph === 'final-wager' && f) {
      if (!f.eligible.includes(p.id)) cls = 'out';
      else mark = f.wagered.includes(p.id) ? h('span', { class: 'mk good' }, icon(LOCK, { size: 26, width: 2.6 }), 'LOCKED') : h('span', { class: 'mk' }, 'BETTING…');
    }
    if (ph === 'final-answer' && f) {
      if (!f.eligible.includes(p.id)) cls = 'out';
      else mark = f.answered.includes(p.id) ? h('span', { class: 'mk good' }, icon(LOCK, { size: 26, width: 2.6 }), 'LOCKED') : h('span', { class: 'mk' }, 'WRITING…');
    }
    if (ph === 'final-reveal' && f) {
      const r = shown.get(p.id);
      if (p.id === current) cls = 'up';
      else if (r && !r.pending) { cls = f.stage === 'done' ? '' : 'dim'; mark = h('span', { class: `mk ${r.correct ? 'good' : 'bad'}` }, r.wager ? signed(r.correct ? r.wager : -r.wager) : 'KEPT IT'); }
      else if (!f.eligible.includes(p.id)) cls = 'out';
    }
    const delta = changed.get(p.id);
    return h('div', { class: `pod ${cls} ${p.connected ? '' : 'off'}`, style: { '--c': p.color } },
      tag && h('span', { class: 'tag' }, tag),
      av(p),
      h('div', { class: 'who' }, h('div', { class: 'nm' }, p.name), h('div', { class: `sc ${p.score < 0 ? 'neg' : ''}` }, minus(p.score))),
      mark,
      hot(p.streak) && !mark && h('span', { class: 'flame', title: `${p.streak} right in a row` }, `🔥${p.streak}`),
      delta ? h('span', { class: `delta ${delta > 0 ? 'good' : 'bad'}` }, signed(delta)) : null);
  }));
}

/** The TV's own buttons, the same ones the Apple TV shows, with keyboard shortcuts in their labels. */
function controlItems() {
  const ph = g.phase; const list = [];
  if (ph === 'lobby' && g.players.length) list.push(['Start game (S)', 'start']);
  if (g.hostJudges && ph === 'reading') list.push(['Open buzzers (B)', 'openNow']);
  if (g.hostJudges && (ph === 'answering' || ph === 'dd-answer')) list.push(['Correct (C)', 'judge', { correct: true }], ['Wrong (W)', 'judge', { correct: false }]);
  if (['reading', 'open', 'answering', 'ruling', 'dd-wager', 'dd-answer'].includes(ph)) list.push(['Skip clue (K)', 'skip']);
  if (g.lastResult && ['ruling', 'reveal', 'open', 'board'].includes(ph)) list.push(['Flip last ruling (O)', 'override']);
  if (['round-intro', 'reveal', 'round-end', 'final-wager', 'final-answer', 'final-reveal'].includes(ph)) list.push(['Continue (N)', 'advance']);
  if (ph === 'board') list.push(['End round early', 'endRound']);
  if (ph === 'gameover') list.push(['Play again', 'playAgain']);
  if (ph !== 'lobby' && ph !== 'gameover') list.push(['End game', 'endGame']);
  return list;
}
function controls() {
  if (!act) return null;
  const items = controlItems();
  if (!items.length) return null;
  return h('div', { class: 'controls' }, items.map(([label, action, args]) => h('button', {
    type: 'button', class: 'ghost',
    onclick: () => {
      if (action === 'endRound' && !confirm('End this round now?')) return;
      if (action === 'endGame' && !confirm('End this game? Scores reset and everyone goes back to the lobby.')) return;
      act(action, args ?? {});
    },
  }, label)));
}

// Keyboard shortcuts. (M and Escape open the corner menu on the TV page.)
const KEYS = { s: ['start'], k: ['skip'], b: ['openNow'], c: ['judge', { correct: true }], w: ['judge', { correct: false }], o: ['override'], n: ['advance'], enter: ['advance'], ' ': ['advance'] };
addEventListener('keydown', (e) => {
  if (!act || !g || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea, button, .tvmenu')) return;
  const k = KEYS[e.key.toLowerCase()];
  if (!k) return;
  if (k[0] === 'start' && g.phase !== 'lobby') return;
  if (!controlItems().some(([, a]) => a === k[0])) return;
  e.preventDefault();
  act(k[0], k[1] ?? {});
});

// ---------- reactions and confetti (outside the redrawn screen, so they keep animating) ----------
function layer(cls) {
  let el = document.querySelector(`.${cls}`);
  if (!el) { el = h('div', { class: cls }); document.body.append(el); }
  return el;
}
function showReactions() {
  const box = layer('bw-reacts');
  for (const r of g.reactions ?? []) {
    if (r.id <= lastReact) continue;
    lastReact = r.id;
    const p = player(r.pid);
    const el = h('div', { style: { left: `${8 + Math.random() * 80}vw`, '--c': p ? p.color : '#fff' } }, h('span', {}, r.e), h('small', {}, p ? p.name : ''));
    box.append(el);
    setTimeout(() => el.remove(), 3500);
  }
}
function confetti(on) {
  const old = document.querySelector('.bw-confetti');
  if (!on) { old?.remove(); return; }
  if (old) return;
  document.body.append(h('div', { class: 'bw-confetti' }, Array.from({ length: 90 }, (_, i) => h('i', {
    style: { left: `${Math.random() * 100}vw`, background: i % 7 === 0 ? (byScore()[0]?.color ?? CONFETTI[0]) : CONFETTI[i % CONFETTI.length], animationDuration: `${3 + Math.random() * 4}s`, animationDelay: `${-Math.random() * 6}s` },
  }))));
}

// ---------- lobby ----------
/** The lobby screen: how to join, who is in, and what will be played. The TV page shows this before the game starts. */
let packsOpen = false;  // the website's TV: the pack chooser is open in place of the players

export function lobby(view, ctx = {}) {
  setup(view, ctx);
  live = null;
  confetti(false);
  scores = new Map();
  const site = ctxInfo.site || (ctxInfo.joinUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const codeTiles = ctxInfo.code ? h('div', { class: 'codetiles' }, [...ctxInfo.code].map((ch) => h('span', {}, ch))) : null;
  const n = g.players.length;
  const cap = player(g.captainId);
  const choosing = !!g.draft || (!!act && packsOpen);
  const step = (num, title, sub) => h('li', {}, h('span', { class: 'num' }, String(num)), h('span', {}, h('b', {}, title), h('small', {}, sub)));

  const seats = g.players.map((p) => h('div', { class: `seat ${p.connected ? '' : 'off'}`, style: { '--c': p.color } }, av(p),
    h('span', { class: 'who' }, h('b', {}, p.name), h('small', { class: p.id === g.captainId ? 'cap' : '' }, p.id === g.captainId ? '★ Captain' : p.connected ? 'Ready' : 'Reconnecting…'))));
  for (let i = n; i < 8; i++) seats.push(h('div', { class: 'seat open' }, h('span', { class: 'av' }, '+'), h('span', { class: 'who' }, h('small', {}, 'Open seat'))));
  const players = h('div', { class: 'lb-panel lb-players' },
    h('div', { class: 'lb-head' }, h('span', { class: 'eyebrow' }, 'Players'), h('b', {}, n ? `${n} joined` : 'Nobody yet'),
      h('span', { class: 'aside' }, cap ? `${cap.name} is captain` : 'The first to join is captain')),
    h('div', { class: `seats ${n > 8 ? 'many' : ''}` }, seats));
  const packs = h('div', { class: 'lb-panel lb-packs' },
    h('div', { class: 'lb-head' }, h('span', { class: 'eyebrow' }, g.draft ? 'Board preview' : 'Question packs'),
      act && !g.draft && h('button', { type: 'button', class: 'ghost done', onclick: () => toggle(false) }, '✓ Done')),
    h('div', { class: 'packs' }, eraRow(), g.draft ? draftRow() : packRow()));

  const lb = h('div', { class: `bwlobby ${choosing ? 'choosing' : ''}` },
    h('section', { class: 'lb-left' },
      h('div', { class: 'lb-hero' }, h('div', { class: 'eyebrow sun' }, 'Tonight’s trivia showdown'),
        h('h1', {}, 'Grab your phone.', h('br'), h('i', {}, 'It’s your buzzer.'))),
      h('ol', { class: 'lb-steps' },
        step(1, 'Scan the code', 'with your phone camera'),
        step(2, 'Pick a name', 'and your colour'),
        step(3, 'Buzz in first', g.hostJudges ? 'and say your answer' : 'then type your answer')),
      players, packs, boardLine()),
    h('aside', { class: 'joinbox' },
      h('div', { class: 'eyebrow' }, 'Scan to join'),
      h('div', { class: 'qr-big' }, ctx.qr ? ctx.qr() : null),
      ctxInfo.code
        ? h('div', { class: 'url' }, 'or go to ', h('b', {}, site), h('br'), 'and enter ', h('b', { class: 'roomcode' }, ctxInfo.code))
        : h('div', { class: 'url' }, 'or go to ', h('b', {}, site)),
      codeTiles));
  function toggle(open) {
    packsOpen = open;
    lb.classList.toggle('choosing', !!g.draft || open);
    const btn = lb.querySelector('.lb-board button');
    if (btn) btn.textContent = open ? '✓ Done' : 'Change packs';
  }
  lb.toggle = toggle;
  screenKey = '';
  return h('div', { class: `bw lobbyscreen ${act ? 'can-act' : ''}` },
    h('header', {}, h('div', { class: 'wm' }, h('i', {}, 'JEOP'), 'ARDY'), h('div', { class: 'roundtag' }, 'Lobby')),
    h('main', {}, lb, h('div', { class: 'lb-foot' },
      cap ? [h('b', {}, cap.name), g.hostJudges ? ' or the host starts the game when everyone is in' : ' starts the game from their phone when everyone is in']
        : 'Waiting for players to scan in')),
    controls());
}

/** "Tonight's board": one line saying what will be played, with a button to change it on a TV that may act. */
function boardLine() {
  const chosen = (g.packs ?? []).filter((pk) => pk.selected).map((pk) => pk.title);
  const what = g.asWritten ? 'Your own board, as written' : g.draft ? 'Your board (preview)'
    : chosen.length ? (chosen.length > 2 ? `${chosen.slice(0, 2).join(' + ')} + ${chosen.length - 2} more` : chosen.join(' + ')) : 'No packs chosen';
  const n = g.categoryCount ?? 0;
  const bits = [n ? `${n} categories` : null, g.easyMode ? 'easy mode' : null, g.hasArchive ? (ERA_LABELS[g.era] ?? g.era ?? '').toLowerCase() : null].filter(Boolean);
  return h('div', { class: 'lb-board' },
    h('div', { class: 'strip' }, Array.from({ length: 6 }, (_, i) => h('i', { style: { '--d': String(i) } }, '$'))),
    h('div', { class: 'what' }, h('div', { class: 'eyebrow' }, 'Tonight’s board'),
      h('div', {}, what, bits.length ? h('span', {}, ` · ${bits.join(' · ')}`) : null, !g.asWritten && n < 12 ? h('span', { class: 'warn' }, ' · needs at least 12 categories') : null)),
    act && !g.draft
      ? h('button', { type: 'button', class: 'ghost', onclick: (e) => e.currentTarget.closest('.bwlobby')?.toggle(!packsOpen) }, packsOpen ? '✓ Done' : 'Change packs')
      : h('div', { class: 'aside' }, 'The host picks packs', h('br'), 'on their phone'));
}

function eraRow() {
  if (!g.hasArchive) return null;
  const note = g.archiveLoading ? 'Loading clues…' : g.archiveError ? h('span', { class: 'warn' }, act ? 'Real-show clues did not load. Click an era to retry.' : 'Real-show clues did not load. Pick an era to retry.') : seasonLabel(g.archiveSeason);
  return [h('div', { class: 'packlabel' }, 'Clues from · ', note),
    (g.eras ?? []).map((e) => actBtn(`pack era ${g.era === e ? 'on' : ''}`, [g.era === e ? '✓ ' : '', ERA_LABELS[e] ?? e], 'setEra', { era: e })),
    h('div', { class: 'brk' })];
}
function packRow() {
  const n = g.categoryCount ?? 0;
  return [
    h('div', { class: 'packlabel' }, g.asWritten ? 'Playing your own board just as you wrote it' : ['Question packs', act ? ' (click to switch on or off)' : '', ` · ${n} categories`, n < 12 ? h('span', { class: 'warn' }, ' need at least 12') : '']),
    g.easyAvailable && actBtn(`pack ${g.easyMode ? 'on' : ''}`, [g.easyMode ? '✓ ' : '', '★ Easy mode'], 'toggleEasy', {}, 'Only casual, family-friendly questions'),
    (g.packs ?? []).map((pk) => actBtn(`pack ${pk.selected ? 'on' : ''}`, [pk.selected ? '✓ ' : '', pk.title, ' ', h('small', {}, pk.own ? 'board' : String(pk.count))], 'togglePack', { pack: pk.id }, pk.description)),
    !g.asWritten && n >= 12 && act && actBtn('pack sun', '▦ Preview the board', 'previewBoard'),
  ];
}
function draftRow() {
  return [
    h('div', { class: 'packlabel' }, act ? 'Your board (click a category to swap it)' : 'Your board'),
    g.draft.map((row, r) => [h('div', { class: 'brk', style: { height: '0' } }), h('span', { class: 'rlabel' }, `R${r + 1}`),
      row.map((name, ci) => actBtn('pack mini on', ['↻ ', name], 'swapCategory', { r: r + 1, ci }, 'Swap this category'))]),
    act && [h('div', { class: 'brk' }), actBtn('pack mini', 'Shuffle all', 'previewBoard'), actBtn('pack mini', 'Back to packs', 'clearPreview')],
  ];
}

// ---------- the round's opening titles ----------
function roundIntro() {
  const key = `${g.round}`;
  const first = key !== introKey;
  introKey = key;
  const picker = player(g.controllerId);
  const ofTotal = g.rounds > 1 ? (g.round === 1 ? 'Let’s play' : 'Values double') : 'One board tonight';
  const lowest = g.round > 1 && picker && g.players.length > 1;
  return frame(h('div', { class: `intro ${first ? 'enter' : ''}` },
    h('div', { class: 'eyebrow sun' }, ofTotal),
    h('div', { class: 'title' }, `ROUND ${g.round}`),
    h('div', { class: 'lead' }, 'Tonight’s categories'),
    h('div', { class: 'cats' }, (g.board ?? []).map((c, i) => h('div', { class: 'cat', style: { '--d': String(i) } }, h('span', {}, c.name)))),
    picker && h('div', { class: 'picker' }, av(picker), h('span', {}, named(picker),
      lowest ? ` has the lowest score, so ${picker.name} picks first.` : ' picks first.'))), { podiums: false, tag: null, right: h('div', {}) });
}

// ---------- the board ----------
let boardKey = '';
function board() {
  const key = `${g.round}:${g.board.map((c) => c.name).join('|')}`;
  const enter = key !== boardKey;
  boardKey = key;
  const rows = Math.max(...g.board.map((c) => c.clues.length));
  const cells = g.board.map((c) => h('div', { class: 'cat' }, h('span', {}, c.name)));
  for (let ri = 0; ri < rows; ri++) {
    g.board.forEach((c, ci) => {
      const cl = c.clues[ri];
      const used = !cl || cl.used;
      cells.push(h('div', {
        class: `tile ${used ? 'used' : ''}`, style: { '--d': String(ri * 6 + ci) },
        onclick: act && !used ? () => act('pick', { ci, ri }) : null,
      }, used ? '' : money(cl.value)));
    });
  }
  const picker = player(g.controllerId);
  return frame([
    h('div', { class: `board ${enter ? 'enter' : ''}`, style: { gridTemplateColumns: `repeat(${g.board.length}, minmax(0, 1fr))`, gridTemplateRows: `1.3fr repeat(${rows}, minmax(0, 1fr))` } }, cells),
    h('div', { class: 'caption' }, av(picker, 48), h('span', {}, named(picker),
      g.hostJudges ? ', it’s your pick. Tell the host a category and an amount.' : ', it’s your pick. Choose a clue on your phone.')),
  ], { right: cluesLeft() });
}

// ---------- a clue ----------
/** Everyone who buzzed on this clue, fastest first, with their time. */
function buzzChips(c, { label = false, open = 1 } = {}) {
  // One opening at a time: after a miss the buzzers open again and everyone is timed afresh.
  const list = (c.buzzes ?? []).filter((b) => (b.open ?? 1) === open);
  if (!list.length) return null;
  return h('div', { class: 'buzzes' }, label && h('span', { class: 'lbl' }, 'BUZZ TIMES'), list.slice(0, 6).map((b, i) => h('span', { class: `chip ${i === 0 ? 'first' : ''}` },
    av(player(b.pid)), nameOf(b.pid), ' ', h('b', {}, `${secs(b.ms)}s`))));
}

function card(c, { q, band, edge = null, cls = '' }) {
  const value = c.dd ? `DAILY DOUBLE · ${money(c.wager ?? 0)}` : money(c.value);
  return h('div', { class: `card ${cls}${enterOnce(`${g.round}:${clueKey(c)}`)}`, style: edge ? { '--c': edge } : {} },
    h('div', { class: 'rail' }, h('div', { class: 'cn' }, c.cat), h('div', { class: 'val' }, value)),
    q,
    band);
}

function clue() {
  const c = g.clue;
  if (g.phase === 'dd-wager') return ddSplash(c, null);
  const q = h('div', { class: 'q' }, c.q ?? '');
  if (g.phase === 'reading') {
    const band = g.hostJudges
      ? h('div', { class: 'band' }, h('div', { class: 'grow' }, h('div', { class: 'hint' }, 'The host is reading the clue. Thumbs ready.')))
      : h('div', { class: 'band' }, h('div', { class: 'grow' }, h('div', { class: 'hint' }, 'Listen up. Buzzers open when the bar fills.'), readingBar(g.timer)));
    return frame(card(c, { q, band }));
  }
  if (g.phase === 'open') {
    const again = (c.tried?.length ?? 0) > 0;
    const band = h('div', { class: 'band' },
      h('div', { class: 'go' }, icon(BELL, { size: 48, stroke: '#0A0C1C' }), again ? 'ANYONE ELSE? BUZZ IN' : 'BUZZ IN NOW'),
      ring(g.timer));
    return frame(card(c, { q, band, edge: '#FFC940', cls: 'open' }));
  }
  if (g.phase === 'answering' || g.phase === 'dd-answer') {
    const dd = g.phase === 'dd-answer';
    const p = player(dd ? g.controllerId : c.buzzedId);
    const doing = g.hostJudges ? 'say your answer!' : dd ? `bet ${money(c.wager ?? 0)} and is answering` : 'is typing an answer';
    const band = h('div', { class: 'band' },
      av(p, 104),
      h('div', { class: 'grow' },
        h('div', { class: 'buzzer' }, h('span', { class: 'big', style: { color: p?.color } }, (p?.name ?? 'Someone').toUpperCase()), h('span', {}, doing)),
        dd ? null : buzzChips(c, { open: c.open || 1 })),
      ring(g.timer, g.hostJudges ? 'TIME' : '0'));
    const el = frame(card(c, { q: h('div', { class: 'q small' }, c.q ?? ''), band, edge: p?.color ?? '#FFC940' }));
    // The bet, full screen, for a moment before the clue.
    if (dd) el.querySelector('main').append(ddSplash(c, c.wager, true));
    return el;
  }
  if (g.phase === 'ruling') return ruling(c);
  return reveal(c);
}

function stamp(ok, text) {
  return h('div', { class: `stamp ${ok ? 'good' : 'bad'}` }, icon(ok ? CHECK : CROSS, { size: 52, stroke: '#0A0C1C', width: 3.2 }), text);
}

/** Their answer, big, and the ruling stamped on it. */
function ruling(c) {
  const r = g.lastResult;
  const p = player(r?.pid);
  const blank = !r || r.answer == null || r.answer === '' || r.timedOut;
  const others = g.players.filter((x) => x.connected && !(c.tried ?? []).includes(x.id) && x.id !== r?.pid).length > 0;
  const next = !r ? '' : r.correct ? `${p?.name ?? 'They'} ${c.dd ? 'keeps' : 'takes'} control of the board.`
    : c.dd ? 'Here’s the answer.' : others ? 'Everyone else can buzz in again in a moment.' : 'Here’s the answer.';
  const delta = r ? Math.abs(r.delta ?? 0) : 0;
  return frame(card(c, {
    q: h('div', { class: 'q faint' }, c.q ?? ''),
    band: [
      h('div', { class: 'ruling' },
        h('div', { class: 'says' }, av(p), named(p), blank ? (r?.timedOut ? ' ran out of time' : ' did not answer') : ' says'),
        blank ? null : h('div', { class: 'theirs' }, `“${r.answer}”`),
        stamp(!!r?.correct, r?.correct ? `RIGHT · ${signed(delta)}` : `${blank ? 'TIME’S UP' : 'NOT QUITE'} · −${money(delta)}`)),
      h('div', { class: 'foot' }, next),
    ],
  }));
}

function reveal(c) {
  const r = g.lastResult;
  const p = player(r?.pid);
  let line;
  if (!r) line = h('div', { class: 'result none' }, (c.buzzes ?? []).length ? 'Nobody got it' : 'Nobody buzzed in');
  else if (r.correct) {
    line = h('div', { class: 'result good' }, av(p, 48), h('span', {}, named(p), ' got it', r.answer ? [' with “', r.answer, '”'] : ''),
      h('b', {}, signed(Math.abs(r.delta ?? 0))), r.overridden ? h('small', {}, 'ruling flipped') : null);
  } else {
    line = h('div', { class: 'result bad' }, av(p, 48), h('span', {}, named(p), r.timedOut || !r.answer ? ' ran out of time' : [' said “', r.answer, '”']),
      h('b', {}, `−${money(Math.abs(r.delta ?? 0))}`), r.overridden ? h('small', {}, 'ruling flipped') : null);
  }
  const streak = r && r.correct && hot(r.streak ?? 0) ? h('div', { class: 'hot' }, `🔥 ${nameOf(r.pid)} is on fire! ${r.streak} in a row`) : null;
  return frame(h('div', { class: `card reveal${enterOnce(`${g.round}:${clueKey(c)}`)}` },
    h('div', { class: 'rail' }, h('div', { class: 'cn' }, c.cat), h('div', { class: 'val' }, c.dd ? 'DAILY DOUBLE' : money(c.value))),
    h('div', { class: 'q faint' }, c.q ?? ''),
    h('div', { class: 'answer' }, h('div', { class: 'eyebrow' }, 'THE ANSWER'), h('div', { class: 'ans' }, c.answer ?? ''), line, streak),
    (c.buzzes ?? []).length ? h('div', { class: 'foot' }, buzzChips(c, { label: true })) : null));
}

/** The Daily Double: full screen, the board's blue in rays. With a bet, "Maya bets $1,000". */
function ddSplash(c, wager, overlay = false) {
  const p = player(g.controllerId);
  const el = h('div', { class: `dd ${overlay ? 'overlay' : ''}` },
    h('div', { class: 'title' }, 'DAILY', h('br'), 'DOUBLE'),
    h('div', { class: 'catpill' }, c.cat),
    h('div', { class: 'bet', style: { '--c': p?.color ?? '#FFC940' } }, av(p, 84),
      wager == null ? h('span', {}, named(p), ' is placing a bet') : [h('span', {}, named(p), ' bets'), h('b', {}, money(wager))]),
    h('div', { class: 'lead' }, wager == null ? `Up to ${money(Math.max(p?.score ?? 0, g.round === 2 ? 2000 : 1000))}. Only ${p?.name ?? 'they'} answers this one.` : `Only ${p?.name ?? 'they'} answers this one. Here comes the clue.`));
  if (!overlay) return frame(el, { podiums: false });
  return el;
}

// ---------- end of a round ----------
function standings() {
  const sorted = byScore();
  const top = Math.max(1, sorted.length ? sorted[0].score : 1);
  return h('div', { class: 'standings' }, sorted.map((p, i) => h('div', { class: 'row', style: { '--c': p.color, '--w': `${(Math.max(0, p.score) / top) * 100}%`, '--i': String(i) } },
    h('span', { class: 'rank' }, String(i + 1)), av(p), h('span', { class: 'nm' }, p.name), h('b', { class: p.score < 0 ? 'neg' : '' }, minus(p.score)))));
}
function roundEnd() {
  const more = g.round < g.rounds;
  return frame(h('div', { class: 'splash' },
    h('div', { class: 'eyebrow sun' }, `Round ${g.round} is done`),
    h('div', { class: 'title' }, more ? `NEXT: ROUND ${g.round + 1}` : 'NEXT: FINAL JEOPARDY'),
    h('div', { class: 'lead' }, more ? 'Every value doubles. Lowest score picks first.' : 'One clue. Everyone wagers in secret.'),
    standings(),
    h('div', { class: 'lead small' }, `The ${g.hostJudges ? 'host' : 'captain'} taps Continue to keep going.`)), { podiums: false });
}

// ---------- Final Jeopardy ----------
function final() {
  const f = g.final;
  if (g.phase === 'final-wager') {
    return frame(h('div', { class: 'splash' },
      h('div', { class: 'eyebrow sun' }, 'THE FINAL CATEGORY IS'),
      h('div', { class: 'fcat' }, f.category),
      h('div', { class: 'lead strong' }, 'Make your wager on your phone. ', h('span', {}, 'Nobody sees it until the reveal.')),
      drainBar(g.timer, 'left to wager')));
  }
  if (g.phase === 'final-answer') {
    const band = h('div', { class: 'band' },
      h('div', { class: 'grow' }, h('div', { class: 'hint' }, 'Write your response on your phone. ', h('span', {}, `${f.answered.length} of ${f.eligible.length} locked in`))),
      ring(g.timer));
    return frame(h('div', { class: `card${enterOnce('final')}`, style: { '--c': '#FFC940' } },
      h('div', { class: 'rail' }, h('div', { class: 'cn' }, f.category), h('div', { class: 'val' }, 'FINAL JEOPARDY')),
      h('div', { class: 'q' }, f.q ?? ''), band));
  }
  return finalReveal();
}

function finalReveal() {
  const f = g.final;
  const order = f.order ?? [];
  if (f.stage === 'done' || !order.length) {
    // The correct response, last of all.
    const right = (f.reveals ?? []).filter((r) => r.correct).map((r) => player(r.id)).filter(Boolean);
    return frame(h('div', { class: 'splash' },
      h('div', { class: 'lead faint' }, f.q ?? ''),
      h('div', { class: 'eyebrow sun' }, 'THE CORRECT RESPONSE'),
      h('div', { class: 'fans' }, f.answer ?? '…'),
      h('div', { class: 'lead' }, right.length ? [right.map((p, i) => [i ? (i === right.length - 1 ? ' and ' : ', ') : '', named(p)]), right.length === 1 ? ' got it.' : ' got it.'] : 'Nobody got it this time.')),
    { tag: `Final Jeopardy · ${f.category}` });
  }
  const r = f.reveals.at(-1);
  const p = player(r?.id);
  const verdict = r && !r.pending;
  const after = p ? p.score : 0;
  const wagerAmt = verdict ? (r.correct ? r.wager : -r.wager) : null;
  const steps = [['Their answer', true], ['Right or wrong', verdict], ['The wager', verdict]];
  return frame(h('div', { class: 'freveal', style: { '--c': p?.color ?? '#FFC940' } },
    h('div', { class: 'who' }, av(p, 110), h('span', { style: { color: p?.color } }, (p?.name ?? 'Someone').toUpperCase())),
    h('div', { class: 'lead' }, 'wrote'),
    h('div', { class: 'response' }, h('div', {}, r?.answer && r.answer !== '(no answer)' ? r.answer : '(nothing)'),
      verdict ? stamp(r.correct, r.correct ? 'RIGHT' : 'WRONG') : null),
    h('div', { class: `money ${verdict ? '' : 'wait'}` },
      h('div', {}, h('div', { class: 'eyebrow' }, 'WAGERED'), h('div', { class: `amt ${verdict ? (r.correct ? 'good' : 'bad') : ''}` }, verdict ? (r.wager ? signed(wagerAmt) : '$0') : '$?')),
      icon(ARROW, { size: 60, stroke: '#AEB3D6', width: 2.4 }),
      h('div', {}, h('div', { class: 'eyebrow' }, 'NEW SCORE'), h('div', { class: 'amt' }, verdict ? minus(after) : '…'))),
    h('div', { class: 'steps' }, steps.map(([t, on], i) => h('span', { class: `step ${on ? 'on' : ''}` }, h('b', {}, String(i + 1)), t)))),
  { tag: `Final Jeopardy · ${f.category}`, right: h('div', { class: 'aside' }, `Player ${f.revealIndex + 1} of ${order.length} · lowest score first`) });
}

// ---------- the champion ----------
function gameover() {
  const sorted = byScore();
  const top = sorted.length ? sorted[0].score : 0;
  const champs = sorted.filter((p) => p.score === top);
  const names = champs.map((p, i) => [i ? ' & ' : '', p.name.toUpperCase()]);
  const podium = [sorted[1], sorted[0], sorted[2]].map((p, i) => p && h('div', { class: 'step', style: { '--c': p.color, '--h': ['150px', '210px', '110px'][i] } },
    av(p, i === 1 ? 84 : 60), h('div', { class: 'nm' }, p.name), h('div', { class: 'block' }, h('b', {}, String([2, 1, 3][i])), h('span', {}, minus(p.score)))));
  const awards = (g.awards ?? []).slice(0, 4).map((a, i) => {
    const p = player(a.pid);
    return h('div', { class: 'award', style: { '--c': p ? p.color : '#fff', '--i': String(i) } },
      h('div', { class: 't' }, a.title), h('div', { class: 'p' }, p ? p.name : ''), h('div', { class: 'd' }, a.detail));
  });
  confetti(true);
  const champColor = champs.length === 1 ? champs[0].color : '#FFC940';
  return frame(h('div', { class: 'champ' },
    h('div', { class: 'crown' }, icon(CROWN, { size: 96, stroke: '#FFC940', width: 1.8 })),
    h('div', { class: 'eyebrow sun' }, champs.length > 1 ? 'IT’S A TIE! TONIGHT’S CHAMPIONS' : 'TONIGHT’S CHAMPION'),
    h('div', { class: `name ${champs.length > 1 || (champs[0]?.name.length ?? 0) > 9 ? 'long' : ''}` }, sorted.length ? names : 'NOBODY!'),
    h('div', { class: 'lead' }, h('span', { class: 'dot', style: { background: champColor } }), minus(top), g.final?.answer ? [' · the final answer was ', h('b', {}, g.final.answer)] : null),
    h('div', { class: 'bottom' }, h('div', { class: 'podium' }, podium), awards.length ? h('div', { class: 'awards' }, awards) : null)),
  { podiums: false, tag: null, right: h('div', { class: 'aside' }, `The ${g.hostJudges ? 'host' : 'captain'} can start a new game`), cls: 'gold' });
}

function setup(view, ctx) {
  loadStyles();
  fitStage();
  if (ctx?.sound) { play = ctx.sound.play; musicPlaying = ctx.sound.musicPlaying; }
  g = view.game;
  act = typeof ctx?.act === 'function' ? ctx.act : null;
  ctxInfo = ctx?.info ?? {};
  showReactions();
}

/** Returns the element to show for the current state. The TV page swaps it in. */
export function render(view, ctx) {
  setup(view, ctx);
  live = null; // each screen sets up its own countdown, if it has one
  if (g.phase !== 'gameover') confetti(false);
  if (!['reading', 'open', 'answering', 'ruling', 'dd-answer', 'reveal', 'final-answer'].includes(g.phase)) cardKey = '';
  if (g.phase === 'gameover') return gameover();
  if (g.phase.startsWith('final') && g.final) return final();
  if (g.phase === 'round-end') return roundEnd();
  if (g.phase === 'round-intro') return roundIntro();
  if (g.clue && ['dd-wager', 'reading', 'open', 'answering', 'ruling', 'dd-answer', 'reveal'].includes(g.phase)) return clue();
  if (g.board) return board();
  return frame(h('div', { class: 'splash' }, h('div', { class: 'title' }, 'Getting the board ready…')));
}

/** The TV page calls this when another game takes over the screen. */
export function leave() { live = null; confetti(false); document.querySelector('.bw-reacts')?.remove(); }
