// The Family Feud question editor: survey questions with ranked answers (and points), plus the five Fast Money questions.
// The page (editor.js) handles the PIN, the Save bar and importing; this fills the rest and hands back
// { save, remove, canDelete, dirty, label }. `api` loads and saves sets, `ui` says when something changed.
import { h, setKids } from '../../common.js';
import { field, row, btn, toggleRow, accordionGroup, slug } from '../../editkit.js';
import { parseAnswerLine } from '../../importer.js';

const blankQ = () => ({ question: '', answers: Array.from({ length: 5 }, () => ({ text: '', points: 10 })) });
const blank = () => ({ title: '', rounds: Array.from({ length: 5 }, blankQ), fastMoney: Array.from({ length: 5 }, blankQ) });

/** What is wrong with one question, in plain words (empty when it is fine). */
function problems(q) {
  const out = [];
  const filled = q.answers.filter((a) => a.text.trim());
  if (!q.question.trim()) out.push('Write the question.');
  if (filled.length < 3) out.push('Needs at least 3 answers.');
  if (new Set(filled.map((a) => a.text.trim().toLowerCase())).size !== filled.length) out.push('Two answers are the same.');
  if (filled.some((a) => !(Number(a.points) >= 1 && Number(a.points) <= 100))) out.push('Points must be 1 to 100.');
  return out;
}

