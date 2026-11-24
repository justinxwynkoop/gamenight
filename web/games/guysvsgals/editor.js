// The Guys vs Gals question editor. A set has two halves: Guy stuff (the Gals answer it) and Gal stuff (the Guys answer
// it). Each has multiple-choice questions (the right answer and up to three wrong ones; the game shuffles them) and
// true-or-false statements for the Lightning Rounds. The page (editor.js) handles the PIN, the Save bar and importing.
import { h, setKids } from '../../common.js';
import { field, row, btn, accordionGroup, slug } from '../../editkit.js';

const HALVES = [
  { key: 'guyStuff', title: 'Guy stuff', who: 'the Gals answer these', color: '#3b8bff' },
  { key: 'galStuff', title: 'Gal stuff', who: 'the Guys answer these', color: '#ff4fa3' },
];
const blankQ = () => ({ cat: '', q: '', a: '', wrong: ['', '', ''] });
const blankS = () => ({ q: '', a: true });
const blank = () => ({ title: '', guyStuff: { questions: [blankQ(), blankQ()], lightning: [blankS()] }, galStuff: { questions: [blankQ(), blankQ()], lightning: [blankS()] } });

/** "Question | right answer | wrong | wrong | wrong", one per line (a tab works too). */
export function parseQuestions(text) {
  const found = []; const bad = [];
  for (const line of String(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.split(/\s*\|\s*|\t+/).map((x) => x.trim());
    if (m.length >= 3 && m[0] && m[1] && m[2]) found.push({ cat: '', q: m[0], a: m[1], wrong: [m[2], m[3] ?? '', m[4] ?? ''] }); else bad.push(line);
  }
  return { found, bad };
}
/** "Statement | true" (or false, yes, no, t, f), one per line. */
export function parseStatements(text) {
  const found = []; const bad = [];
  for (const line of String(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.split(/\s*\|\s*|\t+/).map((x) => x.trim());
    const v = (m[1] ?? '').toLowerCase();
    if (m[0] && ['true', 'false', 't', 'f', 'yes', 'no'].includes(v)) found.push({ q: m[0], a: ['true', 't', 'yes'].includes(v) }); else bad.push(line);
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
  let openKey = 'guyStuff:q';
  const touch = () => { dirty = true; ui.changed(); };

  /** A set from the file, with room to type: three wrong-answer boxes on every question. */
  const loaded = (d) => {
    const half = (x) => ({
      questions: (x?.questions ?? []).map((q) => ({ cat: q.cat ?? '', q: q.q ?? '', a: q.a ?? '', wrong: [...(q.wrong ?? []), '', '', ''].slice(0, 3) })),
      lightning: (x?.lightning ?? []).map((s) => ({ q: s.q ?? '', a: s.a === true })),
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
      questions: x.questions.filter((q) => q.q.trim() && q.a.trim() && q.wrong.some((w) => w.trim()))
        .map((q) => ({ ...(q.cat.trim() ? { cat: q.cat.trim() } : {}), q: q.q.trim(), a: q.a.trim(), wrong: q.wrong.map((w) => w.trim()).filter(Boolean) })),
      lightning: x.lightning.filter((s) => s.q.trim()).map((s) => ({ q: s.q.trim(), a: !!s.a })),
    });
    return { title: doc.title.trim(), ...(doc.about ? { about: doc.about } : {}), guyStuff: half(doc.guyStuff), galStuff: half(doc.galStuff) };
  }
  async function save() {
    const t = tidy();
    for (const hf of HALVES) if (!t[hf.key].questions.length) return { ok: false, text: `${hf.title} needs at least one question with a right and a wrong answer.` };
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

  function pasteBox(placeholder, parse, add) {
    const box = h('textarea', { rows: 4, placeholder });
    const out = h('div', { class: 'tag' });
    const wrap = h('div', { class: 'paste hidden' }, box,
      btn('Add these', () => {
        const { found, bad } = parse(box.value);
        add(found);
        out.textContent = bad.length ? `Could not read: ${bad.join(' · ')}` : `Added ${found.length}.`;
        if (!bad.length) box.value = '';
      }, { small: true }), out);
    return wrap;
  }

  function questionsAcc(group, hf) {
    const half = doc[hf.key];
    let item;
    const filled = () => half.questions.filter((q) => q.q.trim() && q.a.trim() && q.wrong.some((w) => w.trim())).length;
    const summary = () => ({ title: `${hf.title}: questions`, meta: `${filled()} · ${hf.who}`, ok: filled() > 0 });
    const after = () => item?.update(summary());
    const list = h('div', { class: 'answers' });
    const draw = () => {
      list.replaceChildren(...half.questions.map((q, n) => h('div', { class: 'ans-item' },
        h('div', { class: 'ans' }, h('div', { class: 'rank' }, String(n + 1)),
          field('input', q, 'q', { placeholder: 'Question', maxLength: 240, autocomplete: 'off' }, () => { touch(); after(); }),
          btn('✕', () => { half.questions.splice(n, 1); if (!half.questions.length) half.questions.push(blankQ()); touch(); draw(); after(); }, { small: true, aria: 'Remove this question' })),
        h('div', { class: 'ans' }, h('div', { class: 'rank' }, '✓'), field('input', q, 'a', { placeholder: 'Right answer', maxLength: 120, autocomplete: 'off' }, () => { touch(); after(); })),
        [0, 1, 2].map((w) => h('div', { class: 'ans' }, h('div', { class: 'rank' }, '✗'), field('input', q.wrong, String(w), { placeholder: w ? 'Another wrong answer (optional)' : 'Wrong answer', maxLength: 120, autocomplete: 'off' }, () => { touch(); after(); }))),
        h('div', { class: 'ans' }, h('div', { class: 'rank' }, '#'), field('input', q, 'cat', { placeholder: 'Category (optional), e.g. Sports', maxLength: 40, autocomplete: 'off' }, touch)))));
    };
    const paste = pasteBox('One per line: question | right | wrong | wrong | wrong\nWhat is mascara for? | Eyelashes | Lips | Nails', parseQuestions, (found) => {
      half.questions = half.questions.filter((q) => q.q.trim() || q.a.trim()).concat(found);
      if (!half.questions.length) half.questions.push(blankQ());
      touch(); draw(); after();
    });
    const body = h('div', { style: { display: 'contents' } }, list,
      h('div', { class: 'row-actions' },
        btn('＋ Add a question', () => { half.questions.push(blankQ()); touch(); draw(); after(); }, { small: true }),
        btn('Paste a list', () => paste.classList.toggle('hidden'), { small: true })),
      paste);
    const key = `${hf.key}:q`;
    item = group.add({ badge: h('span', { style: { display: 'inline-block', width: '14px', height: '14px', borderRadius: '4px', background: hf.color } }), ...summary(), body, open: openKey === key, onToggle: (on) => { if (on) openKey = key; } });
    draw();
    return item.el;
  }

  function lightningAcc(group, hf) {
    const half = doc[hf.key];
    let item;
    const filled = () => half.lightning.filter((s) => s.q.trim()).length;
    const summary = () => ({ title: `${hf.title}: lightning`, meta: `${filled()} true-or-false`, ok: true });
    const after = () => item?.update(summary());
    const list = h('div', { class: 'answers' });
    const draw = () => {
      list.replaceChildren(...half.lightning.map((st, n) => h('div', { class: 'ans' }, h('div', { class: 'rank' }, String(n + 1)),
        field('input', st, 'q', { placeholder: 'A statement that is true or false', maxLength: 200, autocomplete: 'off' }, () => { touch(); after(); }),
        h('select', { 'aria-label': 'True or false', onchange: (e) => { st.a = e.target.value === 'true'; touch(); } },
          h('option', { value: 'true', selected: st.a }, 'True'), h('option', { value: 'false', selected: !st.a }, 'False')),
        btn('✕', () => { half.lightning.splice(n, 1); touch(); draw(); after(); }, { small: true, aria: 'Remove this statement' }))));
    };
    const paste = pasteBox('One per line: statement | true or false\nMascara goes on your eyelashes. | true', parseStatements, (found) => {
      half.lightning = half.lightning.filter((s) => s.q.trim()).concat(found);
      touch(); draw(); after();
    });
    const body = h('div', { style: { display: 'contents' } }, list,
      h('div', { class: 'row-actions' },
        btn('＋ Add a statement', () => { half.lightning.push(blankS()); touch(); draw(); after(); }, { small: true }),
        btn('Paste a list', () => paste.classList.toggle('hidden'), { small: true })),
      paste);
    const key = `${hf.key}:l`;
    item = group.add({ badge: h('span', {}, '⚡'), ...summary(), body, open: openKey === key, onToggle: (on) => { if (on) openKey = key; } });
    draw();
    return item.el;
  }

  function render() {
    const group = accordionGroup();
    const picker = h('select', { 'aria-label': 'Question set', onchange: (e) => { if (e.target.value === '') startNew(); else open(e.target.value); } },
      h('option', { value: '' }, '＋ New question set'), sets.map((x) => h('option', { value: x.id, selected: !isNew && x.id === id }, x.title)));
    const titleInput = field('input', doc, 'title', { maxLength: 80, placeholder: 'e.g. The Smith Family Battle', autocomplete: 'off' }, touch);
    setKids(container, h('div', { class: 'card' }, row('Question set', picker), row('Title', titleInput)),
      h('div', { class: 'tag' }, 'Guy stuff is what the Gals get asked; gal stuff is what the Guys get asked. Write the right answer and up to three wrong ones: the game shuffles them. Lightning statements are true or false.'),
      HALVES.map((hf) => [questionsAcc(group, hf), lightningAcc(group, hf)]));
  }

  refresh();
  return { save, remove, canDelete: () => !isNew, dirty: () => dirty, label: () => label || (isNew ? 'New set' : `Editing ${doc.title || id}`) };
}
