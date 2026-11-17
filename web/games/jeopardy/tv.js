// Jeopardy on a TV that is a web browser, in the look of the Apple TV app (ported from the Buzzworthy web TV): a lobby
// with the packs, era and board preview; a colour-block board that deals in; the clue with a countdown ring, who
// buzzed and everyone's buzz times; Daily Double; round standings; Final Jeopardy wager chips and reveal cards; the
// champion with awards and confetti; emoji reactions floating up; score chips with hot-streak flames.
// It shows the same view the Apple TV app shows (publicView() in games/jeopardy/game.js). The TV page (public/tv.js)
// swaps in whatever lobby() or render() returns. When ctx.act is given (the website's TV page runs the game itself),
// the TV also has the Buzzworthy controls: buttons in the corner, keyboard shortcuts, and clickable tiles and packs.
import { h, money } from '../../common.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Outfit:wght@400;600;800&display=swap';
function loadStyles() {
  if (document.getElementById('bw-tv-css')) return;
  document.head.append(
    h('link', { id: 'bw-tv-fonts', rel: 'stylesheet', href: FONTS }),
    h('link', { id: 'bw-tv-css', rel: 'stylesheet', href: '/games/jeopardy/tv.css' }));
}

const COLS = ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
const HEX = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ddc97', '#3abeff', '#b388ff'];
const ERA_LABELS = { any: 'Any era', classic: 'Classic 80s & 90s', '2000s': '2000s', recent: 'Recent' };
const seasonLabel = (n) => (n ? `Season ${n} (${1983 + n}-${String((1984 + n) % 100).padStart(2, '0')})` : '');

// ---------- countdown ring ----------
// The engine sends how much time is left when something changes; between updates the TV counts down by itself.
let live = null; // { leftMs, totalMs, at, fg, num, shown, zero }
let play = () => {};
let musicPlaying = () => false;
setInterval(() => {
  if (!live) return;
  const left = Math.max(0, live.leftMs - (performance.now() - live.at));
  if (live.fg) {
    live.fg.style.strokeDashoffset = String(100 - (left / live.totalMs) * 100);
    live.fg.classList.toggle('low', left < 4000);
  }
  const secs = Math.ceil(left / 1000);
  if (live.num) live.num.textContent = secs > 0 ? String(secs) : live.zero;
  if (secs !== live.shown) { live.shown = secs; if (secs > 0 && secs <= 5 && left < live.totalMs && !musicPlaying()) play('tick'); }
}, 100);

function ring(timer, zero = '0') {
  if (!timer || !timer.totalMs) { live = null; return null; }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  for (const cls of ['bg', 'fg']) {
    const c = document.createElementNS(ns, 'circle');
    for (const [k, val] of Object.entries({ class: cls, cx: 50, cy: 50, r: 44, pathLength: 100, 'stroke-dasharray': 100 })) c.setAttribute(k, val);
    svg.append(c);
  }
  const num = h('span', {}, String(Math.ceil(timer.leftMs / 1000)));
  live = { leftMs: timer.leftMs, totalMs: timer.totalMs, at: performance.now(), fg: svg.lastChild, num, shown: Math.ceil(timer.leftMs / 1000), zero };
  live.fg.style.strokeDashoffset = String(100 - (timer.leftMs / timer.totalMs) * 100);
  return h('div', { class: 'ring' }, svg, num);
}

