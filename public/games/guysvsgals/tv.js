// Guys vs Gals on the browser TV (the Apple TV app draws its own, from the same view). The title bar, both teams' race
// lanes, and the stage: the Guys' panel, the question with its answers, the Gals' panel. The coin toss, the Lightning
// Rounds and the winner take over the whole screen. The right answer only reaches the TV once it is locked in.
import { h } from '../../common.js';
import { loadStyles, token, bolt, lane, laneLeft, teamOf, nameOf, aboutText, LETTERS, lengthText, otherSide } from './shared.js';

const LETTER_COLORS = ['#ffe14d', '#7cf0ff', '#b4ff6b', '#ffa7d8'];
const HOP_MS = 260;
let seenMove = null;
const seenAt = new Map();   // reaction id -> when this TV first showed it (so a redraw does not restart it)

function bg() { return h('div', { class: 'gv-bg' }); }

function head(g) {
  const tag = (side) => {
    const t = teamOf(g, side);
    return h('div', { class: `gv-teamtag ${side}` }, h('div', { class: `gv-word ${side}` }, (t?.name ?? side).toUpperCase()));
  };
  return h('div', { class: 'gv-head' }, tag('guys'), h('div', { class: 'gv-vs' }, 'VS'), tag('gals'));
}

/** Reactions from the phones, rising up the side of the screen their team sits on. */
function floats(g) {
  const now = performance.now();
  for (const id of seenAt.keys()) if (!(g.reactions ?? []).some((r) => r.id === id)) seenAt.delete(id);
  return h('div', { class: 'gv-float' }, (g.reactions ?? []).map((r) => {
    if (!seenAt.has(r.id)) seenAt.set(r.id, now);
    const age = now - seenAt.get(r.id);
    if (age > 4400) return null;
    const x = r.side === 'gals' ? 70 + ((r.id * 37) % 24) : 6 + ((r.id * 37) % 24);
    return h('div', { class: 'gv-react', style: { left: `${x}%`, animationDelay: `-${Math.round(age)}ms` } }, h('b', {}, r.e), h('small', {}, r.name));
  }));
}

export function lobby(v, ctx) {
  loadStyles();
  const g = v.game;
  const roster = (side) => {
    const t = teamOf(g, side);
    return h('div', { class: `gv-roster ${side}`, style: { '--c': t?.color } },
      h('h2', {}, token(side, t?.color ?? '#888', 80), t?.name ?? side),
      t?.members.length
        ? h('div', { class: 'gv-names' }, t.members.map((m) => h('span', { class: m.picked ? '' : 'unsure' }, m.name)))
        : h('div', { class: 'empty' }, side === 'guys' ? 'No guys yet. Fellas?' : 'No gals yet. Ladies?'),
      h('div', { class: 'gv-dim', style: { marginTop: 'auto' } }, side === 'guys' ? 'Answer questions about gal stuff' : 'Answer questions about guy stuff'));
  };
  const ready = g.teams.every((t) => t.members.length);
  return h('div', { class: 'gv-tv gv-lobby' }, bg(),
    head(g),
    h('div', { class: 'gv-lobby-main' },
      roster('guys'),
      h('div', { class: 'gv-joinbox' },
        h('div', { class: 'qr-big' }, ctx.qr()),
        h('div', { class: 'gv-say' }, 'Scan to join, then pick your side'),
        ctx.info?.code
          ? h('div', { class: 'gv-dim' }, 'or open ', h('b', {}, ctx.info.site), ' and type ', h('b', { class: 'roomcode gv-code' }, ctx.info.code))
          : ctx.info?.joinUrl ? h('div', { class: 'gv-dim' }, `or open ${ctx.info.joinUrl.replace(/^https?:\/\//, '')}`) : null,
        h('div', { class: 'gv-dim' }, ready ? (g.hosted ? 'The host starts the battle.' : 'The first player to join starts the battle on their phone.') : 'Both sides need at least one player.')),
      roster('gals')),
    h('div', { class: 'gv-rules' },
      h('span', {}, '🗳️ Vote on your phones'),
      h('span', {}, `✅ Right answer: ${g.step} spaces`),
      g.lightningAt.length ? h('span', {}, bolt(22), ' Lightning Rounds') : null,
      h('span', {}, `🏁 ${lengthText(g)}`),
      h('span', {}, `📚 ${g.setTitle || 'All question sets'}`)),
    floats(g));
}

