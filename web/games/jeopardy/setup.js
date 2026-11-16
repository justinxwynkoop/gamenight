// The lobby setup controls, shared by the captain's phone and the host page: which question packs to play, easy mode,
// which era of real-show clues, the board preview, and whether a host judges spoken answers.
// run(action, args) sends one action to the game (the captain's phone wraps it as a captain message).
import { h } from '../../common.js';

export const ERA_LABELS = { any: 'Any era', classic: 'Classic 80s & 90s', '2000s': '2000s', recent: 'Recent' };
const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Outfit:wght@400;600;800&display=swap';

/** Loads the Jeopardy stylesheet and fonts once. */
export function loadStyles() {
  if (document.getElementById('jp-css')) return;
  const css = h('link', { id: 'jp-css', rel: 'stylesheet', href: '/games/jeopardy/jeopardy.css' });
  const fonts = h('link', { id: 'jp-fonts', rel: 'stylesheet', href: FONTS });
  document.head.append(fonts, css);
}

export const seasonLabel = (n) => {
  if (!n) return '';
  const y = 1983 + n;
  return `Season ${n} (${y}-${String((y + 1) % 100).padStart(2, '0')})`;
};

const btn = (label, onclick, cls = '', sub = null) => h('button', { type: 'button', class: `jp-btn ${cls}`, onclick }, label, sub && h('small', {}, sub));

export function easyControl(v, run) {
  if (!v.easyAvailable) return null;
  return btn([v.easyMode ? '✓ ' : '', '★ Easy mode'], () => run('toggleEasy'), `${v.easyMode ? '' : 'ghost'} left ring`,
    v.easyMode ? 'On: casual, family-friendly questions only. Tap to go back.' : 'Casual, family-friendly questions only');
}

export function eraControl(v, run) {
  if (!v.hasArchive) return null;
  const note = v.archiveLoading ? 'Loading clues…' : v.archiveError ? 'Could not load that era. Try again.' : seasonLabel(v.archiveSeason);
  return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
    h('div', { class: 'jp-muted' }, `Clues from the real show: ${note || 'Loading…'}`),
    h('div', { class: 'jp-quick' }, v.eras.map((e) => h('button', { type: 'button', class: `jp-btn ${v.era === e ? '' : 'ghost'}`, style: { flex: '1 1 45%' }, onclick: () => run('setEra', { era: e }) }, ERA_LABELS[e] ?? e))));
}

/** Packs, or the board preview when one is open. */
export function packControls(v, run) {
  if (v.draft) {
    return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
      h('div', { class: 'jp-muted' }, 'Your board. Tap a category to swap it for another one.'),
      v.draft.map((row, r) => [
        h('div', { class: 'jp-eyebrow' }, `Round ${r + 1}`),
        row.map((name, ci) => btn(`↻ ${name}`, () => run('swapCategory', { r: r + 1, ci }), 'ghost left')),
      ]),
      h('div', { class: 'jp-quick' }, btn('Shuffle all', () => run('previewBoard'), 'ghost'), btn('Back to packs', () => run('clearPreview'), 'ghost')));
  }
  return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
    easyControl(v, run),
    h('div', { class: 'jp-muted' }, v.asWritten
      ? 'Playing your own board just as you wrote it.'
      : `Question packs (${v.categoryCount} categories${v.categoryCount < 12 ? ', need 12+' : ''})`),
    v.packs.map((pk) => btn([pk.selected ? '✓ ' : '', pk.title, ' ', h('small', { style: { display: 'inline', opacity: '.7' } }, pk.own ? 'your board' : `${pk.count} categories`)], () => run('togglePack', { pack: pk.id }), `${pk.selected ? '' : 'ghost'} left`)),
    v.asWritten && v.asWrittenChoice !== false && btn('Shuffle my board in with the others instead', () => run('setAsWritten', { on: false }), 'ghost left'),
    !v.asWritten && v.asWrittenChoice === false && btn('Play my board as written', () => run('setAsWritten', { on: null }), 'ghost left'),
    !v.asWritten && v.categoryCount >= 12 && btn('Preview and swap categories', () => run('previewBoard'), 'ring'));
}

export function judgeControl(v, run) {
  return btn([v.hostJudges ? '✓ ' : '', '🎤 A host judges out loud'], () => run('setHostJudges', { on: !v.hostJudges }), `${v.hostJudges ? '' : 'ghost'} left`,
    v.hostJudges ? 'On: players say their answers aloud and the host rules on the host page.' : 'Off: players type their answers and the game checks them.');
}

export function answerTimeControl(v, run) {
  return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
    h('div', { class: 'jp-muted' }, 'Answer clock (a host judging out loud)'),
    h('div', { class: 'jp-quick' }, v.answerTimes.map((n) => h('button', { type: 'button', class: `jp-btn ${n === v.answerTime ? '' : 'ghost'}`, onclick: () => run('setAnswerTime', { seconds: n }) }, n ? `${n}s` : 'Off'))));
}

/** Everything the lobby offers, in order. */
export function lobbyControls(v, run) {
  return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
    judgeControl(v, run),
    v.hostJudges && answerTimeControl(v, run),
    eraControl(v, run),
    packControls(v, run));
}
