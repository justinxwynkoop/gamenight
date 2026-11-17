// Jeopardy on a TV that is a web browser: the board, the clue (buzz-in, answering, Daily Double), the reveal with
// buzz times, Final Jeopardy and the winner with awards. It shows the same view the Apple TV app shows
// (publicView() in games/jeopardy/game.js); the TV page (public/tv.js) swaps in whatever render() returns.
import { h, money, qrImg } from '../../common.js';

// ---------- countdown ----------
// The engine sends how much time is left when something changes; between updates the TV counts down by itself.
let live = null; // { leftMs, totalMs, at, bar, num, shown }
let play = () => {};
let musicPlaying = () => false;
setInterval(() => {
  if (!live) return;
  const left = Math.max(0, live.leftMs - (performance.now() - live.at));
  if (live.bar) { live.bar.firstChild.style.width = `${(left / live.totalMs) * 100}%`; live.bar.classList.toggle('low', left <= 3000); }
  const secs = Math.ceil(left / 1000);
  if (live.num) live.num.textContent = String(secs);
  if (secs !== live.shown) { live.shown = secs; if (secs > 0 && secs <= 5 && left < live.totalMs && !musicPlaying()) play('tick'); }
}, 100);

function timerParts(timer) {
  if (!timer || !timer.totalMs) { live = null; return { bar: null, num: null }; }
  const bar = h('div', { class: 'timer' }, h('i'));
  const num = h('span', { class: 'tnum' }, String(Math.ceil(timer.leftMs / 1000)));
  live = { leftMs: timer.leftMs, totalMs: timer.totalMs, at: performance.now(), bar, num, shown: Math.ceil(timer.leftMs / 1000) };
  bar.firstChild.style.width = `${(timer.leftMs / timer.totalMs) * 100}%`;
  return { bar, num };
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

// ---------- pieces ----------
const byScore = (ps) => [...ps].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
const pts = (n) => h('span', { class: `pts ${n < 0 ? 'neg' : ''}` }, money(n));
const player = (g, id) => g.players.find((p) => p.id === id) ?? null;
const nameOf = (g, id) => player(g, id)?.name ?? '';
const colorOf = (g, id) => player(g, id)?.color ?? '#fff';
const secs = (ms) => `${(ms / 1000).toFixed(2)}s`;

function scoreRow(g, p, big = false) {
  const hot = p.streak >= (g.hotStreak ?? 3);
  return h('div', { class: `score ${big ? 'big' : ''} ${g.controllerId === p.id ? 'ctl' : ''} ${p.connected ? '' : 'off'}` },
    h('span', { class: 'swatch', style: { background: p.color } }),
    h('span', { class: 'nm' }, p.name, hot ? ' 🔥' : ''),
    pts(p.score));
}

function sidebar(g) {
  return h('aside', { class: 'scores' },
    h('h3', {}, `Round ${g.round} of ${g.rounds}`),
    byScore(g.players).map((p) => scoreRow(g, p)),
    g.controllerId && h('div', { class: 'more' }, `${nameOf(g, g.controllerId)} picks next`),
    h('div', { class: 'qr-mini' }, qrImg(), 'Scan to join'));
}

function reactions(g) {
  if (!g.reactions?.length) return null;
  return h('div', { class: 'jp-reacts' }, g.reactions.slice(-6).map((r) =>
    h('span', { class: 'jp-react', style: { borderColor: colorOf(g, r.pid) } }, r.e, h('small', {}, nameOf(g, r.pid)))));
}

const layout = (g, main, full = false) => h('div', { class: `tv-layout ${full ? 'full' : ''}` }, h('div', { class: 'tv-main' }, main), full ? null : sidebar(g), reactions(g));

// ---------- screens ----------
function board(g) {
  const cells = [];
  for (const col of g.board) cells.push(h('div', { class: 'cat' }, col.name));
  const rows = Math.max(...g.board.map((c) => c.clues.length));
  for (let r = 0; r < rows; r++) {
    for (const col of g.board) {
      const cl = col.clues[r];
      cells.push(h('div', { class: `tile ${!cl || cl.used ? 'used' : ''}` }, cl && !cl.used ? money(cl.value) : ''));
    }
  }
  const el = h('div', { class: 'board', style: { gridTemplateColumns: `repeat(${g.board.length}, 1fr)`, gridTemplateRows: `0.9fr repeat(${rows}, 1fr)` } }, cells);
  return layout(g, el);
}

function clue(g) {
  const c = g.clue;
  const stage = [h('div', { class: 'cluecat' }, h('span', {}, c.cat), h('span', {}, c.dd ? 'Daily Double' : money(c.value)))];
  if (g.phase === 'dd-wager') {
    stage.push(h('div', {}, h('div', { class: 'dd-big' }, 'DAILY DOUBLE!'),
      h('div', { class: 'text', style: { marginTop: '3vmin' } },
        h('span', { style: { color: colorOf(g, g.controllerId) } }, nameOf(g, g.controllerId)), ', make your wager')));
    return layout(g, h('div', { class: 'stage' }, stage));
  }
  stage.push(h('div', {}, h('div', { class: 'text' }, c.q ?? ''),
    g.phase === 'reveal' && c.answer ? h('div', { class: 'answer' }, c.answer) : null));
  if (g.phase === 'reading') stage.push(h('div', { class: 'banner' }, 'Get ready…'));
  else if (g.phase === 'open') {
    const { bar, num } = timerParts(g.timer);
    stage.push(h('div', { class: 'banner open' }, h('span', {}, 'Buzz in! '), num), bar);
  } else if (g.phase === 'answering' || g.phase === 'dd-answer') {
    const who = g.phase === 'answering' ? c.buzzedId : g.controllerId;
    const col = colorOf(g, who);
    const { bar, num } = timerParts(g.timer);
    stage.push(h('div', { class: 'banner who', style: { background: col, color: '#fff', textShadow: '0 .3vmin 0 #0008' } },
      h('span', {}, nameOf(g, who) + (c.dd ? ` · wager ${money(c.wager ?? 0)}` : '') + (c.buzzMs != null && g.phase === 'answering' ? ` · ${secs(c.buzzMs)}` : ''), ' '),
      num), bar);
  } else if (g.phase === 'reveal') {
    const r = g.lastResult;
    const text = r ? `${nameOf(g, r.pid)} ${r.correct ? '+' : '-'}${money(Math.abs(r.delta ?? 0))}${r.correct && r.streak >= (g.hotStreak ?? 3) ? ' 🔥' : ''}` : 'Nobody got it';
    stage.push(h('div', { class: 'banner', style: r?.correct ? { background: '#15803d' } : {} }, text));
    if (c.buzzes?.length) {
      stage.push(h('div', { class: 'jp-buzzes' }, c.buzzes.slice(0, 6).map((b, i) =>
        h('span', { class: `jp-buzztime ${b.won ? 'won' : ''}` }, h('i', { style: { background: colorOf(g, b.pid) } }), `${i + 1}. ${nameOf(g, b.pid)} ${secs(b.ms)}`))));
    }
  }
  return layout(g, h('div', { class: 'stage' }, stage));
}

function roundEnd(g) {
  return layout(g, h('div', { class: 'stage', style: { alignContent: 'center' } }, h('div', { style: { width: '100%' } },
    h('div', { class: 'text', style: { marginBottom: '2vmin' } }, `End of round ${g.round}`),
    h('div', { class: 'final-grid', style: { maxWidth: '80vmin', margin: '0 auto' } }, byScore(g.players).map((p) => scoreRow(g, p, true))))), true);
}

function final(g) {
  const f = g.final;
  const body = [h('div', { class: 'cluecat' }, h('span', {}, f.category), h('span', {}, 'Final Jeopardy'))];
  if (g.phase === 'final-wager') {
    body.push(h('div', { class: 'text' }, 'Final Jeopardy'), h('div', { class: 'answer' }, f.category),
      h('p', { style: { fontSize: '3vmin', color: '#cdd6ff' } }, 'Place your wagers on your phone'));
    body.push(h('div', { class: 'final-grid' }, byScore(g.players).map((p) => {
      const playing = f.eligible.includes(p.id);
      return h('div', { class: 'frow' },
        h('span', {}, h('span', { class: 'swatch', style: { background: p.color } }), ' ', p.name),
        h('span', { style: playing ? {} : { opacity: 0.6 } }, !playing ? 'Sitting out' : f.wagered.includes(p.id) ? 'Wager locked in ✓' : 'Wagering…'),
        h('span', {}, money(p.score)), h('span', {}));
    })));
  } else if (g.phase === 'final-answer') {
    const { bar, num } = timerParts(g.timer);
    body.push(h('div', { class: 'text' }, f.q ?? ''), h('div', { class: 'bigtimer' }, num),
      h('p', { style: { fontSize: '3vmin', color: '#cdd6ff' } }, `Type your answer on your phone · ${f.answered.length} of ${f.eligible.length} in`), bar);
  } else {
    body.push(h('div', { class: 'text', style: { fontSize: '4.4vmin' } }, f.q ?? ''),
      f.answer ? h('div', { class: 'answer', style: { marginTop: '1.5vmin', fontSize: '4vmin' } }, f.answer) : null,
      h('div', { class: 'final-grid' }, f.reveals.map((r) => h('div', { class: `frow ${r.correct ? 'ok' : 'no'}` },
        h('span', {}, h('span', { class: 'swatch', style: { background: colorOf(g, r.id) } }), ' ', nameOf(g, r.id)),
        h('span', {}, `“${r.answer}”`),
        h('span', {}, money(r.wager ?? 0)),
        h('span', { class: 'res' }, r.correct ? '✔' : '✘')))));
  }
  return layout(g, h('div', { class: 'stage', style: { alignContent: 'center' } }, h('div', { style: { width: '100%' } }, body)), true);
}

function gameover(g) {
  const sorted = byScore(g.players);
  const top = sorted[0];
  const winners = sorted.filter((p) => p.score === top?.score);
  return layout(g, h('div', { class: 'stage', style: { alignContent: 'center' } }, h('div', { style: { width: '100%' } },
    h('div', { class: 'text' }, winners.length > 1 ? 'It’s a tie!' : 'Champion'),
    h('div', { class: 'winner' }, winners.map((w) => w.name).join(' & ')),
    g.awards?.length ? h('div', { class: 'jp-awards' }, g.awards.map((a) => h('div', { class: 'jp-award' },
      h('b', {}, a.title), h('span', { style: { color: colorOf(g, a.pid) } }, nameOf(g, a.pid)), h('small', {}, a.detail)))) : null,
    h('div', { class: 'final-grid', style: { maxWidth: '80vmin', margin: '0 auto' } }, sorted.map((p) => scoreRow(g, p, true))))), true);
}

/** Returns the element to show for the current state. The TV page swaps it in. */
export function render(view, ctx) {
  if (ctx?.sound) { play = ctx.sound.play; musicPlaying = ctx.sound.musicPlaying; }
  const g = view.game;
  live = null; // each screen sets up its own countdown, if it has one
  if (g.phase === 'gameover') return gameover(g);
  if (g.phase.startsWith('final') && g.final) return final(g);
  if (g.phase === 'round-end') return roundEnd(g);
  if (g.clue && ['dd-wager', 'reading', 'open', 'answering', 'dd-answer', 'reveal'].includes(g.phase)) return clue(g);
  if (g.board) return board(g);
  return h('div', { class: 'lobby' }, h('h1', {}, 'Jeopardy'), h('p', {}, 'Getting the board ready…'));
}
