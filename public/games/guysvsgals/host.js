// Guys vs Gals on the host page. The host sees every card with its answer and can judge it (as well as the reader's
// phone), pick the actor for a charade, call who got it, lock in Our Lives guesses, throw out a dud card, nudge the
// trophy and move things along; in the lobby, who is on which side, the question set and the rules.
import { h } from '../../common.js';
import { button, seg, toggle, card, eyebrow } from '../../ui.js';
import { loadStyles, token, path, deckOf, pic, teamOf, nameOf, aboutText, LETTERS, isRace, raceTrack, acrossText } from './shared.js';

const SUB = { lobby: 'Setting up', card: 'A card', result: 'The answer', trophy: 'A trophy is won', gameover: 'Game over' };

export function render(raw, ctx) {
  loadStyles();
  const g = raw.game;
  const { act } = ctx;
  const body = [];
  const dock = [];
  const lobby = g.phase === 'lobby';

  if (lobby) {
    const players = raw.room.players ?? [];
    if (g.settings.mode === 'race') body.push(card(eyebrow('How the race works'),
      h('p', { class: 'dim' }, 'A coin toss says who goes first. A player on the other team reads a card of three questions and judges each answer on their phone (you can judge here too).'),
      h('p', { class: 'dim' }, 'Every right answer moves the team’s pawn one space; a miss or three right ends the turn. Your own wild space draws a wild card at once, the other team’s only if you stop on it.'),
      h('p', { class: 'dim' }, g.settings.pawns === 1 ? 'One pawn each: first across wins.' : 'Two pawns each: the second starts when the first gets across. Once a game, stopping on the other team’s pawn takes it prisoner. Both across wins.')));
    else body.push(card(eyebrow('How it works'),
      h('p', { class: 'dim' }, `The trophy starts on START and the ${nameOf(g, g.first)} go first. A player on the other team reads a card from their own side’s deck and judges the answer on their phone (you can judge here too). Readers take turns.`),
      h('p', { class: 'dim' }, `Right pulls the trophy one space toward the answering team, who keep going; wrong passes the turn. A right answer on your own green space wins the trophy. First to ${g.target} ${g.target === 1 ? 'trophy' : 'trophies'} wins.`),
      h('p', { class: 'dim' }, 'The space picks the deck: Our Facts, Our Stuff, Our Pics, Our Lives (the reader secretly picks A, B or C) and Our Moves (charades, both teams at once).')));
    body.push(card(eyebrow('Who is on which side'), h('div', { class: 'list' }, players.length ? players.map((p) => {
      const side = g.teams.find((t) => t.id === p.teamId)?.side;
      return h('div', { class: 'rowi' }, h('div', { class: 'grow t' }, p.name),
        seg([{ value: 'guys', label: nameOf(g, 'guys') }, { value: 'gals', label: nameOf(g, 'gals') }], side, (s) => act('setSide', { pid: p.id, side: s })));
    }) : h('p', { class: 'dim' }, 'Nobody has joined yet.'))));
    dock.push(button({ label: 'Start the battle', icon: 'play', kind: 'primary', size: 'lg', block: true, disabled: !g.teams.every((t) => t.members.length), onclick: () => act('start') }));
  } else {
    body.push(card(eyebrow('Now'), h('div', { class: 'card-title' }, g.line.text), g.line.next ? h('p', { class: 'dim' }, g.line.next) : null));
    const c = g.card;
    if ((g.phase === 'card' || g.phase === 'result') && c) {
      const d = deckOf(g, c.deck);
      const result = g.phase === 'result';
      const kids = [
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('span', { class: 'gv-pchip', style: { '--d': d.color } }, d.name), h('span', { class: `gv-pchip ${c.about}` }, aboutText(c.about)),
          c.challenged ? h('span', { class: 'gv-pchip', style: { '--d': '#ff4d4d' } }, 'Challenged') : null,
          c.of ? h('span', { class: 'gv-pchip', style: { '--d': '#fff' } }, `Question ${c.q} of ${c.of}`) : null),
        h('div', { class: 'dim' }, `${nameOf(g, g.turn)} answering · ${c.reader?.name ?? ''} reads${c.actor ? ` · ${c.actor.name} acts` : ''}`),
        c.img ? pic(c.img) : null,
        c.text ? h('div', { class: 'gv-pq' }, c.text) : null,
      ];
      if (c.choices) {
        kids.push(h('div', { class: 'gv-pchoices' }, c.choices.map((x, i) => h('div', { class: `gv-pchoice ${i === c.secret ? 'right' : ''}` },
          h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', {}, x)))));
        if (c.stage === 'secret') kids.push(h('p', { class: 'dim' }, `Waiting for ${c.reader?.name ?? 'the reader'} to pick in secret.`));
        if (c.stage === 'guess') kids.push(h('p', { class: 'dim' }, `${c.voters?.length ?? 0} of ${c.guessers?.length ?? 0} have guessed.`));
      }
      const ans = result ? g.result?.answer : c.answer ?? c.move;
      if (ans && !c.choices) kids.push(h('div', { class: 'gv-pans' }, h('small', {}, c.deck === 'moves' ? 'THE MOVE' : 'THE ANSWER'), ans));
      if (result && g.result?.wild) kids.push(h('div', { class: 'gv-pans' }, h('small', {}, `${nameOf(g, g.result.wild.owner).toUpperCase()} WILD CARD`), g.result.wild.text));
      body.push(h('div', { class: 'gv' }, h('div', { class: 'gv-pcard accent' }, kids)));
      if (g.phase === 'card') {
        if (c.stage === 'read') {
          dock.push(button({ label: c.challenged ? 'They got it' : 'Right', icon: 'check', kind: 'primary', size: 'lg', block: true, onclick: () => act('judge', { right: true }) }));
          dock.push(button({ label: c.challenged ? 'They missed' : 'Wrong', icon: 'x', size: 'lg', block: true, onclick: () => act('judge', { right: false }) }));
        }
        if (c.stage === 'guess') dock.push(button({ label: 'Lock in the guesses', icon: 'check', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
        if (c.stage === 'pick') {
          body.push(card(eyebrow(`Who acts for the ${nameOf(g, g.turn)}?`), h('div', { class: 'list' }, (c.actors ?? []).map((p) => h('div', { class: 'rowi' }, h('div', { class: 'grow t' }, p.name),
            button({ label: 'Acts', size: 'sm', onclick: () => act('actor', { pid: p.id }) }))))));
        }
        if (c.stage === 'act') {
          for (const s of ['guys', 'gals']) dock.push(button({ label: `${nameOf(g, s)} got it`, size: 'lg', block: true, kind: s === g.turn ? 'primary' : undefined, onclick: () => act('moves', { side: s }) }));
          dock.push(button({ label: 'Nobody', size: 'lg', block: true, onclick: () => act('moves', { side: null }) }));
        }
        dock.push(button({ label: 'New card', icon: 'refresh', size: 'lg', block: true, onclick: () => act('newCard') }));
      } else dock.push(button({ label: 'Carry on', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
    }
    if (g.phase === 'trophy') dock.push(button({ label: 'Carry on', icon: 'chevron', kind: 'primary', size: 'lg', block: true, onclick: () => act('advance') }));
    if (g.phase === 'gameover') dock.push(button({ label: 'Rematch', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('playAgain') }));
    if (isRace(g)) body.push(card(eyebrow('The race'), h('div', { class: 'gv' }, h('div', { class: 'gv-pcard gv-ppath' }, raceTrack(g, { compact: true }))),
      h('div', { class: 'list' }, g.teams.map((t) => h('div', { class: 'rowi' }, token(t.side, t.color, 30),
        h('div', { class: 'grow t' }, t.name, g.turn === t.side ? ' ◀' : ''),
        h('span', { class: 'tag' }, `🏁 ${acrossText(g, t.side)}`),
        g.phase !== 'gameover' ? button({ label: '◀', size: 'sm', onclick: () => act('nudge', { side: t.side, delta: -1 }) }) : null,
        g.phase !== 'gameover' ? button({ label: '▶', size: 'sm', onclick: () => act('nudge', { side: t.side, delta: 1 }) }) : null)))));
    else body.push(card(eyebrow(`Trophy ${g.trophy}`), h('div', { class: 'gv' }, h('div', { class: 'gv-pcard gv-ppath' }, path(g, { compact: true }))),
      h('div', { class: 'list' }, g.teams.map((t) => h('div', { class: 'rowi' }, token(t.side, t.color, 30),
        h('div', { class: 'grow t' }, t.name, g.turn === t.side ? ' ◀' : ''),
        h('span', { class: 'tag' }, `🏆 ${t.trophies}/${g.target}`), g.settings.challenges ? h('span', { class: 'tag' }, `✋ ${t.challenges}`) : null))),
      g.phase !== 'gameover' ? h('div', { class: 'dock-row' },
        button({ label: `◀ Toward the ${nameOf(g, 'guys')}`, size: 'sm', onclick: () => act('nudge', { delta: -1 }) }),
        button({ label: `Toward the ${nameOf(g, 'gals')} ▶`, size: 'sm', onclick: () => act('nudge', { delta: 1 }) })) : null));
  }

  const settings = [
    card(eyebrow('Questions'),
      lobby ? h('select', { 'aria-label': 'Question set', onchange: (e) => act('setSet', { id: e.target.value }) },
        h('option', { value: 'all', selected: g.settings.setId === 'all' }, 'All question sets (mixed)'),
        (g.sets ?? []).map((x) => h('option', { value: x.id, selected: g.settings.setId === x.id }, x.title)))
        : h('p', {}, g.settings.setId === 'all' ? 'All question sets (mixed)' : g.settings.setId),
      h('p', { class: 'dim' }, 'Cards a TV has dealt are not dealt again until the deck runs out. Write your own in the Questions tab.')),
    card(eyebrow('Which game'),
      seg([{ value: 'trophy', label: 'Tug of war', sub: 'Trophies', disabled: !lobby }, { value: 'race', label: 'Race', sub: 'Pawns', disabled: !lobby }], g.settings.mode ?? 'trophy', (mode) => act('setRules', { mode })),
      g.settings.mode === 'race' ? [h('div', { class: 't' }, 'Pawns each'),
        seg([{ value: 2, label: '2', sub: 'The classic', disabled: !lobby }, { value: 1, label: '1', sub: 'Quick race', disabled: !lobby }], g.settings.pawns ?? 2, (n) => act('setPawns', { n }))] : null),
    g.settings.mode === 'race' ? null : card(eyebrow('Rules'),
      h('div', { class: 't' }, 'Trophies to win'),
      seg((g.targets ?? [1, 2, 3]).map((n) => ({ value: n, label: String(n), sub: n === 3 ? 'The classic' : n === 1 ? 'Quick' : '', disabled: !lobby })), g.settings.target, (n) => act('setTarget', { n })),
      toggle({ label: 'Challenge tokens', sub: 'Three each: throw a card back at the other team', checked: g.settings.challenges, onchange: (on) => (lobby ? act('setChallenges', { on }) : null) })),
  ];
  const danger = lobby ? [] : [
    button({ label: 'End game', icon: 'x', kind: 'bad', block: true, onclick: () => ctx.confirm({ title: 'End the game?', message: 'Everyone goes back to the lobby and the trophies start over.', confirmLabel: 'End game', onConfirm: () => act('endGame') }) }),
  ];
  return { title: 'Guys vs Gals', sub: SUB[g.phase] ?? '', body, dock: dock.length ? h('div', { class: 'dock-row' }, dock) : null, settings, danger };
}
