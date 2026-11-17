// Family Feud on the TV: the face-off, the survey board, strikes and the steal, Fast Money and the winner.
import { h, ink, unitById, qrImg } from '../../common.js';

// ---------- countdown (Fast Money) ----------
let live = null; // { leftMs, totalMs, at, bar, num, shown }
let play = () => {};
setInterval(() => {
  if (!live) return;
  const left = Math.max(0, live.leftMs - (performance.now() - live.at));
  if (live.bar) { live.bar.firstChild.style.width = `${(left / live.totalMs) * 100}%`; live.bar.classList.toggle('low', left <= 5000); }
  const secs = Math.ceil(left / 1000);
  if (live.num) live.num.textContent = String(secs);
  if (secs !== live.shown) { live.shown = secs; if (secs > 0 && secs <= 5 && left < live.totalMs) play('tick'); }
}, 100);
function timerParts(timer) {
  if (!timer || timer.timedOut) { live = null; return { bar: null, num: null }; }
  const bar = h('div', { class: 'fd-timer' }, h('i'));
  const num = h('span', { class: 'fd-tnum' }, String(Math.ceil(timer.leftMs / 1000)));
  live = { leftMs: timer.leftMs, totalMs: timer.totalMs, at: performance.now(), bar, num, shown: Math.ceil(timer.leftMs / 1000) };
  bar.firstChild.style.width = `${(timer.leftMs / timer.totalMs) * 100}%`;
  return { bar, num };
}

// ---------- the big X ----------
// A strike puts a large boxed X in the middle of the screen, which then slides down into the next empty strike box.
const FX_MS = 2000;
let strikeFx = null; // { round, n, at }: the latest strike, for the animation
const fxElapsed = (r) => (strikeFx && strikeFx.round === r.number && strikeFx.n === r.strikes ? performance.now() - strikeFx.at : Infinity);
const fxActive = (r) => r.strikes > 0 && fxElapsed(r) < FX_MS;

function bigX(r) {
  const el = h('div', { class: 'fd-bigx', 'aria-hidden': 'true' }, '✕');
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    const slots = document.querySelectorAll('.fd-strikes .x');
    const target = slots[r.strikes - 1]?.getBoundingClientRect();
    const big = el.getBoundingClientRect();
    const dx = target ? target.left + target.width / 2 - (big.left + big.width / 2) : 0;
    const dy = target ? target.top + target.height / 2 - (big.top + big.height / 2) : 0;
    const sc = target ? target.width / big.width : 0.2;
    const anim = el.animate([
      { offset: 0, transform: 'scale(.2)', opacity: 0, easing: 'ease-out' },
      { offset: 0.11, transform: 'scale(1.08)', opacity: 1, easing: 'ease-in-out' },
      { offset: 0.16, transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { offset: 0.62, transform: 'translate(0, 0) scale(1)', opacity: 1, easing: 'cubic-bezier(.5, 0, .2, 1)' },
      { offset: 1, transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 1 },
    ], { duration: FX_MS, fill: 'forwards' });
    anim.currentTime = Math.min(FX_MS - 1, Math.max(0, fxElapsed(r)));   // a redraw part-way through carries on from where it was
    anim.onfinish = () => el.remove();
  });
  return el;
}

// ---------- animations that must carry on through a redraw ----------
// The page redraws everything on each update, so an animation's start time is kept here and a redraw
// part-way through resumes it from the right point (a negative animation delay) instead of restarting.
const FLIP_MS = 700;
const POINTS_MS = 600;
const TYPE_MS = 55;
const started = new Map(); // key -> performance.now() when it began
const since = (key) => (started.has(key) ? performance.now() - started.get(key) : Infinity);
const typing = []; // { el, text, key }: answers being typed out
setInterval(() => {
  for (let i = typing.length - 1; i >= 0; i--) {
    const t = typing[i];
    if (!t.el.isConnected) { typing.splice(i, 1); continue; }
    const n = Math.min(t.text.length, Math.floor(since(t.key) / TYPE_MS));
    t.el.textContent = t.text.slice(0, n);
    if (n >= t.text.length) { t.el.classList.remove('typing'); typing.splice(i, 1); }
  }
}, 40);
/** An answer that types itself out, a letter at a time. */
function typed(key, text) {
  const el = h('span', { class: 'a' });
  const elapsed = since(key);
  const n = Number.isFinite(elapsed) ? Math.min(text.length, Math.floor(elapsed / TYPE_MS)) : text.length;
  el.textContent = text.slice(0, n);
  if (n < text.length) { el.classList.add('typing'); typing.push({ el, text, key }); }
  return el;
}

