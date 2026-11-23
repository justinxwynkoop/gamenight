// Pie Chase on the host page. The host reads every question out loud and taps Right or Wrong (the answer is shown here,
// never on the TV until it is judged), picks the question set and the rule options, and can roll, move or skip for a
// player who has gone away. Players still roll and move on their own phones.
import { h, ink } from '../../common.js';
import { button, seg, toggle, card, eyebrow } from '../../ui.js';
import { loadStyles, board, pie, nameOf, catOf, spaceName, goalText } from './shared.js';

const SUB = {
  lobby: 'Setting up', rolloff: 'Rolling to see who goes first', roll: 'Rolling', move: 'Moving', choose: 'Picking a category',
  question: 'A question', result: 'The answer', gameover: 'Game over',
};

export function render(raw, ctx) {
  loadStyles();
  const g = raw.game;
  const { act } = ctx;
  const body = [];
  const dock = [];
  const who = nameOf(g, g.turn);

  if (g.phase === 'lobby') {
    body.push(card(eyebrow('How it works'),
      h('p', { class: 'dim' }, 'Everyone starts in the hub. Players roll and move from their own phones. You read each question out loud and tap Right or Wrong: the answer shows here, and on the TV only once you have judged it. Right rolls again; wrong passes the turn on.'),
      h('p', { class: 'dim' }, `A right answer on a headquarters wins that wedge. To win: ${goalText(g)} (by exact count), then answer a question in a category the others choose.`),
      h('p', {}, `${g.units.length} ${raw.room.mode === 'teams' ? 'teams' : 'players'} · ${g.minUnits} to ${g.maxUnits}`)));
    dock.push(button({ label: 'Start the game', icon: 'play', kind: 'primary', size: 'lg', block: true, disabled: g.units.length < g.minUnits, onclick: () => act('start') }));
  } else {
    body.push(card(eyebrow('Now'), h('div', { class: 'card-title' }, g.line.text), g.line.next ? h('p', { class: 'dim' }, g.line.next) : null));
    if (g.phase === 'question' || g.phase === 'result') {
      const q = g.question;
      const c = catOf(g, q.cat);
      body.push(h('div', { class: 'pc' }, h('div', { class: 'pc-qcard', style: { '--c': c.color, '--ink': ink(c.color) } },
        h('div', { class: 'top' }, h('span', {}, c.name), h('span', {}, q.final ? 'For the win' : q.hq && !q.hasWedge ? 'For the wedge' : '')),
        h('div', { class: 'q' }, q.text),
        h('div', { class: 'a' }, h('small', {}, 'Answer'), q.answer ?? ''))));
      if (g.phase === 'question') {
        dock.push(button({ label: 'Right', icon: 'check', kind: 'ok', size: 'lg', block: true, onclick: () => act('judge', { correct: true }) }));
        dock.push(button({ label: 'Wrong', icon: 'x', kind: 'bad', size: 'lg', block: true, onclick: () => act('judge', { correct: false }) }));
      } else {
        dock.push(button({ label: 'Carry on', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
      }
    }
    if (g.phase === 'choose') {
      body.push(card(eyebrow(g.chooser === 'opponents' ? `Category for ${who}’s winning question` : `${who} picks a category`),
        h('p', { class: 'dim' }, g.chooser === 'opponents' ? 'The other players choose. Tap it for them, or let them pick on their phones.' : 'They can pick on their phone, or tell you.'),
        h('div', { class: 'pc' }, h('div', { class: 'pc-cats' }, g.categories.map((c, i) => h('button', { type: 'button', class: 'pc-cat', style: { '--c': c.color, '--ink': ink(c.color) }, onclick: () => act('choose', { cat: i }) }, c.name))))));
    }
    if (g.phase === 'move' && g.options.length > 1) {
      body.push(card(eyebrow(`${who} rolled ${g.die?.value}: where to?`), h('p', { class: 'dim' }, 'They pick on their phone. You can tap for them.'),
        h('div', { class: 'pc' }, h('div', { class: 'pc-dests' }, g.options.map((id, i) => h('button', { type: 'button', class: 'pc-dest', style: { '--c': g.board.find((x) => x.id === id)?.cat != null ? catOf(g, g.board.find((x) => x.id === id).cat).color : '#5b6a99' }, onclick: () => act('move', { to: id }) },
          h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'sw' }), spaceName(g, id)))))));
    }
    if (g.phase === 'rolloff' && !g.rolloff.starter) dock.push(button({ label: 'Roll for everyone left', icon: 'shuffle', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
    if (g.phase === 'roll') dock.push(button({ label: `Roll for ${who}`, icon: 'shuffle', size: 'lg', block: true, onclick: () => act('roll') }));
    if (g.phase === 'gameover') dock.push(button({ label: 'Play again', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('playAgain') }));
    body.push(card(eyebrow('The board'), h('div', { class: 'pc' }, h('div', { class: 'pc-mini' }, board(g, { highlight: g.phase === 'move' ? g.options : [], focus: g.turn, labels: g.phase === 'move' })))));
    body.push(card(eyebrow('Pies'), h('div', { class: 'list' }, g.units.map((u) => h('div', { class: 'rowi' }, pie(g, u.wedges, 30, u.color),
      h('div', { class: 'grow t' }, u.name, u.id === g.turn ? ' ◀' : ''), h('span', { class: 'tag' }, `${u.wedges.length} · ${spaceName(g, u.pos)}`))))));
  }

  const lobby = g.phase === 'lobby';
  const settings = [
    card(eyebrow('Questions'),
      lobby ? h('select', { 'aria-label': 'Question set', onchange: (e) => act('setSet', { id: e.target.value }) },
        h('option', { value: 'all', selected: g.settings.setId === 'all' }, 'All question sets (mixed)'),
        (g.sets ?? []).map((x) => h('option', { value: x.id, selected: g.settings.setId === x.id }, x.title)))
        : h('p', {}, g.settings.setId === 'all' ? 'All question sets (mixed)' : g.settings.setId),
      h('p', { class: 'dim' }, 'Questions a TV has asked are not asked again until a category runs out. Write your own in the Questions tab.')),
    card(eyebrow('Rules'),
      h('div', { class: 't' }, 'Wedges to win'),
      seg([{ value: 6, label: '6', sub: 'Classic' }, { value: 5, label: '5', sub: 'Shorter' }, { value: 4, label: '4', sub: 'Quick' }].map((o) => ({ ...o, disabled: !lobby })), g.settings.wedgesToWin, (n) => act('setWedges', { n })),
      toggle({ label: 'Equal turns', sub: 'When someone wins, the rest of that round still plays, and anyone else who wins ties', checked: g.settings.equalTurns, onchange: (on) => (lobby ? act('setEqualTurns', { on }) : null) })),
  ];
  const danger = lobby ? [] : [
    ['roll', 'move', 'choose', 'question'].includes(g.phase) ? button({ label: `Skip ${who}’s turn`, icon: 'chevron', block: true, onclick: () => ctx.confirm({ title: `Skip ${who}’s turn?`, message: 'Play passes to the next player.', confirmLabel: 'Skip', onConfirm: () => act('skipTurn') }) }) : null,
    button({ label: 'End game', icon: 'x', kind: 'bad', block: true, onclick: () => ctx.confirm({ title: 'End the game?', message: 'Everyone goes back to the lobby and the pies are emptied.', confirmLabel: 'End game', onConfirm: () => act('endGame') }) }),
  ].filter(Boolean);
  return {
    title: 'Pie Chase', sub: SUB[g.phase] ?? '', body,
    dock: dock.length ? h('div', { class: 'dock-row' }, dock) : null, settings, danger,
  };
}

