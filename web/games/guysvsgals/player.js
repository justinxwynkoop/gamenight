// Guys vs Gals on a phone. In the lobby you pick your side. In the game your phone does whatever your job is right now:
//  - the reader (a player on the other team, taking turns) sees the card and its answer, reads it out and taps Right or
//    Wrong; on an Our Lives card they secretly pick the true answer about themselves first;
//  - the team at play says its answer out loud (Our Lives: everyone votes A, B or C here) and can throw a card back
//    with a challenge token;
//  - on an Our Moves card the reader picks an actor, the two of them see what to act out, and the reader calls who
//    shouted it first.
// Only the reader's phone shows the answer, like holding the card. In the pawn race the reader reads three questions a
// card and there are no challenges. Emoji at the bottom float up on the TV.
import { h, setKids } from '../../common.js';
import { loadStyles, token, path, deckOf, pic, teamOf, nameOf, aboutText, otherSide, LETTERS, isRace, raceTrack, acrossText } from './shared.js';

const LETTER_COLORS = ['#ffe14d', '#7cf0ff', '#b4ff6b'];

export function mount(container, { send }) {
  loadStyles();
  let view = null;
  let peek = false;
  let peekKey = null;

  const btn = (label, cls, onclick, extra = {}) => h('button', { type: 'button', class: `gv-btn ${cls}`, onclick, ...extra }, label);
  const card = (...kids) => h('div', { class: 'gv-pcard' }, kids);

  function header(g) {
    const side = g.me?.side;
    const t = teamOf(g, side);
    if (!t) return null;
    return h('div', { class: 'gv-phead', style: { '--c': t.color } }, token(side, t.color, 44),
      h('div', {}, h('b', {}, `Team ${t.name}`), h('div', { class: 'dim' }, `You answer ${aboutText(otherSide(side)).toLowerCase()}`)),
      g.phase !== 'lobby' && isRace(g) ? h('div', { class: 'gv-pstat' }, h('span', {}, `🏁 ${acrossText(g, side)}`)) : null,
      g.phase !== 'lobby' && !isRace(g) ? h('div', { class: 'gv-pstat' },
        h('span', { title: 'Trophies' }, `🏆 ${t.trophies}/${g.target}`),
        g.settings.challenges ? h('span', { title: 'Challenge tokens' }, `✋ ${t.challenges}`) : null) : null);
  }

  function sidePicker(g) {
    const mine = g.me?.picked ? g.me.side : null;
    return h('div', { class: 'gv-sides' }, ['guys', 'gals'].map((side) => {
      const t = teamOf(g, side);
      return h('button', { type: 'button', class: `gv-side ${mine === side ? 'on' : ''}`, style: { '--c': t?.color }, 'data-side': side, onclick: () => send({ t: 'side', side }) },
        token(side, t?.color ?? '#888', 72), `I'm a ${side === 'guys' ? 'Guy' : 'Gal'}`, h('small', {}, `${t?.members.length ?? 0} on Team ${t?.name ?? ''}`));
    }));
  }

  function lobby(g) {
    const ready = g.teams.every((t) => t.members.length);
    return [
      card(h('h2', {}, g.me?.picked ? 'Your side' : 'Which side are you on?'),
        h('p', { class: 'dim' }, 'The Guys answer questions about gal stuff. The Gals answer questions about guy stuff. Who knows the other side better?'),
        sidePicker(g)),
      modePicker(g),
      g.me?.canStart
        ? [btn(ready ? 'Start the battle!' : 'Both sides need a player', 'go huge', () => send({ t: 'start' }), { disabled: !ready }),
          h('p', { class: 'dim' }, 'You joined first, so you start the game when everyone is in.')]
        : h('p', { class: 'dim' }, g.hosted ? 'The host starts the game when everyone is in.' : 'The first player to join starts the game.'),
      anotherPlayer(),
      rules(g),
    ];
  }

  /** Tug of war or race: the first player (or the host) picks; everyone else sees which. */
  function modePicker(g) {
    const race = g.settings.mode === 'race';
    if (!g.me?.canStart) return h('p', { class: 'dim' }, race ? '🏁 This game is the pawn race.' : '🏆 This game is the trophy tug of war.');
    return card(h('h2', {}, 'Which game?'),
      h('div', { class: 'gv-sides gv-modes' },
        h('button', { type: 'button', class: `gv-side ${race ? '' : 'on'}`, 'data-mode': 'trophy', onclick: () => send({ t: 'mode', mode: 'trophy' }) }, '🏆 Tug of war', h('small', {}, 'Pull the trophy to your side')),
        h('button', { type: 'button', class: `gv-side ${race ? 'on' : ''}`, 'data-mode': 'race', onclick: () => send({ t: 'mode', mode: 'race' }) }, '🏁 Race', h('small', {}, 'Get your pawns across'))));
  }

  /** Opens a new tab that joins as another player, for one phone shared by both sides (or trying it on your own). */
  function anotherPlayer() {
    const params = new URLSearchParams(location.search);
    params.set('seat', String(Math.min(9, Number(params.get('seat') || 1) + 1)));
    return h('a', { class: 'gv-btn gv-another', href: `${location.pathname}?${params}`, target: '_blank', rel: 'noopener' }, '＋ Add another player on this phone');
  }

  function rules(g) {
    if (g.settings.mode === 'race') {
      const two = g.settings.pawns !== 1;
      return h('details', { class: 'gv-pcard' }, h('summary', {}, 'How to play the race'),
        h('p', {}, 'A coin toss says who goes first. A player on the other team reads you a card with three questions, and judges your answers on their phone.'),
        h('p', {}, 'Every right answer moves your pawn one space and you get the next question. A miss, or all three right, ends your turn.'),
        h('p', {}, 'Land on your own wild space and you draw a wild card at once. End your turn on the other team’s wild space and you draw one of theirs. Wild cards help the team they belong to.'),
        two ? h('p', {}, 'Each team has two pawns: the second starts when the first gets across. Once a game, end your turn on the other team’s pawn to take it prisoner. It is freed when their other pawn gets across.') : null,
        h('p', {}, two ? 'Get both pawns across first to win.' : 'Get your pawn across first to win.'));
    }
    return h('details', { class: 'gv-pcard' }, h('summary', {}, 'How to play'),
      h('p', {}, `The trophy starts on START. The ${nameOf(g, g.first)} go first. A player on the other team reads you a card from their deck, and judges your answer on their phone.`),
      h('p', {}, 'Right: the trophy moves one space toward your end and you get another card. Wrong: the other team’s turn.'),
      h('p', {}, `Get it right while the trophy is on your green space and it’s yours. First to ${g.target} ${g.target === 1 ? 'trophy' : 'trophies'} wins.`),
      h('p', {}, 'The space picks the deck: Our Facts, Our Stuff, Our Pics (a picture on the TV), Our Lives (guess what the reader secretly picked) and Our Moves (charades: both teams act at once, shout first to win).'),
      g.settings.challenges ? h('p', {}, '✋ Each team has 3 challenges: throw a card back and make the other team answer it themselves. If they miss, the trophy comes your way.') : null);
  }

  function chips(g, c) {
    const d = deckOf(g, c.deck);
    return h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      isRace(g) ? null : h('span', { class: 'gv-pchip', style: { '--d': d.color } }, d.name),
      h('span', { class: `gv-pchip ${c.about}` }, aboutText(c.about)),
      c.cat && !isRace(g) ? h('span', { class: 'gv-pchip', style: { '--d': '#fff' } }, c.cat) : null);
  }

  function challengeBtn(g) {
    const me = g.me ?? {};
    if (!me.canChallenge) return null;
    const left = teamOf(g, me.side)?.challenges ?? 0;
    return btn(`✋ Challenge! (${left} left)`, 'gv-challenge', () => send({ t: 'challenge' }));
  }

  function peekBtn(key, label, reveal) {
    if (peekKey !== key) { peek = false; peekKey = key; }
    return h('button', { type: 'button', class: `gv-peek ${peek ? 'open' : ''}`, onclick: () => { peek = !peek; refresh(); } },
      peek ? `🤫 ${reveal} Keep a straight face. (Tap to hide)` : label);
  }

  /** An Our Facts, Stuff or Pics card: spoken answers, judged by the reader (or, on a challenge, by the challengers). */
  function spoken(g) {
    const c = g.card;
    const me = g.me ?? {};
    const reader = c.reader?.name ?? '';
    const face = [chips(g, c), c.img ? pic(c.img) : null, h('div', { class: 'gv-pq' }, h('span', { class: 'gv-qa' }, 'Q: '), c.text)];
    if (me.canJudge) {
      return [
        h('div', { class: 'gv-pcard accent' }, face,
          h('div', { class: 'gv-pans' }, h('small', {}, 'THE ANSWER'), me.answer ?? ''),
          h('p', { class: 'dim' }, c.challenged
            ? (me.reader ? `Challenge! Your own team has to answer it now. No hints! Were they right?` : `Challenge! The ${nameOf(g, c.about)} must answer it themselves. Were they right?`)
            : me.reader ? `You’re the reader. Only you can see this, so keep it hidden! Read it out loud to the ${nameOf(g, g.turn)}, then tap what they said.` : `${reader} wandered off, so you judge this one.`)),
        h('div', { class: 'gv-judge' },
          h('button', { type: 'button', class: 'yes', onclick: () => send({ t: 'judge', right: true }) }, 'RIGHT'),
          h('button', { type: 'button', class: 'no', onclick: () => send({ t: 'judge', right: false }) }, 'WRONG')),
      ];
    }
    if (me.myTurn) {
      return [
        h('div', { class: 'gv-pcard accent' }, face, h('p', { class: 'dim' }, `${reader} reads it to you. Say your answer out loud!`)),
        challengeBtn(g),
      ];
    }
    return h('div', { class: 'gv-pcard accent' }, face,
      h('p', {}, c.challenged && me.side === c.about ? `Challenge! Your team has to answer this one, without help from ${reader}. Say it out loud!` : `The ${nameOf(g, g.turn)} are answering.`));
  }

  /** An Our Lives card: the reader picks in secret, then the team (or on a challenge, the reader's teammates) guesses. */
  function lives(g) {
    const c = g.card;
    const me = g.me ?? {};
    const reader = c.reader?.name ?? '';
    const face = [chips(g, c), h('div', { class: 'gv-pq' }, h('span', { class: 'gv-qa' }, 'Q: '), c.text)];
    if (c.stage === 'secret') {
      if (me.canPick) {
        return [h('div', { class: 'gv-pcard accent' }, face, h('p', { class: 'dim' }, `It’s about you! Read the question and the three answers out loud, then secretly tap the one that’s true for you. The ${nameOf(g, g.turn)} have to guess it.`)),
          h('div', { class: 'gv-pchoices' }, c.choices.map((x, i) => h('button', { type: 'button', class: 'gv-pchoice', 'data-i': i, style: { '--l': LETTER_COLORS[i] }, onclick: () => send({ t: 'secret', choice: i }) },
            h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', {}, x))))];
      }
      return h('div', { class: 'gv-pcard accent' }, face, list(c, null), h('p', { class: 'dim' }, `🤫 ${reader} is secretly picking the one that’s true for them…`));
    }
    // Guessing.
    const parts = [h('div', { class: 'gv-pcard accent' }, face,
      h('p', { class: 'dim' }, me.canGuess
        ? (c.challenged ? `Challenge! What did ${reader} pick? Your team guesses this one.` : `What did ${reader} pick? Everyone votes: the team’s favourite counts.`)
        : `The ${nameOf(g, c.challenged ? c.about : g.turn)} are guessing what ${reader} picked (${c.voters?.length ?? 0} of ${c.guessers?.length ?? 0} voted).`))];
    if (me.canGuess) {
      parts.push(h('div', { class: 'gv-pchoices' }, c.choices.map((x, i) => h('button', { type: 'button', class: `gv-pchoice ${me.vote === i ? 'mine' : ''}`, 'data-i': i, style: { '--l': LETTER_COLORS[i] }, onclick: () => send({ t: 'vote', choice: i }) },
        h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', {}, x)))));
    } else parts.push(list(c, peek && me.secret !== undefined && me.secret !== null ? me.secret : null));
    if (me.secret !== undefined && me.secret !== null && !me.canGuess) parts.push(peekBtn(`l${c.n}`, `👀 Peek at what ${me.reader ? 'you' : reader} picked`, `It’s ${LETTERS[me.secret]}!`));
    parts.push(challengeBtn(g));
    return parts;
  }
  function list(c, right) {
    return h('div', { class: 'gv-pchoices' }, c.choices.map((x, i) => h('div', { class: `gv-pchoice ${i === right ? 'right' : ''}`, style: { '--l': LETTER_COLORS[i] } }, h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', {}, x))));
  }

  /** An Our Moves card: the reader picks an actor, both act it out at once, the reader calls who got it first. */
  function moves(g) {
    const c = g.card;
    const me = g.me ?? {};
    const reader = c.reader?.name ?? '';
    const parts = [];
    if (c.stage === 'pick') {
      if (me.canPickActor) {
        parts.push(h('div', { class: 'gv-pcard accent' }, chips(g, c), h('div', { class: 'gv-pq' }, 'Charades!'),
          h('p', { class: 'dim' }, `${me.reader ? 'You’re' : `${reader} is`} acting. Pick someone on the ${nameOf(g, g.turn)} to act the same thing at the same time. Each team shouts at its own actor: first to say it wins!`)),
        h('div', { class: 'gv-pchoices' }, (me.actors ?? []).map((p) => h('button', { type: 'button', class: 'gv-pchoice', 'data-pid': p.id, onclick: () => send({ t: 'actor', pid: p.id }) }, h('span', {}, `🎭 ${p.name}`)))));
      } else parts.push(h('div', { class: 'gv-pcard accent' }, chips(g, c), h('div', { class: 'gv-pq' }, 'Charades!'), h('p', { class: 'dim' }, `${reader} is picking someone on your team to act with.`)));
      return parts;
    }
    if (me.move) {
      parts.push(h('div', { class: 'gv-pcard accent' }, chips(g, c), h('p', {}, 'Act this out (no talking, no pointing at things!):'), h('div', { class: 'gv-move' }, me.move),
        h('p', { class: 'dim' }, me.reader ? `${c.actor?.name ?? ''} is acting the same thing for the ${nameOf(g, g.turn)}. Your team guesses yours.` : `${reader} is acting the same thing for the ${nameOf(g, c.about)}. Your team guesses yours.`)));
    } else {
      parts.push(h('div', { class: 'gv-pcard accent' }, chips(g, c), h('div', { class: 'gv-pq' }, 'Shout it out!'),
        h('p', { class: 'dim' }, me.side === c.about ? `Guess what ${reader} is acting!` : `Guess what ${c.actor?.name ?? ''} is acting!`)));
    }
    if (me.canCall) {
      parts.push(h('p', { class: 'dim' }, 'Who said it first?'), h('div', { class: 'gv-judge three' },
        ['guys', 'gals'].map((s) => h('button', { type: 'button', 'data-side': s, style: { '--c': teamOf(g, s)?.color }, onclick: () => send({ t: 'moves', side: s }) }, `The ${nameOf(g, s)} got it`)),
        h('button', { type: 'button', class: 'nobody', onclick: () => send({ t: 'moves', side: null }) }, 'Nobody got it')));
    }
    return parts;
  }

  function result(g) {
    const c = g.card;
    const r = g.result;
    if (isRace(g)) {
      const head = r.won ? `🏁 The ${nameOf(g, r.won)} win the race!` : r.right ? 'Right!' : 'Wrong!';
      return h('div', { class: 'gv-pcard accent' }, chips(g, c), h('h2', {}, head),
        c.text ? h('div', { class: 'gv-pq' }, h('span', { class: 'gv-qa' }, 'Q: '), c.text) : null,
        r.answer ? h('div', { class: 'gv-pans' }, h('small', {}, 'THE ANSWER'), r.answer) : null,
        r.wild ? h('div', { class: 'gv-pans', style: { background: teamOf(g, r.wild.owner)?.color, color: '#fff' } }, h('small', {}, `${nameOf(g, r.wild.owner).toUpperCase()} WILD CARD`), r.wild.text) : null,
        r.captured ? h('p', {}, `🔒 A ${nameOf(g, r.captured)} pawn is taken prisoner!`) : null,
        r.crossed && !r.won ? h('p', {}, `🎉 A ${nameOf(g, r.crossed)} pawn is across!`) : null,
        h('p', { class: 'dim' }, g.line.next));
    }
    const head = r.trophy ? `🏆 The ${nameOf(g, r.trophy)} win the trophy!`
      : c.deck === 'moves' ? (r.moved ? `The ${nameOf(g, r.moved)} got it!` : r.timeout ? 'Time’s up!' : 'Nobody got it')
        : r.challenged ? (r.right ? `The ${nameOf(g, c.about)} beat the challenge!` : `The ${nameOf(g, c.about)} missed the challenge!`)
          : r.right ? 'Right!' : 'Wrong!';
    return h('div', { class: 'gv-pcard accent' }, chips(g, c), h('h2', {}, head),
      c.text ? h('div', { class: 'gv-pq' }, h('span', { class: 'gv-qa' }, 'Q: '), c.text) : null,
      r.answer ? h('div', { class: 'gv-pans' }, h('small', {}, c.deck === 'lives' ? `${c.reader?.name ?? ''} PICKED` : c.deck === 'moves' ? 'THE MOVE WAS' : 'THE ANSWER'), r.answer) : null,
      h('p', { class: 'dim' }, g.line.next));
  }

  function trophyWon(g) {
    const side = g.trophyWon;
    const mine = side === g.me?.side;
    return h('div', { class: 'gv-pcard accent' }, h('h2', {}, `🏆 The ${nameOf(g, side)} win a trophy!`),
      h('p', {}, mine ? 'That’s your team! 🎉' : 'Get the next one! 😤'), h('p', { class: 'dim' }, g.line.next));
  }

  function gameover(g) {
    const side = (g.winners ?? [])[0];
    const won = side === g.me?.side;
    return [
      h('div', { class: 'gv-pcard accent', style: { '--c': teamOf(g, side)?.color } },
        h('h2', {}, `The ${nameOf(g, side)} win!`),
        h('p', {}, won ? 'That’s your team! 🎉' : 'Rematch? 😤'),
        h('div', { style: { display: 'flex', justifyContent: 'center' } }, token(side, teamOf(g, side)?.color ?? '#888', 90))),
      g.me?.canStart ? btn('Rematch!', 'go huge', () => send({ t: 'play-again' })) : h('p', { class: 'dim' }, g.hosted ? 'The host can start a rematch.' : 'The first player can start a rematch.'),
    ];
  }

  function waiting(g) {
    return card(h('h2', {}, g.line.text), g.line.next ? h('p', { class: 'dim' }, g.line.next) : null);
  }

  function reacts(g) {
    if (g.phase === 'lobby') return null;
    return h('div', { class: 'gv-reacts' }, (g.reactionList ?? []).map((e, i) => h('button', { type: 'button', 'aria-label': `React ${e}`, onclick: () => send({ t: 'react', e: i }) }, e)));
  }

  function helper(g) {
    if (!g.me?.canStart || ['lobby', 'gameover'].includes(g.phase)) return null;
    const guessing = g.phase === 'card' && g.card?.stage === 'guess';
    if (g.phase === 'card' && !guessing) return null;
    return h('details', { class: 'gv-pcard' }, h('summary', {}, 'Someone gone quiet?'),
      h('p', { class: 'dim' }, 'You started the game, so you can keep it moving.'),
      btn(guessing ? 'Lock in their guesses now' : 'Move on', '', () => send({ t: 'advance' })));
  }

  function refresh() {
    const g = view?.game;
    if (!g || !view.room?.me) return;
    let body;
    if (g.phase === 'lobby') body = lobby(g);
    else if (g.phase === 'card' && g.card) body = g.card.deck === 'lives' ? lives(g) : g.card.deck === 'moves' ? moves(g) : spoken(g);
    else if (g.phase === 'result' && g.card && g.result) body = result(g);
    else if (g.phase === 'trophy') body = trophyWon(g);
    else if (g.phase === 'gameover') body = gameover(g);
    else body = waiting(g);
    setKids(container, h('div', { class: 'gv', style: g.card && (g.phase === 'card' || g.phase === 'result') ? { '--a': deckOf(g, g.card.deck).color, '--back': teamOf(g, g.card.about)?.color } : {} }, header(g), body,
      g.phase !== 'lobby' ? h('div', { class: 'gv-pcard gv-ppath' }, isRace(g) ? raceTrack(g, { compact: true }) : path(g, { compact: true })) : null,
      helper(g), g.phase !== 'lobby' ? rules(g) : null, reacts(g)));
  }

  return {
    update(v) { view = v; refresh(); },
    onMessage(m) { if (m.t === 'ack') navigator.vibrate?.(25); },
    destroy() {},
  };
}
