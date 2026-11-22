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

// ---------- a clue's sound or video, then the voice ----------
let spokenKey = '';
let clip = null;        // the <audio> or <video> playing a clue's sound or video (kept outside the redrawn screen)
let clipTimer = null;

function stopClip() {
  clearTimeout(clipTimer); clipTimer = null;
  if (clip) { try { clip.pause(); } catch { /* gone */ } clip.removeAttribute('src'); clip.load?.(); clip = null; }
  document.querySelector('.bw-video')?.remove();
}

/**
 * Plays a clue's sound or video, from `start` to `end` seconds (30 at most), and calls `done` once, when it ends or
 * cannot play (a broken link, or a browser that will not play sound before a click). A video fills the screen.
 */
function playClip(media, volume, done) {
  stopClip();
  let called = false;
  const finish = () => { if (called) return; called = true; stopClip(); done(); };
  const el = document.createElement(media.kind === 'video' ? 'video' : 'audio');
  el.preload = 'auto';
  el.playsInline = true;
  el.volume = Math.max(0, Math.min(1, volume));
  const start = media.start ?? 0;
  const end = Math.min(media.end ?? start + 30, start + 30);
  el.src = `${media.url}#t=${start},${end}`;
  el.addEventListener('timeupdate', () => { if (el.currentTime >= end - 0.05) finish(); });
  el.addEventListener('ended', finish);
  el.addEventListener('error', finish);
  if (media.kind === 'video') {
    const box = h('div', { class: 'bw-video' }, el, media.credit ? h('div', { class: 'credit' }, media.credit) : null);
    document.body.append(box);
  }
  clip = el;
  // Loading may take a moment; a clip that never starts or never ends does not hold up the game.
  clipTimer = setTimeout(finish, (end - start) * 1000 + 8000);
  el.play()?.catch?.(() => finish());
}

/**
 * When a clue comes up, the TV plays its sound or video (if it has one), then reads it out loud (unless a host is
 * reading them, or reading aloud is switched off in the lobby). Then it tells the game, which opens the buzzers a
 * moment later.
 */
