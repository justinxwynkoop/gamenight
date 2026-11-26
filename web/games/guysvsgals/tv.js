// Guys vs Gals on the browser TV (the Apple TV app draws its own, from the same view), drawn as a comic book page: the
// Guys' panel with their superhero, the card being read in a speech balloon, the Gals' panel, and the tug-of-war path
// along the foot with the trophy on it. A trophy won and the winners take over the whole screen. The answer only reaches
// the TV once the card has been judged.
import { h } from '../../common.js';
import { loadStyles, token, art, trophy, path, spaceLeft, deckOf, spaceDeck, pic, teamOf, nameOf, aboutText, LETTERS, otherSide, isRace, raceTrack, acrossText, pawnBin, pawnRow, raceSteps } from './shared.js';

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
    g.settings.mode === 'race' ? h('div', { class: 'gv-rules' },
      h('span', {}, token('guys', '', 30), ` The race: get ${g.settings.pawns === 1 ? 'your pawn' : 'both pawns'} across first`),
      h('span', {}, '🪙 A coin toss says who goes first'),
      h('span', {}, '❓ Three questions a card'),
      h('span', {}, '🃏 Wild cards'),
      g.settings.pawns > 1 ? h('span', {}, '🔒 Take one prisoner') : null,
      h('span', {}, `📚 ${g.setTitle || 'All question sets'}`)) : h('div', { class: 'gv-rules' },
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
    isRace(g) ? h('div', { class: 'gv-pos' },
      h('div', { class: 'gv-pawns', title: acrossText(g, side) }, g.race.pawns[side].map((p) => h('span', { class: p.state === 'home' ? '' : 'off' }, token(side, '', 64)))),
      h('b', {}, acrossText(g, side).toUpperCase()),
      g.race.skip?.[side] ? h('i', {}, '💤') : null) : h('div', { class: 'gv-pos' },
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
  if (isRace(g)) {
    const word = r.won ? 'WINNERS!' : r.captured ? 'GOTCHA!' : r.wild ? 'WILD!' : r.crossed ? 'ACROSS!' : r.right ? 'POW!' : 'OOF!';
    return h('div', { class: `gv-pow ${r.right || r.won ? 'yes' : 'no'}` }, h('span', {}, word));
  }
  const good = r.trophy || r.moved;
  const word = r.trophy ? 'TROPHY!' : g.card?.deck === 'moves' ? (r.moved ? (r.stolen ? 'STOLEN!' : 'GOT IT!') : r.timeout ? 'TIME!' : 'NOPE!') : r.challenged ? (r.right ? 'BLOCKED!' : 'GOTCHA!') : r.right ? 'POW!' : 'OOF!';
  return h('div', { class: `gv-pow ${good ? 'yes' : 'no'}` }, h('span', {}, word));
}

function verdict(g) {
  const r = g.result;
  if (isRace(g)) {
    const text = r.won ? `THE ${nameOf(g, r.won).toUpperCase()} WIN THE RACE!` : r.captured ? `A ${nameOf(g, r.captured).toUpperCase()} PAWN IS TAKEN PRISONER!`
      : r.crossed ? `A ${nameOf(g, r.crossed).toUpperCase()} PAWN IS ACROSS!` : r.more ? `${nameOf(g, g.turn).toUpperCase()}: NEXT QUESTION` : `OVER TO THE ${nameOf(g, r.next).toUpperCase()}`;
    return h('div', { class: `gv-verdict ${r.right || r.won ? 'yes' : 'no'}` }, text);
  }
  const moved = r.moved ? `TROPHY ${r.moved === 'guys' ? '◀' : '▶'} ${nameOf(g, r.moved).toUpperCase()}` : `OVER TO THE ${nameOf(g, r.next).toUpperCase()}`;
  return h('div', { class: `gv-verdict ${r.moved ? 'yes' : 'no'}` }, r.trophy ? `THE ${nameOf(g, r.trophy).toUpperCase()} WIN THE TROPHY!` : moved);
}

function deckCard(g) {
  const c = g.card;
  const d = deckOf(g, c.deck);
  const result = g.phase === 'result';
  const r = g.result;
  const race = isRace(g);
  const chips = h('div', { style: { display: 'flex', gap: '1.2vmin', flexWrap: 'wrap', alignItems: 'center' } },
    race ? null : h('span', { class: 'gv-chip deck', style: { '--d': d.color } }, d.name),
    h('span', { class: `gv-chip ${c.about}` }, aboutText(c.about)),
    c.cat && !race ? h('span', { class: 'gv-chip ghost' }, c.cat) : null,
    c.of ? h('span', { class: 'gv-chip gv-qcount' }, `QUESTION ${c.q} OF ${c.of}`) : null);
  const top = h('div', { class: 'gv-card-top' }, chips, c.deck === 'moves' && !result && c.stage === 'act' ? ring(g.timer) : null);
  const stamp = c.challenged && !result ? h('div', { class: 'gv-stamp' }, 'CHALLENGE!') : null;
  let middle;
  let foot;
  const reader = c.reader?.name ?? '';
  if (c.deck === 'moves') {
    middle = h('div', { class: 'gv-moves' },
      result ? h('div', { class: 'gv-q big' }, r.answer) : h('div', { class: 'gv-q big' }, c.stage === 'pick' ? 'CHARADES!' : c.stage === 'ready' ? 'GET READY!' : 'ACT IT OUT!'),
      h('div', { class: 'gv-actors' },
        h('span', { style: { '--c': teamOf(g, c.about)?.color } }, (c.ready ?? []).includes(c.reader?.id) ? '✅ ' : '🎭 ', reader),
        h('b', {}, 'VS'),
        h('span', { style: { '--c': teamOf(g, g.turn)?.color } }, (c.ready ?? []).includes(c.actor?.id) ? '✅ ' : '🎭 ', c.actor?.name ?? '?')));
    foot = result ? null : c.stage === 'pick'
      ? `${reader} picks someone on the ${nameOf(g, g.turn)} to act with`
      : c.stage === 'ready' ? `${reader} and ${c.actor?.name ?? ''} are reading what to act out. The clock starts when both press Start on their phones`
      : 'Both act out the same thing. Each team shouts at their own actor. First to say it wins!';
  } else {
    const parts = [];
    if (c.img) parts.push(pic(c.img));
    parts.push(h('div', { class: 'gv-q' }, h('span', { class: 'gv-qa' }, 'Q:'), c.text));
    if (c.choices) {
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
    } else if (result) parts.push(h('div', { class: 'gv-answer' }, h('span', { class: 'gv-qa' }, 'A:'), r.answer));
    else if (c.stage === 'move') parts.push(h('div', { class: 'gv-answer' }, h('span', { class: 'gv-qa' }, 'A:'), c.answer));
    if (result && r.wild) parts.push(h('div', { class: 'gv-wildcard', style: { '--c': teamOf(g, r.wild.owner)?.color } }, h('small', {}, `${nameOf(g, r.wild.owner).toUpperCase()} WILD CARD`), r.wild.text));
    middle = h('div', { class: `gv-body ${c.img ? 'with-pic' : ''}` }, parts);
    if (!result) {
      if (c.deck === 'lives') {
        foot = c.stage === 'secret' ? `🤫 ${reader} is secretly picking the true one…`
          : c.challenged ? `The ${nameOf(g, c.about)} guess what ${reader} picked, on their phones (${c.voters?.length ?? 0} of ${c.guessers?.length ?? 0})`
            : `The ${nameOf(g, g.turn)} guess what ${reader} picked, on their phones (${c.voters?.length ?? 0} of ${c.guessers?.length ?? 0})`;
      } else if (c.stage === 'move') foot = `✅ Right! ${nameOf(g, g.turn)}: pick a lit space on your phones (${(c.moves ?? []).map((m) => m.k).join(', ')})`;
      else if (isRace(g)) foot = `📖 ${reader} reads · the ${nameOf(g, g.turn)} say the answer out loud. A right answer moves their pawn onto a lit space of their choice.`;
      else foot = c.challenged ? `Challenge! The ${nameOf(g, c.about)} answer it themselves, no help from ${reader}. ${reader} judges.` : `📖 ${reader} reads · the ${nameOf(g, g.turn)} say the answer out loud`;
    }
  }
  return h('div', { class: `gv-card deck-${c.deck}`, 'data-n': c.n, style: { '--a': d.color, '--back': teamOf(g, c.about)?.color } }, cardStripe(), top, stamp, result ? pow(g) : null, middle,
    result ? verdict(g) : h('div', { class: 'gv-foot' }, foot));
}

/** The dark stripe down the left of every question card, with the game's name on it. */
const cardStripe = () => h('div', { class: 'gv-stripe' }, h('span', {}, 'GUYS', h('b', {}, ' VS '), 'GALS'));

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
      h('div', { class: 'gv-sub' }, `${isRace(g) ? g.teams.map((x) => `${x.name} ${acrossText(g, x.side)}`).join('  ·  ') : g.teams.map((x) => `${x.name} ${x.trophies} ${x.trophies === 1 ? 'trophy' : 'trophies'}`).join('  ·  ')}  ·  ${g.hosted ? 'The host can start a rematch.' : 'The first player can start a rematch.'}`)));
}

