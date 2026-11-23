// Pie Chase on the browser TV (the Apple TV app draws its own, from the same view). The board fills the left of the
// screen; the right has whose turn it is, the die and everyone's pie. Questions come up on a card over the board. The
// answer is only on the TV once it has been judged.
import { h, ink } from '../../common.js';
import { loadStyles, board, pie, die, nameOf, catOf, unitOf, legend, spaceName, spaceOf, goalText } from './shared.js';

const HOP_MS = 170;   // a token takes this long per space when it moves
let seenDie = null;   // the roll the TV has already tumbled (the screen is redrawn on every change)
let seenMove = null;  // the move it has already animated

const moveKey = (m) => (m ? `${m.unit}:${m.from}>${m.to}:${m.n}:${m.path.join(',')}` : null);

export function lobby(v, ctx) {
  loadStyles();
  const g = v.game;
  const n = g.units.length;
  const teams = v.room.mode === 'teams';
  return h('div', { class: 'pc-tv pc-lobby' },
    h('div', { class: 'pc-left' }, board(g, { tokens: false })),
    h('div', { class: 'pc-side' },
      h('h1', { class: 'pc-title' }, 'Pie Chase'),
      h('div', { class: 'pc-sub' }, `Win a wedge in each category, then race back to the hub. ${g.minUnits} to ${g.maxUnits} ${teams ? 'teams' : 'players'}.`),
      h('div', { class: 'pc-join' },
        h('div', { class: 'qr-big' }, ctx.qr()),
        h('div', {},
          h('div', { class: 'pc-say' }, 'Scan to join'),
          ctx.info?.code
            ? h('div', { class: 'pc-next' }, 'or open ', h('b', {}, ctx.info.site), ' and type ', h('b', { class: 'roomcode pc-code' }, ctx.info.code))
            : ctx.info?.joinUrl ? h('div', { class: 'pc-next' }, `or open ${ctx.info.joinUrl.replace(/^https?:\/\//, '')}`) : null)),
      h('div', { class: 'pc-units' }, g.units.length
        ? g.units.map((u) => unitRow(g, u, { lobby: true }))
        : h('div', { class: 'pc-next' }, 'Nobody has joined yet')),
      h('div', { class: 'pc-next' }, `Questions: ${g.setTitle || 'All question sets'} · ${goalText(g)}`),
      h('div', { class: 'pc-next' }, n < g.minUnits ? `Waiting for ${g.minUnits - n} more ${teams ? 'team' : 'player'}` : g.hosted ? 'The host starts the game.' : 'The first player to join starts the game on their phone.'),
      legend(g)));
}

function unitRow(g, u, { lobby = false } = {}) {
  const turn = !lobby && g.turn === u.id;
  return h('div', { class: `pc-unit ${turn ? 'turn' : ''} ${u.connected ? '' : 'off'}`, style: { '--c': u.color } },
    pie(g, u.wedges, lobby ? 44 : 58, u.color),
    h('div', { class: 'pc-uname' },
      h('b', {}, u.name),
      u.members?.length ? h('small', {}, u.members.join(', ')) : !lobby ? h('small', {}, u.won ? 'Won!' : `${u.wedges.length} ${u.wedges.length === 1 ? 'wedge' : 'wedges'} · ${spaceName(g, u.pos)}`) : null),
    turn ? h('span', { class: 'pc-arrow' }, '◀') : null);
}

/** The card over the board: the question, and once it is judged, the answer. */
function questionCard(g) {
  const q = g.question;
  const c = catOf(g, q.cat);
  const who = nameOf(g, g.turn);
  const res = g.result;
  const tag = q.final ? 'FOR THE WIN' : q.hq ? (q.hasWedge && !res?.wedge ? 'HEADQUARTERS' : 'FOR THE WEDGE') : null;
  return h('div', { class: `pc-card ${res ? (res.correct ? 'right' : 'wrong') : ''}`, style: { '--c': c.color, '--ink': ink(c.color) } },
    h('div', { class: 'pc-card-top' }, h('span', {}, c.name), tag ? h('span', { class: 'pc-tag' }, tag) : null),
    h('div', { class: 'pc-q' }, q.text),
    res
      ? h('div', { class: 'pc-ans' },
        h('div', { class: 'pc-verdict' }, res.win ? `🏆 ${who} WINS!` : res.wedge !== null && res.wedge !== undefined ? `RIGHT! ${who} wins the ${catOf(g, res.wedge).name} wedge` : res.correct ? 'RIGHT!' : 'NOT QUITE'),
        h('div', {}, h('small', {}, 'Answer: '), h('b', {}, q.answer)))
      : h('div', { class: 'pc-card-foot' }, `${who} answers out loud`, g.readerId ? ` · ${nameOf(g, g.readerId)} reads and judges` : g.hosted ? ' · the host judges' : ''));
}

function rolloffCard(g) {
  const r = g.rolloff;
  const contenders = new Set(r.contenders);
  return h('div', { class: 'pc-card plain' },
    h('div', { class: 'pc-card-top' }, h('span', {}, r.starter ? `${nameOf(g, r.starter)} goes first!` : r.round > 1 ? 'A tie! Roll again' : 'Who goes first?')),
    h('div', { class: 'pc-next' }, r.starter ? 'Then play passes to the left.' : 'Everyone rolls on their phone. The highest roll goes first.'),
    h('div', { class: 'pc-rolls' }, g.units.map((u) => {
      const val = r.rolls[u.id] ?? (contenders.has(u.id) ? null : r.history?.at(-1)?.[u.id] ?? null);
      return h('div', { class: `pc-roll ${contenders.has(u.id) ? '' : 'out'} ${r.starter === u.id ? 'best' : ''}`, style: { '--c': u.color } },
        h('b', {}, u.name), val ? die(val, { size: 72 }) : h('div', { class: 'pc-wait' }, contenders.has(u.id) ? '…' : ''));
    })));
}

