// The Jeopardy question editor: six categories of five clues, plus Final Jeopardy.
// The page (editor.js) handles the PIN, the Save bar and importing; this fills the rest and hands back
// { save, remove, canDelete, dirty, label }. `api` loads and saves sets, `ui` says when something changed.
import { h, setKids } from '../../common.js';
import { field, row, btn, accordionGroup, slug } from '../../editkit.js';

function blank() {
  return {
    title: '',
    categories: Array.from({ length: 6 }, () => ({
      name: '', clues: [200, 400, 600, 800, 1000].map((value) => ({ value, clue: '', answer: '' })),
    })),
    final: { category: '', clue: '', answer: '' },
  };
}

export function mount(container, api, ui) {
  let sets = [];
  let id = '';        // id of the set being edited ('' = brand new)
  let isNew = true;
  let doc = blank();
  let dirty = false;
  let label = '';
  let openKey = 'c0';
  const touch = () => { dirty = true; ui.changed(); };

  async function refresh() {
    try { sets = await api.list(); } catch (e) { ui.toast(e.message, 'bad'); }
    render();
  }
  async function open(setId) {
    if (dirty && !confirm('Discard your unsaved changes?')) { render(); return; }
    try { doc = await api.get(setId); id = setId; isNew = false; dirty = false; openKey = 'c0'; label = ''; } catch (e) { ui.toast(e.message, 'bad'); }
    render(); ui.changed();
  }
  function startNew() {
    if (dirty && !confirm('Discard your unsaved changes?')) { render(); return; }
    doc = blank(); id = ''; isNew = true; dirty = false; openKey = 'c0'; label = ''; render(); ui.changed();
  }
  async function save() {
    const sid = isNew ? slug(id || doc.title) : id;
    if (!sid) return { ok: false, text: 'Give the set a title first.' };
    await api.put(sid, doc);
    id = sid; isNew = false; dirty = false; label = `Saved “${doc.title}”`;
    sets = await api.list(); render();
    return { ok: true, text: `Saved “${doc.title}”.` };
  }
  async function remove() {
    if (isNew || !confirm(`Delete “${doc.title}”? This cannot be undone.`)) return null;
    await api.del(id);
    doc = blank(); id = ''; isNew = true; dirty = false; label = '';
    sets = await api.list(); render();
    return { ok: true, text: 'Deleted.' };
  }

  // ---------- one category ----------
  function categoryAcc(group, cat, c) {
    let item;
    const summary = () => {
      const done = cat.clues.filter((x) => x.clue.trim() && x.answer.trim()).length;
      return { title: cat.name.trim(), meta: `${done}/${cat.clues.length}`, ok: !!cat.name.trim() && done === cat.clues.length };
    };
    const after = () => item?.update(summary());
    const clues = cat.clues.map((cl, r) => {
      const dd = h('button', { type: 'button', class: 'dd', 'aria-pressed': String(!!cl.dailyDouble), 'aria-label': 'Daily Double' }, '★ Daily Double');
      dd.addEventListener('click', () => {
        if (cl.dailyDouble) delete cl.dailyDouble; else cl.dailyDouble = true;
        dd.setAttribute('aria-pressed', String(!!cl.dailyDouble)); touch();
      });
      return h('div', { class: 'clue' },
        h('div', { class: 'clue-top' }, field('input', cl, 'value', { type: 'number', inputMode: 'numeric', min: 1, step: 100, 'aria-label': 'Value' }, touch), h('div', { class: 'grow' }), dd),
        field('textarea', cl, 'clue', { rows: 2, placeholder: 'Clue (what the host reads)' }, () => { touch(); after(); }),
        field('input', cl, 'answer', { placeholder: 'Answer (only the host sees it)', autocomplete: 'off' }, () => { touch(); after(); }));
    });
    const body = h('div', { style: { display: 'contents' } },
      row('Category name', field('input', cat, 'name', { maxLength: 40, placeholder: `Category ${c + 1}`, autocomplete: 'off' }, () => { touch(); after(); })),
      clues);
    item = group.add({ badge: String(c + 1), ...summary(), placeholder: 'Tap to name the category', body, open: openKey === `c${c}`, onToggle: (on) => { if (on) openKey = `c${c}`; } });
    return item.el;
  }

  function finalAcc(group) {
    let item;
    const f = doc.final;
    const summary = () => ({ title: f.category.trim(), meta: 'Final', ok: !!(f.category.trim() && f.clue.trim() && f.answer.trim()) });
    const after = () => item?.update(summary());
    const body = h('div', { style: { display: 'contents' } },
      row('Category', field('input', f, 'category', { placeholder: 'Category', autocomplete: 'off' }, () => { touch(); after(); })),
      row('Clue', field('textarea', f, 'clue', { rows: 3, placeholder: 'The final clue' }, () => { touch(); after(); })),
      row('Answer', field('input', f, 'answer', { placeholder: 'The answer', autocomplete: 'off' }, () => { touch(); after(); })));
    item = group.add({ badge: '★', ...summary(), placeholder: 'Final Jeopardy', body, open: openKey === 'final', onToggle: (on) => { if (on) openKey = 'final'; } });
    return item.el;
  }

  // ---------- the whole page ----------
  function render() {
    const group = accordionGroup();
    const picker = h('select', { 'aria-label': 'Question set', onchange: (e) => { if (e.target.value === '') startNew(); else open(e.target.value); } },
      h('option', { value: '' }, '＋ New question set'), sets.map((s) => h('option', { value: s.id, selected: !isNew && s.id === id }, s.title)));
    const fileName = isNew && h('details', {}, h('summary', { class: 'tag', style: { cursor: 'pointer' } }, 'File name (optional)'),
      (() => { const el = h('input', { value: id, placeholder: 'auto from the title', style: { marginTop: '8px' } }); el.addEventListener('input', () => { id = el.value; touch(); }); return el; })());
    const setCard = h('div', { class: 'card' }, row('Question set', picker),
      row('Title', field('input', doc, 'title', { maxLength: 80, placeholder: 'e.g. Holiday Trivia', autocomplete: 'off' }, touch)), fileName,
      h('div', { class: 'tag' }, 'Leave Daily Doubles unmarked and the game places one at random each time. Mark any to choose the spots yourself.'));
    setKids(container, setCard, doc.categories.map((cat, c) => categoryAcc(group, cat, c)), finalAcc(group));
  }

  refresh();
  return { save, remove, canDelete: () => !isNew, dirty: () => dirty, label: () => label || (isNew ? 'New set' : `Editing ${doc.title || id}`) };
}