// ---------- the race board ----------
// The pawn race is played on a board like the classic one: a deep blue field with a yellow and red rim, each team's
// START rail down its outer edge, two halves of round spaces in staggered columns, each team's wild columns in its
// colour, and the two decks of cards in the middle, where the card being read sits. Our own art throughout.

const DOT_FILLS = ['#ff8a8a', '#ffd76a', '#8be08b', '#ffb26b', '#ff9ccf', '#8fc8ff', '#c7a6ff', '#7fe0d4'];
// Pictures on the plain spaces: Microsoft's 3D emoji that come with the game (pics/, MIT, art/SOURCES.md).
const DOT_PICS = ['american-football', 'cupcake', 'wrench', 'lipstick', 'racing-car', 'high-heeled-shoe', 'video-game', 'handbag', 'hammer', 'nail-polish', 'baseball', 'bouquet', 'toolbox', 'dress', 'fishing-pole', 'ring', 'bowling', 'shopping-bags', 'pickup-truck', 'yarn', 'pool-8-ball', 'teapot', 'motorcycle', 'gem-stone'];

function boardDot(g, x, row) {
  const r = g.race;
  const wild = r.wild.guys.includes(x) ? 'guys' : r.wild.gals.includes(x) ? 'gals' : null;
  const seed = x * 7 + row * 3;
  const kids = [];
  for (const side of ['guys', 'gals']) {
    r.pawns[side].forEach((p, i) => {
      if (p.state === 'board' && p.x === x && pawnRow(g, side, i) === row) kids.push(token(side, '', 128, 'gv-dot-pawn'));
    });
  }
  // A wild space says so, in its team's colour, with the team's name under it.
  const label = wild ? h('b', {}, 'WILD', h('small', {}, (teamOf(g, wild)?.name ?? wild).toUpperCase())) : pic(DOT_PICS[seed % DOT_PICS.length], 'gv-dot-pic');
  const next = raceSteps(g).find((s) => s.x === x && s.row === row);
  const isNext = !!next;
  return h('div', { class: `gv-dot ${wild ? `wild ${wild}` : ''} ${kids.length ? 'has-pawn' : ''} ${isNext ? 'next' : ''}`, 'data-x': x, 'data-row': row, 'data-k': next?.k ?? null,
    style: { '--d': wild ? teamOf(g, wild)?.color : DOT_FILLS[seed % DOT_FILLS.length], '--n': isNext ? teamOf(g, g.turn)?.color : null } }, label, kids);
}

