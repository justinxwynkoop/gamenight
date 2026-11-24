// Guys vs Gals on the browser TV (the Apple TV app draws its own, from the same view), drawn as a comic book page: the
// Guys' panel with their superhero, the card being read in a speech balloon, the Gals' panel, and the tug-of-war path
// along the foot with the trophy on it. A trophy won and the winners take over the whole screen. The answer only reaches
// the TV once the card has been judged.
import { h } from '../../common.js';
import { loadStyles, token, art, trophy, path, spaceLeft, deckOf, spaceDeck, pic, teamOf, nameOf, aboutText, LETTERS, otherSide } from './shared.js';

const LETTER_COLORS = ['#ffe14d', '#7cf0ff', '#b4ff6b', '#ffa7d8'];
const HOP_MS = 320;
let seenMove = null;
const seenAt = new Map();   // reaction id -> when this TV first showed it (so a redraw does not restart it)

function bg() { return h('div', { class: 'gv-bg' }); }

/** Comic lettering: white with a thick ink outline. */
const letters = (text, cls = '') => h('div', { class: `gv-letters ${cls}` }, text);

function head(g) {
  const tag = (side) => {
    const t = teamOf(g, side);
    return h('div', { class: `gv-teamtag ${side}` }, letters((t?.name ?? side).toUpperCase(), `gv-word ${side}`));
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
      h('span', {}, trophy(26), ` Pull the trophy to your side. First to ${g.target} ${g.target === 1 ? 'trophy' : 'trophies'}`),
      h('span', {}, `💖 The ${nameOf(g, g.first)} go first`),
      (g.decks ?? []).map((d) => h('span', { class: 'gv-deckpill', style: { '--d': d.color } }, d.name)),
      g.settings.challenges ? h('span', {}, '✋ 3 challenges each') : null,
      h('span', {}, `📚 ${g.setTitle || 'All question sets'}`)),
    floats(g));
}

function teamPanel(g, side) {
  const t = teamOf(g, side);
  const c = g.card;
  const live = g.phase === 'card' || g.phase === 'result';
  const turn = g.turn === side && live;
  const reading = live && c?.about === side;
  const guessing = g.phase === 'card' && c?.deck === 'lives' && c.stage === 'guess';
  const guessers = new Set(guessing ? c.guessers ?? [] : []);
  const voters = new Set(guessing ? c.voters ?? [] : []);
  const tag = (m) => {
    if (!live || !c) return null;
    if (c.reader?.id === m.id) return h('i', { class: 'role' }, '📖');
    if (c.actor?.id === m.id) return h('i', { class: 'role' }, '🎭');
    if (guessers.has(m.id)) return h('i', { class: 'chk' }, voters.has(m.id) ? '✓' : '…');
    return null;
  };
  return h('div', { class: `gv-team ${side} ${turn ? 'turn' : ''}`, style: { '--c': t?.color } },
    h('div', { class: 'gv-rays' }),
    letters((t?.name ?? side).toUpperCase(), 'gv-team-name'),
    turn ? h('div', { class: 'gv-clock-badge' }, 'YOUR TURN!') : reading ? h('div', { class: 'gv-clock-badge reading' }, 'READING!') : null,
    h('div', { class: 'gv-team-hero' }, token(side, t?.color ?? '#888', 256)),
    h('div', { class: 'gv-members' }, (t?.members ?? []).map((m) => h('span', { class: `gv-member ${m.connected ? '' : 'off'} ${voters.has(m.id) ? 'voted' : ''}` }, m.name, tag(m)))),
    h('div', { class: 'gv-pos' },
      h('div', { class: 'gv-cups' }, Array.from({ length: g.target }, (_, i) => trophy(64, i < (t?.trophies ?? 0) ? 'won' : 'empty'))),
      g.settings.challenges ? h('div', { class: 'gv-tokens', title: 'Challenge tokens' }, Array.from({ length: 3 }, (_, i) => h('i', { class: i < (t?.challenges ?? 0) ? 'on' : '' }, '✋'))) : null));
}

