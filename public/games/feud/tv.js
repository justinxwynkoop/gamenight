// Family Feud on the TV: the face-off, the survey board, strikes and the steal, Fast Money and the winner.
// The look is a prime-time survey stage: a gold-framed board ringed with chasing bulbs, glossy blue answer panels
// that flip to lit ones, team podiums with lit score windows, and the pot in a gold "bank" between them. The Apple
// TV app draws the same screens in SwiftUI (tv-app/FamilyGameNight/Feud/Display/FeudScreens.swift).
import { h, ink, unitById, qrImg } from '../../common.js';
import { loadStyles, art } from './shared.js';
import { celebrate } from '../../fireworks.js';

// ---------- countdown (Fast Money) ----------
let live = null; // { leftMs, totalMs, at, bar, num, ring, shown }
let play = () => {};
setInterval(() => {
  if (!live) return;
  const left = Math.max(0, live.leftMs - (performance.now() - live.at));
  if (live.bar) { live.bar.firstChild.style.width = `${(left / live.totalMs) * 100}%`; live.bar.classList.toggle('low', left <= 5000); }
  if (live.ring) { live.ring.style.setProperty('--p', String(left / live.totalMs)); live.ring.classList.toggle('low', left <= 5000); }
  const secs = Math.ceil(left / 1000);
  if (live.num) live.num.textContent = String(secs);
  if (secs !== live.shown) { live.shown = secs; if (secs > 0 && secs <= 5 && left < live.totalMs) play('tick'); }
}, 100);
function timerParts(timer) {
  if (!timer || timer.timedOut) { live = null; return { bar: null, num: null, ring: null }; }
  const bar = h('div', { class: 'fd-timer' }, h('i'));
  const num = h('span', { class: 'fd-tnum' }, String(Math.ceil(timer.leftMs / 1000)));
  const ring = h('div', { class: 'fd-ring', style: { '--p': String(timer.leftMs / timer.totalMs) } }, num);
  live = { leftMs: timer.leftMs, totalMs: timer.totalMs, at: performance.now(), bar, num, ring, shown: Math.ceil(timer.leftMs / 1000) };
  bar.firstChild.style.width = `${(timer.leftMs / timer.totalMs) * 100}%`;
  return { bar, num, ring };
}

// ---------- the big X ----------
// A strike puts a large boxed X in the middle of the screen, which then slides down into the next empty strike box.
const FX_MS = 2000;
let strikeFx = null; // { round, n, at }: the latest strike, for the animation
const fxElapsed = (r) => (strikeFx && strikeFx.round === r.number && strikeFx.n === r.strikes ? performance.now() - strikeFx.at : Infinity);
const fxActive = (r) => r.strikes > 0 && fxElapsed(r) < FX_MS;

