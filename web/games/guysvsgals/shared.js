// Bits the phone, host and TV pages of Guys vs Gals share: the stylesheet, the art (a superhero for each side), the race
// track, and a few words. The look is a comic book: newsprint, ink outlines, halftone and Bangers lettering.
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

export const LETTERS = ['A', 'B', 'C', 'D'];
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

/**
 * One team's lane of the race track: start, a space for every step (lightning ones marked), the finish, and the token.
 * `hopFrom`: where the token was before (the TV animates it along).
 */
export function lane(g, side, { compact = false } = {}) {
  const t = teamOf(g, side);
  const n = g.length;
  const lit = new Set(g.lightningAt ?? []);
  const used = new Set(t?.used ?? []);
  const cells = [];
  for (let i = 0; i <= n; i++) {
    const kind = i === 0 ? 'start' : i === n ? 'finish' : lit.has(i) ? 'light' : 'space';
    cells.push(h('div', { class: `gv-cell ${kind} ${i <= (t?.pos ?? 0) && i > 0 ? 'passed' : ''} ${used.has(i) ? 'used' : ''}`, 'data-i': i },
      kind === 'start' ? (compact ? '' : 'GO') : kind === 'finish' ? art('trophy', compact ? 18 : 48) : kind === 'light' ? bolt(compact ? 16 : 30) : compact ? '' : h('span', {}, String(i))));
  }
  const pct = ((t?.pos ?? 0) / n) * 100;
  return h('div', { class: `gv-lane ${side} ${g.turn === side ? 'turn' : ''}`, style: { '--c': t?.color ?? '#888' } },
    h('div', { class: 'gv-cells', style: { gridTemplateColumns: `repeat(${n + 1}, 1fr)` } }, cells),
    h('div', { class: 'gv-runner', 'data-side': side, style: { left: `calc(${pct}% * ${n / (n + 1)} + ${50 / (n + 1)}%)` } }, token(side, t?.color ?? '#888', compact ? 30 : 64)));
}
/** Where on the lane (as a CSS left) a space is. */
export const laneLeft = (g, i) => `calc(${(i / g.length) * 100}% * ${g.length / (g.length + 1)} + ${50 / (g.length + 1)}%)`;

/** How long the game is, in words. */
export const lengthText = (g) => `${g.lengths?.find((l) => l.n === g.length)?.label ?? ''} game · ${g.length} spaces`.trim();
