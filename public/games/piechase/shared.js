// Bits the phone, host and TV pages of Pie Chase share: the stylesheet, the board, the pies and the die.
// The board's layout comes from the game (view.board: every space with its kind, category and place), so the TV,
// the phones and the Apple TV all draw the same wheel.
import { h } from '../../common.js';

const NS = 'http://www.w3.org/2000/svg';
/** An SVG element (h() makes HTML ones). */
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

/** Loads the Pie Chase stylesheet once. */
export function loadStyles() {
  if (document.getElementById('pc-css')) return;
  document.head.append(h('link', { id: 'pc-css', rel: 'stylesheet', href: '/games/piechase/piechase.css' }));
}

export const unitOf = (v, id) => v.units?.find((u) => u.id === id) ?? null;
export const nameOf = (v, id) => unitOf(v, id)?.name ?? 'Someone';
export const catOf = (v, i) => v.categories?.[i] ?? { name: '', color: '#888' };
export const spaceOf = (v, id) => v.board?.find((x) => x.id === id) ?? null;

/** What a space is, in words: "Geography headquarters", "Roll Again", "the hub", "a History space". */
export function spaceName(v, id) {
  const sp = spaceOf(v, id);
  if (!sp) return '';
  if (sp.kind === 'hub') return 'The hub';
  if (sp.kind === 'again') return 'Roll Again';
  if (sp.kind === 'hq') return `${catOf(v, sp.cat).name} headquarters`;
  return catOf(v, sp.cat).name;
}

// ---------- pies ----------
const rad = (deg) => (deg * Math.PI) / 180;
function wedgePath(cx, cy, r, i, n = 6) {
  const a0 = rad(-90 + (i * 360) / n);
  const a1 = rad(-90 + ((i + 1) * 360) / n);
  const p = (a) => `${(cx + Math.cos(a) * r).toFixed(3)} ${(cy + Math.sin(a) * r).toFixed(3)}`;
  return `M ${cx} ${cy} L ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)} Z`;
}
/** A pie's wedges inside an SVG: category i's slot is filled with its colour once won. */
export function pieShapes(v, wedges, cx, cy, r, ring = '#fff', ringWidth = r * 0.12) {
  const have = new Set(wedges ?? []);
  return [
    s('circle', { cx, cy, r, fill: '#0b1020', stroke: ring, 'stroke-width': ringWidth }),
    v.categories.map((c, i) => s('path', { d: wedgePath(cx, cy, r * 0.86, i), fill: have.has(i) ? c.color : 'transparent', stroke: have.has(i) ? '#0b1020' : 'rgba(255,255,255,.14)', 'stroke-width': r * 0.05 })),
  ];
}
/** A player's pie as its own little picture. */
export function pie(v, wedges, size = 40, ring = '#fff', label = '') {
  return s('svg', { viewBox: '-1.1 -1.1 2.2 2.2', width: size, height: size, class: 'pc-pie', role: 'img', 'aria-label': label || `${(wedges ?? []).length} of 6 wedges` },
    pieShapes(v, wedges, 0, 0, 1, ring, 0.14));
}

// ---------- the die ----------
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
/** A die face. `n` changes with every roll, so it tumbles in again even when the number is the same. */
export function die(value, { size = 80, rolling = false, key = '' } = {}) {
  const pips = PIPS[value] ?? [];
  return s('svg', { viewBox: '-1.2 -1.2 2.4 2.4', width: size, height: size, class: `pc-die ${rolling ? 'roll' : ''}`, 'data-k': key, role: 'img', 'aria-label': value ? `Rolled ${value}` : 'Die' },
    s('rect', { x: -1.1, y: -1.1, width: 2.2, height: 2.2, rx: 0.4, fill: '#fff', stroke: '#c8cfe4', 'stroke-width': 0.06 }),
    pips.map(([x, y]) => s('circle', { cx: x * 0.58, cy: y * 0.58, r: 0.2, fill: '#111827' })));
}

// ---------- the board ----------
const RING_R = 1;          // ring spaces sit on this circle
const RING_W = 0.15;       // how thick the ring is
const DIE_GLYPH = '⚄';
function sector(rIn, rOut, a0, a1) {
  const p = (r, a) => `${(Math.cos(a) * r).toFixed(4)} ${(Math.sin(a) * r).toFixed(4)}`;
  return `M ${p(rOut, a0)} A ${rOut} ${rOut} 0 0 1 ${p(rOut, a1)} L ${p(rIn, a1)} A ${rIn} ${rIn} 0 0 0 ${p(rIn, a0)} Z`;
}
function hexagon(r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = rad(-60 + i * 60);
    return `${(Math.cos(a) * r).toFixed(4)},${(Math.sin(a) * r).toFixed(4)}`;
  }).join(' ');
}

/**
 * The whole wheel, as SVG. opts:
 *   highlight   space ids to light up (where the roll can go)
 *   onPick(id)  makes those spaces tappable
 *   tokens      true to draw everyone's pie where they are (default)
 *   focus       the unit whose turn it is (their token is drawn on top, with a glow)
 *   labels      true to number the highlighted spaces (the phone's list uses the same numbers)
 */