function teamPanel(g, side) {
  const t = teamOf(g, side);
  const turn = g.turn === side && ['question', 'reveal'].includes(g.phase);
  const voters = new Set(g.question?.voters ?? []);
  const asking = g.phase === 'question' && g.turn === side;
  return h('div', { class: `gv-team ${side} ${turn ? 'turn' : ''}`, style: { '--c': t?.color } },
    h('div', { class: 'gv-team-top' }, token(side, t?.color ?? '#888', 70),
      h('div', {}, h('div', { class: 'gv-team-name' }, t?.name ?? side), h('div', { class: 'gv-team-sub' }, `answer ${aboutText(otherSide(side)).toLowerCase()}`))),
    turn ? h('div', { class: 'gv-clock-badge' }, g.lastChance ? 'LAST CHANCE' : 'ON THE CLOCK') : null,
    h('div', { class: 'gv-members' }, (t?.members ?? []).map((m) => h('div', { class: `gv-member ${m.connected ? '' : 'off'} ${asking && voters.has(m.id) ? 'voted' : ''}` },
      h('span', {}, m.name), asking ? h('span', { class: 'chk' }, '✓') : null))),
    h('div', { class: 'gv-pos' }, h('b', {}, String(t?.pos ?? 0)), h('span', {}, `of ${g.length} spaces`)));
}

/** A countdown ring that keeps draining between views. */
function ring(timer) {
  if (!timer) return h('div', { class: 'gv-ring' });
  const frac = Math.max(0, Math.min(1, timer.leftMs / timer.totalMs));
  const secs = Math.ceil(timer.leftMs / 1000);
  const fg = h('div', {});
  fg.innerHTML = '<svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15.9" fill="none" stroke-width="3.4"/><circle class="fg" cx="18" cy="18" r="15.9" fill="none" stroke-width="3.4" pathLength="100" stroke-dasharray="100"/></svg>';
  const circle = fg.querySelector('.fg');
  circle.style.strokeDashoffset = String(100 - frac * 100);
  circle.style.animationDuration = `${timer.leftMs}ms`;
  const label = h('b', {}, String(secs));
  const el = h('div', { class: `gv-ring ${secs <= 5 ? 'low' : ''}` }, fg.firstChild, label);
  // The number counts down on its own between views.
  const end = performance.now() + timer.leftMs;
  const tickNum = () => {
    if (!el.isConnected) return;
    const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    label.textContent = String(s);
    el.classList.toggle('low', s <= 5);
    if (s > 0) setTimeout(tickNum, 200);
  };
  setTimeout(tickNum, 200);
  return el;
}

function questionCard(g) {
  const q = g.question;
  const t = teamOf(g, g.turn);
  const aboutTeam = teamOf(g, q.about);
  const reveal = g.phase === 'reveal';
  const res = g.result;
  return h('div', { class: 'gv-card', style: { '--a': aboutTeam?.color ?? '#888' } },
    h('div', { class: 'gv-card-top' },
      h('div', { style: { display: 'flex', gap: '1.2vmin', flexWrap: 'wrap' } },
        h('span', { class: 'gv-chip' }, aboutText(q.about)),
        q.cat ? h('span', { class: 'gv-chip ghost' }, q.cat) : null),
      reveal || q.locked ? null : ring(g.timer)),
    h('div', { class: 'gv-q' }, q.text),
    h('div', { class: 'gv-choices' }, q.choices.map((c, i) => {
      let cls = '';
      let mark = null;
      if (reveal) {
        if (i === q.answer) { cls = 'right'; mark = h('div', { class: 'gv-mark' }, '✓'); } else if (i === q.pick) { cls = 'wrong'; mark = h('div', { class: 'gv-mark' }, '✗'); } else cls = 'dim';
      } else if (q.locked && i === q.pick) cls = 'final';
      return h('div', { class: `gv-choice ${cls}`, style: { '--l': LETTER_COLORS[i], '--t': t?.color } },
        h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', { class: 'txt' }, c),
        q.counts[i] && !reveal ? h('span', { class: 'gv-votes' }, Array.from({ length: q.counts[i] }, () => h('i', {}))) : null, mark);
    })),
    reveal
      ? h('div', { class: `gv-verdict ${res.correct ? 'yes' : 'no'}` }, res.correct ? `RIGHT! +${res.moved} ${res.moved === 1 ? 'SPACE' : 'SPACES'}` : res.timeout ? 'OUT OF TIME!' : 'WRONG!')
      : h('div', { class: 'gv-foot' }, q.locked ? (q.pick === null ? 'Time’s up!' : 'FINAL ANSWER…') : `The ${t?.name ?? ''} vote on their phones${g.lastChance ? ' · last chance to catch up!' : ''} · the ${nameOf(g, otherSide(g.turn))} know this one 🤫`));
}