/** Sound cues for a change of state. prev and view are the raw { room, game } views. */
export function onChange(prev, view, sound) {
  play = sound.play;
  const p = prev.game; const g = view.game;
  if (!p || !g) return;
  const pr = p.round; const r = g.round;
  if (r) {
    const sameRound = pr && pr.number === r.number;
    const up = (x) => x.answers.filter((a) => a.revealed).length;
    if (sameRound) {
      r.answers.forEach((a, i) => { if ((a.revealed || a.late) && !(pr.answers[i].revealed || pr.answers[i].late)) started.set(`flip:${r.number}:${a.n}`, performance.now()); });
      if (r.strikes > pr.strikes) strikeFx = { round: r.number, n: r.strikes, at: performance.now() };
      if (up(r) > up(pr)) sound.play('ding');
      else if (r.strikes > pr.strikes) sound.play(r.strikes >= r.maxStrikes ? 'strikeout' : 'strike');
      else if (pr.step === 'steal' && r.step === 'roundEnd' && r.result?.winner === pr.stealFrom) sound.play('strike');
      else if (r.faceoff.attempts.length > pr.faceoff.attempts.length && r.faceoff.attempts.at(-1)?.rank === null) sound.play('strike');
      else if (r.faceoff.open && !pr.faceoff.open) sound.play('open');
      else if (r.faceoff.turn && !pr.faceoff.turn && !r.faceoff.attempts.length) sound.play('faceoff');
      if (r.step === 'roundEnd' && pr.step !== 'roundEnd') sound.play('correct');
    } else if (pr || p.status !== 'round') sound.play('roundstart');
  }
  const pf = p.fm; const f = g.fm;
  if (f) {
    if (!pf) sound.play('fastmoney');
    else {
      for (const [row, was] of f.rows.map((x, i) => [x, pf.rows[i]])) {
        for (const slotName of ['p1', 'p2']) {
          const c = row[slotName]; const w = was[slotName];
          if (c.shown >= 1 && w.shown < 1 && c.typed) started.set(`say:${slotName}:${row.q}`, performance.now());
          if (c.shown === 2 && w.shown < 2) started.set(`pts:${slotName}:${row.q}`, performance.now());
        }
      }
      if (f.timer?.timedOut && !pf.timer?.timedOut) sound.play('timeup');
      const judged = (x) => x.rows.reduce((n, row) => n + (row.p1.judged ? 1 : 0) + (row.p2.judged ? 1 : 0), 0);
      if (judged(f) > judged(pf)) {
        const pts = (x) => x.rows.reduce((n, row) => n + (row.p1.points ?? 0) + (row.p2.points ?? 0), 0);
        sound.play(pts(f) > pts(pf) ? 'fmpoints' : 'zero');
      }
      if (f.step === 'results' && pf.step !== 'results') sound.play(f.won ? 'winner' : 'zero');
    }
  }
  if (g.status === 'done' && p.status !== 'done') sound.play('winner');
}

const colorOf = (v, id) => unitById({ units: v.room.units }, id)?.color ?? '#fff';
const unitOf = (v, id) => v.room.units.find((u) => u.id === id) ?? null;
const nameOf = (v, id) => unitOf(v, id)?.name ?? '';

function teamBox(v, u, r) {
  const playing = r && r.control === u.id;
  return h('div', { class: `fd-score ${playing ? 'on' : ''}`, style: { '--c': u.color, background: u.color, color: ink(u.color) } },
    h('div', { class: 'n' }, u.name),
    h('div', { class: 'p' }, String(u.score)),
    h('div', { class: 's' }, playing ? (r.step === 'steal' ? 'STEAL' : 'PLAYING') : ' '));
}

