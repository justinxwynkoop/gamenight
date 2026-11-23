// The Pie Chase question editor: six categories (the colours are fixed, the names are yours), each with as many
// questions as you like. The page (editor.js) handles the PIN, the Save bar and importing; this fills the rest and hands
// back { save, remove, canDelete, dirty, label }. `api` loads and saves sets, `ui` says when something changed.
import { h, setKids } from '../../common.js';
import { field, row, btn, accordionGroup, slug } from '../../editkit.js';

const DEFAULT = ['Geography', 'Entertainment', 'History', 'Arts & Literature', 'Science & Nature', 'Sports & Leisure'];
const COLORS = ['#3b82f6', '#ec4899', '#facc15', '#a855f7', '#22c55e', '#f97316'];
const blankQ = () => ({ q: '', a: '' });
const blank = () => ({ title: '', categories: DEFAULT.map((name) => ({ name, questions: [blankQ(), blankQ(), blankQ()] })) });

/** "Question | Answer" (or a tab between them), one per line. */
export function parseLines(text) {
  const found = []; const bad = [];
  for (const line of String(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.split(/\s*\|\s*|\t+/);
    if (m.length >= 2 && m[0] && m.slice(1).join(' ').trim()) found.push({ q: m[0], a: m.slice(1).join(' ').trim() }); else bad.push(line);
  }
  return { found, bad };
}

export function mount(container, api, ui) {
  let sets = [];
  let id = '';
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
  /** What gets saved: empty rows are dropped. */
  function tidy() {
    return {
      title: doc.title.trim(),
      categories: doc.categories.map((c, i) => ({
        name: c.name.trim() || DEFAULT[i],
        questions: c.questions.filter((q) => q.q.trim() && q.a.trim()).map((q) => ({ q: q.q.trim(), a: q.a.trim() })),
      })),
    };
  }
  async function save() {
    const t = tidy();
    const empty = t.categories.find((c) => !c.questions.length);
    if (empty) return { ok: false, text: `${empty.name} needs at least one question with an answer.` };
    const sid = isNew ? slug(id || doc.title) : id;
    if (!sid) return { ok: false, text: 'Give the set a title first.' };
    await api.put(sid, t);
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

  function categoryAcc(group, c, i) {
    let item;
    const filled = () => c.questions.filter((q) => q.q.trim() && q.a.trim()).length;
    const summary = () => ({ title: c.name.trim() || DEFAULT[i], meta: `${filled()} questions`, ok: filled() > 0 });
    const after = () => item?.update(summary());
    const list = h('div', { class: 'answers' });
    const draw = () => {
      list.replaceChildren(...c.questions.map((q, n) => h('div', { class: 'ans-item' },
        h('div', { class: 'ans' },
          h('div', { class: 'rank' }, String(n + 1)),
          field('input', q, 'q', { placeholder: 'Question', maxLength: 240, autocomplete: 'off' }, () => { touch(); after(); }),
          btn('✕', () => { c.questions.splice(n, 1); if (!c.questions.length) c.questions.push(blankQ()); touch(); draw(); after(); }, { small: true, aria: 'Remove this question' })),
        h('div', { class: 'ans' }, h('div', { class: 'rank' }, '→'), field('input', q, 'a', { placeholder: 'Answer', maxLength: 160, autocomplete: 'off' }, () => { touch(); after(); })))));
    };
    const pasteBox = h('textarea', { rows: 4, placeholder: 'One per line, question | answer:\nWhat is the capital of France? | Paris' });
    const pasteOut = h('div', { class: 'tag' });
    const paste = h('div', { class: 'paste hidden' }, pasteBox,
      btn('Add these questions', () => {
        const { found, bad } = parseLines(pasteBox.value);
        c.questions = c.questions.filter((q) => q.q.trim() || q.a.trim()).concat(found);
        if (!c.questions.length) c.questions.push(blankQ());
        pasteOut.textContent = bad.length ? `Could not read: ${bad.join(' · ')}` : `Added ${found.length}.`;
        if (!bad.length) pasteBox.value = '';
        touch(); draw(); after();
      }, { small: true }), pasteOut);
    const body = h('div', { style: { display: 'contents' } },
      row('Category name', field('input', c, 'name', { maxLength: 40, placeholder: DEFAULT[i] }, () => { touch(); after(); })),
      list,
      h('div', { class: 'row-actions' },
        btn('＋ Add a question', () => { c.questions.push(blankQ()); touch(); draw(); after(); }, { small: true }),
        btn('Paste a list', () => paste.classList.toggle('hidden'), { small: true })),
      paste);
    item = group.add({ badge: h('span', { style: { display: 'inline-block', width: '14px', height: '14px', borderRadius: '4px', background: COLORS[i] } }), ...summary(), body, open: `c${i}` === openKey, onToggle: (on) => { if (on) openKey = `c${i}`; } });
    draw();
    return item.el;
  }

  function render() {
    const group = accordionGroup();
    const picker = h('select', { 'aria-label': 'Question set', onchange: (e) => { if (e.target.value === '') startNew(); else open(e.target.value); } },
      h('option', { value: '' }, '＋ New question set'), sets.map((x) => h('option', { value: x.id, selected: !isNew && x.id === id }, x.title)));
    const titleInput = field('input', doc, 'title', { maxLength: 80, placeholder: 'e.g. The Smith Family Quiz', autocomplete: 'off' }, touch);
    const setCard = h('div', { class: 'card' }, row('Question set', picker), row('Title', titleInput));
    setKids(container, setCard,
      h('div', { class: 'tag' }, 'Six categories, one per colour on the board. Write as many questions as you like in each; a game uses one at a time and does not repeat them.'),
      doc.categories.map((c, i) => categoryAcc(group, c, i)));
  }

  refresh();
  return { save, remove, canDelete: () => !isNew, dirty: () => dirty, label: () => label || (isNew ? 'New set' : `Editing ${doc.title || id}`) };
}