function chooseCard(g) {
  const who = nameOf(g, g.turn);
  return h('div', { class: 'pc-card plain' },
    h('div', { class: 'pc-card-top' }, h('span', {}, g.chooser === 'opponents' ? `${who} is in the hub with every wedge!` : `${who} is in the hub`)),
    h('div', { class: 'pc-next' }, g.chooser === 'opponents' ? 'The other players pick the category for the winning question.' : `${who} picks any category.`),
    legend(g));
}

function winnerCard(g) {
  const ws = (g.winners ?? []).map((id) => unitOf(g, id)).filter(Boolean);
  return h('div', { class: 'pc-card plain win' },
    h('div', { class: 'pc-card-top' }, h('span', {}, ws.length > 1 ? 'A TIE!' : 'WINNER!')),
    h('div', { class: 'pc-winners' }, ws.map((u) => h('div', {}, pie(g, u.wedges, 170, u.color), h('b', {}, u.name)))),
    h('div', { class: 'pc-next' }, g.hosted ? 'The host can start another game.' : 'The first player can start another game from their phone.'));
}

export function render(v) {
  loadStyles();
  const g = v.game;
  const fresh = moveKey(g.lastMove);
  const animate = fresh && fresh !== seenMove && ['question', 'choose', 'roll'].includes(g.phase) && g.lastMove.unit === g.turn;
  const hops = animate ? g.lastMove.path.length : 0;
  let overlay = null;
  if (g.phase === 'rolloff') overlay = rolloffCard(g);
  else if (g.phase === 'question' || g.phase === 'result') overlay = questionCard(g);
  else if (g.phase === 'choose') overlay = chooseCard(g);
  else if (g.phase === 'gameover') overlay = winnerCard(g);
  // The card waits for the token to finish hopping.
  if (overlay && hops) overlay.style.animationDelay = `${hops * HOP_MS + 150}ms`;
  const boardEl = board(g, { highlight: g.phase === 'move' ? g.options : [], focus: g.turn, labels: g.phase === 'move' && g.options.length > 1 });
  const left = h('div', { class: 'pc-left' }, boardEl, overlay ? h('div', { class: 'pc-over' }, overlay) : null);
  if (animate) { seenMove = fresh; requestAnimationFrame(() => hop(boardEl, g)); }

  const rolled = g.die && g.die.n !== seenDie;
  if (rolled) seenDie = g.die.n;
  const dieBox = g.die && ['move', 'roll', 'question', 'choose', 'result', 'rolloff'].includes(g.phase)
    ? die(g.die.value, { size: 120, rolling: rolled, key: g.die.n }) : null;

  const side = h('div', { class: 'pc-side' },
    h('h1', { class: 'pc-title' }, 'Pie Chase'),
    h('div', { class: 'pc-status' },
      h('div', { class: 'pc-dieslot' }, dieBox),
      h('div', {}, h('div', { class: 'pc-say' }, g.line.text), g.line.next ? h('div', { class: 'pc-next' }, g.line.next) : null)),
    g.phase === 'move' && g.options.length > 1 ? h('div', { class: 'pc-opts' }, g.options.map((id, i) => h('span', {}, h('b', {}, String(i + 1)), spaceName(g, id)))) : null,
    h('div', { class: 'pc-units' }, g.units.map((u) => unitRow(g, u))),
    legend(g));
  return h('div', { class: `pc-tv phase-${g.phase}` }, left, side);
}

/** Moves the token that just moved along its path, a hop per space, ending where the view put it. */
function hop(boardEl, g) {
  const m = g.lastMove;
  const token = boardEl.querySelector(`.pc-token[data-unit="${m.unit}"]`);
  const end = spaceOf(g, m.to);
  if (!token || !end || !token.animate) return;
  const pts = [m.from, ...m.path].map((id) => spaceOf(g, id)).filter(Boolean);
  const frames = pts.map((p) => ({ transform: `translate(${(p.x - end.x).toFixed(4)}px, ${(p.y - end.y).toFixed(4)}px)` }));
  try { token.animate(frames, { duration: Math.max(1, pts.length - 1) * HOP_MS, easing: 'ease-in-out' }); } catch { /* fine: it just jumps */ }
}

/** Sound cues, from what changed since the last view (see engine/sounds.js for what each name means in this game). */
export function onChange(prev, view, sound) {
  const p = prev.game; const g = view.game;
  if (!p || !g) return;
  if (g.phase === 'lobby' && p.phase === 'lobby' && g.units.length > p.units.length) sound.play('join');
  if (g.die && g.die.n !== p.die?.n) sound.play('pick');                     // the die is rolled
  if (g.phase === p.phase && g.phase !== 'roll') return;
  switch (g.phase) {
    case 'rolloff': if (p.phase === 'lobby') sound.play('roundstart'); break;
    case 'roll': if (g.again === 'space' && p.phase === 'move') sound.play('bet'); break;   // a Roll Again space
    case 'question': sound.play(g.question?.final ? 'final' : 'open'); break;
    case 'result':
      if (g.result?.win) sound.play('fanfare');
      else if (g.result?.wedge !== null && g.result?.wedge !== undefined) sound.play('dd');      // a wedge is won
      else sound.play(g.result?.correct ? 'correct' : 'wrong');
      break;
    case 'gameover': sound.play('applause'); break;
    default: break;
  }
}
