// Bits the phone, host and TV pages of Guys vs Gals share: the stylesheet, the art (a superhero for each side), the
// tug-of-war path with its trophy, the decks, and a few words. The look is a comic book: newsprint, ink outlines, halftone and Bangers lettering.
import { h } from '../../common.js';

const NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

export function loadStyles() {
  if (document.getElementById('gv-css')) return;
  document.head.append(h('link', { id: 'gv-css', rel: 'stylesheet', href: '/games/guysvsgals/guysvsgals.css' }));
  const FONTS = 'https://fonts.googleapis.com/css2?family=Bangers&family=Outfit:wght@400;600;800;900&display=swap';
  if (!document.querySelector(`link[href="${FONTS}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: FONTS }));
}

export const LETTERS = ['A', 'B', 'C'];
export const teamOf = (g, side) => g.teams?.find((t) => t.side === side) ?? null;
export const nameOf = (g, side) => teamOf(g, side)?.name ?? (side === 'guys' ? 'Guys' : 'Gals');
export const otherSide = (side) => (side === 'guys' ? 'gals' : 'guys');
/** "Gal stuff" for a question about the gals' side of things. */
export const aboutText = (about) => (about === 'guys' ? 'Guy stuff' : 'Gal stuff');

/** Where the game's art lives: Microsoft's 3D emoji (MIT, art/SOURCES.md), the Gals' hero recoloured pink. */
export const ART = '/games/guysvsgals/art/';
export const art = (name, size, cls = '') => h('img', { src: `${ART}${name}.png`, width: size, height: size, alt: '', draggable: 'false', class: `gv-art ${cls}` });

/** A team's token: its superhero. (`color` is kept for callers; the art carries the team's colour.) */
export function token(side, color, size = 60, cls = '') {
  const el = art(side === 'gals' ? 'gals-hero' : 'guys-hero', size, `gv-token ${side} ${cls}`);
  el.alt = side === 'guys' ? 'The Guys' : 'The Gals';
  return el;
}

/** A lightning bolt. */
export function bolt(size = 40) {
  return art('bolt', size, 'gv-bolt');
}

/** A trophy (the one in play, or one in a team's winner's circle). */
export const trophy = (size = 40, cls = '') => art('trophy', size, `gv-trophy ${cls}`);

/** The pictures that come with the game (pics/, Microsoft's 3D emoji, MIT: art/SOURCES.md). */
export const PICS = ['american-football', 'axe', 'ballet-shoes', 'baseball', 'bikini', 'bouquet', 'bow-and-arrow', 'bowling', 'boxing-glove', 'bullseye', 'carpentry-saw', 'clutch-bag', 'cupcake', 'cut-of-meat', 'dress', 'fishing-pole', 'flag-in-hole', 'flying-disc', 'folding-hand-fan', 'fuel-pump', 'gem-stone', 'hair-pick', 'hammer', 'handbag', 'high-heeled-shoe', 'hot-pepper', 'ice-hockey', 'kimono', 'ladder', 'lipstick', 'lotion-bottle', 'mirror', 'motorcycle', 'nail-polish', 'necktie', 'nut-and-bolt', 'pickup-truck', 'pool-8-ball', 'purse', 'racing-car', 'ribbon', 'ring', 'sari', 'scarf', 'screwdriver', 'sewing-needle', 'shopping-bags', 'shortcake', 'soap', 'sponge', 'teapot', 'tent', 'toolbox', 'tractor', 'video-game', 'wrench', 'yarn'];

/** The decks, by id: { name, short, color }. */
export const deckOf = (g, id) => g.decks?.find((d) => d.id === id) ?? { id, name: id, short: id, color: '#ccc' };
/** An Our Pics picture: one of ours (pics/<name>.png) or a web address someone typed in the editor. */
export const picUrl = (img) => (/^https?:\/\//.test(img ?? '') ? img : `/games/guysvsgals/pics/${img}.png`);
export const pic = (img, cls = '') => h('img', { class: `gv-pic ${cls}`, src: picUrl(img), alt: '', draggable: 'false' });

/** The space n steps from START (negative: toward the Guys' end), as the deck it draws from. */
export function spaceDeck(g, n) {
  const id = g.path?.[Math.min(g.green, Math.abs(n))] ?? 'facts';
  return id === 'any' ? { id: 'any', name: 'Any deck', short: 'Any', color: g.greenColor ?? '#3ddc84' } : deckOf(g, id);
}

/**
 * The tug-of-war path: the Guys' winner's circle, their green space, the coloured spaces, START in the middle, the same
 * the other way, and the Gals' winner's circle. The trophy sits on the space it is on.
 */
export function path(g, { compact = false } = {}) {
  const cells = [];
  const circle = (side) => {
    const t = teamOf(g, side);
    const n = t?.trophies ?? 0;
    return h('div', { class: `gv-circle ${side}`, style: { '--c': t?.color ?? '#888' }, title: `${nameOf(g, side)}: ${n} ${n === 1 ? 'trophy' : 'trophies'}` },
      Array.from({ length: g.target ?? 3 }, (_, i) => trophy(compact ? 16 : 40, i < n ? 'won' : 'empty')));
  };
  for (let n = -g.green; n <= g.green; n++) {
    const d = spaceDeck(g, n);
    const cls = n === 0 ? 'start' : Math.abs(n) === g.green ? 'green' : '';
    cells.push(h('div', { class: `gv-space ${cls} ${n === g.pos ? 'here' : ''}`, 'data-n': n, style: { '--d': d.color } },
      compact ? null : h('span', {}, n === 0 ? 'START' : d.short)));
  }
  return h('div', { class: `gv-path ${compact ? 'compact' : ''}` }, circle('guys'),
    h('div', { class: 'gv-spaces', style: { gridTemplateColumns: `repeat(${g.green * 2 + 1}, 1fr)` } }, cells,
      h('div', { class: 'gv-cup', style: { left: spaceLeft(g, g.pos) } }, trophy(compact ? 30 : 84))),
    circle('gals'));
}
/** Where on the path (as a CSS left) a space is. */
export const spaceLeft = (g, n) => `${((n + g.green + 0.5) / (g.green * 2 + 1)) * 100}%`;

/** The trophies a team has won, as "2 of 3". */
export const trophyText = (g, side) => `${teamOf(g, side)?.trophies ?? 0} of ${g.target}`;

/** The pawn race? (the classic race board instead of the trophy tug of war) */
export const isRace = (g) => g?.mode === 'race' && !!g.race;

/** Where a pawn sits on the race track, as a CSS left: x runs 0 (the Guys' START) to len + 1 (the Gals'). */
export const raceLeft = (g, x) => `${((x + 0.5) / (g.race.len + 2)) * 100}%`;

/** A team's pawns off the board: waiting to start, made it across, or a prisoner held at the other team's START. */
export function pawnBin(g, side, compact) {
  const r = g.race;
  const mine = r.pawns[side];
  const size = compact ? 18 : 44;
  const theirs = r.pawns[otherSide(side)];
  return h('div', { class: `gv-bin ${side}`, style: { '--c': teamOf(g, side)?.color ?? '#888' } },
    mine.filter((p) => p.state === 'wait').map(() => h('span', { class: 'wait', title: 'Waiting to start' }, token(side, '', size))),
    theirs.filter((p) => p.state === 'home').map(() => h('span', { class: 'home', title: 'Made it across' }, token(otherSide(side), '', size))),
    // A prisoner sits on the START of the team that took it.
    theirs.filter((p) => p.state === 'jail').map(() => h('span', { class: 'jail', title: 'Prisoner' }, token(otherSide(side), '', size), h('b', {}, '🔒'))));
}

/**
 * The race track: the Guys' START on the left, RACE_LEN spaces with the wild spaces in each side's colour, and the
 * Gals' START on the right. Pawns on the board stand on their spaces; the rest wait (or sit in jail) by a START.
 */
export function raceTrack(g, { compact = false } = {}) {
  const r = g.race;
  const cells = [];
  const wildSide = (x) => (r.wild.guys.includes(x) ? 'guys' : r.wild.gals.includes(x) ? 'gals' : null);
  for (let x = 0; x <= r.len + 1; x++) {
    const start = x === 0 ? 'guys' : x === r.len + 1 ? 'gals' : null;
    const wild = wildSide(x);
    const color = start ? teamOf(g, start)?.color : wild ? teamOf(g, wild)?.color : '#fff';
    cells.push(h('div', { class: `gv-space ${start ? 'start' : ''} ${wild ? 'wild' : ''}`, 'data-x': x, style: { '--d': color ?? '#fff' } },
      compact ? null : h('span', {}, start ? 'START' : wild ? 'WILD' : String(x))));
  }
  const pawns = [];
  for (const side of ['guys', 'gals']) {
    r.pawns[side].forEach((p, i) => {
      if (p.state !== 'board') return;
      const twin = r.pawns[otherSide(side)].some((o) => o.state === 'board' && o.x === p.x);
      pawns.push(h('div', { class: `gv-pawn ${side} ${twin ? 'twin' : ''}`, 'data-side': side, 'data-i': i, style: { left: raceLeft(g, p.x) } }, token(side, '', compact ? 30 : 84)));
    });
  }
  return h('div', { class: `gv-path gv-race ${compact ? 'compact' : ''}` }, pawnBin(g, 'guys', compact),
    h('div', { class: 'gv-spaces', style: { gridTemplateColumns: `repeat(${r.len + 2}, 1fr)` } }, cells, pawns),
    pawnBin(g, 'gals', compact));
}

/** Which space of its column a pawn stands on (0 is the top). Old saved games have no rows: a middle one. */
export function pawnRow(g, side, i) {
  const p = g.race.pawns[side][i];
  if (Number.isInteger(p?.row)) return p.row;
  const n = g.race.pawns[side].length;
  return side === 'guys' ? (n === 1 ? 2 : 1 + i) : (n === 1 ? 3 : 3 + i);
}

/**
 * The spaces the team at play can step onto with a right answer: lit while the question is read, and lettered (k) once
 * it is right and the team is picking one.
 */
export function raceSteps(g) {
  if (g.phase !== 'card' || !g.race) return [];
  return g.card?.stage === 'move' ? (g.card.moves ?? []) : (g.race.steps ?? []).map(({ k, ...s }) => s);
}

/** What stepping onto a space means, for a button: the way there and what is on it. */
export function stepLabel(g, steps, s) {
  const where = steps.length === 2 ? (s === steps[0] ? '⬆ Up' : '⬇ Down') : ['Top', '2nd', '3rd', '4th', '5th', 'Bottom'][s.row] ?? '';
  const what = s.pawn ? `on the ${nameOf(g, otherSide(g.turn))}’ pawn!` : s.wild ? `${nameOf(g, s.wild)} wild space` : '';
  return { where, what };
}

/**
 * The race board, small, for a phone: the same staggered columns of spaces as the TV, with the pawns on their spaces.
 * While a team is picking, its lit spaces can be tapped (onPick gets the space's letter).
 */
export function miniBoard(g, onPick = null) {
  const r = g.race;
  const rows = r.rows ?? 6;
  const steps = raceSteps(g);
  const cols = [];
  for (let x = 1; x <= r.len; x++) {
    const wild = r.wild.guys.includes(x) ? 'guys' : r.wild.gals.includes(x) ? 'gals' : null;
    cols.push(h('div', { class: `gv-mcol ${x % 2 ? 'odd' : 'even'}` }, Array.from({ length: rows }, (_, row) => {
      const kids = [];
      for (const side of ['guys', 'gals']) {
        r.pawns[side].forEach((p, i) => { if (p.state === 'board' && p.x === x && pawnRow(g, side, i) === row) kids.push(token(side, '', 30)); });
      }
      const step = steps.find((s) => s.x === x && s.row === row);
      const cls = `gv-mdot ${wild ? 'wild' : ''} ${step ? 'next' : ''} ${kids.length ? 'has-pawn' : ''}`;
      const style = { '--d': wild ? teamOf(g, wild)?.color : null, '--n': step ? teamOf(g, g.turn)?.color : null };
      const letter = step?.k ? h('b', {}, step.k) : null;
      return step?.k && onPick
        ? h('button', { type: 'button', class: cls, style, 'data-k': step.k, 'aria-label': `Space ${step.k}`, onclick: () => onPick(step.k) }, kids, letter)
        : h('div', { class: cls, style }, kids, letter);
    })));
  }
  const rail = (side) => h('div', { class: `gv-mrail ${side}`, style: { '--c': teamOf(g, side)?.color ?? '#888' } },
    r.pawns[side].filter((p) => p.state === 'board' && p.at === 0).map(() => token(side, '', 30)), pawnBin(g, side, true));
  return h('div', { class: 'gv-mini' }, rail('guys'), h('div', { class: 'gv-mgrid', style: { gridTemplateColumns: `repeat(${r.len}, 1fr)` } }, cols), rail('gals'));
}

/** "1 of 2 across" */
export const acrossText = (g, side) => `${g.race.pawns[side].filter((p) => p.state === 'home').length} of ${g.race.pawns[side].length} across`;
