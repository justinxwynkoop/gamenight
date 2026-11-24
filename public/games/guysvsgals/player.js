// Guys vs Gals on a phone. In the lobby you pick your side. When it is your team's question you vote here (and see how
// your teammates voted); when it is the other team's, your phone knows the answer (behind a peek button) so you can
// enjoy watching them squirm. In a Lightning Round your team taps True or False as fast as it can. Emoji at the
// bottom float up on the TV.
import { h, setKids } from '../../common.js';
import { loadStyles, token, lane, teamOf, nameOf, aboutText, otherSide, LETTERS, lengthText } from './shared.js';

const LETTER_COLORS = ['#ffe14d', '#7cf0ff', '#b4ff6b', '#ffa7d8'];

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
      g.phase !== 'lobby' ? h('div', { class: 'pos' }, `${t.pos} / ${g.length}`, h('small', {}, 'spaces')) : null);
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
      g.me?.canStart
        ? [btn(ready ? 'Start the battle!' : 'Both sides need a player', 'go huge', () => send({ t: 'start' }), { disabled: !ready }),
          h('p', { class: 'dim' }, 'You joined first, so you start the game when everyone is in.')]
        : h('p', { class: 'dim' }, g.hosted ? 'The host starts the game when everyone is in.' : 'The first player to join starts the game.'),
      anotherPlayer(),
      rules(g),
    ];
  }

  /** Opens a new tab that joins as another player, for one phone shared by both sides (or trying it on your own). */
  function anotherPlayer() {
    const params = new URLSearchParams(location.search);
    params.set('seat', String(Math.min(9, Number(params.get('seat') || 1) + 1)));
    return h('a', { class: 'gv-btn gv-another', href: `${location.pathname}?${params}`, target: '_blank', rel: 'noopener' }, '＋ Add another player on this phone');
  }

  function rules(g) {
    return h('details', { class: 'gv-pcard' }, h('summary', {}, 'How to play'),
      h('p', {}, 'The teams take turns. On your turn everyone on your team votes for an answer on their phone. The team’s favourite answer is locked in.'),
      h('p', {}, `Right: your token moves ${g.step} spaces. Wrong: it stays put. First to the finish wins (the other team gets one last turn to tie).`),
      g.lightningAt?.length ? h('p', {}, '⚡ Reach a lightning space and your team plays a Lightning Round: true-or-false, as fast as you can. Every right answer is a space.') : null,
      h('p', { class: 'dim' }, `${lengthText(g)}.`));
  }

  function tracks(g) {
    return h('div', { class: 'gv-pcard gv-ptrack' }, lane(g, 'guys', { compact: true }), lane(g, 'gals', { compact: true }));
  }

  function question(g) {
    const q = g.question;
    const me = g.me ?? {};
    const reveal = g.phase === 'reveal';
    const t = teamOf(g, g.turn);
    const top = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('span', { class: 'gv-chip', style: { '--a': teamOf(g, q.about)?.color } }, aboutText(q.about)), q.cat ? h('span', { class: 'gv-chip ghost' }, q.cat) : null);
    if (me.myTurn) {
      const choices = h('div', { class: 'gv-pchoices' }, q.choices.map((c, i) => {
        let cls = me.vote === i ? 'mine' : '';
        if (reveal) cls = i === q.answer ? 'right' : i === q.pick ? 'wrong' : '';
        else if (q.locked && i === q.pick) cls = 'mine';
        return h('button', { type: 'button', class: `gv-pchoice ${cls}`, 'data-i': i, disabled: q.locked || reveal, style: { '--l': LETTER_COLORS[i], '--t': t?.color }, onclick: () => send({ t: 'vote', choice: i }) },
          h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', {}, c),
          q.counts[i] ? h('span', { class: 'n' }, Array.from({ length: q.counts[i] }, () => h('i', {}))) : null);
      }));
      return [
        h('div', { class: 'gv-pcard accent', style: { '--c': t?.color } }, top, h('div', { class: 'gv-pq' }, q.text),
          h('p', { class: 'dim' }, reveal ? verdict(g) : q.locked ? 'Locked in! Fingers crossed…' : me.vote !== undefined ? 'Voted! You can change it until everyone has voted.' : 'Vote for your answer. The team’s favourite wins.')),
        choices,
      ];
    }
    // The other team (or someone without a side).
    if (peekKey !== q.n) { peek = false; peekKey = q.n; }
    const ans = me.answer ?? q.answer;
    return [
      h('div', { class: 'gv-pcard' }, top, h('div', { class: 'gv-pq' }, q.text),
        h('p', { class: 'dim' }, reveal ? verdict(g) : `The ${t?.name ?? ''} are answering. This is your stuff: you know this one!`)),
      h('div', { class: 'gv-pchoices' }, q.choices.map((c, i) => h('div', { class: `gv-pchoice ${reveal ? (i === q.answer ? 'right' : i === q.pick ? 'wrong' : '') : peek && i === ans ? 'right' : ''}`, style: { '--l': LETTER_COLORS[i], '--t': t?.color } },
        h('span', { class: 'gv-letter' }, LETTERS[i]), h('span', {}, c), q.counts[i] ? h('span', { class: 'n' }, Array.from({ length: q.counts[i] }, () => h('i', {}))) : null))),
      !reveal && ans !== undefined ? h('button', { type: 'button', class: `gv-peek ${peek ? 'open' : ''}`, onclick: () => { peek = !peek; refresh(); } }, peek ? `🤫 It’s ${LETTERS[ans]}! Keep a straight face. (Tap to hide)` : '👀 Peek at the answer (don’t give it away!)') : null,
    ];
  }

  function verdict(g) {
    const r = g.result;
    if (!r) return '';
    return r.correct ? `Right! The ${nameOf(g, g.turn)} move ${r.moved} spaces.` : r.timeout ? 'Out of time!' : `Wrong! The ${nameOf(g, g.turn)} stay put.`;
  }

  function lightning(g) {
    const L = g.lightning;
    const me = g.me ?? {};
    const t = teamOf(g, L.side);
    const mine = me.side === L.side;
    if (g.phase === 'lightning-intro') {
      return h('div', { class: 'gv-pcard accent', style: { '--c': '#ffe14d' } }, h('h2', {}, '⚡ LIGHTNING ROUND ⚡'),
        h('p', {}, mine ? 'Get your thumbs ready: True or False, as fast as you can. Anyone on the team can answer!' : `The ${t?.name ?? ''} are about to answer true or false, as fast as they can.`));
    }
    if (g.phase === 'lightning-done' || L.over) {
      return h('div', { class: 'gv-pcard accent', style: { '--c': '#ffe14d' } }, h('h2', {}, `${L.rights} of ${L.total} right!`), h('p', { class: 'dim' }, `The ${t?.name ?? ''} move ${L.rights} ${L.rights === 1 ? 'space' : 'spaces'}.`));
    }
    const last = L.done.at(-1);
    return [
      h('div', { class: 'gv-pcard accent', style: { '--c': '#ffe14d' } },
        h('div', { class: 'dim' }, `⚡ ${L.i + 1} of ${L.total} · ${L.rights} right so far`),
        h('div', { class: 'gv-pq' }, L.current ?? ''),
        L.flash && last ? h('p', {}, last.correct ? '✅ Right!' : `❌ It was ${last.a ? 'true' : 'false'}`) : null),
      mine
        ? h('div', { class: 'gv-ptf' },
          h('button', { type: 'button', class: 't', onclick: () => send({ t: 'lightning', said: true }) }, 'TRUE'),
          h('button', { type: 'button', class: 'f', onclick: () => send({ t: 'lightning', said: false }) }, 'FALSE'))
        : h('div', { class: 'gv-pcard' }, h('p', {}, me.lightningAnswer === undefined ? 'Watch the TV!' : `Psst: it’s ${me.lightningAnswer ? 'TRUE' : 'FALSE'}. Don’t say a word!`)),
    ];
  }

  function gameover(g) {
    const ws = g.winners ?? [];
    const won = ws.includes(g.me?.side);
    return [
      h('div', { class: 'gv-pcard accent', style: { '--c': ws.length > 1 ? '#ffe14d' : teamOf(g, ws[0])?.color } },
        h('h2', {}, ws.length > 1 ? 'It’s a tie!' : `The ${nameOf(g, ws[0])} win!`),
        h('p', {}, won ? (ws.length > 1 ? 'Nobody loses tonight. 🤝' : 'That’s your team! 🎉') : 'Rematch? 😤'),
        h('div', { style: { display: 'flex', gap: '12px', justifyContent: 'center' } }, ws.map((s) => token(s, teamOf(g, s)?.color ?? '#888', 90)))),
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
    return h('details', { class: 'gv-pcard' }, h('summary', {}, 'Someone gone quiet?'),
      h('p', { class: 'dim' }, 'You started the game, so you can keep it moving.'),
      btn(g.phase === 'question' && !g.question?.locked ? 'Lock in their answer now' : 'Move on', '', () => send({ t: 'advance' })));
  }

  function refresh() {
    const g = view?.game;
    if (!g || !view.room?.me) return;
    let body;
    if (g.phase === 'lobby') body = lobby(g);
    else if ((g.phase === 'question' || g.phase === 'reveal') && g.question) body = question(g);
    else if (g.phase.startsWith('lightning') && g.lightning) body = lightning(g);
    else if (g.phase === 'gameover') body = gameover(g);
    else body = waiting(g);
    setKids(container, h('div', { class: 'gv' }, header(g), body, g.phase !== 'lobby' ? tracks(g) : null, helper(g), g.phase !== 'lobby' ? rules(g) : null, reacts(g)));
  }

  return {
    update(v) { view = v; refresh(); },
    onMessage(m) { if (m.t === 'ack') navigator.vibrate?.(25); },
    destroy() {},
  };
}