function speakClue(p, g, now, was, newClue, sound) {
  const clueOn = ['reading', 'dd-answer'].includes(now);
  if (!clueOn) {
    if (spokenKey && !['open', 'answering', 'ruling', 'reveal', 'final-answer'].includes(now)) { sound.stopSpeaking?.(); spokenKey = ''; }
    if (!['dd-answer'].includes(now)) stopClip();
    return;
  }
  const key = `${g.round}:${clueKey(g.clue)}:${now === 'dd-answer' ? 'dd' : 'q'}`;
  const media = g.clue?.media;
  const plays = media && (media.kind === 'audio' || media.kind === 'video');
  if (key === spokenKey || !(newClue || was !== now)) return;
  if (!(g.readsAloud && g.clue?.q) && !plays) return;
  spokenKey = key;
  const { ci, ri } = g.clue;
  const isReading = now === 'reading' && !g.hostJudges;
  const ready = () => { if (isReading && spokenKey === key && phaseNow === 'reading') act?.('readDone', { ci, ri }); };
  const read = () => {
    if (spokenKey !== key) return;
    if (g.readsAloud && sound.speak?.(g.clue.q, ready)) return;
    // Nobody reads it out: give everyone the time to read it on screen.
    if (plays) setTimeout(ready, Math.min(8000, 1500 + String(g.clue.q ?? '').length * 55));
  };
  // A beat after the pick sound, so the two do not talk over each other.
  setTimeout(() => {
    if (spokenKey !== key) return;
    if (plays) playClip(media, sound.volume?.() ?? 0.7, read); else read();
  }, 450);
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
  // Final Jeopardy's "think" music runs while answers are typed (after the voice reads the clue, when it does).
  if (now === 'final-answer' && was !== 'final-answer') {
    const think = () => { if (phaseNow === 'final-answer') sound.music('think', { owner: 'final', loop: false }); };
    if (g.readsAloud && g.final?.q && sound.speak?.(g.final.q, think)) spokenKey = `final:${g.round}`; else think();
  } else if (now !== 'final-answer') sound.stopMusic('final');
  speakClue(p, g, now, was, newClue, sound);
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
const gains = new Map(); // id -> { delta, at }: a float still going when the screen changes (a right answer with a host goes straight to the board)
let introKey = '';
let cardKey = '';       // the clue (or Final) whose card is on screen: the card zooms in only when it changes
/** ' enter' the first time a card for this clue is drawn, so its entrance plays once per clue, not at every step. */
function enterOnce(key) { const first = key !== cardKey; cardKey = key; return first ? ' enter' : ''; }

const player = (id) => g.players.find((p) => p.id === id) ?? null;
const nameOf = (id) => player(id)?.name ?? 'Someone';
const initial = (name) => String(name || '?').trim().slice(0, 1).toUpperCase();
const av = (p, size) => h('span', { class: 'av', style: { '--c': p ? p.color : '#AEB3D6', ...(size ? { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.43)}px` } : {}) } }, initial(p?.name));
const byScore = () => g.players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
/** Seconds to the thousandth: 0.312 */
const secs = (ms) => (Math.round(ms) / 1000).toFixed(3);
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
    guideStrip(),
    podiums ? podiumStrip() : null);
  return h('div', { class: `bw ${act ? 'can-act' : ''} ${still ? 'still' : ''}` }, stage, controls());
}
/** What is going on and what happens next, in one line (the engine writes it; the Apple TV shows the same). */
function guideStrip() {
  const gd = g.guide;
  if (!gd || !gd.text) return null;
  const p = player(gd.pid);
  return h('div', { class: 'guide', style: { '--c': p ? p.color : 'var(--sun)' } },
    p ? av(p, 52) : h('span', { class: 'spark' }, '✦'),
    h('div', {}, h('b', {}, gd.text), gd.next && h('small', {}, gd.next)));
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
    if (before != null && before !== p.score) { changed.set(p.id, p.score - before); gains.set(p.id, { delta: p.score - before, at: performance.now() }); }
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
    // A float that started on the previous screen carries on here from where it was (the board comes straight back after a right answer).
    const gain = gains.get(p.id);
    const age = gain ? performance.now() - gain.at : Infinity;
    const delta = changed.get(p.id) ?? (age < 2200 ? gain.delta : 0);
    const floating = changed.has(p.id) ? 0 : age;
    return h('div', { class: `pod ${cls} ${p.connected ? '' : 'off'}`, style: { '--c': p.color } },
      tag && h('span', { class: 'tag' }, tag),
      av(p),
      h('div', { class: 'who' }, h('div', { class: 'nm' }, p.name), h('div', { class: `sc ${p.score < 0 ? 'neg' : ''}` }, minus(p.score))),
      mark,
      hot(p.streak) && !mark && h('span', { class: 'flame', title: `${p.streak} right in a row` }, `🔥${p.streak}`),
      delta ? h('span', { class: `delta ${delta > 0 ? 'good' : 'bad'}`, style: floating ? { animationDelay: `-${Math.round(floating)}ms` } : null }, signed(delta)) : null);
  }));
}

/** The TV's own buttons, with keyboard shortcuts in their labels. (The Apple TV shows only the step that moves the game along on screen and keeps the rest in its game menu: JeopardyRemote.swift.) */
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
  gains.clear();
  const site = ctxInfo.site || (ctxInfo.joinUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const codeTiles = ctxInfo.code ? h('div', { class: 'codetiles' }, [...ctxInfo.code].map((ch) => h('span', {}, ch))) : null;
  const n = g.players.length;
  const cap = player(g.captainId);
  const choosing = !!g.draft || (!!act && packsOpen);
  const step = (num, title, sub) => h('li', {}, h('span', { class: 'num' }, String(num)), h('span', {}, h('b', {}, title), h('small', {}, sub)));

  // On a TV that may act, clicking a seat makes that player the captain.
  const seats = g.players.map((p) => h('div', {
    class: `seat ${p.connected ? '' : 'off'} ${act && p.id !== g.captainId ? 'pickable' : ''}`, style: { '--c': p.color },
    title: act && p.id !== g.captainId ? `Make ${p.name} captain` : null,
    onclick: act && p.id !== g.captainId ? () => { if (confirm(`Make ${p.name} the captain?`)) act('setCaptain', { pid: p.id }); } : null,
  }, av(p),
    h('span', { class: 'who' }, h('b', {}, p.name), h('small', { class: p.id === g.captainId ? 'cap' : '' }, p.id === g.captainId ? '★ Captain' : p.connected ? 'Ready' : 'Reconnecting…'))));
  for (let i = n; i < 8; i++) seats.push(h('div', { class: 'seat open' }, h('span', { class: 'av' }, '+'), h('span', { class: 'who' }, h('small', {}, 'Open seat'))));
  const players = h('div', { class: 'lb-panel lb-players' },
    h('div', { class: 'lb-head' }, h('span', { class: 'eyebrow' }, 'Players'), h('b', {}, n ? `${n} joined` : 'Nobody yet'),
      h('span', { class: 'aside' }, g.hostJudges ? 'A host is running this game' : cap ? `${cap.name} is captain${act ? '. Click a player to change it' : ''}` : 'The first to join is captain')),
    h('div', { class: `seats ${n > 8 ? 'many' : ''}` }, seats));
  // With a host connected, the topics are the host's to choose (on the host page): the TV shows only who has joined.
  const packs = g.hosted ? null : pickerPanel();

  const lb = h('div', { class: `bwlobby ${choosing && !g.hosted ? 'choosing' : ''}` },
    h('section', { class: 'lb-left' },
      h('div', { class: 'lb-hero' }, h('div', { class: 'eyebrow sun' }, 'Tonight’s trivia showdown'),
        h('h1', {}, 'Grab your phone.', h('br'), h('i', {}, 'It’s your buzzer.')),
        hallLine(g.hall) && h('div', { class: 'hall' }, '🏆 ', hallLine(g.hall))),
      h('ol', { class: 'lb-steps' },
        step(1, 'Scan the code', 'with your phone camera'),
        step(2, 'Pick a name', 'and your colour'),
        step(3, 'Buzz in first', g.hostJudges ? 'and say your answer' : 'then type your answer')),
      players, packs, g.hosted ? null : boardLine()),
    h('aside', { class: 'joinbox' },
      h('div', { class: 'eyebrow' }, 'Scan to join'),
      h('div', { class: 'qr-big' }, ctx.qr ? ctx.qr() : null),
      ctxInfo.code
        ? h('div', { class: 'url' }, 'or go to ', h('b', {}, site), h('br'), 'and enter ', h('b', { class: 'roomcode' }, ctxInfo.code))
        : h('div', { class: 'url' }, 'or go to ', h('b', {}, site)),
      codeTiles,
      // Hosting? This code opens the host page already signed in. Once a host is connected it says so instead.
      g.hosted ? h('div', { class: 'hostbox' }, h('div', { class: 'eyebrow' }, 'A host is running this game'))
        : ctx.hostQr?.() ? h('div', { class: 'hostbox' }, h('div', { class: 'eyebrow' }, 'Hosting? Scan to host'), h('div', { class: 'qr-small' }, ctx.hostQr())) : null));
  function toggle(open) {
    packsOpen = open;
    lb.classList.toggle('choosing', !!g.draft || open);
    if (!open) pickTab = null;
    const btn = lb.querySelector('.lb-board button');
    if (btn) btn.textContent = open ? '✓ Done' : 'Choose questions';
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
  const what = g.asWritten ? (chosen.length === 2 ? `Your games: ${chosen.join(', then ')}` : `Your game: ${chosen[0] ?? ''}`) : g.draft ? 'Your board (preview)'
    : chosen.length ? (chosen.length > 2 ? `${chosen.slice(0, 2).join(' + ')} + ${chosen.length - 2} more` : chosen.join(' + ')) : 'No topics chosen';
  const n = g.categoryCount ?? 0;
  const realShow = (g.packs ?? []).some((pk) => pk.selected && pk.archive);
  const bits = g.asWritten ? ['as written'] : [n ? `${n} categories` : null, g.freshCount ? `${g.freshCount} new` : null, g.easyMode ? 'easy mode' : null, realShow ? (ERA_LABELS[g.era] ?? g.era ?? '').toLowerCase() : null].filter(Boolean);
  return h('div', { class: 'lb-board' },
    h('div', { class: 'strip' }, Array.from({ length: 6 }, (_, i) => h('i', { style: { '--d': String(i) } }, '$'))),
    h('div', { class: 'what' }, h('div', { class: 'eyebrow' }, 'Tonight’s board'),
      h('div', {}, what, bits.length ? h('span', {}, ` · ${bits.join(' · ')}`) : null, !g.asWritten && n < 12 ? h('span', { class: 'warn' }, ' · needs at least 12 categories') : null)),
    act && !g.draft
      ? h('button', { type: 'button', class: 'ghost', onclick: (e) => e.currentTarget.closest('.bwlobby')?.toggle(!packsOpen) }, packsOpen ? '✓ Done' : 'Choose questions')
      : !act && h('div', { class: 'aside' }, 'Picked on the', h('br'), 'captain’s phone'));
}

// ---------- choosing the questions ----------
// Three shelves: clues from the real show (by topic and era), the family packs that come with the game, and your own
// games from the question editor (played just as written). Each topic says how many of its categories this TV has
// not shown yet; a clue is not dealt again until its whole pack has been played.
let pickTab = null;      // the shelf open on this TV: 'archive', 'house' or 'own' (null: the one in use)
const TABS = [['archive', 'Real show', 'Clues from the TV show'], ['house', 'Family packs', 'Made for family night'], ['own', 'Your games', 'Whole boards, as written']];
export const shelfOf = (pk) => (pk.own ? 'own' : pk.archive ? 'archive' : 'house');
/** The shelf to open first: the one with what is switched on (your games win, then the real show). */
export function shelfInUse(v) {
  const on = (v.packs ?? []).filter((pk) => pk.selected);
  if (on.some((pk) => pk.own)) return 'own';
  if (on.some((pk) => pk.archive)) return 'archive';
  if (on.length) return 'house';
  return v.hasArchive ? 'archive' : 'house';
}

function pickerPanel() {
  const tab = pickTab ?? shelfInUse(g);
  const packs = g.packs ?? [];
  const tabs = h('div', { class: 'pk-tabs', role: 'tablist' }, TABS.map(([id, label, sub]) => {
    if (id === 'archive' && !g.hasArchive) return null;
    const of = packs.filter((pk) => shelfOf(pk) === id);
    const on = of.filter((pk) => pk.selected).length;
    return h('button', {
      type: 'button', role: 'tab', class: `pk-tab ${tab === id ? 'on' : ''}`, 'aria-selected': String(tab === id),
      onclick: act ? (e) => { pickTab = id; e.currentTarget.closest('.lb-packs')?.replaceWith(pickerPanel()); } : null,
    }, h('b', {}, label), h('small', {}, on ? (id === 'own' ? `${on === 1 ? 'Playing 1' : `Playing ${on}`}` : `${on} on`) : of.length ? sub : id === 'own' ? 'Make your own' : sub));
  }));
  const body = g.draft ? draftShelf() : tab === 'own' ? ownShelf() : topicShelf(tab);
  return h('div', { class: 'lb-panel lb-packs' },
    h('div', { class: 'lb-head' }, h('span', { class: 'eyebrow' }, g.draft ? 'Your board' : 'Choose the questions'),
      act && !g.draft && h('button', { type: 'button', class: 'ghost done', onclick: (e) => e.currentTarget.closest('.bwlobby')?.toggle(false) }, '✓ Done')),
    !g.draft && tabs,
    h('div', { class: 'pk-body' }, body),
    pickerFoot());
}

/** How much of a topic this TV has not shown yet, as a bar and a count. */
function freshness(pk) {
  if (pk.fresh == null || !pk.count) return null;
  const frac = pk.fresh / pk.count;
  return h('span', { class: 'pk-fresh' }, h('i', { style: { '--f': `${Math.round(frac * 100)}%` } }),
    pk.fresh === pk.count ? 'All new' : pk.fresh ? `${pk.fresh} new` : 'All played: starts over');
}

function topicShelf(tab) {
  const packs = (g.packs ?? []).filter((pk) => shelfOf(pk) === tab);
  const era = tab === 'archive' && g.hasArchive && h('div', { class: 'pk-era' },
    h('span', { class: 'packlabel' }, 'Clues from'),
    (g.eras ?? []).map((e) => actBtn(`pk-chip ${g.era === e ? 'on' : ''}`, [g.era === e ? '✓ ' : '', ERA_LABELS[e] ?? e], 'setEra', { era: e })),
    h('span', { class: 'pk-note' }, g.archiveLoading ? 'Loading clues…' : g.archiveError
      ? h('span', { class: 'warn' }, act ? 'Did not load. Click an era to try again.' : 'Did not load. Pick an era to try again.') : seasonLabel(g.archiveSeason)));
  const allOn = packs.length && packs.every((pk) => pk.selected);
  return [
    era,
    h('div', { class: 'pk-row' },
      h('span', { class: 'packlabel' }, tab === 'archive' ? 'Topics' : 'Packs', act ? ' · click to switch on or off' : ''),
      act && packs.length > 1 && actBtn('pk-chip', allOn ? 'All off' : 'All on', 'setAllPacks', { kind: tab, on: !allOn })),
    packs.length
      ? h('div', { class: 'pk-grid' }, packs.map((pk) => actBtn(`pk-card ${pk.selected ? 'on' : ''} ${pk.easy ? 'easy' : ''}`, [
        h('span', { class: 'pk-top' }, h('span', { class: 'pk-check' }, pk.selected ? '✓' : ''), h('b', {}, pk.title), pk.easy ? h('em', {}, 'Easy') : null),
        h('small', {}, `${pk.count} categories`),
        freshness(pk),
      ], 'togglePack', { pack: pk.id }, pk.description)))
      : h('div', { class: 'pk-empty' }, g.archiveLoading ? 'Loading a season of the show…' : 'Nothing here yet'),
  ];
}

function ownShelf() {
  const own = (g.packs ?? []).filter((pk) => pk.own);
  const on = own.filter((pk) => pk.selected);
  const make = h('div', { class: 'pk-game make' },
    h('b', {}, '+ Make your own game'),
    h('small', {}, 'On the host page, open Questions and write a board: six categories, five clues each, and a Final. It shows up here, on every TV in the house.'));
  return [
    h('div', { class: 'pk-row' }, h('span', { class: 'packlabel' }, own.length ? `${own.length} games · played just as written${act ? ' · click to play one' : ''}` : 'No games yet')),
    h('div', { class: 'pk-games' },
      own.map((pk) => {
        const round = on.length === 2 ? on.findIndex((x) => x.id === pk.id) + 1 : 0;
        return h('div', { class: `pk-game ${pk.selected ? 'on' : ''}` },
          actBtn('pk-play', [h('span', { class: 'pk-check' }, pk.selected ? '✓' : ''), h('b', {}, pk.title), round ? h('em', {}, `Round ${round}`) : null], 'playBoard', { pack: pk.id }, 'Play this game'),
          h('div', { class: 'pk-cats' }, (pk.cats ?? []).map((c) => h('span', {}, c))),
          act && on.length === 1 && !pk.selected && actBtn('pk-chip small', '+ Add as round 2', 'playBoard', { pack: pk.id, add: true }));
      }),
      make),
  ];
}

function draftShelf() {
  return [
    h('div', { class: 'pk-row' }, h('span', { class: 'packlabel' }, act ? 'Click a category to swap it for another one' : 'The categories that will be played'),
      act && [actBtn('pk-chip', '⇄ Shuffle all', 'previewBoard'), actBtn('pk-chip', '‹ Back to topics', 'clearPreview')]),
    g.draft.map((row, r) => h('div', { class: 'pk-draft' }, h('span', { class: 'rlabel' }, `Round ${r + 1}`),
      h('div', { class: 'pk-draftrow' }, row.map((name, ci) => actBtn('pk-cat', [h('span', {}, name), g.draftFresh?.[r]?.[ci] === false ? h('em', { class: 'old' }, 'Played before') : h('em', {}, 'New'), act ? h('i', {}, '↻') : null], 'swapCategory', { r: r + 1, ci }, 'Swap this category'))))),
  ];
}

function pickerFoot() {
  const n = g.categoryCount ?? 0;
  const text = g.asWritten ? 'Played just as written, then Final Jeopardy'
    : [h('b', {}, `${n} categories`), g.freshCount != null ? ` · ${g.freshCount} not seen on this TV` : '', n < 12 ? h('span', { class: 'warn' }, ' · switch on at least 12') : ''];
  return h('div', { class: 'pk-foot' }, h('span', {}, text),
    act && g.seenCount > 0 && !g.draft && h('button', {
      type: 'button', class: 'ghost', title: 'Every clue counts as new again',
      onclick: () => { if (confirm('Forget every clue this TV has shown? They can all come up again.')) act('resetHistory'); },
    }, 'Start fresh'),
    act && !g.asWritten && !g.draft && n >= 12 && actBtn('pk-preview', '▦ Preview and swap', 'previewBoard'));
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
    // Whose pick it is, and why, is in the strip below the board (guideStrip).
    !g.guide && h('div', { class: 'caption' }, av(picker, 48), h('span', {}, named(picker), ', it’s your pick.')),
    recentBuzzes(),
  ], { right: cluesLeft() });
}

/** The last clue's buzz times, in one compact row under the board for a few seconds after it (the engine takes them away). */
function recentBuzzes() {
  const r = g.recentBuzzes;
  if (!r?.buzzes?.length) return null;
  const latest = Math.max(...r.buzzes.map((b) => b.open ?? 1));
  const list = r.buzzes.filter((b) => (b.open ?? 1) === latest);
  const best = list[0].ms;
  return h('div', { class: 'recent' }, h('span', { class: 'lbl' }, 'BUZZ TIMES'),
    list.map((b, i) => h('span', { class: `rb ${i === 0 ? 'first' : ''}`, style: { '--c': player(b.pid)?.color ?? '#AEB3D6' } },
      h('i', {}, String(i + 1)), nameOf(b.pid), h('b', {}, `${secs(b.ms)}s`), i ? h('small', {}, `+${secs(b.ms - best)}`) : null)));
}

// ---------- a clue ----------
/** Everyone who buzzed on this clue, fastest first: a ranked list (two columns once there are more than four), to the thousandth. */
function buzzChips(c, { label = false, open = null } = {}) {
  // One opening at a time: after a miss the buzzers open again and everyone is timed afresh. The newest opening that
  // has any buzzes is shown, so the times stay up through the whole clue (before anyone has buzzed in a reopening, it is
  // still the last one's).
  const all = c.buzzes ?? [];
  const showing = open ?? Math.max(1, ...all.map((b) => b.open ?? 1));
  const list = all.filter((b) => (b.open ?? 1) === showing);
  if (!list.length) return null;
  const best = list[0].ms;
  return h('div', { class: `buzzes ${list.length > 4 ? 'two' : ''}` }, label && h('div', { class: 'lbl' }, 'BUZZ TIMES'),
    h('div', { class: 'brows' }, list.map((b, i) => h('div', { class: `brow ${i === 0 ? 'first' : ''}`, style: { '--c': player(b.pid)?.color ?? '#AEB3D6' } },
      h('span', { class: 'rk' }, String(i + 1)), av(player(b.pid), 40), h('span', { class: 'nm' }, nameOf(b.pid)),
      h('b', {}, `${secs(b.ms)}s`), h('small', {}, i ? `+${secs(b.ms - best)}` : '')))));
}

/** The buzz times along the bottom of a clue, once anyone has buzzed (they stay for the whole clue). */
const buzzFoot = (c) => ((c.buzzes ?? []).length && !c.dd ? h('div', { class: 'foot' }, buzzChips(c, { label: true })) : null);

function card(c, { q, band, edge = null, cls = '', foot = null }) {
  const value = c.dd ? `DAILY DOUBLE · ${money(c.wager ?? 0)}` : money(c.value);
  return h('div', { class: `card ${cls}${enterOnce(`${g.round}:${clueKey(c)}`)}`, style: edge ? { '--c': edge } : {} },
    h('div', { class: 'rail' }, h('div', { class: 'cn' }, c.cat), h('div', { class: 'val' }, value)),
    q,
    band,
    foot);
}

/** The clue's text, with its picture beside it (or a note that a sound or video goes with it). */
function clueText(c, cls = '') {
  const m = c.media;
  if (!m) return h('div', { class: `q ${cls}` }, c.q ?? '');
  const side = m.kind === 'image'
    ? h('figure', { class: 'pic' }, h('img', { src: m.url, alt: '' }), m.credit ? h('figcaption', {}, m.credit) : null)
    : h('figure', { class: 'pic note' }, h('div', { class: 'ic' }, m.kind === 'audio' ? '🔊' : '🎬'), h('figcaption', {}, m.kind === 'audio' ? 'Listen' : 'Watch', m.credit ? h('small', {}, m.credit) : null));
  return h('div', { class: `q withpic ${cls}` }, side, h('div', { class: 'qt' }, c.q ?? ''));
}

function clue() {
  const c = g.clue;
  if (g.phase === 'dd-wager') return ddSplash(c, null);
  const q = clueText(c);
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
    return frame(card(c, { q, band, edge: '#FFC940', cls: 'open', foot: buzzFoot(c) }));
  }
  if (g.phase === 'answering' || g.phase === 'dd-answer') {
    const dd = g.phase === 'dd-answer';
    const p = player(dd ? g.controllerId : c.buzzedId);
    const doing = g.hostJudges ? 'say your answer!' : dd ? `bet ${money(c.wager ?? 0)} and is answering` : 'is typing an answer';
    const band = h('div', { class: 'band' },
      av(p, 104),
      h('div', { class: 'grow' },
        h('div', { class: 'buzzer' }, h('span', { class: 'big', style: { color: p?.color } }, (p?.name ?? 'Someone').toUpperCase()), h('span', {}, doing)),
        null),
      ring(g.timer, g.hostJudges ? 'TIME' : '0'));
    const el = frame(card(c, { q: clueText(c, 'small'), band, edge: p?.color ?? '#FFC940', foot: buzzFoot(c) }));
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
    foot: buzzFoot(c),
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
/** The family scoreboard in one line (the same words as JeoHall.line in the Apple TV app), or null. */
export function hallLine(hall) {
  if (!hall?.games) return null;
  const head = `Family scoreboard after ${hall.games} game${hall.games === 1 ? '' : 's'}`;
  const winners = hall.players.filter((e) => e.wins > 0).slice(0, 4);
  if (!winners.length) return `${head}: no champion yet`;
  return `${head}: ${winners.map((e) => `${e.name} ${e.wins} win${e.wins === 1 ? '' : 's'}${e.streak >= 2 ? ` (${e.streak} in a row)` : ''}`).join(' · ')}`;
}

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
    hallLine(g.hall) && h('div', { class: 'hall' }, '🏆 ', hallLine(g.hall)),
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
export function leave() { live = null; confetti(false); stopClip(); document.querySelector('.bw-reacts')?.remove(); }