function boardHalf(g, from, to) {
  const cols = [];
  for (let x = from; x <= to; x++) {
    cols.push(h('div', { class: `gv-col ${x % 2 ? 'odd' : 'even'}` }, Array.from({ length: g.race.rows ?? 6 }, (_, row) => boardDot(g, x, row))));
  }
  return h('div', { class: 'gv-half' }, cols);
}

function boardRail(g, side) {
  return h('div', { class: `gv-rail ${side}`, style: { '--c': teamOf(g, side)?.color } },
    h('div', { class: 'gv-rail-name' }, 'START'), pawnBin(g, side, false));
}

/** A team's corner of the middle: name, whose turn it is, the players and how many pawns are across. */
function boardTeam(g, side) {
  const t = teamOf(g, side);
  const c = g.card;
  const live = (g.phase === 'card' || g.phase === 'result') && c;
  const turn = live && g.turn === side;
  const reading = live && c.about === side;
  return h('div', { class: `gv-bteam ${side} ${turn ? 'turn' : ''}`, style: { '--c': t?.color } },
    token(side, '', 128, 'gv-bteam-hero'),
    h('div', {},
      h('div', { class: 'gv-bteam-name' }, (t?.name ?? side).toUpperCase(),
        turn ? h('span', { class: 'gv-clock-badge' }, 'YOUR TURN!') : reading ? h('span', { class: 'gv-clock-badge reading' }, 'READING!') : null),
      h('div', { class: 'gv-bteam-who' }, (t?.members ?? []).map((m) => h('span', { class: m.connected ? '' : 'off' }, m.name, live && c.reader?.id === m.id ? ' 📖' : ''))),
      h('div', { class: 'gv-bteam-across' }, acrossText(g, side).toUpperCase(), g.race.skip?.[side] ? ' 💤' : '')));
}

/** The two decks in the middle of the board: the Guys' cards (blue backs) and the Gals' (pink backs). */
function boardDecks(g) {
  const deck = (side) => h('div', { class: `gv-deck ${side}`, style: { '--c': teamOf(g, side)?.color } },
    h('div', { class: 'gv-deck-top' }, h('span', {}, `${(teamOf(g, side)?.name ?? side).toUpperCase()} STUFF`)));
  return h('div', { class: 'gv-decks' }, deck('guys'), deck('gals'));
}

