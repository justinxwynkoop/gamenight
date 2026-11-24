// The Guys vs Gals question editor. A set has two halves: Guy stuff (read by the Guys, answered by the Gals) and Gal
// stuff (read by the Gals, answered by the Guys). Each half has the five decks:
//   Our Facts, Our Stuff   a question and its answer (and a category, if you like)
//   Our Pics               a picture (one of ours, or a web address), a question about it, and its answer
//   Our Lives              a question about the reader, and three answers, A, B and C
//   Our Moves              something to act out
// Only Our Facts or Our Stuff is needed; a deck left empty is played as Our Facts. The page (editor.js) handles the
// PIN, the Save bar and importing.
import { h, setKids } from '../../common.js';
import { field, row, btn, accordionGroup, slug } from '../../editkit.js';
import { PICS, picUrl } from './shared.js';

const HALVES = [
  { key: 'guyStuff', title: 'Guy stuff', who: 'the Guys read, the Gals answer', color: '#3b8bff' },
  { key: 'galStuff', title: 'Gal stuff', who: 'the Gals read, the Guys answer', color: '#ff4fa3' },
];
const DECKS = [
  { key: 'facts', name: 'Our Facts', color: '#9b5cff', blank: () => ({ cat: '', q: '', a: '' }) },
  { key: 'stuff', name: 'Our Stuff', color: '#ffd23f', blank: () => ({ cat: '', q: '', a: '' }) },
  { key: 'pics', name: 'Our Pics', color: '#ff8a3d', blank: () => ({ img: '', q: '', a: '' }) },
  { key: 'lives', name: 'Our Lives', color: '#2ec5ff', blank: () => ({ q: '', choices: ['', '', ''] }) },
  { key: 'moves', name: 'Our Moves', color: '#ff3b5c', blank: () => ({ m: '' }) },
];
const t = (s) => String(s ?? '').trim();
const filledOf = (deck, x) => {
  if (deck === 'moves') return !!t(x.m);
  if (deck === 'lives') return !!t(x.q) && x.choices.every((c) => t(c));
  return !!t(x.q) && !!t(x.a) && (deck !== 'pics' || !!t(x.img));
};
const blankHalf = () => Object.fromEntries(DECKS.map((d) => [d.key, d.key === 'facts' ? [d.blank(), d.blank()] : []]));
const blank = () => ({ title: '', guyStuff: blankHalf(), galStuff: blankHalf() });