// ---------- sounds ----------
const clueKey = (c) => (c ? `${c.ci}:${c.ri}` : '');
/** Sound cues for a change of state. prev and view are the whole { room, game } views. */
export function onChange(prev, view, sound) {
  play = sound.play; musicPlaying = sound.musicPlaying;
  const p = prev.game; const g = view.game;
  if (!p || !g) return;
  const was = p.phase; const now = g.phase;
  const newClue = clueKey(g.clue) !== clueKey(p.clue);
  if (now === 'board' && (was === 'lobby' || was === 'round-end')) sound.play('roundstart');
  if (now === 'dd-wager' && (was !== 'dd-wager' || newClue)) sound.play('dd');
  else if (now === 'open' && was !== 'open') sound.play('open');
  else if (now === 'answering' && was !== 'answering') sound.play('buzz');
  if (now === 'reveal' && was !== 'reveal') {
    const r = g.lastResult;
    if (r && r.correct) sound.play('correct');
    else if (r && !r.correct) sound.play('wrong');
    else sound.play('timeup');
  } else if (g.clue && p.clue && !newClue && (g.clue.tried?.length ?? 0) > (p.clue.tried?.length ?? 0) && now !== 'reveal') sound.play('wrong');
  if (now === 'final-wager' && was !== 'final-wager') sound.play('final');
  // Final Jeopardy's "think" music runs while answers are typed.
  if (now === 'final-answer' && was !== 'final-answer') sound.music('think', { owner: 'final', loop: false });
  else if (now !== 'final-answer') sound.stopMusic('final');
  if (now === 'final-reveal' || now === 'gameover') {
    const before = p.final?.reveals?.length ?? 0;
    const after = g.final?.reveals ?? [];
    for (const r of after.slice(before)) sound.play(r.correct ? 'correct' : 'wrong');
  }
  if (now === 'gameover' && was !== 'gameover') sound.play('fanfare');
}

// ---------- state shared by the screens ----------
let g = null;          // the game's view
let act = null;        // (action, args) => void, when this TV may act
let ctxInfo = {};      // { joinUrl, code, site }
let boardKey = '';     // the board deals in only when a new one appears
let lastReact = 0;
let screenKey = '';

const player = (id) => g.players.find((p) => p.id === id) ?? null;
const nameOf = (id) => player(id)?.name ?? 'Someone';
const initial = (name) => String(name || '?').trim().slice(0, 1).toUpperCase();
const av = (p) => h('span', { class: 'av', style: { '--c': p ? p.color : '#fff' } }, initial(p?.name));
const byScore = () => g.players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
const secs = (ms) => (ms / 1000).toFixed(2);
const isFinal = () => g.phase.startsWith('final');
const hot = (n) => n >= (g.hotStreak ?? 3);
/** A button that acts on the game, or plain text on a TV that may not act. */
const actBtn = (cls, label, action, args = {}, title = null) => h('button', { type: 'button', class: cls, title, onclick: act ? () => act(action, args) : null }, label);

