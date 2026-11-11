// Small building blocks shared by the host page and the games' host screens (buttons, tabs, cards, icons).
import { h } from './common.js';

// Simple outline icons (24x24, drawn with a stroke).
const ICONS = {
  grid: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }]],
  users: [['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
  award: [['circle', { cx: 12, cy: 8, r: 7 }], ['path', { d: 'M8.21 13.89 7 23l5-3 5 3-1.21-9.12' }]],
  sliders: [['path', { d: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
  chevron: [['path', { d: 'M9 18l6-6-6-6' }]],
  tv: [['rect', { x: 2, y: 7, width: 20, height: 15, rx: 2 }], ['path', { d: 'M17 2l-5 5-5-5' }]],
  star: [['path', { d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' }]],
  clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 6v6l4 2' }]],
  refresh: [['path', { d: 'M23 4v6h-6M1 20v-6h6' }], ['path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }]],
  play: [['path', { d: 'M5 3l14 9-14 9V3z' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  edit: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }]],
  shuffle: [['path', { d: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5' }]],
  volume: [['path', { d: 'M11 5 6 9H2v6h4l5 4V5z' }], ['path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07' }]],
  trash: [['path', { d: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }]],
  swap: [['path', { d: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3' }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  flag: [['path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7' }]],
};

export function icon(name, size = 22) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

/** A button. kind: primary | ok | bad | ghost (or ''), size: sm | lg. */
export function button({ label, icon: iconName, kind = '', size = '', block = false, onclick, disabled = false, aria } = {}) {
  const cls = ['b', kind && `b-${kind}`, size && `b-${size}`, block && 'b-block'].filter(Boolean).join(' ');
  return h('button', { type: 'button', class: cls, onclick, disabled, 'aria-label': aria },
    iconName && icon(iconName, size === 'sm' ? 18 : 20), label != null && h('span', {}, label));
}

/** A row of choices where one is selected. options: [{ value, label, sub?, disabled? }] */
export function seg(options, value, onpick) {
  return h('div', { class: 'seg', role: 'group' }, options.map((o) => h('button', {
    type: 'button', 'aria-pressed': String(o.value === value), disabled: o.disabled, onclick: () => onpick(o.value),
  }, h('span', {}, o.label), o.sub && h('small', {}, o.sub))));
}

/** An on/off switch with a label. */
export function toggle({ label, sub, checked, onchange }) {
  return h('label', { class: 'switch' },
    h('div', { class: 'grow' }, h('div', { class: 't' }, label), sub && h('div', { class: 's' }, sub)),
    h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onchange(e.target.checked) }),
    h('span', { class: 'track' }));
}

export const dot = (color, size = 14) => h('span', { class: 'dotc', style: { background: color, width: `${size}px`, height: `${size}px` } });
export const pill = (text, kind = '') => h('span', { class: `pill ${kind}` }, text);
export const eyebrow = (text) => h('div', { class: 'eyebrow' }, text);
export const card = (...kids) => h('section', { class: 'card' }, kids);

// A live countdown pill: the server sends the time left when something changes, and we count down from there.
let ticking = null; // { leftMs, at, el }
setInterval(() => {
  if (ticking?.el.isConnected) ticking.el.textContent = `${Math.max(0, Math.ceil((ticking.leftMs - (performance.now() - ticking.at)) / 1000))}s`;
}, 250);
export function timerPill(timer) {
  ticking = null;
  if (!timer) return null;
  if (timer.timedOut) return pill('Time’s up', 'bad');
  const el = pill(`${Math.ceil(timer.leftMs / 1000)}s`, 'live');
  ticking = { leftMs: timer.leftMs, at: performance.now(), el };
  return el;
}