function strikes(r) {
  const left = FX_MS - fxElapsed(r);
  return h('div', { class: 'fd-strikes' }, Array.from({ length: r.maxStrikes }, (_, i) => {
    const landing = fxActive(r) && i === r.strikes - 1;   // this box fills in when the big X arrives
    return h('div', { class: `x ${i < r.strikes ? 'on' : ''} ${landing ? 'later' : ''}`, style: landing ? { animationDelay: `${Math.max(0, left) / 1000}s` } : {} }, i < r.strikes ? '✕' : '');
  }));
}

function slot(a, round) {
  const up = a.revealed || a.late;
  const t = since(`flip:${round}:${a.n}`);
  const flipping = up && t < FLIP_MS;
  return h('div', { class: `fd-slot ${a.revealed ? 'up' : ''} ${a.late ? 'late' : ''} ${flipping ? 'flipping' : ''}` },
    h('div', { class: 'inner', style: flipping ? { animationDelay: `-${Math.round(t)}ms` } : {} },
      h('div', { class: 'face front' }, h('div', { class: 'num' }, String(a.n))),
      h('div', { class: 'face back' }, h('div', { class: 'num' }, String(a.n)), h('div', { class: 'txt' }, a.text ?? ''), h('div', { class: 'pt' }, a.points !== null ? String(a.points) : ''))));
}

function banner(v, r) {
  const f = r.faceoff;
  const cls = []; let text = ''; let sub = null; let color = null;
  if (r.step === 'faceoff') {
    if (f.open) { cls.push('open'); text = 'Face-off — buzz in!'; sub = f.reps.map((p) => p.name).filter(Boolean).join('  vs  '); }
    else if (f.turn) { const rep = f.reps.find((p) => p.unitId === f.turn); text = `${rep?.name ?? nameOf(v, f.turn)}, your answer?`; color = colorOf(v, f.turn); }
    else if (f.attempts.length >= 2) { text = 'Nobody got it. Face-off again!'; }
    else { text = 'Face-off'; sub = f.reps.map((p) => p.name).filter(Boolean).join('  vs  '); }
  } else if (r.step === 'choose') { text = `${nameOf(v, f.winner)} won the face-off!`; color = colorOf(v, f.winner); sub = 'Play or pass?'; }
  else if (r.step === 'play') { text = `${nameOf(v, r.control)} — name an answer`; color = colorOf(v, r.control); }
  else if (r.step === 'steal') { cls.push('steal'); text = `Steal! ${nameOf(v, r.control)}, one guess`; }
  else if (r.step === 'roundEnd') { text = `${nameOf(v, r.result?.winner)} wins ${r.result?.awarded ?? 0}${r.multiplier > 1 ? ` (×${r.multiplier})` : ''}`; color = colorOf(v, r.result?.winner); cls.push('win'); }
  return h('div', { class: `fd-banner ${cls.join(' ')}`, style: color ? { background: color, color: ink(color) } : {} }, h('span', {}, text), sub && h('small', {}, sub));
}

function roundScreen(v) {
  const g = v.game; const r = g.round;
  const [a, b] = v.room.units;
  const rows = Math.ceil(r.answers.length / 2);
  return h('div', { class: 'fd-screen' },
    h('div', { class: 'fd-top' }, a && teamBox(v, a, r),
      h('div', { class: 'fd-mid' }, h('div', { class: 'rd' }, `Round ${r.number}${r.multiplier > 1 ? ` · ×${r.multiplier}` : ''}`), h('div', { class: 'pot' }, String(r.pot)), h('div', { class: 'pl' }, 'points on the board')),
      b && teamBox(v, b, r)),
    h('div', { class: 'fd-question' }, r.question),
    h('div', { class: 'fd-board', style: { gridTemplateRows: `repeat(${rows}, 1fr)` } }, r.answers.map((a) => slot(a, r.number))),
    h('div', { class: 'fd-foot' }, strikes(r), banner(v, r), h('div', { class: 'fd-join' }, qrImg())),
    fxActive(r) && bigX(r));
}