function raceBoard(g, center) {
  const len = g.race.len;
  const mid = Math.floor(len / 2);
  return h('div', { class: 'gv-board' },
    h('div', { class: 'gv-banner l' }, 'GUYS ', h('small', {}, 'VS'), ' GALS'),
    h('div', { class: 'gv-banner r' }, 'GUYS ', h('small', {}, 'VS'), ' GALS'),
    boardRail(g, 'guys'), boardHalf(g, 1, mid),
    h('div', { class: 'gv-mid' }, h('div', { class: 'gv-bteams' }, boardTeam(g, 'guys'), boardTeam(g, 'gals')), h('div', { class: 'gv-center' }, center), boardDecks(g)),
    boardHalf(g, mid + 1, len), boardRail(g, 'gals'));
}

export function render(v) {
  loadStyles();
  const g = v.game;
  const race = isRace(g);
  const strip = h('div', { class: 'gv-tracks' }, race ? raceTrack(g) : path(g));
  const key = g.lastMove ? String(g.lastMove.n) : null;
  if (race) seenMove = key;
  else if (key && key !== seenMove) {
    seenMove = key;
    requestAnimationFrame(() => slide(strip, g));
  }
  let center;
  if ((g.phase === 'card' || g.phase === 'result') && g.card) center = deckCard(g);
  else center = h('div', { class: 'gv-card', style: { '--a': '#ffd23f' } }, cardStripe(), h('div', { class: 'gv-q big' }, g.line.text), g.line.next ? h('div', { class: 'gv-foot' }, g.line.next) : null);
  let over = null;
  if (g.phase === 'trophy') over = trophyScreen(g);
  else if (g.phase === 'gameover') over = winScreen(g);
  if (center) requestAnimationFrame(() => fitCard(center));
  if (race) return h('div', { class: `gv-tv gv-tv-board phase-${g.phase}` }, raceBoard(g, center), over, floats(g));
  return h('div', { class: `gv-tv phase-${g.phase}` }, bg(),
    h('div', { class: 'gv-stage' }, teamPanel(g, 'guys'), h('div', { class: 'gv-center' }, center), teamPanel(g, 'gals')),
    strip,
    over, floats(g));
}

/** A long question (or a picture, three answers and the answer at once) shrinks its lettering until the card fits
 *  between the team panels, instead of running off the bottom of the screen. */
export function fitCard(card) {
  const box = card.parentElement;
  if (!box?.isConnected) return;
  const room = box.clientHeight;
  let fit = 1;
  card.style.setProperty('--fit', '1');
  while (card.scrollHeight > room + 1 && fit > 0.5) {
    fit = Math.round((fit - 0.05) * 100) / 100;
    card.style.setProperty('--fit', String(fit));
  }
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
    if (g.card.n !== p.card?.n) {
      // Over to the other team: a sting. The same team's next card: a deal. The next question on a race card: nothing,
      // the reader just carries on.
      if (p.phase !== 'lobby' && p.turn && g.turn !== p.turn) sound.play('roundstart');
      else if (!((g.card.q ?? 1) > 1)) sound.play('open');
    }
    else if (g.card.challenged && !p.card?.challenged) sound.play('dd');
    else if (g.card.stage !== p.card?.stage && ['guess', 'act'].includes(g.card.stage)) sound.play('lock');
    else if (g.card.stage === 'move' && p.card?.stage !== 'move') sound.play('correct');   // right: now pick a space
  }
  if (g.phase === p.phase) return;
  switch (g.phase) {
    case 'card': if (p.phase === 'lobby') sound.play('roundstart'); break;
    case 'result':
      // (A right answer in the race already rang when the team started picking its space.)
      if (p.card?.stage !== 'move') sound.play(g.result?.timeout ? 'timeup' : g.result?.moved ? 'correct' : 'wrong');
      // The race: a wild card, a prisoner, a pawn across.
      if (g.result?.wild) setTimeout(() => sound.play('dd'), 700);
      else if (g.result?.captured) setTimeout(() => sound.play('lock'), 700);
      else if (g.result?.crossed && !g.result?.won) setTimeout(() => sound.play('ding'), 700);
      break;
    case 'trophy': sound.play('ding'); setTimeout(() => sound.play('applause'), 900); break;
    case 'gameover': sound.play('fanfare'); setTimeout(() => sound.play('applause'), 2600); break;
    default: break;
  }
}