function tossScreen(g) {
  const first = g.turn;
  return h('div', { class: 'gv-over gv-toss' }, h('div', {},
    h('div', { class: 'gv-coin', style: { '--end': first === 'guys' ? '1800deg' : '1980deg' } },
      h('div', { class: 'face-guys' }, token('guys', teamOf(g, 'guys')?.color ?? '#3b8bff', 200)),
      h('div', { class: 'face-gals' }, token('gals', teamOf(g, 'gals')?.color ?? '#ff4fa3', 200))),
    h('div', { class: 'gv-big' }, `THE ${nameOf(g, first).toUpperCase()} GO FIRST!`),
    h('div', { class: 'gv-sub' }, 'Coin toss! Then the teams take turns.')));
}

function lightningScreen(g) {
  const L = g.lightning;
  const t = teamOf(g, L.side);
  const intro = g.phase === 'lightning-intro';
  const done = g.phase === 'lightning-done';
  const pips = h('div', { class: 'gv-pips' }, Array.from({ length: L.total }, (_, i) => {
    const d = L.done[i];
    return h('i', { class: d ? (d.correct ? 'yes' : 'no') : i === L.i && !L.over && !intro ? 'now' : '' }, d ? (d.correct ? '✓' : '✗') : '');
  }));
  let middle;
  if (intro) {
    middle = [h('div', { class: 'gv-big now' }, `${(t?.name ?? '').toUpperCase()}, GET READY!`),
      h('div', { class: 'gv-sub' }, `${L.total} true-or-false statements about ${aboutText(otherSide(L.side)).toLowerCase()}. Anyone on the team can answer. Fast!`)];
  } else if (done) {
    middle = [h('div', { class: 'gv-l-score' }, `+${L.rights}`), h('div', { class: 'gv-sub' }, `${L.rights} of ${L.total} right: the ${t?.name ?? ''} move ${L.rights} ${L.rights === 1 ? 'space' : 'spaces'}!`)];
  } else {
    const flash = L.flash;
    const last = L.done.at(-1);
    const text = flash && last ? last.text : L.current ?? last?.text ?? '';
    middle = [
      h('div', { class: `gv-l-q ${flash ? (flash.correct ? 'right' : 'wrong') : ''}`, 'data-i': L.i }, text),
      flash && last ? h('div', { class: `gv-verdict ${flash.correct ? 'yes' : 'no'}` }, `${last.a ? 'TRUE' : 'FALSE'}${flash.correct ? '! ✓' : ' ✗'}`)
        : h('div', { class: 'gv-tf' }, h('span', { class: 't' }, 'TRUE'), h('span', { class: 'f' }, 'FALSE')),
      g.timer ? h('div', { class: 'gv-bar' }, h('i', { style: { transform: `scaleX(${g.timer.leftMs / g.timer.totalMs})`, animationDuration: `${g.timer.leftMs}ms` } })) : null,
    ];
  }
  return h('div', { class: 'gv-over gv-lightning' }, h('div', { class: 'gv-l-wrap' },
    h('div', { class: 'gv-l-title' }, bolt(80), 'LIGHTNING ROUND', bolt(80)),
    h('div', { class: 'gv-l-team' }, token(L.side, t?.color ?? '#888', 54), `The ${t?.name ?? ''}`),
    middle, pips));
}

function confetti() {
  const colors = ['#3b8bff', '#ff4fa3', '#ffe14d', '#2ee59d', '#ffffff', '#b07bff'];
  return h('div', { class: 'gv-confetti' }, Array.from({ length: 70 }, (_, i) => h('i', { style: {
    left: `${(i * 137) % 100}%`, background: colors[i % colors.length], animationDuration: `${3 + ((i * 53) % 30) / 10}s`, animationDelay: `-${((i * 71) % 40) / 10}s`,
    transform: `rotate(${(i * 47) % 360}deg)` } })));
}

function winScreen(g) {
  const ws = g.winners ?? [];
  const tie = ws.length > 1;
  const t = teamOf(g, ws[0]);
  return h('div', { class: 'gv-over gv-win', style: { '--c': tie ? '#ffe14d' : t?.color ?? '#888' } }, confetti(),
    h('div', {},
      tie ? h('div', { class: 'tie' }, ws.map((s) => token(s, teamOf(g, s)?.color ?? '#888', 260))) : token(ws[0], t?.color ?? '#888', 340),
      h('div', { class: 'gv-big now' }, tie ? 'IT’S A TIE!' : `THE ${(t?.name ?? '').toUpperCase()} WIN!`),
      h('div', { class: 'gv-sub' }, tie ? 'Both sides made it home. Rematch?' : `${g.teams.map((x) => `${x.name} ${x.pos}`).join(' · ')}  ·  ${g.hosted ? 'The host can start a rematch.' : 'The first player can start a rematch.'}`)));
}

