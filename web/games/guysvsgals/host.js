// Guys vs Gals on the host page. The host sees every question with its answer, can lock an answer in early, throw out
// a dud question, nudge a token and move things along; in the lobby, who is on which side, the question set and the
// rules. The players vote on their own phones.
import { h } from '../../common.js';
import { button, seg, toggle, card, eyebrow } from '../../ui.js';
import { loadStyles, token, lane, teamOf, nameOf, aboutText, LETTERS, lengthText } from './shared.js';

const SUB = {
  lobby: 'Setting up', toss: 'The coin toss', question: 'A question', reveal: 'The answer',
  'lightning-intro': 'Lightning Round', lightning: 'Lightning Round', 'lightning-done': 'Lightning Round', gameover: 'Game over',
};

export function render(raw, ctx) {
  loadStyles();
  const g = raw.game;
  const { act } = ctx;
  const body = [];
  const dock = [];
  const lobby = g.phase === 'lobby';

  if (lobby) {
    const players = raw.room.players ?? [];
    body.push(card(eyebrow('How it works'),
      h('p', { class: 'dim' }, 'Everyone picks the Guys or the Gals on their phone. Teams take turns answering multiple-choice questions about the other side’s stuff: everyone on the team votes, and the favourite answer is locked in.'),
      h('p', { class: 'dim' }, `Right moves the team ${g.step} spaces. Lightning spaces start a true-or-false Lightning Round. First to the finish wins; the other team gets one last turn to tie.`)));
    body.push(card(eyebrow('Who is on which side'), h('div', { class: 'list' }, players.length ? players.map((p) => {
      const side = g.teams.find((t) => t.id === p.teamId)?.side;
      return h('div', { class: 'rowi' }, h('div', { class: 'grow t' }, p.name),
        seg([{ value: 'guys', label: nameOf(g, 'guys') }, { value: 'gals', label: nameOf(g, 'gals') }], side, (s) => act('setSide', { pid: p.id, side: s })));
    }) : h('p', { class: 'dim' }, 'Nobody has joined yet.'))));
    dock.push(button({ label: 'Start the battle', icon: 'play', kind: 'primary', size: 'lg', block: true, disabled: !g.teams.every((t) => t.members.length), onclick: () => act('start') }));
  } else {
    body.push(card(eyebrow('Now'), h('div', { class: 'card-title' }, g.line.text), g.line.next ? h('p', { class: 'dim' }, g.line.next) : null));
    if ((g.phase === 'question' || g.phase === 'reveal') && g.question) {
      const q = g.question;
      body.push(h('div', { class: 'gv' }, h('div', { class: 'gv-pcard accent', style: { '--c': teamOf(g, g.turn)?.color } },
        h('div', { class: 'dim' }, `${nameOf(g, g.turn)} · ${aboutText(q.about)}${q.cat ? ` · ${q.cat}` : ''}`),
        h('div', { class: 'gv-pq' }, q.text),
        h('div', { class: 'gv-pchoices' }, q.choices.map((c, i) => h('div', { class: `gv-pchoice ${i === q.answer ? 'right' : g.phase === 'reveal' && i === q.pick ? 'wrong' : ''}`, style: { '--l': '#ffe14d', '--t': teamOf(g, g.turn)?.color } },
          h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', {}, c), q.counts[i] ? h('span', { class: 'n' }, Array.from({ length: q.counts[i] }, () => h('i', {}))) : null))))));
      if (g.phase === 'question') {
        if (!q.locked) dock.push(button({ label: 'Lock in now', icon: 'check', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
        dock.push(button({ label: 'New question', icon: 'refresh', size: 'lg', block: true, onclick: () => act('newQuestion') }));
      } else dock.push(button({ label: 'Carry on', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
    }
    if (g.phase.startsWith('lightning') && g.lightning) {
      const L = g.lightning;
      body.push(card(eyebrow(`Lightning Round · ${nameOf(g, L.side)}`),
        h('p', {}, `${L.rights} right of ${L.done.length} answered (${L.total} in all)`),
        L.current ? h('p', {}, h('b', {}, L.current), ` (${L.currentAnswer ? 'TRUE' : 'FALSE'})`) : null));
      dock.push(button({ label: g.phase === 'lightning' ? 'End the round now' : 'Carry on', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
    }
    if (g.phase === 'toss') dock.push(button({ label: 'Skip the toss', icon: 'chevron', size: 'lg', block: true, onclick: () => act('advance') }));
    if (g.phase === 'gameover') dock.push(button({ label: 'Rematch', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('playAgain') }));
    body.push(card(eyebrow('The race'), h('div', { class: 'gv' }, h('div', { class: 'gv-pcard gv-ptrack' }, lane(g, 'guys', { compact: true }), lane(g, 'gals', { compact: true }))),
      h('div', { class: 'list' }, g.teams.map((t) => h('div', { class: 'rowi' }, token(t.side, t.color, 30),
        h('div', { class: 'grow t' }, t.name, g.turn === t.side ? ' ◀' : ''), h('span', { class: 'tag' }, `${t.pos} / ${g.length}`),
        g.phase !== 'gameover' ? [button({ label: '−1', size: 'sm', onclick: () => act('nudge', { side: t.side, delta: -1 }) }), button({ label: '+1', size: 'sm', onclick: () => act('nudge', { side: t.side, delta: 1 }) })] : null)))));
  }

  const settings = [
    card(eyebrow('Questions'),
      lobby ? h('select', { 'aria-label': 'Question set', onchange: (e) => act('setSet', { id: e.target.value }) },
        h('option', { value: 'all', selected: g.settings.setId === 'all' }, 'All question sets (mixed)'),
        (g.sets ?? []).map((x) => h('option', { value: x.id, selected: g.settings.setId === x.id }, x.title)))
        : h('p', {}, g.settings.setId === 'all' ? 'All question sets (mixed)' : g.settings.setId),
      h('p', { class: 'dim' }, 'Questions a TV has asked are not asked again until they run out. Write your own in the Questions tab.')),
    card(eyebrow('Rules'),
      h('div', { class: 't' }, 'Game length'),
      seg((g.lengths ?? []).map((l) => ({ value: l.n, label: l.label, sub: `${l.n} spaces`, disabled: !lobby })), g.settings.length, (n) => act('setLength', { n })),
      h('div', { class: 't', style: { marginTop: '12px' } }, 'Time to answer'),
      seg([20, 30, 45, 0].map((s) => ({ value: s, label: s ? `${s}s` : 'No clock', disabled: !lobby })), g.settings.answerSecs, (secs) => act('setAnswerTime', { secs })),
      toggle({ label: 'Lightning Rounds', sub: 'A true-or-false speed round on every fifth space', checked: g.settings.lightning, onchange: (on) => (lobby ? act('setLightning', { on }) : null) }),
      h('p', { class: 'dim' }, lengthText(g))),
  ];
  const danger = lobby ? [] : [
    button({ label: 'End game', icon: 'x', kind: 'bad', block: true, onclick: () => ctx.confirm({ title: 'End the game?', message: 'Everyone goes back to the lobby and the race starts over.', confirmLabel: 'End game', onConfirm: () => act('endGame') }) }),
  ];
  return { title: 'Guys vs Gals', sub: SUB[g.phase] ?? '', body, dock: dock.length ? h('div', { class: 'dock-row' }, dock) : null, settings, danger };
}
