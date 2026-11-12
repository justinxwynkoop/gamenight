// The Jeopardy question editor: six categories of five clues, plus Final Jeopardy.
// The page (editor.js) handles the PIN and passes `api` for loading and saving sets.
import { h, setKids } from '../../common.js';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function blank() {
  return {
    title: '',
    categories: Array.from({ length: 6 }, () => ({
      name: '', clues: [200, 400, 600, 800, 1000].map((value) => ({ value, clue: '', answer: '' })),
    })),
    final: { category: '', clue: '', answer: '' },
  };
}

/** api: { list(), get(id), put(id, doc), del(id) } — each returns a promise and throws an Error with a readable message. */
export function mount(container, api) {
  let sets = [];
  let id = '';        // id of the set being edited ('' = brand new)
  let isNew = true;
  let doc = blank();
  let msg = null;     // {ok: bool, text}

  async function refresh() {
    try { sets = await api.list(); } catch (e) { msg = { ok: false, text: e.message }; }
    render();
  }
  async function open(setId) {
    try { doc = await api.get(setId); id = setId; isNew = false; msg = null; } catch (e) { msg = { ok: false, text: e.message }; }
    render();
  }
  async function save() {
    const sid = isNew ? slug(id || doc.title) : id;
    if (!sid) { msg = { ok: false, text: 'Give the set a title first.' }; return render(); }
    try {
      await api.put(sid, doc);
      id = sid; isNew = false; msg = { ok: true, text: `Saved “${doc.title}”.` };
      sets = await api.list();
    } catch (e) { msg = { ok: false, text: e.message }; }
    render();
  }
  async function remove() {
    if (isNew || !confirm(`Delete “${doc.title}”? This cannot be undone.`)) return;
    try { await api.del(id); doc = blank(); id = ''; isNew = true; msg = { ok: true, text: 'Deleted.' }; sets = await api.list(); } catch (e) { msg = { ok: false, text: e.message }; }
    render();
  }

function field(tag, obj, key, props = {}) {
  const el = h(tag, { ...props, value: obj[key] ?? '' });
  el.addEventListener('input', () => { obj[key] = props.type === 'number' ? Number(el.value) : el.value; });
  return el;
}

  function render() {
  const picker = h('select', { onchange: (e) => { if (e.target.value === '') { doc = blank(); id = ''; isNew = true; msg = null; render(); } else open(e.target.value); } },
    h('option', { value: '' }, '＋ New question set'), sets.map((s) => h('option', { value: s.id, selected: !isNew && s.id === id }, s.title)));
  const cats = doc.categories.map((cat, c) => h('div', { class: 'ed-cat' },
    field('input', cat, 'name', { placeholder: `Category ${c + 1}`, maxLength: 40, style: { fontWeight: '700' } }),
    cat.clues.map((cl, r) => h('div', { class: 'ed-clue' },
      h('div', { class: 'top' }, field('input', cl, 'value', { type: 'number', min: 1, step: 100 }),
        h('label', { class: 'row', style: { margin: 0, fontSize: '.8rem' } }, (() => {
          const cb = h('input', { type: 'checkbox', checked: !!cl.dailyDouble });
          cb.addEventListener('change', () => { if (cb.checked) cl.dailyDouble = true; else delete cl.dailyDouble; });
          return cb;
        })(), 'Daily Double')),
      field('textarea', cl, 'clue', { placeholder: 'Clue (what the host reads)' }),
      field('input', cl, 'answer', { placeholder: 'Answer (host only)' })))));
  setKids(container, 
    h('div', { class: 'card bar' }, h('strong', {}, 'Question sets'), picker),
    h('div', { class: 'card' },
      h('label', {}, 'Title'), field('input', doc, 'title', { maxLength: 80, placeholder: 'e.g. Holiday Trivia' }),
      isNew && [h('label', {}, 'File name (optional, letters/numbers/dashes)'), (() => {
        const el = h('input', { value: id, placeholder: 'auto from title' }); el.addEventListener('input', () => { id = el.value; }); return el;
      })()],
      h('p', { class: 'tag' }, 'Tip: leave Daily Doubles unticked and the game places one at random each time. Tick any to choose the spots yourself.')),
    h('div', { class: 'card' }, h('div', { class: 'ed-grid' }, cats)),
    h('div', { class: 'card' }, h('h2', {}, 'Final Jeopardy'),
      field('input', doc.final, 'category', { placeholder: 'Category' }),
      h('div', { style: { height: '8px' } }), field('textarea', doc.final, 'clue', { placeholder: 'Clue' }),
      h('div', { style: { height: '8px' } }), field('input', doc.final, 'answer', { placeholder: 'Answer' })),
    msg && h('div', { class: msg.ok ? 'hostans' : 'err' }, msg.text),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: save }, 'Save'),
      !isNew && h('button', { class: 'btn bad', onclick: remove }, 'Delete')));
}

  refresh();
}