// ---------- the frame: header, main, score chips, controls ----------
function frame(mainKids, { chips = true } = {}) {
  const tag = g.phase === 'lobby' || g.phase === 'gameover' ? null
    : isFinal() ? 'Final Jeopardy' : g.round === 2 ? 'Round 2 · Double values' : `Round ${g.round}`;
  const join = (ctxInfo.site || ctxInfo.joinUrl || '').replace(/^https?:\/\//, '').replace(/\?.*$/, '').replace(/\/$/, '');
  // A screen is redrawn on every update (a buzz, a reaction); its entrance animations only play the first time.
  const key = [g.phase, g.round, clueKey(g.clue), g.clue?.tried?.length, g.clue?.buzzes?.length, g.lastResult?.correct, g.lastResult?.overridden,
    g.final?.reveals?.length, g.players.map((p) => p.id).join(','), g.awards?.length].join('|');
  const still = key === screenKey;
  screenKey = key;
  return h('div', { class: `bw ${act ? 'can-act' : ''} ${still ? 'still' : ''}` },
    h('header', {},
      h('div', { class: 'wm' }, h('i', {}, 'JEOP'), 'ARDY'),
      tag && h('div', { class: 'roundtag' }, tag),
      g.phase !== 'lobby' && h('div', { class: 'joininfo' }, 'Join at ', h('span', {}, join), ctxInfo.code && h('b', {}, ctxInfo.code))),
    h('main', {}, mainKids),
    // The score chips and the TV's own buttons share the bottom row, so the buttons never cover a tile or the clock.
    h('div', { class: 'bottombar' }, chips && footer(), controls()));
}

function footer() {
  if (['lobby', 'round-end', 'gameover'].includes(g.phase)) return null;
  const buzzed = g.phase === 'answering' ? g.clue?.buzzedId : null;
  return h('footer', {}, g.players.map((p) => h('div', {
    class: `chip ${p.connected ? '' : 'off'} ${g.phase === 'board' && p.id === g.controllerId ? 'ctrl' : ''} ${buzzed === p.id ? 'buzzed' : ''}`,
    style: { '--c': p.color },
  }, av(p),
  h('div', {}, h('div', { class: 'n' }, p.name), h('div', { class: `s ${p.score < 0 ? 'neg' : ''}` }, money(p.score))),
  hot(p.streak) && h('span', { class: 'flame', title: `${p.streak} right in a row` }, `🔥${p.streak}`))));
}

/** The TV's own buttons, the same ones the Apple TV shows, with the Buzzworthy keyboard shortcuts in their labels. */
function controlItems() {
  const ph = g.phase; const list = [];
  if (ph === 'lobby' && g.players.length) list.push(['Start game (S)', 'start']);
  if (g.hostJudges && ph === 'reading') list.push(['Open buzzers (B)', 'openNow']);
  if (g.hostJudges && (ph === 'answering' || ph === 'dd-answer')) list.push(['Correct (C)', 'judge', { correct: true }], ['Wrong (W)', 'judge', { correct: false }]);
  if (['reading', 'open', 'answering', 'dd-wager', 'dd-answer'].includes(ph)) list.push(['Skip clue (K)', 'skip']);
  if (g.lastResult && ['reveal', 'open', 'board'].includes(ph)) list.push(['Flip last ruling (O)', 'override']);
  if (['reveal', 'round-end', 'final-wager', 'final-answer', 'final-reveal'].includes(ph)) list.push(['Continue (N)', 'advance']);
  if (ph === 'board') list.push(['End round early', 'endRound']);
  if (ph === 'gameover') list.push(['Play again', 'playAgain']);
  return list;
}
function controls() {
  if (!act) return null;
  const items = controlItems();
  if (!items.length) return null;
  return h('div', { class: 'controls' }, items.map(([label, action, args]) => h('button', {
    type: 'button', class: 'ghost',
    onclick: () => { if (action === 'endRound' && !confirm('End this round now?')) return; act(action, args ?? {}); },
  }, label)));
}

// Keyboard shortcuts from the Buzzworthy TV. (M and Escape open the corner menu on the TV page.)
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
  document.body.append(h('div', { class: 'bw-confetti' }, Array.from({ length: 80 }, (_, i) => h('i', {
    style: { left: `${Math.random() * 100}vw`, background: HEX[i % 6], animationDuration: `${3 + Math.random() * 4}s`, animationDelay: `${-Math.random() * 6}s` },
  }))));
}

