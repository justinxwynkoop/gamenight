// The Fast Money form on a player's phone: one question at a time, a big answer box, a microphone button, Skip
// (or just say "skip"), and a way back to the questions that were skipped while there is still time.
import { h } from '../../common.js';
import { spokenCommand, nextUnanswered, speechProblem } from './speech.js';

/**
 * questions  the five questions
 * send       sends { t: 'fm-answers', answers }
 * Returns { node, auto, setNote } — auto() sends whatever is there (called when time runs out).
 */
export function buildFastMoneyForm(questions, { send, Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition } = {}) {
  const N = questions.length;
  const answers = Array(N).fill('');
  const skipped = new Set();
  let idx = 0;
  let mode = 'ask';           // 'ask' (one question) or 'review' (all of them, with a Send button)
  let recognition = null;
  let listening = false;
  let sentOnTimeout = false;

  // ----- the pieces that keep their state (so typing is never interrupted by a redraw) -----
  const dots = h('div', { class: 'fm-dots', role: 'tablist', 'aria-label': 'Questions' });
  const count = h('div', { class: 'tag' });
  const question = h('div', { class: 'fm-q' });
  const input = h('input', { type: 'text', class: 'fm-input', maxLength: 40, placeholder: 'Your answer', autocomplete: 'off', autocapitalize: 'sentences', enterKeyHint: 'next', 'aria-label': 'Your answer' });
  const mic = h('button', { type: 'button', class: 'fm-mic', 'aria-label': 'Speak your answer', title: 'Speak your answer' }, '🎤');
  const hint = h('div', { class: 'fm-hint', role: 'status' });
  const skip = h('button', { type: 'button', class: 'btn', onclick: () => doSkip() }, 'Skip');
  const next = h('button', { type: 'button', class: 'btn primary', onclick: () => doNext() }, 'Next');
  const ask = h('div', { class: 'fm-ask' }, count, question, h('div', { class: 'fm-row' }, input, Recognition && mic),
    hint, h('div', { class: 'fm-actions' }, skip, next));
  const review = h('div', { class: 'fm-review hidden' });
  const note = h('p', { class: 'tag' });
  const node = h('div', { class: 'fm-form' }, dots, ask, review, note);

  const commit = () => { if (mode === 'ask') answers[idx] = input.value.trim(); };
  const sendNow = () => { send({ t: 'fm-answers', answers: [...answers] }); };

  function drawDots() {
    dots.replaceChildren(...questions.map((_, i) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(mode === 'ask' && i === idx), 'aria-label': `Question ${i + 1}${answers[i] ? ', answered' : skipped.has(i) ? ', skipped' : ''}`,
      class: `fm-dot ${mode === 'ask' && i === idx ? 'now' : ''} ${answers[i] ? 'done' : skipped.has(i) ? 'skip' : ''}`,
      onclick: () => { commit(); sendNow(); show(i); },
    }, answers[i] ? '✓' : skipped.has(i) ? '↷' : String(i + 1))));
  }

  function show(i, message = '') {
    stopListening();
    mode = 'ask'; idx = i;
    ask.classList.remove('hidden'); review.classList.add('hidden');
    count.textContent = `Question ${i + 1} of ${N}${skipped.has(i) && !answers[i] ? ' · skipped before' : ''}`;
    question.textContent = questions[i];
    input.value = answers[i];
    hint.textContent = message;
    next.textContent = i === N - 1 ? 'Done' : 'Next';
    drawDots();
    input.focus({ preventScroll: true });
  }

  function showReview() {
    stopListening();
    mode = 'review';
    ask.classList.add('hidden'); review.classList.remove('hidden');
    const open = answers.map((a, i) => (a ? -1 : i)).filter((i) => i >= 0);
    review.replaceChildren(
      h('h3', {}, open.length ? 'Some questions are still empty' : 'All done!'),
      h('p', { class: 'tag' }, open.length ? 'Go back and answer them while there is time, or send what you have.' : 'You can still change an answer until time is up.'),
      ...questions.map((q, i) => h('div', { class: 'fm-rv' }, h('div', { class: 'q' }, `${i + 1}. ${q}`),
        h('div', { class: 'a' }, answers[i] || (skipped.has(i) ? 'Skipped' : '—')),
        h('button', { type: 'button', class: 'btn small', onclick: () => show(i) }, answers[i] ? 'Change' : 'Answer'))),
      h('button', { type: 'button', class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick: () => { sendNow(); note.textContent = 'Answers sent. You can change them until time is up.'; } }, 'Send my answers'));
    drawDots();
  }

  function goOn() {
    const to = nextUnanswered(answers, idx);
    if (to === -1 || to === idx) return showReview();   // nothing else is empty (the only one left is the one just left)
    show(to, to < idx ? 'Back to a question you skipped.' : '');
  }

  function doNext() {
    const typed = input.value.trim();
    if (!typed || spokenCommand(typed)) return doSkip();   // nothing typed, or typing or saying "skip": that is a skip, not an answer
    commit();
    if (answers[idx]) skipped.delete(idx);
    sendNow();
    goOn();
  }

  function doSkip() {
    input.value = '';
    answers[idx] = '';
    skipped.add(idx);
    sendNow();
    goOn();
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doNext(); } });
  input.addEventListener('input', () => { commit(); });

  // ----- voice -----
  function stopListening() {
    if (recognition) { try { recognition.stop(); } catch { /* not running */ } }
    listening = false; mic.classList.remove('listening');
  }
  function startListening() {
    if (!Recognition) return;
    try {
      recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (e) => {
        const text = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
        input.value = text;
        if (e.results[e.results.length - 1].isFinal) { if (spokenCommand(text)) doSkip(); else { commit(); hint.textContent = 'Tap Next, or say skip.'; } }
      };
      recognition.onerror = (e) => { hint.textContent = speechProblem(e.error); };
      recognition.onend = () => { listening = false; mic.classList.remove('listening'); };
      hint.textContent = 'Listening… say your answer, or say skip.';
      recognition.start();
      listening = true; mic.classList.add('listening');
    } catch {
      hint.textContent = speechProblem('error');
    }
  }
  mic.addEventListener('click', () => { if (listening) stopListening(); else startListening(); });

  show(0, Recognition ? '' : 'Tip: tap the microphone on your keyboard to speak your answer.');

  return {
    node,
    setNote: (text) => { if (text) note.textContent = text; },
    /** Time is up: send whatever is there, once. */
    auto() { if (sentOnTimeout) return; sentOnTimeout = true; commit(); sendNow(); },
    // for tests
    state: () => ({ idx, mode, answers: [...answers], skipped: [...skipped] }),
  };
}
