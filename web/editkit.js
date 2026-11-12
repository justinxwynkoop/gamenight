// Small building blocks for the question editors (Family Feud and Jeopardy): fields wired to a document, and
// collapsible sections so a long set is easy to move around in on a phone.
import { h } from './common.js';
import { icon } from './ui.js';

export const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const grow = (el) => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`; };

/** An input or textarea that writes to obj[key] as you type. `after` runs on every edit (mark unsaved, refresh headers). */
export function field(tag, obj, key, props = {}, after = () => {}) {
  const el = h(tag, { ...props, value: obj[key] ?? '' });
  el.addEventListener('input', () => {
    obj[key] = props.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    if (tag === 'textarea') grow(el);
    after(el);
  });
  if (tag === 'textarea') requestAnimationFrame(() => grow(el));
  return el;
}

/** A labelled form row. */
export const row = (label, control, hint) => h('label', { class: 'fld' }, h('span', { class: 'fld-l' }, label), control, hint && h('span', { class: 'fld-h' }, hint));

/** A button. kind: primary | ghost | bad | '' ; small makes it compact. */
export function btn(label, onclick, { kind = '', small = false, iconName, disabled = false, aria } = {}) {
  return h('button', { type: 'button', class: ['btn', kind && `btn-${kind}`, small && 'btn-sm'].filter(Boolean).join(' '), onclick, disabled, 'aria-label': aria },
    iconName && icon(iconName, small ? 16 : 18), label != null && label !== '' && h('span', {}, label));
}

/** A switch (checkbox shown as a toggle). */
export function toggleRow(label, sub, checked, onchange) {
  return h('label', { class: 'switch' },
    h('div', { class: 'grow' }, h('div', { class: 't' }, label), sub && h('div', { class: 's' }, sub)),
    h('input', { type: 'checkbox', checked: !!checked, onchange: (e) => onchange(e.target.checked) }), h('span', { class: 'track' }));
}

/**
 * A group of collapsible sections where only one is open at a time.
 * group.add({ badge, title, meta, ok, body }) returns { el, update({ title, meta, ok }) }.
 */
export function accordionGroup() {
  const items = [];
  let openIndex = -1;
  return {
    get openIndex() { return openIndex; },
    add({ badge, title, placeholder = '', meta, ok = true, body, open = false, onToggle = () => {} }) {
      const badgeEl = h('span', { class: 'acc-badge' }, badge);
      const titleEl = h('span', { class: 'acc-title' }, title);
      const metaEl = h('span', { class: 'acc-meta' }, meta);
      const state = h('span', { class: 'acc-state' });
      const head = h('button', { type: 'button', class: 'acc-head', 'aria-expanded': String(open) }, badgeEl, titleEl, metaEl, state, h('span', { class: 'acc-chev' }, icon('chevron', 18)));
      const bodyEl = h('div', { class: 'acc-body' }, body);
      const el = h('section', { class: `acc ${open ? 'open' : ''}` }, head, bodyEl);
      const item = {
        el,
        setOpen(on) { el.classList.toggle('open', on); head.setAttribute('aria-expanded', String(on)); },
        update({ title: t, meta: m, ok: good = true }) {
          titleEl.textContent = t || placeholder; titleEl.classList.toggle('empty', !t);
          metaEl.textContent = m ?? '';
          state.replaceChildren(good ? icon('check', 16) : icon('flag', 16));
          state.className = `acc-state ${good ? 'good' : 'warn'}`;
        },
      };
      item.update({ title, meta, ok });
      head.addEventListener('click', () => {
        const idx = items.indexOf(item);
        const willOpen = !el.classList.contains('open');
        items.forEach((it) => it.setOpen(false));
        openIndex = willOpen ? idx : -1;
        item.setOpen(willOpen);
        onToggle(willOpen);
        if (willOpen) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      });
      items.push(item);
      if (open) openIndex = items.length - 1;
      return item;
    },
  };
}