function bigX(r) {
  const el = h('div', { class: 'fd-bigx', 'aria-hidden': 'true' }, h('span', {}, '✕'));
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

/** A steal that failed: the big X comes up in the middle for a moment and goes (there is no strike box for it to land in). */
const MISS_MS = FX_MS + 800;
let stealFx = null; // { round, at }
const missElapsed = (r) => (stealFx && stealFx.round === r.number ? performance.now() - stealFx.at : Infinity);
function missX(r) {
  const el = h('div', { class: 'fd-bigx', 'aria-hidden': 'true' }, h('span', {}, '✕'));
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    const anim = el.animate([
      { offset: 0, transform: 'scale(.2)', opacity: 0, easing: 'ease-out' },
      { offset: 0.1, transform: 'scale(1.08)', opacity: 1, easing: 'ease-in-out' },
      { offset: 0.15, transform: 'scale(1)', opacity: 1 },
      { offset: 0.8, transform: 'scale(1)', opacity: 1 },
      { offset: 1, transform: 'scale(1)', opacity: 0 },
    ], { duration: MISS_MS, fill: 'forwards' });
    anim.currentTime = Math.min(MISS_MS - 1, Math.max(0, missElapsed(r)));
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
      if (r.stealMissed && !pr.stealMissed) stealFx = { round: r.number, at: performance.now() };
      if (r.timer?.timedOut && !pr.timer?.timedOut) sound.play('timeup');
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
      if ((f.dupBuzz ?? 0) > (pf.dupBuzz ?? 0)) sound.play('strike');   // Player 2 said what Player 1 said: the buzzer
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
const plural = (u) => u?.name ?? '';

// ---------- the stage, the lobby ----------
/** Every Feud screen sits on the same stage: spotlights from above, a glow on the floor. */
const stage = (cls, ...kids) => h('div', { class: `fd-stage ${cls}` }, h('div', { class: 'fd-beams', 'aria-hidden': 'true' }), ...kids);
const logo = (small) => h('div', { class: `fd-logo ${small ? 'sm' : ''}` }, h('span', { class: 'a' }, 'Family'), h('span', { class: 'b' }, 'Feud'));

export function lobby(v, ctx) {
  loadStyles();
  const g = v.game;
  const info = ctx?.info ?? {};
  const units = v.room.units;
  const step = (pic, title, text) => h('div', { class: 'fd-how' }, art(pic), h('div', {}, h('b', {}, title), h('span', {}, text)));
  return stage('fd-lobby',
    h('div', { class: 'fd-lb-top' },
      h('div', { class: 'fd-lb-brand' }, logo(),
        h('div', { class: 'fd-lb-set' }, g.title ?? 'Pick a question set on the host page'),
        h('div', { class: 'fd-lb-rules' }, `${g.rounds || 5} survey rounds · first to ${g.settings?.targetScore ?? 300} wins${g.settings?.fastMoney && g.hasFastMoney ? ' · then Fast Money for the jackpot' : ''}`)),
      h('div', { class: 'fd-lb-join' },
        h('div', { class: 'qr' }, ctx?.qr ? ctx.qr() : qrImg()),
        h('div', { class: 'how' }, h('b', {}, 'Scan to join'),
          info.code ? h('span', {}, 'or open ', h('b', {}, info.site), ' and type ', h('b', { class: 'roomcode fd-code' }, info.code))
            : info.joinUrl ? h('span', {}, `or open ${info.joinUrl.replace(/^https?:\/\//, '')}`) : null))),
    h('div', { class: 'fd-lb-teams' }, units.map((u, i) => h('div', { class: 'fd-lb-team', style: { '--c': u.color, '--ink': ink(u.color) } },
      h('div', { class: 'nm' }, u.name),
      h('div', { class: 'who' }, u.memberNames?.length ? u.memberNames.map((n) => h('span', {}, n)) : h('em', {}, 'Nobody yet: pick this team on your phone')),
      i === 0 && units.length > 1 && h('div', { class: 'vs' }, 'VS')))),
    h('div', { class: 'fd-lb-steps' },
      step('microphone', 'Face-off', 'Buzz first and name the top answer'),
      step('clipboard', 'Survey says', 'Find every answer before three strikes'),
      step('money-bag', 'Fast Money', 'The winners play a bonus round for the jackpot')),
    h('div', { class: 'fd-lb-foot' }, g.hosted ? 'The host starts the game.' : 'The captain (the first player to join) starts the game on their phone.'));
}

// ---------- a round ----------
function podium(v, u, r) {
  const playing = r && r.control === u.id;
  const tag = playing ? (r.step === 'steal' ? 'STEALING' : r.step === 'roundEnd' ? 'WINS THE ROUND' : 'PLAYING') : '';
  return h('div', { class: `fd-podium ${playing ? 'on' : ''} ${r?.control && !playing ? 'off' : ''}`, style: { '--c': u.color, '--ink': ink(u.color) } },
    h('div', { class: 'nm' }, u.name),
    h('div', { class: 'led' }, String(u.score)),
    h('div', { class: 'tag' }, tag || ' '));
}

function bank(r) {
  const label = r.sudden ? `SUDDEN DEATH ×${r.multiplier}` : r.multiplier === 2 ? 'DOUBLE POINTS' : r.multiplier === 3 ? 'TRIPLE POINTS' : null;
  return h('div', { class: 'fd-bank' },
    h('div', { class: 'rd' }, r.sudden ? 'Sudden death' : `Round ${r.number}`),
    h('div', { class: 'coin' }, h('div', { class: 'in' }, h('b', {}, String(r.pot)), h('small', {}, r.step === 'roundEnd' ? 'won' : 'in the bank'))),
    label && h('div', { class: 'mult' }, label));
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

/** The board: a gold frame ringed with chasing bulbs, the answers 1 to n/2 down the left and the rest down the right. */
function board(r) {
  const rows = Math.max(3, Math.ceil(r.answers.length / 2));
  return h('div', { class: 'fd-frame' }, h('div', { class: 'fd-bulbs', 'aria-hidden': 'true' }),
    h('div', { class: 'fd-board', style: { gridTemplateRows: `repeat(${rows}, 1fr)` } }, r.answers.map((a) => slot(a, r.number))));
}

/** Who buzzed in the face-off and how fast (to the thousandth), fastest first: it stays up until the team has played on. */
function faceoffTimes(v, r) {
  const list = r.faceoff.buzzes ?? [];
  if (!list.length || !['faceoff', 'choose'].includes(r.step)) return null;
  const best = list[0].ms;
  return h('div', { class: 'fd-buzzes' }, h('span', { class: 'lbl' }, 'Buzz times'),
    list.map((b, i) => h('span', { class: `rb ${i === 0 ? 'first' : ''}`, style: { '--c': colorOf(v, b.unitId) } },
      h('i', {}, String(i + 1)), b.name ?? nameOf(v, b.unitId), h('b', {}, `${(b.ms / 1000).toFixed(3)}s`), i ? h('small', {}, `+${((b.ms - best) / 1000).toFixed(3)}`) : null)));
}

function banner(v, r) {
  const f = r.faceoff;
  const cls = []; let text = ''; let sub = null; let color = null;
  const vs = f.reps.map((p) => p.name).filter(Boolean).join('  vs  ');
  if (r.step === 'faceoff') {
    if (f.open) { cls.push('open'); text = 'Face-off! Buzz in!'; sub = vs; }
    else if (f.turn) { const rep = f.reps.find((p) => p.unitId === f.turn); text = `${rep?.name ?? nameOf(v, f.turn)}, your answer?`; color = colorOf(v, f.turn); if (f.followup) sub = 'Both missed: next in line'; else if (r.sudden) sub = `Sudden death: the winning answer is worth ×${r.multiplier}`; sub = sub ? `${sub} · No table talk!` : 'No table talk! Answer alone'; }
    else if (f.attempts.length >= 2) { text = 'Nobody got it. Face-off again!'; }
    else { text = 'Face-off'; sub = vs; }
  } else if (r.step === 'choose') { text = `${nameOf(v, f.winner)} won the face-off!`; color = colorOf(v, f.winner); sub = 'Play or pass?'; }
  else if (r.step === 'play') { text = `${nameOf(v, r.control)}: name an answer`; color = colorOf(v, r.control); if (r.up) sub = `${r.up.name} is up`; }
  else if (r.step === 'steal') { cls.push('steal'); text = `Steal! ${nameOf(v, r.control)}, one guess`; if (r.up) sub = `${r.up.name} is up`; }
  else if (r.step === 'roundEnd') { text = `${nameOf(v, r.result?.winner)} win ${r.result?.awarded ?? 0} points${r.multiplier > 1 ? ` (×${r.multiplier})` : ''}`; color = colorOf(v, r.result?.winner); cls.push('win'); }
  // With nobody hosting, the last typed guess shows under the banner, so the room sees what was said.
  if (!sub && r.said && r.step !== 'choose') sub = `${r.said.name}: “${r.said.text}”${r.said.index === -1 ? '  ✕' : ''}`;
  // The answer clock the host started: the seconds left, or TIME'S UP.
  const clock = r.timer && ['play', 'steal'].includes(r.step) ? (r.timer.timedOut ? h('b', { class: 'fd-aclock out' }, 'TIME’S UP') : h('b', { class: 'fd-aclock' }, timerParts(r.timer).num)) : null;
  return h('div', { class: `fd-banner ${cls.join(' ')} ${color ? 'team' : ''}`, style: color ? { '--c': color, '--ink': ink(color) } : {} },
    h('div', { class: 'txt' }, h('span', {}, text), sub && h('small', {}, sub)), clock);
}

function roundScreen(v) {
  const g = v.game; const r = g.round;
  const [a, b] = v.room.units;
  return stage('fd-round',
    h('div', { class: 'fd-top' }, a && podium(v, a, r), bank(r), b && podium(v, b, r)),
    h('div', { class: 'fd-question' }, h('span', {}, r.question)),
    board(r),
    faceoffTimes(v, r),
    h('div', { class: 'fd-foot' }, strikes(r), banner(v, r), h('div', { class: 'fd-join' }, qrImg())),
    fxActive(r) && bigX(r),
    r.stealMissed && missElapsed(r) < MISS_MS && missX(r));
}

// ---------- Fast Money ----------
function fmHead(v, f) {
  const team = unitOf(v, f.team);
  return h('div', { class: 'fd-fmhead' }, art('money-bag', 'bag'), h('div', { class: 't' }, 'Fast Money'),
    team && h('div', { class: 'tm', style: { background: team.color, color: ink(team.color) } }, team.name),
    h('div', { class: `stakes ${f.stakes === 'tiebreak' ? 'tie' : ''}` }, f.stakes === 'tiebreak' ? 'Tiebreaker' : 'Bonus round'));
}

function fmScreen(v) {
  const g = v.game; const f = g.fm;
  const team = unitOf(v, f.team);
  const champ = unitOf(v, g.champion);
  if (f.step === 'team') {
    return stage('fd-center fd-intro', art('money-bag', 'hero'),
      h('div', { class: 'fd-kicker' }, 'It’s a tie!'),
      h('div', { class: 'fd-big' }, 'Fast Money decides it'),
      h('p', { class: 'fd-sub' }, `The team that plays wins with ${f.goal} points. Fall short, and the other team wins.`),
      h('div', { class: 'fd-vs' }, v.room.units.map((u) => h('span', { style: { background: u.color, color: ink(u.color) } }, `${u.name} · ${u.score}`))));
  }
  if (f.step === 'pick') {
    const pair = f.players.map((p) => p.name ?? '…').join(' & ');
    if (f.stakes === 'tiebreak') {
      return stage('fd-center fd-intro', art('money-bag', 'hero'),
        h('div', { class: 'fd-kicker' }, 'Tiebreaker: Fast Money'),
        h('div', { class: 'fd-big', style: { color: team?.color } }, pair),
        h('p', { class: 'fd-sub' }, `${plural(team)} need ${f.goal} points to win the game.`));
    }
    return stage('fd-center fd-intro fd-crowned',
      h('div', { class: 'fd-crown' }, art('trophy', 'hero')),
      h('div', { class: 'fd-kicker' }, 'Winners of the Feud'),
      h('div', { class: 'fd-champ', style: { '--c': champ?.color ?? team?.color ?? '#ffd45a' } }, champ?.name ?? team?.name ?? ''),
      h('div', { class: 'fd-next' }, art('money-bag'), h('div', {},
        h('b', {}, 'Bonus round: Fast Money'),
        h('span', {}, `${pair} play for the jackpot: ${f.goal} points wins it`))));
  }
  if (f.step === 'p1' || f.step === 'p2') {
    const who = f.players[f.step === 'p1' ? 0 : 1];
    const { ring } = timerParts(f.timer);
    return stage('fd-fmplay', fmHead(v, f),
      h('div', { class: 'fd-fmbody' },
        h('div', { class: 'fd-fmleft' },
          h('div', { class: 'fd-big' }, `${who.name ?? 'Player'}, you’re up!`),
          h('p', { class: 'fd-sub' }, f.step === 'p2' ? (f.waitingForClock ? 'Get ready! The host starts the clock.' : 'Don’t repeat your partner’s answers') : 'Five questions. Answer fast! No table talk.'),
          // Player 2 plays with Player 1's answers hidden, but their score stays up.
          f.step === 'p2' && h('div', { class: 'fd-p1score' }, h('span', {}, `${f.players[0]?.name ?? 'Player 1'} scored`), h('b', {}, String(f.totals.p1))),
          f.step === 'p2' && f.rejected?.length ? h('p', { class: 'fd-dupnote' }, `Question ${f.rejected[0] + 1}: that answer was already given. Try another!`) : null,
          h('div', { class: 'fd-qs' }, f.rows.map((row, i) => h('div', { class: 'q' }, h('span', { class: 'n' }, String(i + 1)), h('span', {}, row.question))))),
        h('div', { class: 'fd-fmclock' }, art('stopwatch', 'watch'), f.timer?.timedOut ? h('div', { class: 'fd-ring out' }, h('span', { class: 'fd-tnum' }, 'TIME')) : ring)));
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
  const pct = Math.min(100, (f.totals.total / f.goal) * 100);
  const won = f.step === 'results' && f.won;
  const verdict = f.step !== 'results' ? null
    : f.stakes === 'tiebreak' ? (f.won ? `${plural(team)} win the game!` : `${nameOf(v, g.champion)} win the game!`)
      : (f.won ? 'Jackpot!' : 'So close!');
  return stage(`fd-fmreveal ${won ? 'won' : ''}`, fmHead(v, f),
    h('div', { class: 'fd-fmnames' }, f.players.map((p) => h('span', {}, p.name ?? ''))),
    h('div', { class: 'fd-frame' }, h('div', { class: 'fd-bulbs', 'aria-hidden': 'true' }),
      h('div', { class: 'fd-fm' }, f.rows.map((row) => h('div', { class: 'row' }, cell(row.p1, 'p1', row.q), h('div', { class: 'q' }, row.question), cell(row.p2, 'p2', row.q))))),
    h('div', { class: 'fd-fmfoot' },
      h('div', { class: 'tot' }, h('b', {}, String(f.totals.total)), h('span', {}, 'points')),
      h('div', { class: 'meter' }, h('div', { class: 'fill', style: { width: `${pct}%` } }), h('div', { class: 'goal' }, `${f.goal} wins ${f.stakes === 'tiebreak' ? 'the game' : 'the jackpot'}`)),
      verdict && h('div', { class: `fd-verdict ${f.won ? 'yes' : 'no'}` }, f.won && art('money-bag'), verdict)));
}

// Confetti lives outside the screen that is redrawn on every update, so it keeps falling.
function confetti(colors) {
  const old = document.querySelector('.fd-confetti');
  if (!colors) { old?.remove(); celebrate(null); return; }
  celebrate('fd-winners', [...colors, '#5b72ff']);
  if (old) return;
  document.body.append(h('div', { class: 'fd-confetti', 'aria-hidden': 'true' }, Array.from({ length: 110 }, (_, i) => h('i', {
    style: { left: `${Math.random() * 100}vw`, background: colors[i % colors.length], animationDuration: `${3 + Math.random() * 4}s`, animationDelay: `${-Math.random() * 6}s` },
  }))));
}
export function leave() { live = null; confetti(null); }

function doneScreen(v) {
  const g = v.game;
  const champ = unitOf(v, g.result?.champion ?? g.champion);
  const fm = g.result?.fastMoney;
  const sorted = [...v.room.units].sort((a, b) => (b.id === champ?.id) - (a.id === champ?.id) || b.score - a.score);
  confetti(champ ? [champ.color, '#ffd45a', '#ffffff'] : ['#ffd45a', '#ffffff', '#5b72ff']);
  const fmLine = !fm?.played ? null
    : fm.stakes === 'tiebreak' ? `Fast Money broke the tie: ${fm.total} of ${fm.goal}`
      : fm.won ? `Fast Money jackpot! ${fm.total} points` : `Fast Money: ${fm.total} of ${fm.goal}, just short of the jackpot`;
  return stage('fd-center fd-done',
    h('div', { class: 'fd-crown' }, art('trophy', 'hero')),
    h('div', { class: 'fd-kicker' }, champ ? 'Winners of the Feud' : 'It’s a tie!'),
    champ && h('div', { class: 'fd-champ', style: { '--c': champ.color } }, champ.name),
    champ?.memberNames?.length && h('div', { class: 'fd-members' }, champ.memberNames.join(' · ')),
    h('div', { class: 'fd-final' }, sorted.map((u) => h('div', { class: `r ${u.id === champ?.id ? 'top' : ''}`, style: { '--c': u.color, '--ink': ink(u.color) } },
      h('span', { class: 'nm' }, u.name), h('b', {}, String(u.score))))),
    fmLine && h('div', { class: `fd-fmline ${fm.won ? 'won' : ''}` }, art('money-bag'), fmLine),
    h('p', { class: 'fd-thanks' }, 'Thanks for playing! Play again from the host or the captain’s phone.'));
}

/** Returns the element to show for the current state. The TV page swaps it in. */
export function render(view, ctx) {
  loadStyles();
  if (ctx?.sound) play = ctx.sound.play;
  live = null; // each screen sets up its own countdown, if it has one
  const g = view.game;
  if (g.status === 'done') return doneScreen(view);
  confetti(null);
  if (g.status === 'fastmoney' && g.fm) return fmScreen(view);
  if (g.status === 'round' && g.round) return roundScreen(view);
  return stage('fd-center', logo());
}