export function mount(container, api, ui) {
  let sets = [];
  let id = '';
  let isNew = true;
  let doc = blank();
  let dirty = false;
  let label = '';
  let openKey = 'r0';
  const touch = () => { dirty = true; ui.changed(); };

  async function refresh() {
    try { sets = await api.list(); } catch (e) { ui.toast(e.message, 'bad'); }
    render();
  }
  async function open(setId) {
    if (dirty && !confirm('Discard your unsaved changes?')) { render(); return; }
    try { doc = await api.get(setId); doc.fastMoney ??= null; id = setId; isNew = false; dirty = false; openKey = 'r0'; label = ''; } catch (e) { ui.toast(e.message, 'bad'); }
    render(); ui.changed();
  }
  function startNew() {
    if (dirty && !confirm('Discard your unsaved changes?')) { render(); return; }
    doc = blank(); id = ''; isNew = true; dirty = false; openKey = 'r0'; label = ''; render(); ui.changed();
  }
  /** What gets saved: empty answer rows are dropped, aliases become a list, Fast Money is left out when switched off. */
  function tidy() {
    const q = (x) => ({
      question: x.question.trim(),
      answers: x.answers.filter((a) => a.text.trim()).map((a) => ({
        text: a.text.trim(), points: Number(a.points),
        ...(a.aliasText?.trim() ? { aliases: a.aliasText.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
      })),
    });
    return { title: doc.title.trim(), rounds: doc.rounds.map(q), ...(doc.fastMoney ? { fastMoney: doc.fastMoney.map(q) } : {}) };
  }
  async function save() {
    const sid = isNew ? slug(id || doc.title) : id;
    if (!sid) return { ok: false, text: 'Give the set a title first.' };
    await api.put(sid, tidy());
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

  // ---------- one answer ----------
  function answerRow(q, a, n, redraw, after) {
    a.aliasText ??= (a.aliases ?? []).join(', ');
    const alt = h('div', { class: `ans-alt ${a.aliasText.trim() ? '' : 'hidden'}` },
      field('input', a, 'aliasText', { placeholder: 'Also accept (other words, separated by commas)' }, () => { touch(); }));
    return h('div', { class: 'ans-item' },
      h('div', { class: 'ans' },
        h('div', { class: 'rank' }, String(n + 1)),
        field('input', a, 'text', { placeholder: `Answer ${n + 1}`, maxLength: 40, autocomplete: 'off' }, () => { touch(); after(); }),
        field('input', a, 'points', { type: 'number', inputMode: 'numeric', min: 1, max: 100, placeholder: 'pts', 'aria-label': 'Points' }, () => { touch(); after(); }),
        btn('alt', () => alt.classList.toggle('hidden'), { small: true, aria: 'Other words to accept' }),
        btn('✕', () => { q.answers.splice(n, 1); touch(); redraw(); after(); }, { small: true, aria: 'Remove this answer', disabled: q.answers.length <= 3 })),
      alt);
  }

  // ---------- one question (a round, or a Fast Money question) ----------
  function questionAcc(group, list, i, name, key, removable) {
    const q = list[i];
    let item;
    const summary = () => {
      const filled = q.answers.filter((a) => a.text.trim()).length;
      return { title: q.question.trim(), meta: `${filled} answers`, ok: problems(q).length === 0 };
    };
    const after = () => item?.update(summary());
    const answers = h('div', { class: 'answers' });
    const hint = h('div', { class: 'tag' });
    const draw = () => {
      answers.replaceChildren(...q.answers.map((a, n) => answerRow(q, a, n, draw, after)));
      const p = problems(q);
      hint.textContent = p.length ? p.join(' ') : 'Most popular answer first. Points are how many people out of 100 said it.';
    };
    const pasteBox = h('textarea', { rows: 4, placeholder: 'One answer per line:\nSpoon - 30\nFork - 25 | forks, silverware' });
    const pasteOut = h('div', { class: 'tag' });
    const paste = h('div', { class: 'paste hidden' }, pasteBox,
      btn('Add these answers', () => {
        const lines = pasteBox.value.split('\n').map((l) => l.trim()).filter(Boolean);
        const bad = []; const found = [];
        for (const l of lines) { const a = parseAnswerLine(l); if (a) found.push(a); else bad.push(l); }
        q.answers = q.answers.filter((a) => a.text.trim());
        for (const a of found) if (q.answers.length < 8) q.answers.push({ text: a.text, points: a.points, aliasText: (a.aliases ?? []).join(', ') });
        while (q.answers.length < 3) q.answers.push({ text: '', points: 10 });
        pasteOut.textContent = bad.length ? `Could not read: ${bad.join(' · ')}` : `Added ${found.length}.`;
        if (!bad.length) pasteBox.value = '';
        touch(); draw(); after();
      }, { small: true }), pasteOut);
    const body = h('div', { style: { display: 'contents' } },
      row('Question', field('textarea', q, 'question', { rows: 2, placeholder: 'e.g. Name something you find in a kitchen', maxLength: 200 }, () => { touch(); after(); })),
      answers, hint,
      h('div', { class: 'row-actions' },
        btn('＋ Add answer', () => { if (q.answers.length < 8) { q.answers.push({ text: '', points: 5 }); touch(); draw(); after(); } }, { small: true }),
        btn('Sort by points', () => { q.answers.sort((x, y) => Number(y.points) - Number(x.points)); touch(); draw(); }, { small: true }),
        btn('Paste a list', () => paste.classList.toggle('hidden'), { small: true }),
        removable && btn('Remove', () => { if (confirm(`Remove ${name} ${i + 1}?`)) { list.splice(i, 1); touch(); openKey = 'r0'; render(); } }, { small: true, kind: 'bad' })),
      paste);
    item = group.add({ badge: String(i + 1), ...summary(), placeholder: 'Tap to write the question', body, open: key === openKey, onToggle: (on) => { if (on) openKey = key; } });
    draw();
    return item.el;
  }

  // ---------- the whole page ----------
  function render() {
    const group = accordionGroup();
    const picker = h('select', { 'aria-label': 'Question set', onchange: (e) => { if (e.target.value === '') startNew(); else open(e.target.value); } },
      h('option', { value: '' }, '＋ New question set'), sets.map((s) => h('option', { value: s.id, selected: !isNew && s.id === id }, s.title)));
    const titleInput = field('input', doc, 'title', { maxLength: 80, placeholder: 'e.g. Grandma’s House', autocomplete: 'off' }, touch);
    const fileName = isNew && h('details', {}, h('summary', { class: 'tag', style: { cursor: 'pointer' } }, 'File name (optional)'),
      (() => { const el = h('input', { value: id, placeholder: 'auto from the title', style: { marginTop: '8px' } }); el.addEventListener('input', () => { id = el.value; touch(); }); return el; })());
    const setCard = h('div', { class: 'card' }, row('Question set', picker), row('Title', titleInput), fileName);

    const rounds = doc.rounds.map((_, i) => questionAcc(group, doc.rounds, i, 'Round', `r${i}`, doc.rounds.length > 3));
    const addRound = btn('＋ Add a round', () => { doc.rounds.push(blankQ()); openKey = `r${doc.rounds.length - 1}`; touch(); render(); }, { disabled: doc.rounds.length >= 8 });

    const fm = h('div', { class: 'card' },
      toggleRow('Fast Money', 'Exactly 5 questions at the end of the game', !!doc.fastMoney, (on) => { doc.fastMoney = on ? (doc.fastMoney ?? Array.from({ length: 5 }, blankQ)) : null; touch(); render(); }));
    const fmItems = doc.fastMoney ? doc.fastMoney.map((_, i) => questionAcc(group, doc.fastMoney, i, 'Fast Money', `f${i}`, false)) : [];

    setKids(container, setCard,
      h('div', { class: 'tag' }, `Rounds · a game plays 3 to 8; the last two are worth double and triple points.`),
      rounds, addRound, fm, fmItems);
  }

  refresh();
  return { save, remove, canDelete: () => !isNew, dirty: () => dirty, label: () => label || (isNew ? 'New set' : `Editing ${doc.title || id}`) };
}