export function board(v, { highlight = [], onPick = null, tokens = true, focus = null, labels = false, className = '' } = {}) {
  const lit = new Set(highlight);
  const number = new Map(highlight.map((id, i) => [id, i + 1]));
  const ring = [];
  const spokes = [];
  const hqs = [];
  const marks = [];
  const pick = (id) => (onPick && lit.has(id) ? { onclick: () => onPick(id), class: 'pick', role: 'button', 'aria-label': `Move to ${spaceName(v, id)}` } : {});
  const ringCount = v.board.filter((x) => x.id.startsWith('r')).length || 42;
  const step = 360 / ringCount;
  for (const sp of v.board) {
    const fill = sp.kind === 'again' ? '#1b2238' : sp.kind === 'hub' ? '#101626' : catOf(v, sp.cat).color;
    const on = lit.has(sp.id);
    if (sp.id.startsWith('r')) {
      const n = Number(sp.id.slice(1));
      const a0 = rad(-90 + (n - 0.5) * step + 0.35);
      const a1 = rad(-90 + (n + 0.5) * step - 0.35);
      ring.push(s('path', { d: sector(RING_R - RING_W / 2, RING_R + RING_W / 2, a0, a1), fill, class: `pc-sp ${on ? 'lit' : ''}`, 'data-id': sp.id, ...pick(sp.id) }));
      if (sp.kind === 'hq') {
        hqs.push(s('g', { class: `pc-hq ${on ? 'lit' : ''}`, 'data-id': sp.id, ...pick(sp.id) },
          s('circle', { cx: sp.x, cy: sp.y, r: 0.115, fill, stroke: '#fff', 'stroke-width': 0.022 }),
          // The headquarters' wedge, so it reads as "win a wedge here".
          s('path', { d: wedgePath(sp.x, sp.y, 0.075, 0, 6), fill: '#fff', opacity: 0.9, transform: `rotate(${(Math.atan2(sp.y, sp.x) * 180) / Math.PI + 120} ${sp.x} ${sp.y})` })));
      }
      if (sp.kind === 'again') marks.push(s('text', { x: sp.x, y: sp.y, class: 'pc-again', 'font-size': 0.085, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, DIE_GLYPH));
    } else if (sp.kind === 'hub') {
      spokes.push(s('polygon', { points: hexagon(0.17), fill, stroke: '#fff', 'stroke-width': 0.02, class: `pc-sp pc-hub ${on ? 'lit' : ''}`, 'data-id': sp.id, ...pick(sp.id) }));
      // A star of six colours in the middle of the hub.
      for (let i = 0; i < 6; i++) spokes.push(s('path', { d: wedgePath(0, 0, 0.1, i), fill: catOf(v, i).color, opacity: 0.85, 'pointer-events': 'none' }));
    } else {
      const ang = (Math.atan2(sp.y, sp.x) * 180) / Math.PI;
      spokes.push(s('rect', { x: sp.x - 0.06, y: sp.y - 0.055, width: 0.12, height: 0.11, rx: 0.02, fill, transform: `rotate(${ang} ${sp.x} ${sp.y})`, class: `pc-sp ${on ? 'lit' : ''}`, 'data-id': sp.id, ...pick(sp.id) }));
    }
    if (on && labels) marks.push(s('g', { class: 'pc-num', 'pointer-events': 'none' }, s('circle', { cx: sp.x, cy: sp.y, r: 0.055, fill: '#fff' }), s('text', { x: sp.x, y: sp.y, 'font-size': 0.07, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#0b1020' }, String(number.get(sp.id)))));
  }
  const pieces = tokens ? tokenShapes(v, focus) : [];
  return s('svg', { viewBox: '-1.16 -1.16 2.32 2.32', class: `pc-board ${className}`, role: 'img', 'aria-label': 'The board' },
    s('circle', { cx: 0, cy: 0, r: 1.14, fill: '#0d1428', stroke: '#26325a', 'stroke-width': 0.012 }),
    s('circle', { cx: 0, cy: 0, r: RING_R - RING_W / 2 - 0.03, fill: '#121b36' }),
    ring, spokes, hqs, marks, pieces);
}

/** Everyone's pie on their space; several on one space sit side by side. */
function tokenShapes(v, focus) {
  const by = new Map();
  for (const u of v.units ?? []) {
    const list = by.get(u.pos) ?? [];
    list.push(u);
    by.set(u.pos, list);
  }
  const out = [];
  let top = null;
  for (const [id, list] of by) {
    const sp = spaceOf(v, id);
    if (!sp) continue;
    const n = list.length;
    list.forEach((u, i) => {
      const spread = n > 1 ? 0.075 : 0;
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = sp.x + Math.cos(a) * spread;
      const y = sp.y + Math.sin(a) * spread;
      const r = n > 3 ? 0.05 : 0.062;
      const g = s('g', { class: `pc-token ${u.id === focus ? 'focus' : ''}`, 'data-unit': u.id },
        u.id === focus ? s('circle', { cx: x, cy: y, r: r * 1.55, class: 'pc-glow', fill: 'none', stroke: '#fff', 'stroke-width': 0.016 }) : null,
        pieShapes(v, u.wedges, x, y, r, u.color, r * 0.3));
      if (u.id === focus) top = g; else out.push(g);
    });
  }
  if (top) out.push(top);
  return out;
}

/** The six categories as a key: colour and name. */
export function legend(v) {
  return h('div', { class: 'pc-legend' }, v.categories.map((c) => h('span', {}, h('i', { style: { background: c.color } }), c.name)));
}

/** "4 wedges to win" etc., for screens that explain the game. */
export const goalText = (v) => (v.settings?.wedgesToWin ?? 6) < 6 ? `a shorter game: ${v.settings.wedgesToWin} wedges, then the hub` : 'all six wedges, then the hub';