// ---------- lobby ----------
/** The lobby screen: how to join, who is in, and what will be played. The TV page shows this before the game starts. */
export function lobby(view, ctx = {}) {
  setup(view, ctx);
  live = null;
  confetti(false);
  const codeTiles = ctxInfo.code ? h('div', { class: 'codetiles' }, [...ctxInfo.code].map((ch, i) => h('span', { style: { background: COLS[[0, 2, 3, 4][i % 4]] } }, ch))) : null;
  const site = ctxInfo.site || (ctxInfo.joinUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return frame(h('div', { class: `bwlobby ${g.draft || (g.packs?.length ?? 0) > 10 ? 'building' : ''}` },
    h('div', {},
      h('div', { class: 'wm' }, h('i', {}, 'JEOP'), h('br'), 'ARDY'),
      h('div', { class: 'tag' }, 'The trivia showdown where your phone is the buzzer.'),
      h('div', { class: 'steps' },
        h('div', {}, h('b', {}, '1. '), 'Scan the code with your phone camera'),
        h('div', {}, h('b', {}, '2. '), 'Type your name and join'),
        h('div', {}, h('b', {}, '3. '), g.hostJudges
          ? `A host reads the clues; players answer out loud${g.answerTime ? ` within ${g.answerTime} seconds` : ''}.`
          : 'Players type their answers. Want a host? Open the host page and turn on “A host judges out loud”.')),
      h('div', { class: 'roster' }, g.players.length
        ? g.players.map((p) => h('span', { class: `chip ${p.connected ? '' : 'off'}`, style: { '--c': p.color } }, av(p), p.name, p.id === g.captainId ? ' ★' : ''))
        : h('div', { class: 'sub' }, 'Waiting for players…')),
      h('div', { class: 'packs' }, eraRow(), g.draft ? draftRow() : packRow())),
    h('div', { class: 'joinbox' },
      h('div', { class: 'eyebrow' }, 'Scan to join'),
      h('div', { class: 'qr-big' }, ctx.qr ? ctx.qr() : null),
      ctxInfo.code
        ? h('div', { class: 'url' }, 'or go to ', h('b', {}, site), ' and enter ', h('b', { class: 'roomcode' }, ctxInfo.code))
        : h('div', { class: 'url' }, 'or go to ', h('b', {}, site)),
      codeTiles)), { chips: false });
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

// ---------- the game's screens ----------
function board() {
  const key = `${g.round}:${g.board.map((c) => c.name).join('|')}`;
  const enter = key !== boardKey;
  boardKey = key;
  const rows = Math.max(...g.board.map((c) => c.clues.length));
  const cells = g.board.map((c, ci) => h('div', { class: 'cat', style: { '--col': COLS[ci % 6] } }, c.name));
  for (let ri = 0; ri < rows; ri++) {
    g.board.forEach((c, ci) => {
      const cl = c.clues[ri];
      const used = !cl || cl.used;
      cells.push(h('div', {
        class: `tile ${used ? 'used' : ''}`, style: { '--col': COLS[ci % 6], '--d': String(ri * 6 + ci) },
        onclick: act && !used ? () => act('pick', { ci, ri }) : null,
      }, used ? '' : money(cl.value)));
    });
  }
  return frame([
    h('div', { class: `board ${enter ? 'enter' : ''}`, style: { gridTemplateColumns: `repeat(${g.board.length}, 1fr)`, gridTemplateRows: `1.25fr repeat(${rows}, 1fr)` } }, cells),
    h('div', { class: 'caption' }, h('b', {}, nameOf(g.controllerId)), g.hostJudges ? ', tell the host your pick: a category and an amount.' : ', pick a clue on your phone.'),
  ]);
}

function resultLine() {
  const r = g.lastResult;
  if (!r) return null;
  return h('div', { class: `result ${r.correct ? 'ok' : 'no'}` },
    `${r.correct ? '✓' : '✗'} ${nameOf(r.pid)}${r.answer == null || r.answer === '' ? '' : ` said “${r.answer}”`}  ${r.correct ? '+' : '-'}${money(Math.abs(r.delta ?? 0))}${r.overridden ? ' (ruling flipped)' : ''}`);
}
function hotLine() {
  const r = g.lastResult;
  if (!r || !r.correct || !hot(r.streak ?? 0)) return null;
  return h('div', { class: 'hot' }, `🔥 ${nameOf(r.pid)} is on fire! ${r.streak} in a row`);
}
/** Everyone who buzzed on this clue, fastest first, with their time and how far behind the fastest. */
function buzzOrder(c) {
  const list = c.buzzes ?? [];
  if (!list.length) return null;
  const best = list[0].ms;
  return h('div', { class: 'buzzorder' }, h('span', { class: 'lbl' }, 'Buzz times'), list.map((b, i) => h('span', { class: `b ${i === 0 ? 'first' : ''}` },
    av(player(b.pid)), nameOf(b.pid), ' ', h('em', {}, `${secs(b.ms)}s`), i ? h('small', {}, ` +${secs(b.ms - best)}`) : null)));
}
const callout = (p, ...line) => h('div', { class: 'callout', style: { '--c': p ? p.color : '#fff' } }, av(p), h('div', {}, h('div', { class: 'who' }, p ? p.name : 'Someone'), h('div', { class: 'line' }, line)));

function clue() {
  const c = g.clue;
  if (g.phase === 'dd-wager') {
    return frame(h('div', { class: 'ddbox' },
      h('div', { class: 'big', style: { fontSize: '14vh', lineHeight: '.9', textAlign: 'center' } }, 'DAILY', h('br'), h('span', { style: { color: 'var(--sun)' } }, 'DOUBLE')),
      h('div', { class: 'pill', style: { '--col': COLS[c.ci % 6] } }, c.cat),
      h('div', { class: 'sub', style: { color: 'var(--text)' } }, av(player(g.controllerId)), ' ', h('b', {}, nameOf(g.controllerId)), ' is choosing a wager…')));
  }
  const buzzer = g.phase === 'answering' ? player(c.buzzedId) : null;
  const accent = buzzer ? buzzer.color : COLS[c.ci % 6];
  let status = null;
  if (g.phase === 'reading') status = h('div', { class: 'status wait' }, g.hostJudges ? 'The host is reading the clue. Thumbs ready.' : 'Get ready to buzz…');
  if (g.phase === 'open') status = h('div', {}, resultLine(), h('div', { style: { marginTop: '1.4vh' } }, h('span', { class: 'go' }, '🔔 BUZZ IN!')));
  if (g.phase === 'answering') {
    status = h('div', {}, callout(buzzer, g.hostJudges ? 'buzzed in. Say your answer!' : 'buzzed in and is typing…', c.buzzMs != null ? h('span', { class: 'speed' }, `${secs(c.buzzMs)}s`) : null), buzzOrder(c));
  }
  if (g.phase === 'dd-answer') status = callout(player(g.controllerId), `wagered ${money(c.wager ?? 0)} and is answering…`);
  if (g.phase === 'reveal') {
    status = h('div', {}, h('div', { class: 'eyebrow' }, 'The answer'), h('div', { class: 'ans' }, c.answer ?? ''),
      g.lastResult ? resultLine() : h('div', { class: 'sub', style: { marginTop: '1vh' } }, 'Nobody buzzed in.'), hotLine(), buzzOrder(c));
  }
  const showTimer = ['open', 'answering', 'dd-answer'].includes(g.phase);
  return frame(h('div', { class: 'clue', style: { '--accent': accent } },
    h('div', { class: 'meta' }, h('span', { class: 'cname' }, c.cat), h('span', { class: 'v' }, c.dd ? 'DAILY DOUBLE' : money(c.value))),
    h('div', { class: 'q' }, c.q ?? ''),
    h('div', { class: 'bottom' }, status, showTimer ? ring(g.timer, g.hostJudges && g.phase === 'answering' ? 'TIME' : '0') : null)));
}

function standings() {
  const sorted = byScore();
  const top = Math.max(1, sorted.length ? sorted[0].score : 1);
  return h('div', { class: 'standings' }, sorted.map((p, i) => h('div', { class: 'row', style: { '--c': p.color, '--w': `${(Math.max(0, p.score) / top) * 100}%` } },
    h('span', { class: 'rank' }, String(i + 1)), av(p), h('span', {}, p.name), h('b', { class: p.score < 0 ? 'neg' : '' }, money(p.score)))));
}

function roundEnd() {
  const more = g.round < g.rounds;
  return frame(h('div', { class: 'splash' },
    h('div', { class: 'eyebrow', style: { color: 'var(--sun)' } }, `Round ${g.round} is done`),
    h('div', { class: 'big', style: { fontSize: '8vh' } }, more ? `NEXT: ROUND ${g.round + 1}` : 'NEXT: FINAL JEOPARDY'),
    h('div', { class: 'sub' }, more ? 'Every value doubles. Lowest score picks first.' : 'One clue. Everyone wagers in secret.'),
    standings(),
    h('div', { class: 'sub', style: { fontSize: '2.2vh' } }, `The ${g.hostJudges ? 'host' : 'captain'} taps Continue to keep going.`)), { chips: false });
}

function chipsLine(ids, done, mark) {
  return ids.map((id) => h('span', { class: 'waitchip' }, av(player(id)), nameOf(id), ' ', done.includes(id) ? mark : h('span', { style: { color: 'var(--muted)' } }, '…')));
}

function final() {
  const f = g.final;
  if (g.phase === 'final-wager') {
    return frame(h('div', { class: 'splash' },
      h('div', { class: 'eyebrow', style: { color: 'var(--sun)' } }, 'Final Jeopardy'),
      h('div', { class: 'sub' }, 'The category is'),
      h('div', { class: 'big', style: { fontSize: '8vh', color: 'var(--sun)' } }, f.category),
      h('div', { class: 'sub' }, 'Place your wager on your phone.'),
      h('div', { class: 'sub', style: { fontSize: '2.4vh', color: 'var(--text)' } }, chipsLine(f.eligible, f.wagered, h('span', { style: { color: 'var(--good)' } }, '✓')))));
  }
  if (g.phase === 'final-answer') {
    return frame(h('div', { class: 'clue', style: { '--accent': 'var(--sun)' } },
      h('div', { class: 'meta' }, h('span', { class: 'cname' }, f.category), h('span', { class: 'v' }, 'FINAL')),
      h('div', { class: 'q' }, f.q ?? ''),
      h('div', { class: 'bottom' }, h('div', { class: 'status', style: { fontSize: '2.4vh' } }, chipsLine(f.eligible, f.answered, '🔒')), ring(g.timer))));
  }
  return frame(h('div', { class: 'splash' },
    h('div', { class: 'sub', style: { maxWidth: '75vw' } }, f.q ?? ''),
    h('div', { class: 'eyebrow' }, 'The answer'),
    h('div', { class: 'big', style: { fontSize: '7vh', color: 'var(--sun)' } }, f.answer ?? '…'),
    revealCards()));
}

function revealCards() {
  return h('div', { class: 'reveals' }, g.final.reveals.map((r) => h('div', { class: `rcard ${r.correct ? 'ok' : 'no'}`, style: { '--rc': r.correct ? 'var(--good)' : 'var(--bad)' } },
    h('div', { class: 'who' }, av(player(r.id)), nameOf(r.id), h('span', { class: 'mark' }, r.correct ? '✓' : '✗')),
    h('div', { class: 'what' }, r.answer || '(blank)'),
    h('div', { class: 'wager' }, `${r.correct ? '+' : '-'}${money(r.wager ?? 0)}${r.overridden ? ' (flipped)' : ''}`,
      act && h('button', { type: 'button', class: 'ghost', onclick: () => act('finalOverride', { pid: r.id }) }, 'flip')))));
}

function gameover() {
  const sorted = byScore();
  const top = sorted.length ? sorted[0].score : 0;
  const champs = sorted.filter((p) => p.score === top);
  const names = champs.map((p, i) => [i ? ' & ' : '', h('span', { style: { color: p.color } }, p.name)]);
  const awards = (g.awards ?? []).map((a, i) => {
    const p = player(a.pid);
    return h('div', { class: 'award', style: { '--c': p ? p.color : '#fff', '--i': String(i) } },
      h('div', { class: 't' }, a.title), h('div', { class: 'p' }, p ? p.name : ''), h('div', { class: 'd' }, a.detail));
  });
  confetti(true);
  return frame(h('div', { class: 'splash', style: { gap: '1.6vh' } },
    h('div', { class: 'eyebrow', style: { color: 'var(--sun)' } }, champs.length > 1 ? 'It’s a tie! Tonight’s champions' : 'Tonight’s champion'),
    h('div', { class: 'big', style: { fontSize: `${champs.length > 1 ? 8 : 11}vh` } }, sorted.length ? names : 'Nobody!'),
    g.final?.answer ? h('div', { class: 'sub' }, 'The final answer was ', h('b', {}, g.final.answer)) : null,
    awards.length ? h('div', { class: 'awards' }, awards) : null,
    standings(),
    h('div', { class: 'sub', style: { fontSize: '2.2vh' } }, `The ${g.hostJudges ? 'host' : 'captain'} can tap Play again for a fresh board.`)), { chips: false });
}

function setup(view, ctx) {
  loadStyles();
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
  if (g.phase === 'gameover') return gameover();
  if (g.phase.startsWith('final') && g.final) return final();
  if (g.phase === 'round-end') return roundEnd();
  if (g.clue && ['dd-wager', 'reading', 'open', 'answering', 'dd-answer', 'reveal'].includes(g.phase)) return clue();
  if (g.board) return board();
  return frame(h('div', { class: 'splash' }, h('div', { class: 'big', style: { fontSize: '6vh' } }, 'Getting the board ready…')));
}

/** The TV page calls this when another game takes over the screen. */
export function leave() { live = null; confetti(false); document.querySelector('.bw-reacts')?.remove(); }
