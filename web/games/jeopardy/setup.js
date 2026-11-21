// The lobby setup controls, shared by the captain's phone and the host page: the question chooser (real-show topics and
// era, the family packs, your own games, the board preview), and how the game is played (a host judging out loud...).
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
  const note = v.archiveLoading ? 'Loading clues…' : v.archiveError ? 'Real-show clues did not load. Tap an era to retry.' : seasonLabel(v.archiveSeason);
  return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
    h('div', { class: 'jp-muted jp-small' }, `Clues from: ${note || 'Loading…'}`),
    h('div', { class: 'jp-eras' }, v.eras.map((e) => h('button', { type: 'button', class: `jp-chip ${v.era === e ? 'on' : ''}`, onclick: () => run('setEra', { era: e }) }, v.era === e ? '✓ ' : '', ERA_LABELS[e] ?? e))));
}

// ---------- choosing the questions ----------
// Three shelves, as on the TV: clues from the real show (by topic and era), the family packs that come with the game,
// and your own games from the question editor (played just as written). Each topic says how many of its categories
// the TV has not shown yet; a clue is not dealt again until its whole pack has been played.
const SHELVES = [['archive', 'Real show'], ['house', 'Family packs'], ['own', 'Your games']];
const shelfOf = (pk) => (pk.own ? 'own' : pk.archive ? 'archive' : 'house');
function shelfInUse(v) {
  const on = (v.packs ?? []).filter((pk) => pk.selected);
  if (on.some((pk) => pk.own)) return 'own';
  if (on.some((pk) => pk.archive)) return 'archive';
  if (on.length) return 'house';
  return v.hasArchive ? 'archive' : 'house';
}
let shelf = null;   // the shelf open on this phone (null: the one in use)

const freshLine = (pk) => {
  if (pk.fresh == null || !pk.count) return h('small', {}, `${pk.count} categories`);
  const text = pk.fresh === pk.count ? `All ${pk.count} categories new` : pk.fresh ? `${pk.fresh} of ${pk.count} categories new` : 'All played: starts over next game';
  return h('small', { class: 'jp-fresh' }, h('i', { style: { '--f': `${Math.round((pk.fresh / pk.count) * 100)}%` } }), text);
};

/** The question chooser (or the board preview when one is open). It redraws itself when a shelf is picked. */
export function packControls(v, run, { editorHint = 'Ask the host to write one on the host page (Questions).' } = {}) {
  const box = h('div', { class: 'jp-stack jp-picker', style: { maxWidth: 'none' } });
  const draw = () => box.replaceChildren(...[v.draft ? draftView(v, run) : pickerView(v, run, draw, editorHint)].flat(Infinity).filter(Boolean));
  draw();
  return box;
}