/** Pasting a list, one per line, the parts split with | (or a tab). */
export function parseCards(deck, text) {
  const found = []; const bad = [];
  for (const line of String(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.split(/\s*\|\s*|\t+/).map((x) => x.trim());
    if (deck === 'moves') found.push({ m: m[0] });
    else if (deck === 'lives') { if (m.length >= 4 && m.slice(0, 4).every(Boolean)) found.push({ q: m[0], choices: m.slice(1, 4) }); else bad.push(line); }
    else if (deck === 'pics') { if (m.length >= 3 && m.slice(0, 3).every(Boolean)) found.push({ img: m[0], q: m[1], a: m[2] }); else bad.push(line); }
    else if (m.length >= 2 && m[0] && m[1]) found.push({ cat: m[2] ?? '', q: m[0], a: m[1] }); else bad.push(line);
  }
  return { found, bad };
}
const PASTE_HINT = {
  facts: 'One per line: question | answer | category (optional)\nHow many points is a touchdown? | 6 | Sports',
  stuff: 'One per line: question | answer | category (optional)\nWhat is a stiletto? | A shoe with a tall, thin heel',
  pics: 'One per line: picture | question | answer\nwrench | What is this tool called? | A wrench',
  lives: 'One per line: question | A | B | C\nMy dream car is: | A truck | A sports car | Anything cheap',
  moves: 'One per line: something to act out\nChanging a flat tire',
};

export function mount(container, api, ui) {
  let sets = [];
  let id = '';
  let isNew = true;
  let doc = blank();
  let dirty = false;
  let label = '';
  let openKey = 'guyStuff:facts';
  const touch = () => { dirty = true; ui.changed(); };

  /** A set from the file, with room to type. */
  const loaded = (d) => {
    const half = (x) => ({
      facts: (x?.facts ?? []).map((q) => ({ cat: q.cat ?? '', q: q.q ?? '', a: q.a ?? '' })),
      stuff: (x?.stuff ?? []).map((q) => ({ cat: q.cat ?? '', q: q.q ?? '', a: q.a ?? '' })),
      pics: (x?.pics ?? []).map((q) => ({ img: q.img ?? '', q: q.q ?? '', a: q.a ?? '' })),
      lives: (x?.lives ?? []).map((q) => ({ q: q.q ?? '', choices: [...(q.choices ?? []), '', '', ''].slice(0, 3) })),
      moves: (x?.moves ?? []).map((q) => ({ m: q.m ?? '' })),
    });
    return { ...d, title: d.title ?? '', guyStuff: half(d.guyStuff), galStuff: half(d.galStuff) };
  };

  async function refresh() {
    try { sets = await api.list(); } catch (e) { ui.toast(e.message, 'bad'); }
    render();
  }
  async function open(setId) {
    if (dirty && !confirm('Discard your unsaved changes?')) { render(); return; }
    try { doc = loaded(await api.get(setId)); id = setId; isNew = false; dirty = false; label = ''; } catch (e) { ui.toast(e.message, 'bad'); }
    render(); ui.changed();
  }
  function startNew() {
    if (dirty && !confirm('Discard your unsaved changes?')) { render(); return; }
    doc = blank(); id = ''; isNew = true; dirty = false; label = ''; render(); ui.changed();
  }
  function tidy() {
    const half = (x) => ({
      facts: x.facts.filter((q) => filledOf('facts', q)).map((q) => ({ ...(t(q.cat) ? { cat: t(q.cat) } : {}), q: t(q.q), a: t(q.a) })),
      stuff: x.stuff.filter((q) => filledOf('stuff', q)).map((q) => ({ ...(t(q.cat) ? { cat: t(q.cat) } : {}), q: t(q.q), a: t(q.a) })),
      pics: x.pics.filter((q) => filledOf('pics', q)).map((q) => ({ img: t(q.img), q: t(q.q), a: t(q.a) })),
      lives: x.lives.filter((q) => filledOf('lives', q)).map((q) => ({ q: t(q.q), choices: q.choices.map(t) })),
      moves: x.moves.filter((q) => filledOf('moves', q)).map((q) => ({ m: t(q.m) })),
    });
    return { title: t(doc.title), ...(doc.about ? { about: doc.about } : {}), guyStuff: half(doc.guyStuff), galStuff: half(doc.galStuff) };
  }
  async function save() {
    const out = tidy();
    for (const hf of HALVES) if (!out[hf.key].facts.length && !out[hf.key].stuff.length) return { ok: false, text: `${hf.title} needs at least one Our Facts or Our Stuff question with its answer.` };
    const sid = isNew ? slug(id || doc.title) : id;
    if (!sid) return { ok: false, text: 'Give the set a title first.' };
    await api.put(sid, out);
    id = sid; isNew = false; dirty = false; label = `Saved “${doc.title}”`;
    sets = await api.list();
    render();
    return { ok: true, text: `Saved “${doc.title}”.` };
  }
  async function remove() {
    if (isNew || !confirm(`Delete “${doc.title}”? This cannot be undone.`)) return null;
    await api.del(id);
    doc = blank(); id = ''; isNew = true; dirty = false; label = '';
    sets = await api.list(); render();
    return { ok: true, text: 'Deleted.' };
  }

  function pasteBox(deck, add) {
    const box = h('textarea', { rows: 4, placeholder: PASTE_HINT[deck] });
    const out = h('div', { class: 'tag' });
    return h('div', { class: 'paste hidden' }, box,
      btn('Add these', () => {
        const { found, bad } = parseCards(deck, box.value);
        add(found);
        out.textContent = bad.length ? `Could not read: ${bad.join(' · ')}` : `Added ${found.length}.`;
        if (!bad.length) box.value = '';
      }, { small: true }), out);
  }

  const input = (obj, key, placeholder, after, max = 240) => field('input', obj, key, { placeholder, maxLength: max, autocomplete: 'off' }, () => { touch(); after(); });

  /** The boxes for one card. */
  function cardFields(deck, x, after) {
    if (deck === 'moves') return [input(x, 'm', 'Something to act out, e.g. Changing a flat tire', after, 120)];
    if (deck === 'lives') {
      return [input(x, 'q', 'A question about the reader, e.g. My dream car is:', after),
        ['A', 'B', 'C'].map((l, i) => h('div', { class: 'ans' }, h('div', { class: 'rank' }, l), input(x.choices, String(i), `Answer ${l}`, after, 120)))];
    }
    const parts = [];
    if (deck === 'pics') {
      const preview = h('img', { src: x.img ? picUrl(x.img) : '', alt: '', style: { width: '48px', height: '48px', objectFit: 'contain', visibility: x.img ? 'visible' : 'hidden' } });
      const pick = field('input', x, 'img', { placeholder: 'Picture: one of ours (e.g. wrench) or a web address', maxLength: 400, autocomplete: 'off', list: 'gv-pics' }, () => {
        touch(); after(); preview.src = x.img ? picUrl(x.img) : ''; preview.style.visibility = x.img ? 'visible' : 'hidden';
      });
      parts.push(h('div', { class: 'ans' }, preview, pick));
    }
    parts.push(input(x, 'q', 'Question', after));
    parts.push(h('div', { class: 'ans' }, h('div', { class: 'rank' }, '✓'), input(x, 'a', 'Answer', after, 120)));
    if (deck !== 'pics') parts.push(h('div', { class: 'ans' }, h('div', { class: 'rank' }, '#'), field('input', x, 'cat', { placeholder: 'Category (optional), e.g. Sports', maxLength: 40, autocomplete: 'off' }, touch)));
    return parts;
  }

  function deckAcc(group, hf, d) {
    const half = doc[hf.key];
    let item;
    const filled = () => half[d.key].filter((x) => filledOf(d.key, x)).length;
    const summary = () => ({ title: `${hf.title}: ${d.name}`, meta: `${filled()} · ${hf.who}`, ok: d.key === 'facts' || d.key === 'stuff' ? filled() > 0 || half.facts.concat(half.stuff).some((x) => filledOf('facts', x)) : true });
    const after = () => item?.update(summary());
    const list = h('div', { class: 'answers' });
    const draw = () => {
      list.replaceChildren(...half[d.key].map((x, n) => h('div', { class: 'ans-item' },
        h('div', { class: 'ans' }, h('div', { class: 'rank' }, String(n + 1)), h('div', { class: 'grow' }),
          btn('✕', () => { half[d.key].splice(n, 1); touch(); draw(); after(); }, { small: true, aria: 'Remove this card' })),
        cardFields(d.key, x, after))));
    };
    const paste = pasteBox(d.key, (found) => {
      half[d.key] = half[d.key].filter((x) => filledOf(d.key, x)).concat(found);
      touch(); draw(); after();
    });
    const body = h('div', { style: { display: 'contents' } }, list,
      h('div', { class: 'row-actions' },
        btn('＋ Add a card', () => { half[d.key].push(d.blank()); touch(); draw(); after(); }, { small: true }),
        btn('Paste a list', () => paste.classList.toggle('hidden'), { small: true })),
      paste);
    const key = `${hf.key}:${d.key}`;
    item = group.add({ badge: h('span', { style: { display: 'inline-block', width: '14px', height: '14px', borderRadius: '4px', background: d.color, border: `3px solid ${hf.color}` } }), ...summary(), body, open: openKey === key, onToggle: (on) => { if (on) openKey = key; } });
    draw();
    return item.el;
  }

  function render() {
    const group = accordionGroup();
    const picker = h('select', { 'aria-label': 'Question set', onchange: (e) => { if (e.target.value === '') startNew(); else open(e.target.value); } },
      h('option', { value: '' }, '＋ New question set'), sets.map((x) => h('option', { value: x.id, selected: !isNew && x.id === id }, x.title)));
    const titleInput = field('input', doc, 'title', { maxLength: 80, placeholder: 'e.g. The Smith Family Battle', autocomplete: 'off' }, touch);
    setKids(container, h('div', { class: 'card' }, row('Question set', picker), row('Title', titleInput)),
      h('datalist', { id: 'gv-pics' }, PICS.map((p) => h('option', { value: p }))),
      h('div', { class: 'tag' }, 'Guy stuff is read by the Guys to the Gals; gal stuff is read by the Gals to the Guys. Every half has the five decks. Our Facts or Our Stuff is a must; an empty deck is played as Our Facts. Our Lives cards are about the reader: they secretly pick A, B or C. Our Moves cards are charades.'),
      HALVES.map((hf) => DECKS.map((d) => deckAcc(group, hf, d))));
  }

  refresh();
  return { save, remove, canDelete: () => !isNew, dirty: () => dirty, label: () => label || (isNew ? 'New set' : `Editing ${doc.title || id}`) };
}
