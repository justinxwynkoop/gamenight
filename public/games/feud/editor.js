// The Family Feud question editor: survey questions with ranked answers (and points), plus the five Fast Money questions.
// The page (editor.js) handles the PIN and passes `api` for loading and saving sets.
import { h, setKids } from '../../common.js';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const blankQ = () => ({ question: '', answers: Array.from({ length: 5 }, () => ({ text: '', points: 10 })) });
const blank = () => ({ title: '', rounds: Array.from({ length: 5 }, blankQ), fastMoney: Array.from({ length: 5 }, blankQ) });

/** api: { list(), get(id), put(id, doc), del(id) } — each returns a promise and throws an Error with a readable message. */
export function mount(container, api) {
  let sets = [];
  let id = '';
  let isNew = true;
  let doc = blank();
  let msg = null;

  async function refresh() {
    try { sets = await api.list(); } catch (e) { msg = { ok: false, text: e.message }; }
    render();
  }
  async function open(setId) {
    try { doc = await api.get(setId); doc.fastMoney ??= null; id = setId; isNew = false; msg = null; } catch (e) { msg = { ok: false, text: e.message }; }
    render();
  }
  /** What gets saved: empty answer rows are dropped, aliases become a list, Fast Money is left out when switched off. */
  function tidy() {
    const q = (x) => ({
      question: x.question.trim(),
      answers: x.answers.filter((a) => a.text.trim()).map((a) => ({ text: a.text.trim(), points: Number(a.points), ...(a.aliasText?.trim() || a.aliases?.length ? { aliases: (a.aliasText ?? a.aliases.join(', ')).split(',').map((s) => s.trim()).filter(Boolean) } : {}) })),
    });
    return { title: doc.title.trim(), rounds: doc.rounds.map(q), ...(doc.fastMoney ? { fastMoney: doc.fastMoney.map(q) } : {}) };
  }
  async function save() {
    const sid = isNew ? slug(id || doc.title) : id;
    if (!sid) { msg = { ok: false, text: 'Give the set a title first.' }; return render(); }
    try {
      await api.put(sid, tidy());
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
    el.addEventListener('input', () => { obj[key] = props.type === 'number' ? el.value : el.value; });
    return el;
  }

  function questionCard(list, i, label, { removable = false } = {}) {
    const q = list[i];
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('strong', {}, `${label} ${i + 1}`), removable && h('button', { class: 'btn small bad', onclick: () => { list.splice(i, 1); render(); } }, 'Remove')),
      field('input', q, 'question', { placeholder: 'e.g. Name something you find in a kitchen', maxLength: 200 }),
      h('p', { class: 'tag' }, 'Answers, most popular first. Points are how many people out of 100 said it.'),
      q.answers.map((a, n) => {
        a.aliasText ??= (a.aliases ?? []).join(', ');
        return h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } },
          h('div', { style: { flex: '3' } }, field('input', a, 'text', { placeholder: `Answer ${n + 1}`, maxLength: 40 })),
          h('div', { style: { flex: '1', minWidth: '64px' } }, field('input', a, 'points', { type: 'number', min: 1, max: 100, placeholder: 'pts' })),
          h('div', { style: { flex: '3' } }, field('input', a, 'aliasText', { placeholder: 'also accept (commas)' })),
          h('button', { class: 'btn small', 'aria-label': 'Remove answer', disabled: q.answers.length <= 3, onclick: () => { q.answers.splice(n, 1); render(); } }, '✕'));
      }),
      h('div', { style: { height: '8px' } }),
      h('button', { class: 'btn small', disabled: q.answers.length >= 8, onclick: () => { q.answers.push({ text: '', points: 5 }); render(); } }, '＋ Add an answer'));
  }

  function render() {
    const picker = h('select', { onchange: (e) => { if (e.target.value === '') { doc = blank(); id = ''; isNew = true; msg = null; render(); } else open(e.target.value); } },
      h('option', { value: '' }, '＋ New question set'), sets.map((s) => h('option', { value: s.id, selected: !isNew && s.id === id }, s.title)));
    setKids(container, 
      h('div', { class: 'card bar' }, h('strong', {}, 'Question sets'), picker),
      h('div', { class: 'card' },
        h('label', {}, 'Title'), field('input', doc, 'title', { maxLength: 80, placeholder: 'e.g. Grandma’s House' }),
        isNew && [h('label', {}, 'File name (optional, letters/numbers/dashes)'), (() => {
          const el = h('input', { value: id, placeholder: 'auto from title' }); el.addEventListener('input', () => { id = el.value; }); return el;
        })()],
        h('p', { class: 'tag' }, 'A game plays 3 to 8 rounds. The last two rounds are worth double and triple points. Each question needs 3 to 8 answers.')),
      doc.rounds.map((_, i) => questionCard(doc.rounds, i, 'Round', { removable: doc.rounds.length > 3 })),
      h('div', { class: 'row' }, h('button', { class: 'btn', disabled: doc.rounds.length >= 8, onclick: () => { doc.rounds.push(blankQ()); render(); } }, '＋ Add a round')),
      h('div', { class: 'card' }, h('h2', {}, 'Fast Money'),
        h('label', { class: 'row', style: { margin: 0 } }, (() => {
          const cb = h('input', { type: 'checkbox', checked: !!doc.fastMoney });
          cb.addEventListener('change', () => { doc.fastMoney = cb.checked ? (doc.fastMoney ?? Array.from({ length: 5 }, blankQ)) : null; render(); });
          return cb;
        })(), 'This set has Fast Money (exactly 5 questions)')),
      doc.fastMoney && doc.fastMoney.map((_, i) => questionCard(doc.fastMoney, i, 'Fast Money')),
      msg && h('div', { class: msg.ok ? 'hostans' : 'err' }, msg.text),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: save }, 'Save'),
        !isNew && h('button', { class: 'btn bad', onclick: remove }, 'Delete')));
  }

  refresh();
}