/** The clock: a starburst with the seconds left, counting down on its own between views. */
function ring(timer) {
  if (!timer) return null;
  const secs = Math.ceil(timer.leftMs / 1000);
  const label = h('b', {}, String(secs));
  const el = h('div', { class: `gv-ring ${secs <= 5 ? 'low' : ''}` }, h('i', {}), h('span', {}), label);
  const end = performance.now() + timer.leftMs;
  const tickNum = () => {
    if (!el.isConnected) return;
    const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    if (label.textContent !== String(s)) { label.textContent = String(s); el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
    el.classList.toggle('low', s <= 10);
    if (s > 0) setTimeout(tickNum, 200);
  };
  setTimeout(tickNum, 200);
  return el;
}

/** What a result says, in big comic letters. */
function pow(g) {
  const r = g.result;
  if (!r) return null;
  const good = r.trophy || r.moved;
  const word = r.trophy ? 'TROPHY!' : g.card?.deck === 'moves' ? (r.moved ? (r.stolen ? 'STOLEN!' : 'GOT IT!') : r.timeout ? 'TIME!' : 'NOPE!') : r.challenged ? (r.right ? 'BLOCKED!' : 'GOTCHA!') : r.right ? 'POW!' : 'OOF!';
  return h('div', { class: `gv-pow ${good ? 'yes' : 'no'}` }, h('span', {}, word));
}

function verdict(g) {
  const r = g.result;
  const moved = r.moved ? `TROPHY ${r.moved === 'guys' ? '◀' : '▶'} ${nameOf(g, r.moved).toUpperCase()}` : `OVER TO THE ${nameOf(g, r.next).toUpperCase()}`;
  return h('div', { class: `gv-verdict ${r.moved ? 'yes' : 'no'}` }, r.trophy ? `THE ${nameOf(g, r.trophy).toUpperCase()} WIN THE TROPHY!` : moved);
}

function deckCard(g) {
  const c = g.card;
  const d = deckOf(g, c.deck);
  const result = g.phase === 'result';
  const r = g.result;
  const chips = h('div', { style: { display: 'flex', gap: '1.2vmin', flexWrap: 'wrap', alignItems: 'center' } },
    h('span', { class: 'gv-chip deck', style: { '--d': d.color } }, d.name),
    h('span', { class: `gv-chip ${c.about}` }, aboutText(c.about)),
    c.cat ? h('span', { class: 'gv-chip ghost' }, c.cat) : null);
  const top = h('div', { class: 'gv-card-top' }, chips, c.deck === 'moves' && !result ? ring(g.timer) : null);
  const stamp = c.challenged && !result ? h('div', { class: 'gv-stamp' }, 'CHALLENGE!') : null;
  let middle;
  let foot;
  const reader = c.reader?.name ?? '';
  if (c.deck === 'moves') {
    middle = h('div', { class: 'gv-moves' },
      result ? h('div', { class: 'gv-q' }, r.answer) : h('div', { class: 'gv-q' }, c.stage === 'pick' ? 'CHARADES!' : 'ACT IT OUT!'),
      h('div', { class: 'gv-actors' },
        h('span', { style: { '--c': teamOf(g, c.about)?.color } }, '🎭 ', reader),
        h('b', {}, 'VS'),
        h('span', { style: { '--c': teamOf(g, g.turn)?.color } }, '🎭 ', c.actor?.name ?? '?')));
    foot = result ? null : c.stage === 'pick'
      ? `${reader} picks someone on the ${nameOf(g, g.turn)} to act with`
      : 'Both act out the same thing. Each team shouts at their own actor. First to say it wins!';
  } else {
    const parts = [];
    if (c.img) parts.push(pic(c.img));
    parts.push(h('div', { class: 'gv-q' }, c.text));
    if (c.deck === 'lives') {
      const secret = result ? r.secret : null;
      const pickI = result ? r.pick : null;
      parts.push(h('div', { class: 'gv-choices three' }, c.choices.map((x, i) => {
        let cls = '';
        let mark = null;
        if (result) {
          if (i === secret) { cls = 'right'; mark = h('div', { class: 'gv-mark' }, '✓'); } else if (i === pickI) { cls = 'wrong'; mark = h('div', { class: 'gv-mark' }, '✗'); } else cls = 'dim';
        }
        return h('div', { class: `gv-choice ${cls}`, style: { '--l': LETTER_COLORS[i] } }, h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', { class: 'txt' }, x), mark);
      })));
    } else if (result) parts.push(h('div', { class: 'gv-answer' }, h('small', {}, 'ANSWER'), r.answer));
    middle = h('div', { class: `gv-body ${c.img ? 'with-pic' : ''}` }, parts);
    if (!result) {
      if (c.deck === 'lives') {
        foot = c.stage === 'secret' ? `🤫 ${reader} is secretly picking the true one…`
          : c.challenged ? `The ${nameOf(g, c.about)} guess what ${reader} picked, on their phones (${c.voters?.length ?? 0} of ${c.guessers?.length ?? 0})`
            : `The ${nameOf(g, g.turn)} guess what ${reader} picked, on their phones (${c.voters?.length ?? 0} of ${c.guessers?.length ?? 0})`;
      } else foot = c.challenged ? `The ${nameOf(g, c.about)} answer it themselves, no help from ${reader}! The ${nameOf(g, g.turn)} judge.` : `📖 ${reader} reads · the ${nameOf(g, g.turn)} say the answer out loud`;
    }
  }
  return h('div', { class: `gv-card deck-${c.deck}`, 'data-n': c.n, style: { '--a': d.color } }, top, stamp, result ? pow(g) : null, middle,
    result ? verdict(g) : h('div', { class: 'gv-foot' }, foot));
}

function confetti() {
  const colors = ['#3b8bff', '#ff4fa3', '#ffe14d', '#2ee59d', '#ffffff', '#b07bff'];
  return h('div', { class: 'gv-confetti' }, Array.from({ length: 70 }, (_, i) => h('i', { style: {
    left: `${(i * 137) % 100}%`, background: colors[i % colors.length], animationDuration: `${3 + ((i * 53) % 30) / 10}s`, animationDelay: `-${((i * 71) % 40) / 10}s`,
    transform: `rotate(${(i * 47) % 360}deg)` } })));
}

function trophyScreen(g) {
  const side = g.trophyWon;
  const t = teamOf(g, side);
  return h('div', { class: 'gv-over gv-trophy-won', style: { '--c': t?.color ?? '#888' } }, confetti(),
    h('div', {},
      h('div', { class: 'gv-win-hero' }, trophy(256, 'big'), token(side, '', 200, 'beside')),
      letters(`THE ${(t?.name ?? '').toUpperCase()} WIN A TROPHY!`, 'gv-big now'),
      h('div', { class: 'gv-sub' }, `${g.teams.map((x) => `${x.name} ${x.trophies}`).join('  ·  ')}  ·  first to ${g.target}. A new trophy goes on START.`)));
}

function winScreen(g) {
  const side = (g.winners ?? [])[0];
  const t = teamOf(g, side);
  return h('div', { class: 'gv-over gv-win', style: { '--c': t?.color ?? '#888' } }, confetti(),
    h('div', {},
      h('div', { class: 'gv-win-hero' }, art('crown', 256, 'gv-crown'), token(side, '', 256)),
      letters(`THE ${(t?.name ?? '').toUpperCase()} WIN!`, 'gv-big now'),
      h('div', { class: 'gv-sub' }, `${g.teams.map((x) => `${x.name} ${x.trophies} ${x.trophies === 1 ? 'trophy' : 'trophies'}`).join('  ·  ')}  ·  ${g.hosted ? 'The host can start a rematch.' : 'The first player can start a rematch.'}`)));
}

export function render(v) {
  loadStyles();
  const g = v.game;
  const strip = h('div', { class: 'gv-tracks' }, path(g));
  const key = g.lastMove ? String(g.lastMove.n) : null;
  if (key && key !== seenMove) {
    seenMove = key;
    requestAnimationFrame(() => slide(strip, g));
  }
  let center;
  if ((g.phase === 'card' || g.phase === 'result') && g.card) center = deckCard(g);
  else center = h('div', { class: 'gv-card', style: { '--a': '#ffd23f' } }, h('div', { class: 'gv-q' }, g.line.text), g.line.next ? h('div', { class: 'gv-foot' }, g.line.next) : null);
  let over = null;
  if (g.phase === 'trophy') over = trophyScreen(g);
  else if (g.phase === 'gameover') over = winScreen(g);
  return h('div', { class: `gv-tv phase-${g.phase}` }, bg(),
    h('div', { class: 'gv-stage' }, teamPanel(g, 'guys'), h('div', { class: 'gv-center' }, center), teamPanel(g, 'gals')),
    strip,
    over, floats(g));
}

/** The trophy slides along the path to its new space (or, on a win, off the end into the winner's circle). */
function slide(strip, g) {
  const m = g.lastMove;
  const el = strip.querySelector('.gv-cup');
  if (!el?.animate) return;
  const to = m.trophy ? m.from + (m.side === 'guys' ? -1.2 : 1.2) : m.to;
  if (to === m.from) return;
  try {
    el.animate([
      { left: spaceLeft(g, m.from), transform: 'translate(-50%, -50%)' },
      { left: `calc((${spaceLeft(g, m.from)} + ${spaceLeft(g, to)}) / 2)`, transform: 'translate(-50%, -85%) rotate(-12deg)' },
      { left: spaceLeft(g, to), transform: 'translate(-50%, -50%)' },
    ], { duration: HOP_MS * 2, easing: 'ease-in-out', delay: 250, fill: m.trophy ? 'forwards' : 'none' });
  } catch { /* it just jumps */ }
}

/** Sound cues (engine/sounds.js says what each name means in this game). */
export function onChange(prev, view, sound) {
  const p = prev.game; const g = view.game;
  if (!p || !g) return;
  // A charade has its own music.
  if (g.phase === 'card' && g.card?.stage === 'act') { if (!sound.musicPlaying?.()) sound.music?.('think', { owner: 'game', loop: false }); } else sound.stopMusic?.('game');
  const joined = (x) => x.teams.reduce((n, t) => n + t.members.length, 0);
  if (g.phase === 'lobby' && p.phase === 'lobby' && joined(g) > joined(p)) sound.play('join');
  if (g.lastMove && g.lastMove.n !== p.lastMove?.n && !g.lastMove.trophy) setTimeout(() => sound.play('pick'), 250);   // the trophy moves
  if (g.phase === 'card' && g.card) {
    if (g.card.n !== p.card?.n) sound.play('open');
    else if (g.card.challenged && !p.card?.challenged) sound.play('dd');
    else if (g.card.stage !== p.card?.stage && ['guess', 'act'].includes(g.card.stage)) sound.play('lock');
  }
  if (g.phase === p.phase) return;
  switch (g.phase) {
    case 'card': if (p.phase === 'lobby') sound.play('roundstart'); break;
    case 'result': sound.play(g.result?.timeout ? 'timeup' : g.result?.moved ? 'correct' : 'wrong'); break;
    case 'trophy': sound.play('ding'); setTimeout(() => sound.play('applause'), 900); break;
    case 'gameover': sound.play('fanfare'); setTimeout(() => sound.play('applause'), 2600); break;
    default: break;
  }
}
