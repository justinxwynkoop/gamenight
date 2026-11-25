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

/** Loads the Pie Chase stylesheet (and its fonts) once. */
export function loadStyles() {
  if (document.getElementById('pc-css')) return;
  document.head.append(h('link', { id: 'pc-css', rel: 'stylesheet', href: '/games/piechase/piechase.css' }));
  const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Outfit:wght@400;600;800;900&display=swap';
  if (!document.querySelector(`link[href="${FONTS}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: FONTS }));
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

// ---------- category icons ----------
// Each category has a little picture, drawn in a 24-unit box (white on the category's colour). A set that renames its
// categories keeps the picture of the slot unless the new name clearly matches another one. The Apple TV uses SF Symbols
// that look the same (PieChaseScreens.swift, Pie.symbol).
const ICONS = {
  globe: [['circle', { cx: 12, cy: 12, r: 9, fill: 'none', 'stroke-width': 2.2 }], ['ellipse', { cx: 12, cy: 12, rx: 4, ry: 9, fill: 'none', 'stroke-width': 2 }], ['path', { d: 'M3.5 9h17M3.5 15h17', fill: 'none', 'stroke-width': 2 }]],
  star: [['path', { d: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z', stroke: 'none' }]],
  columns: [['path', { d: 'M12 2.5L2.5 7.5v2h19v-2zM4.5 11h3v7h-3zM10.5 11h3v7h-3zM16.5 11h3v7h-3zM2.5 19.5h19v2h-19z', stroke: 'none' }]],
  book: [['path', { d: 'M12 6.2C9.8 4.6 6.6 4 3 4.3v14c3.6-.3 6.8.3 9 1.9 2.2-1.6 5.4-2.2 9-1.9v-14c-3.6-.3-6.8.3-9 1.9z', stroke: 'none' }], ['path', { d: 'M12 6.4v13.4', fill: 'none', 'stroke-width': 1.4, 'stroke-opacity': 0.35, stroke: '#000' }]],
  leaf: [['path', { d: 'M20.5 3.5C11 3.5 4.5 8 4.5 15.2c0 1.4.3 2.6.8 3.6C7 13.6 10.5 10.4 15 8.6c-3.8 2.4-6.8 5.9-8.6 10.6 1.2.9 2.7 1.3 4.3 1.3 7.2 0 9.8-7.7 9.8-17z', stroke: 'none' }]],
  ball: [['circle', { cx: 12, cy: 12, r: 9, fill: 'none', 'stroke-width': 2.2 }], ['path', { d: 'M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8', fill: 'none', 'stroke-width': 2 }]],
};
const SLOT_ICON = ['globe', 'star', 'columns', 'book', 'leaf', 'ball'];
const NAME_ICON = [[/geo|world|place|travel|map|countr/i, 'globe'], [/entertain|movie|film|tv|music|pop|show|celeb/i, 'star'], [/hist|past|famous/i, 'columns'],
  [/art|lit|book|word|read|language/i, 'book'], [/sci|nature|animal|plant|space/i, 'leaf'], [/sport|leisure|game|hobb/i, 'ball']];
/** The picture for category i (one of the ICONS keys). */
export function iconOf(v, i) {
  const name = catOf(v, i).name ?? '';
  return NAME_ICON.find(([re]) => re.test(name))?.[1] ?? SLOT_ICON[i] ?? 'star';
}
/** A category's picture inside another SVG, centred on (x, y), `size` across. */
export function iconShapes(key, x, y, size, color = '#fff') {
  const k = size / 24;
  return s('g', { transform: `translate(${(x - 12 * k).toFixed(4)} ${(y - 12 * k).toFixed(4)}) scale(${k.toFixed(5)})`, fill: color, stroke: color, 'stroke-linecap': 'round', 'pointer-events': 'none' },
    (ICONS[key] ?? ICONS.star).map(([tag, a]) => s(tag, a)));
}
/** A category's picture on its own (for HTML: chips, cards, buttons). */
export function icon(v, i, size = 24, color = 'currentColor') {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'pc-ico', 'aria-hidden': 'true' }, iconShapes(iconOf(v, i), 12, 12, 24, color));
}

// ---------- pies ----------
const rad = (deg) => (deg * Math.PI) / 180;
function wedgePath(cx, cy, r, i, n = 6) {
  const a0 = rad(-90 + (i * 360) / n);
  const a1 = rad(-90 + ((i + 1) * 360) / n);
  const p = (a) => `${(cx + Math.cos(a) * r).toFixed(3)} ${(cy + Math.sin(a) * r).toFixed(3)}`;
  return `M ${cx} ${cy} L ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)} Z`;
}
/** Shared gradients for the board and the pies (defined once per page, in a hidden SVG). */
function ensureDefs() {
  if (typeof document === 'undefined' || document.getElementById('pc-defs')) return;
  const stop = (offset, color, opacity = 1) => s('stop', { offset, 'stop-color': color, 'stop-opacity': opacity });
  document.body.append(s('svg', { id: 'pc-defs', width: 0, height: 0, style: 'position:absolute;width:0;height:0', 'aria-hidden': 'true' },
    s('defs', {},
      s('linearGradient', { id: 'pc-gloss', x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#fff', 0.55), stop(0.45, '#fff', 0.08), stop(0.55, '#000', 0), stop(1, '#000', 0.22)),
      s('radialGradient', { id: 'pc-crust', cx: 0.5, cy: 0.5, r: 0.5 }, stop(0.9, '#b8692b'), stop(0.95, '#e9a95a'), stop(1, '#c97a35')),
      s('radialGradient', { id: 'pc-face', cx: 0.5, cy: 0.42, r: 0.6 }, stop(0, '#4a2150'), stop(0.7, '#2b1233'), stop(1, '#1d0b24')),
      s('radialGradient', { id: 'pc-plate', cx: 0.4, cy: 0.35, r: 0.75 }, stop(0, '#fff3c4'), stop(0.55, '#f5c451'), stop(1, '#c98a1d')),
      s('radialGradient', { id: 'pc-dome', cx: 0.35, cy: 0.3, r: 0.8 }, stop(0, '#fff', 0.5), stop(0.5, '#fff', 0.05), stop(1, '#000', 0.25)))));
}
/** A pie's wedges inside an SVG: a crust in the player's colour, and category i's slot filled with its colour once won. */
export function pieShapes(v, wedges, cx, cy, r, ring = '#fff', ringWidth = r * 0.12, fresh = null) {
  ensureDefs();
  const have = new Set(wedges ?? []);
  return [
    s('circle', { cx, cy, r, fill: '#1d0b24', stroke: ring, 'stroke-width': ringWidth }),
    v.categories.map((c, i) => s('path', { d: wedgePath(cx, cy, r * 0.84, i), fill: have.has(i) ? c.color : 'rgba(255,255,255,.05)', stroke: have.has(i) ? '#1d0b24' : 'rgba(255,255,255,.16)', 'stroke-width': r * 0.05, class: have.has(i) ? `pc-wedge on ${i === fresh ? 'fresh' : ''}` : 'pc-wedge' })),
    have.size ? s('circle', { cx, cy, r: r * 0.84, fill: 'url(#pc-dome)', 'pointer-events': 'none' }) : null,
  ];
}
/** A player's pie as its own little picture. */
export function pie(v, wedges, size = 40, ring = '#fff', label = '', fresh = null) {
  return s('svg', { viewBox: '-1.1 -1.1 2.2 2.2', width: size, height: size, class: 'pc-pie', role: 'img', 'aria-label': label || `${(wedges ?? []).length} of 6 wedges` },
    pieShapes(v, wedges, 0, 0, 1, ring, 0.16, fresh));
}

// ---------- the die ----------
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
/** A die face. `n` changes with every roll, so it tumbles in again even when the number is the same. */
export function die(value, { size = 80, rolling = false, key = '' } = {}) {
  const pips = PIPS[value] ?? [];
  return s('svg', { viewBox: '-1.25 -1.25 2.5 2.5', width: size, height: size, class: `pc-die ${rolling ? 'roll' : ''}`, 'data-k': key, role: 'img', 'aria-label': value ? `Rolled ${value}` : 'Die' },
    s('rect', { x: -1.1, y: -1.02, width: 2.2, height: 2.2, rx: 0.46, fill: '#d9c7b0' }),
    s('rect', { x: -1.1, y: -1.14, width: 2.2, height: 2.2, rx: 0.46, fill: '#fffaf1', stroke: '#eadbc6', 'stroke-width': 0.05 }),
    pips.map(([x, y]) => s('circle', { cx: x * 0.56, cy: y * 0.56 - 0.04, r: 0.19, fill: '#7a1f3d' })));
}

// ---------- the board ----------
// Drawn as a pie in its tin: a crimped golden crust round the edge, a berry-dark filling, six faint slices (one per
// category, round its spoke), glossy candy spaces, a medallion with the category's picture at each headquarters, and a
// golden plate with a little six-colour pie in the hub.
const RING_R = 1;          // ring spaces sit on this circle
const RING_W = 0.15;       // how thick the ring is
function sector(rIn, rOut, a0, a1) {
  const p = (r, a) => `${(Math.cos(a) * r).toFixed(4)} ${(Math.sin(a) * r).toFixed(4)}`;
  return `M ${p(rOut, a0)} A ${rOut} ${rOut} 0 0 1 ${p(rOut, a1)} L ${p(rIn, a1)} A ${rIn} ${rIn} 0 0 0 ${p(rIn, a0)} Z`;
}
/** A crimped edge: a circle of radius r with `n` bumps of size `bump`. */
function crimp(r, n, bump) {
  const pts = [];
  for (let i = 0; i <= n * 8; i++) {
    const a = (i / (n * 8)) * Math.PI * 2;
    const rr = r + bump * Math.abs(Math.sin((a * n) / 2));
    pts.push(`${(Math.cos(a) * rr).toFixed(4)} ${(Math.sin(a) * rr).toFixed(4)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}
/** Three pips: a Roll Again space. */
function againMark(x, y, size) {
  const d = size * 0.3;
  return s('g', { 'pointer-events': 'none', class: 'pc-again' }, [[-1, -1], [0, 0], [1, 1]].map(([a, b]) => s('circle', { cx: x + a * d, cy: y + b * d, r: size * 0.13, fill: '#7a1f3d' })));
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
  ensureDefs();
  const lit = new Set(highlight);
  const number = new Map(highlight.map((id, i) => [id, i + 1]));
  const ring = [];
  const spokes = [];
  const hqs = [];
  const marks = [];
  const pick = (id) => (onPick && lit.has(id) ? { onclick: () => onPick(id), role: 'button', 'aria-label': `Move to ${spaceName(v, id)}` } : {});
  const cls = (base, id) => `${base} ${lit.has(id) ? 'lit' : ''} ${onPick && lit.has(id) ? 'pick' : ''}`;
  const ringCount = v.board.filter((x) => x.id.startsWith('r')).length || 42;
  const step = 360 / ringCount;
  for (const sp of v.board) {
    const fill = sp.kind === 'again' ? '#f6e3c0' : sp.kind === 'hub' ? 'url(#pc-plate)' : catOf(v, sp.cat).color;
    const on = lit.has(sp.id);
    if (sp.id.startsWith('r')) {
      const n = Number(sp.id.slice(1));
      const a0 = rad(-90 + (n - 0.5) * step + 0.5);
      const a1 = rad(-90 + (n + 0.5) * step - 0.5);
      const d = sector(RING_R - RING_W / 2, RING_R + RING_W / 2, a0, a1);
      ring.push(s('g', { class: cls('pc-sp', sp.id), 'data-id': sp.id, ...pick(sp.id) },
        s('path', { d, fill }), s('path', { d, fill: 'url(#pc-gloss)', 'pointer-events': 'none', class: 'pc-shine' })));
      if (sp.kind === 'hq') {
        hqs.push(s('g', { class: cls('pc-hq', sp.id), 'data-id': sp.id, ...pick(sp.id) },
          s('circle', { cx: sp.x, cy: sp.y + 0.012, r: 0.135, fill: 'rgba(0,0,0,.35)' }),
          s('circle', { cx: sp.x, cy: sp.y, r: 0.128, fill: '#fffaf1' }),
          s('circle', { cx: sp.x, cy: sp.y, r: 0.108, fill }),
          s('circle', { cx: sp.x, cy: sp.y, r: 0.108, fill: 'url(#pc-dome)' }),
          iconShapes(iconOf(v, sp.cat), sp.x, sp.y, 0.115, '#fff')));
      }
      if (sp.kind === 'again') marks.push(againMark(sp.x, sp.y, 0.075));
    } else if (sp.kind === 'hub') {
      spokes.push(s('g', { class: cls('pc-sp pc-hub', sp.id), 'data-id': sp.id, ...pick(sp.id) },
        s('path', { d: crimp(0.175, 12, 0.022), fill: 'url(#pc-plate)', stroke: '#8a5a12', 'stroke-width': 0.008 }),
        [0, 1, 2, 3, 4, 5].map((i) => s('path', { d: wedgePath(0, 0, 0.13, i), fill: catOf(v, i).color, stroke: '#fff6da', 'stroke-width': 0.01 })),
        s('circle', { cx: 0, cy: 0, r: 0.13, fill: 'url(#pc-dome)', 'pointer-events': 'none' }),
        s('circle', { cx: 0, cy: 0, r: 0.03, fill: '#fff6da', 'pointer-events': 'none' })));
    } else {
      const ang = (Math.atan2(sp.y, sp.x) * 180) / Math.PI;
      const box = { x: sp.x - 0.058, y: sp.y - 0.052, width: 0.116, height: 0.104, rx: 0.026, transform: `rotate(${ang} ${sp.x} ${sp.y})` };
      spokes.push(s('g', { class: cls('pc-sp', sp.id), 'data-id': sp.id, ...pick(sp.id) },
        s('rect', { ...box, fill }), s('rect', { ...box, fill: 'url(#pc-gloss)', 'pointer-events': 'none', transform: `rotate(${ang} ${sp.x} ${sp.y})`, class: 'pc-shine' })));
    }
    if (on && labels) marks.push(s('g', { class: 'pc-num', 'pointer-events': 'none' }, s('circle', { cx: sp.x, cy: sp.y, r: 0.062, fill: '#fffaf1', stroke: '#1d0b24', 'stroke-width': 0.012 }), s('text', { x: sp.x, y: sp.y + 0.003, 'font-size': 0.078, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#1d0b24' }, String(number.get(sp.id)))));
  }
  // Six faint slices, one round each spoke, in the spoke's colour.
  const slices = [0, 1, 2, 3, 4, 5].map((k) => {
    const hq = v.board.find((x) => x.kind === 'hq' && x.cat === k);
    if (!hq) return null;
    const mid = Math.atan2(hq.y, hq.x);
    return s('path', { d: `M 0 0 L ${(Math.cos(mid - Math.PI / 6) * 0.9).toFixed(4)} ${(Math.sin(mid - Math.PI / 6) * 0.9).toFixed(4)} A 0.9 0.9 0 0 1 ${(Math.cos(mid + Math.PI / 6) * 0.9).toFixed(4)} ${(Math.sin(mid + Math.PI / 6) * 0.9).toFixed(4)} Z`,
      fill: catOf(v, k).color, opacity: 0.09, stroke: '#1d0b24', 'stroke-width': 0.01, 'stroke-opacity': 0.6 });
  });
  const pieces = tokens ? tokenShapes(v, focus) : [];
  return s('svg', { viewBox: '-1.22 -1.22 2.44 2.44', class: `pc-board ${className}`, role: 'img', 'aria-label': 'The board' },
    s('circle', { cx: 0, cy: 0.03, r: 1.19, fill: 'rgba(0,0,0,.4)', class: 'pc-tin-shadow' }),
    s('path', { d: crimp(1.135, 48, 0.045), fill: '#d48a42', stroke: '#8f4f1c', 'stroke-width': 0.01 }),
    s('circle', { cx: 0, cy: 0, r: 1.15, fill: 'url(#pc-crust)' }),
    s('circle', { cx: 0, cy: 0, r: 1.098, fill: '#1d0b24' }),
    s('circle', { cx: 0, cy: 0, r: RING_R - RING_W / 2 - 0.02, fill: 'url(#pc-face)' }),
    slices, ring, spokes, hqs, marks, pieces);
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
      const r = n > 3 ? 0.055 : 0.068;
      const g = s('g', { class: `pc-token ${u.id === focus ? 'focus' : ''}`, 'data-unit': u.id, style: `--c:${u.color}` },
        u.id === focus ? s('circle', { cx: x, cy: y, r: r * 1.6, class: 'pc-glow', fill: u.color, 'fill-opacity': 0.25, stroke: u.color, 'stroke-width': 0.014 }) : null,
        s('circle', { cx: x, cy: y + r * 0.22, r: r * 1.05, fill: 'rgba(0,0,0,.45)' }),
        pieShapes(v, u.wedges, x, y, r, u.color, r * 0.3));
      if (u.id === focus) top = g; else out.push(g);
    });
  }
  if (top) out.push(top);
  return out;
}

/** The six categories as a key: picture, colour and name. */
export function legend(v) {
  return h('div', { class: 'pc-legend' }, v.categories.map((c, i) => h('span', { style: { '--c': c.color } }, h('i', {}, icon(v, i, 14, '#fff')), c.name)));
}

/** The game's logo: a pie with a few wedges, and the name. */
export function logo(v, tag = 'h1') {
  return h(tag, { class: 'pc-logo' }, pie(v, [0, 2, 4], 60, '#d48a42', 'Pie Chase'), h('span', {}, 'Pie Chase'));
}

const CONFETTI = ['#3b82f6', '#ec4899', '#facc15', '#a855f7', '#22c55e', '#f97316', '#fffaf1'];
/** Falling confetti in the category colours, for the winner. */
export function confetti(n = 60) {
  return h('div', { class: 'pc-confetti', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => {
    const r = (k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    return h('i', { style: { '--x': `${(r(1) * 100).toFixed(1)}%`, '--t': `${(3 + r(2) * 3).toFixed(2)}s`, '--d': `${(-r(3) * 6).toFixed(2)}s`, '--r': `${Math.round(r(4) * 360)}deg`, '--c': CONFETTI[i % CONFETTI.length] } });
  }));
}

/** "4 wedges to win" etc., for screens that explain the game. */
export const goalText = (v) => (v.settings?.wedgesToWin ?? 6) < 6 ? `a shorter game: ${v.settings.wedgesToWin} wedges, then the hub` : 'all six wedges, then the hub';
