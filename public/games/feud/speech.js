// Small pure helpers for the Fast Money phone form (kept free of the DOM so they can be tested).

const SKIP = /^(skip|skip it|skip this|skip this one|skip this question|pass|next question|i don'?t know|don'?t know|no idea|i have no idea)$/;

/** What a spoken or typed answer means as a command: 'skip' when the whole thing is a skip word, else null. */
export function spokenCommand(text) {
  const t = String(text ?? '').toLowerCase().replace(/[.!?,"“”]/g, '').replace(/\s+/g, ' ').trim();
  return SKIP.test(t) ? 'skip' : null;
}

/**
 * Which question to show after `from`: the next one with no answer, going forward and then back round to the ones
 * that were skipped. Returns -1 when every question has an answer.
 */
export function nextUnanswered(answers, from) {
  const n = answers.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (!String(answers[i] ?? '').trim()) return i;
  }
  return -1;
}

/** A friendly line for a speech-recognition error code. */
export function speechProblem(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed': return 'Voice isn’t allowed here. Tap the microphone on your keyboard to speak instead.';
    case 'no-speech': return 'I didn’t hear anything. Try again.';
    case 'audio-capture': return 'I can’t find a microphone.';
    case 'network': return 'Voice needs an internet connection. Tap the microphone on your keyboard instead.';
    case 'aborted': return '';
    default: return 'Voice didn’t work. Tap the microphone on your keyboard instead.';
  }
}
