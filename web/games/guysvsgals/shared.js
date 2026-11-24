// Bits the phone, host and TV pages of Guys vs Gals share: the stylesheet, the team emblems (a mustache for the Guys, a
// bow for the Gals), the race track, and a few words.
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
  const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Outfit:wght@400;600;800&display=swap';
  if (!document.querySelector(`link[href="${FONTS}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: FONTS }));
}

export const LETTERS = ['A', 'B', 'C', 'D'];
export const teamOf = (g, side) => g.teams?.find((t) => t.side === side) ?? null;
export const nameOf = (g, side) => teamOf(g, side)?.name ?? (side === 'guys' ? 'Guys' : 'Gals');
export const otherSide = (side) => (side === 'guys' ? 'gals' : 'guys');
/** "Gal stuff" for a question about the gals' side of things. */
export const aboutText = (about) => (about === 'guys' ? 'Guy stuff' : 'Gal stuff');

const MUSTACHE = 'M0 -4 C -5 -13, -17 -16, -25 -8 C -30 -3, -36 2, -46 -3 C -42 11, -26 15, -13 9 C -7 6, -3 4, 0 3 C 3 4, 7 6, 13 9 C 26 15, 42 11, 46 -3 C 36 2, 30 -3, 25 -8 C 17 -16, 5 -13, 0 -4 Z';
const BOW_L = 'M -5 0 C -14 -17, -40 -24, -41 -2 C -42 20, -15 17, -5 0 Z';
const BOW_R = 'M 5 0 C 14 -17, 40 -24, 41 -2 C 42 20, 15 17, 5 0 Z';

/** The side's emblem on its own: the mustache or the bow, in white (or `fill`). */
export function emblemShapes(side, fill = '#fff') {
  if (side === 'guys') return [s('path', { d: MUSTACHE, fill })];
  return [s('path', { d: BOW_L, fill }), s('path', { d: BOW_R, fill }), s('ellipse', { cx: 0, cy: 0, rx: 8, ry: 9, fill }),
    s('path', { d: 'M -22 -4 C -16 -2, -12 0, -9 1 M 22 -4 C 16 -2, 12 0, 9 1', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 3, fill: 'none' })];
}
/** A team's token: a round badge in its colour with the emblem. */
export function token(side, color, size = 60, cls = '') {
  return s('svg', { viewBox: '-60 -60 120 120', width: size, height: size, class: `gv-token ${side} ${cls}`, role: 'img', 'aria-label': side === 'guys' ? 'The Guys' : 'The Gals' },
    s('defs', {}, s('radialGradient', { id: `gvg-${side}`, cx: '35%', cy: '30%', r: '75%' },
      s('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': 0.45 }), s('stop', { offset: '55%', 'stop-color': color, 'stop-opacity': 1 }), s('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 1 }))),
    s('circle', { r: 56, fill: color }),
    s('circle', { r: 56, fill: `url(#gvg-${side})` }),
    s('circle', { r: 52, fill: 'none', stroke: '#fff', 'stroke-width': 5, opacity: 0.9 }),
    s('g', { transform: side === 'guys' ? 'translate(0 6) scale(.95)' : 'translate(0 2) scale(.95)' }, emblemShapes(side)));
}

/** A lightning bolt. */
export function bolt(size = 40, fill = '#ffe14d') {
  return s('svg', { viewBox: '0 0 64 100', width: size * 0.64, height: size, class: 'gv-bolt', 'aria-hidden': 'true' },
    s('path', { d: 'M38 0 L4 56 L28 56 L20 100 L60 38 L34 38 Z', fill, stroke: 'rgba(0,0,0,.25)', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
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
      kind === 'start' ? (compact ? '' : 'GO') : kind === 'finish' ? '🏆' : kind === 'light' ? bolt(compact ? 16 : 30) : compact ? '' : h('span', {}, String(i))));
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