export function render(v) {
  loadStyles();
  const g = v.game;
  const tracks = h('div', { class: 'gv-tracks' }, lane(g, 'guys'), lane(g, 'gals'));
  const key = g.lastMove ? `${g.lastMove.side}:${g.lastMove.n}` : null;
  if (key && key !== seenMove) {
    seenMove = key;
    requestAnimationFrame(() => hop(tracks, g));
  }
  let center = null;
  if ((g.phase === 'question' || g.phase === 'reveal') && g.question) center = questionCard(g);
  else center = h('div', { class: 'gv-card', style: { '--a': '#ffe14d' } }, h('div', { class: 'gv-q' }, g.line.text), g.line.next ? h('div', { class: 'gv-foot' }, g.line.next) : null);
  let over = null;
  if (g.phase === 'toss') over = tossScreen(g);
  else if (g.phase.startsWith('lightning') && g.lightning) over = lightningScreen(g);
  else if (g.phase === 'gameover') over = winScreen(g);
  return h('div', { class: `gv-tv phase-${g.phase}` }, bg(),
    head(g), tracks,
    h('div', { class: 'gv-stage' }, teamPanel(g, 'guys'), h('div', { class: 'gv-center' }, center), teamPanel(g, 'gals')),
    over, floats(g));
}

/** The token that just moved slides along its lane, one hop per space. */
function hop(tracks, g) {
  const m = g.lastMove;
  const el = tracks.querySelector(`.gv-runner[data-side="${m.side}"]`);
  if (!el?.animate || m.to === m.from) return;
  const frames = [];
  const dir = m.to > m.from ? 1 : -1;
  for (let i = m.from; i !== m.to + dir; i += dir) frames.push({ left: laneLeft(g, i), transform: 'translate(-50%, -50%)' }, { left: laneLeft(g, i), transform: 'translate(-50%, -80%)' });
  frames.pop();
  frames.push({ left: laneLeft(g, m.to), transform: 'translate(-50%, -50%)' });
  try { el.animate(frames, { duration: Math.abs(m.to - m.from) * HOP_MS + 200, easing: 'ease-in-out', delay: 250 }); } catch { /* it just jumps */ }
}

/** Sound cues (engine/sounds.js says what each name means in this game). */
export function onChange(prev, view, sound) {
  const p = prev.game; const g = view.game;
  if (!p || !g) return;
  // The Lightning Round's own music.
  if (g.phase === 'lightning') { if (!sound.musicPlaying?.()) sound.music?.('think', { owner: 'game', loop: false }); } else sound.stopMusic?.('game');
  const joined = (x) => x.teams.reduce((n, t) => n + t.members.length, 0);
  if (g.phase === 'lobby' && p.phase === 'lobby' && joined(g) > joined(p)) sound.play('join');
  if (g.lastMove && g.lastMove.n !== p.lastMove?.n) setTimeout(() => sound.play('pick'), 250);   // a token moves
  if (g.phase === 'question' && p.phase === 'question' && g.question && p.question && g.question.n === p.question.n && !p.question.locked && g.question.locked) sound.play('lock');
  if (g.phase === 'lightning' && p.phase === 'lightning' && g.lightning && p.lightning && g.lightning.i > p.lightning.i) sound.play(g.lightning.done.at(-1)?.correct ? 'ding' : 'strike');
  if (g.phase === 'question' && p.phase === 'question' && g.question?.n !== p.question?.n) sound.play('open');
  if (g.phase === p.phase) return;
  switch (g.phase) {
    case 'toss': sound.play('roundstart'); break;
    case 'question': sound.play('open'); break;
    case 'reveal': sound.play(g.result?.correct ? 'correct' : g.result?.timeout ? 'timeup' : 'wrong'); break;
    case 'lightning-intro': sound.play('dd'); break;
    case 'lightning-done': if ((g.lightning?.done?.length ?? 0) < (g.lightning?.total ?? 0)) sound.play('timeup'); break;   // the clock beat them
    case 'gameover': sound.play('fanfare'); setTimeout(() => sound.play('applause'), 2600); break;
    default: break;
  }
}