// ---------- Fast Money ----------
function fmScreen(v) {
  const g = v.game; const f = g.fm;
  const team = unitOf(v, f.team);
  const head = h('div', { class: 'fd-fmhead' }, h('div', { class: 't' }, 'Fast Money'), team && h('div', { class: 'tm', style: { background: team.color, color: ink(team.color) } }, team.name));
  if (f.step === 'team' || f.step === 'pick') {
    return h('div', { class: 'fd-screen center' }, head, h('div', { class: 'fd-big' }, f.step === 'team' ? 'Tied! Who plays Fast Money?' : `${f.players.map((p) => p.name ?? '…').join(' & ')}`),
      h('p', { class: 'fd-sub' }, `Reach ${f.goal} points to win`));
  }
  if (f.step === 'p1' || f.step === 'p2') {
    const who = f.players[f.step === 'p1' ? 0 : 1];
    const { bar, num } = timerParts(f.timer);
    return h('div', { class: 'fd-screen center' }, head,
      h('div', { class: 'fd-big' }, `${who.name ?? 'Player'}, you’re up!`),
      f.step === 'p2' && h('p', { class: 'fd-sub' }, 'Don’t repeat your partner’s answers'),
      h('div', { class: 'fd-qs' }, f.rows.map((row, i) => h('div', { class: 'q' }, h('span', { class: 'n' }, String(i + 1)), row.question))),
      h('div', { class: 'fd-clock' }, f.timer?.timedOut ? 'TIME’S UP' : num), bar);
  }
  // reveal & results
  // Three stages, driven by the host: nothing, what the player said (typed out), then the points ("survey says").
  const cell = (c, slotName, q) => {
    const said = c.shown >= 1;
    const done = c.shown === 2;
    const pop = done && since(`pts:${slotName}:${q}`) < POINTS_MS;
    return h('div', { class: `c ${said && !done ? 'said' : ''} ${done ? 'on' : ''} ${done && c.points === 0 ? 'zero' : ''} ${pop ? 'pop' : ''}`, style: pop ? { animationDelay: `-${Math.round(since(`pts:${slotName}:${q}`))}ms` } : {} },
      said ? typed(`say:${slotName}:${q}`, c.typed || c.label || 'No answer') : h('span', { class: 'a' }),
      h('span', { class: 'p' }, done ? String(c.points) : ''));
  };
  return h('div', { class: 'fd-screen' }, head,
    h('div', { class: 'fd-fm' }, f.rows.map((row) => h('div', { class: 'row' }, cell(row.p1, 'p1', row.q), h('div', { class: 'q' }, row.question), cell(row.p2, 'p2', row.q)))),
    h('div', { class: 'fd-fmfoot' },
      h('div', { class: 'tot' }, h('b', {}, String(f.totals.total)), h('span', {}, ` / ${f.goal}`)),
      f.step === 'results' && h('div', { class: `fd-banner ${f.won ? 'win' : ''}`, style: f.won ? { background: '#15803d' } : {} }, f.won ? 'You did it!' : 'So close!')));
}

function doneScreen(v) {
  const g = v.game;
  const sorted = [...v.room.units].sort((a, b) => b.score - a.score);
  const tie = sorted[0] && sorted[1] && sorted[0].score === sorted[1].score;
  const fm = g.result?.fastMoney;
  const w = sorted[0];
  return h('div', { class: 'fd-screen center' },
    h('div', { class: 'fd-big' }, tie ? 'It’s a tie!' : 'Winner'),
    !tie && w && h('div', { class: 'fd-winner', style: { color: w.color } }, w.name),
    h('div', { class: 'fd-final' }, sorted.map((u) => h('div', { class: 'r', style: { borderColor: u.color } }, h('span', {}, u.name), h('b', {}, String(u.score))))),
    fm?.played && h('p', { class: 'fd-sub' }, `Fast Money: ${fm.total} of ${fm.goal} — ${fm.won ? 'they won the bonus round!' : 'just short'}`));
}

/** Returns the element to show for the current state. The TV page swaps it in. */
export function render(view, ctx) {
  if (ctx?.sound) play = ctx.sound.play;
  live = null; // each screen sets up its own countdown, if it has one
  const g = view.game;
  if (g.status === 'done') return doneScreen(view);
  if (g.status === 'fastmoney' && g.fm) return fmScreen(view);
  if (g.status === 'round' && g.round) return roundScreen(view);
  return h('div', { class: 'fd-screen center' }, h('div', { class: 'fd-big' }, 'Family Feud'));
}
