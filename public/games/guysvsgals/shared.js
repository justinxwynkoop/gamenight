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