function pickerView(v, run, redraw, editorHint) {
  const open = shelf ?? shelfInUse(v);
  const packs = v.packs ?? [];
  const tabs = h('div', { class: 'jp-tabs', role: 'tablist' }, SHELVES.map(([id, label]) => {
    if (id === 'archive' && !v.hasArchive) return null;
    const on = packs.filter((pk) => shelfOf(pk) === id && pk.selected).length;
    return h('button', { type: 'button', role: 'tab', 'aria-selected': String(open === id), class: `jp-tab ${open === id ? 'on' : ''}`, onclick: () => { shelf = id; redraw(); } },
      label, on ? h('small', {}, id === 'own' ? 'playing' : `${on} on`) : null);
  }));
  const of = packs.filter((pk) => shelfOf(pk) === open);
  let body;
  if (open === 'own') {
    const on = of.filter((pk) => pk.selected);
    body = [
      h('div', { class: 'jp-muted jp-small' }, of.length ? 'Your games are played just as they were written. Tap one to play it.' : 'No games of your own yet.'),
      of.map((pk) => h('div', { class: `jp-game ${pk.selected ? 'on' : ''}` },
        h('button', { type: 'button', class: 'jp-gamebtn', onclick: () => run('playBoard', { pack: pk.id }) },
          h('span', { class: 'jp-check' }, pk.selected ? '✓' : ''), h('b', {}, pk.title),
          on.length === 2 && pk.selected ? h('em', {}, `Round ${on.findIndex((x) => x.id === pk.id) + 1}`) : null),
        h('div', { class: 'jp-cats' }, (pk.cats ?? []).map((c) => h('span', {}, c))),
        on.length === 1 && !pk.selected && h('button', { type: 'button', class: 'jp-link', style: { alignSelf: 'flex-start', padding: '0' }, onclick: () => run('playBoard', { pack: pk.id, add: true }) }, '+ Add as round 2'))),
      h('div', { class: 'jp-game make' }, h('b', {}, '+ Make your own game'), h('small', {}, `Six categories, five clues each, and a Final. ${editorHint}`)),
    ];
  } else {
    const allOn = of.length > 0 && of.every((pk) => pk.selected);
    body = [
      open === 'archive' && eraControl(v, run),
      h('div', { class: 'jp-rowhead' }, h('span', { class: 'jp-eyebrow' }, open === 'archive' ? 'Topics' : 'Packs'),
        of.length > 1 && h('button', { type: 'button', class: 'jp-link', onclick: () => run('setAllPacks', { kind: open, on: !allOn }) }, allOn ? 'All off' : 'All on')),
      of.length ? of.map((pk) => h('button', { type: 'button', class: `jp-topic ${pk.selected ? 'on' : ''}`, onclick: () => run('togglePack', { pack: pk.id }) },
        h('span', { class: 'jp-check' }, pk.selected ? '✓' : ''),
        h('span', { class: 'jp-topictext' }, h('b', {}, pk.title, pk.easy ? h('em', {}, 'Easy') : null), open === 'house' && pk.description ? h('small', { class: 'jp-desc' }, pk.description) : null, freshLine(pk))))
        : h('div', { class: 'jp-muted' }, v.archiveLoading ? 'Loading a season of the show…' : 'Nothing here yet'),
    ];
  }
  const n = v.categoryCount ?? 0;
  const foot = h('div', { class: 'jp-pickfoot' },
    h('div', {}, v.asWritten ? 'Played just as written, then Final Jeopardy.'
      : [h('b', {}, `${n} categories`), v.freshCount != null ? ` · ${v.freshCount} not seen yet` : '', n < 12 ? h('span', { class: 'bad' }, ' · switch on 12 or more') : '']),
    !v.asWritten && n >= 12 && btn('▦ Preview and swap categories', () => run('previewBoard'), 'ring'),
    v.seenCount > 0 && h('button', { type: 'button', class: 'jp-link', onclick: () => { if (confirm('Forget every clue the TV has shown? They can all come up again.')) run('resetHistory'); } }, 'Start fresh: forget the clues already played'));
  return [tabs, ...body, foot];
}

function draftView(v, run) {
  return [
    h('div', { class: 'jp-muted' }, 'Your board. Tap a category to swap it for another one.'),
    v.draft.map((row, r) => [
      h('div', { class: 'jp-eyebrow' }, `Round ${r + 1}`),
      h('div', { class: 'jp-draft' }, row.map((name, ci) => h('button', { type: 'button', class: 'jp-draftcat', onclick: () => run('swapCategory', { r: r + 1, ci }) },
        h('span', {}, name), v.draftFresh?.[r]?.[ci] === false ? h('em', { class: 'old' }, 'Played before') : h('em', {}, 'New'), h('i', {}, '↻')))),
    ]),
    h('div', { class: 'jp-quick' }, btn('⇄ Shuffle all', () => run('previewBoard'), 'ghost'), btn('‹ Back', () => run('clearPreview'), 'ghost')),
  ];
}

export function judgeControl(v, run) {
  return btn([v.hostJudges ? '✓ ' : '', '🎤 A host judges out loud'], () => run('setHostJudges', { on: !v.hostJudges }), `${v.hostJudges ? '' : 'ghost'} left`,
    v.hostJudges ? 'On: players say their answers aloud and the host rules on the host page.' : 'Off: players type their answers and the game checks them.');
}

export function finalControl(v, run) {
  return btn([v.finalForAll ? '✓ ' : '', '🏁 Everyone plays Final Jeopardy'], () => run('setFinalForAll', { on: !v.finalForAll }), `${v.finalForAll ? '' : 'ghost'} left`,
    v.finalForAll ? 'On: players at $0 or below play too, and can bet up to $1,000.' : 'Off: only players with money play, as on the show.');
}

export function answerTimeControl(v, run) {
  return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
    h('div', { class: 'jp-muted' }, 'Answer clock (a host judging out loud)'),
    h('div', { class: 'jp-quick' }, v.answerTimes.map((n) => h('button', { type: 'button', class: `jp-btn ${n === v.answerTime ? '' : 'ghost'}`, onclick: () => run('setAnswerTime', { seconds: n }) }, n ? `${n}s` : 'Off'))));
}

/** Everything the lobby offers, in order. */
export function lobbyControls(v, run, opts = {}) {
  return h('div', { class: 'jp-stack', style: { maxWidth: 'none' } },
    packControls(v, run, opts),
    h('div', { class: 'jp-eyebrow', style: { marginTop: '8px' } }, 'How you play'),
    judgeControl(v, run),
    v.hostJudges && answerTimeControl(v, run),
    finalControl(v, run));
}
