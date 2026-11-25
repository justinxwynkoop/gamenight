// Pie Chase on a phone. On your turn you roll here and pick where to move (on a little copy of the board, or from the
// list under it). When someone else answers, your phone shows the question and the answer, so you can read it out and
// say whether they got it right; the next player in turn is the one who reads. With a host, the host reads instead.
import { h, setKids, ink } from '../../common.js';
import { loadStyles, board, pie, die, nameOf, catOf, unitOf, spaceName, spaceOf, goalText, icon, logo, confetti } from './shared.js';

export function mount(container, { send }) {
  loadStyles();
  let view = null;
  let lastRoll = null;

  const btn = (label, cls, onclick, extra = {}) => h('button', { type: 'button', class: `pc-btn ${cls}`, onclick, ...extra }, label);
  const card = (...kids) => h('div', { class: 'pc-pcard' }, kids);

  function me(v) { return v.me ?? {}; }
  function mine(v) { return unitOf(v, me(v).unitId); }

  function header(v) {
    const u = mine(v);
    if (!u) return null;
    const teams = view.room?.mode === 'teams';
    return h('div', { class: 'pc-me', style: { '--c': u.color } }, pie(v, u.wedges, 54, u.color),
      h('div', {}, h('b', {}, teams ? `Team ${u.name}` : u.name),
        h('div', { class: 'dim' }, `${u.wedges.length} of ${v.settings.wedgesToWin} wedges${v.phase !== 'lobby' ? ` · ${spaceName(v, u.pos)}` : ''}`)));
  }

  function scores(v) {
    return h('details', { class: 'pc-pcard' }, h('summary', {}, 'Everyone’s pies'),
      h('div', { class: 'pc-scores' }, v.units.map((u) => h('div', { class: `pc-score ${u.id === v.turn ? 'turn' : ''}` }, pie(v, u.wedges, 34, u.color),
        h('b', {}, u.name), h('span', { class: 'dim' }, `${u.wedges.length} · ${spaceName(v, u.pos)}`)))));
  }

  function rules() {
    return h('details', { class: 'pc-pcard' }, h('summary', {}, 'How to play'),
      h('p', {}, 'Everyone starts in the hub. Roll, then move exactly that many spaces in any direction (you can turn at a headquarters and cross the hub, but not double back).'),
      h('p', {}, 'Land on a colour and the next player reads you a question in that category. Right: roll again. Wrong: your turn is over.'),
      h('p', {}, 'Answer right on a headquarters (the big spaces at the end of each spoke) to win that wedge. Roll Again spaces (⚄) just mean roll again. In the hub you pick any category.'),
      h('p', {}, 'With every wedge, head back to the hub and land on it by exact count. The other players pick the category: get it right and you win! Get it wrong and you leave the hub next turn and come back.'));
  }

  function lobby(v) {
    const n = v.units.length;
    const teams = view.room?.mode === 'teams';
    return [
      card(h('div', { class: 'pc-hero' }, logo(v, 'div')),
        h('p', {}, `Win a wedge in each of the six categories, then race back to the hub and answer one last question to win. To win: ${goalText(v)}.`),
        h('p', { class: 'dim' }, `${n} ${teams ? (n === 1 ? 'team' : 'teams') : n === 1 ? 'player' : 'players'} · ${v.minUnits} to ${v.maxUnits}`),
        h('div', { class: 'pc-scores' }, v.units.map((u) => h('div', { class: 'pc-score' }, pie(v, [], 30, u.color), h('b', {}, u.name), u.members ? h('span', { class: 'dim' }, u.members.join(', ')) : null)))),
      me(v).canStart
        ? [btn(n < v.minUnits ? `Waiting for ${v.minUnits - n} more` : 'Start the game', 'go huge', () => send({ t: 'start' }), { disabled: n < v.minUnits }),
          h('p', { class: 'dim' }, 'You joined first, so you start the game when everyone is in.')]
        : h('p', { class: 'dim' }, v.hosted ? 'The host starts the game when everyone is in.' : 'The first player starts the game when everyone is in.'),
      anotherPlayer(),
      rules(),
    ];
  }

  /** Opens a new tab that joins as another player, for one phone shared by two people (or trying it on your own). */
  function anotherPlayer() {
    const params = new URLSearchParams(location.search);
    const next = String(Math.min(9, Number(params.get('seat') || 1) + 1));
    params.set('seat', next);
    return h('a', { class: 'btn', href: `${location.pathname}?${params}`, target: '_blank', rel: 'noopener', style: { display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '12px' } }, '＋ Add another player on this phone');
  }

  function rolloff(v) {
    const r = v.rolloff;
    const id = me(v).unitId;
    const inIt = r.contenders.includes(id);
    const rolled = r.rolls[id];
    return [
      card(h('h2', {}, r.starter ? `${nameOf(v, r.starter)} goes first!` : r.round > 1 ? 'A tie for highest: roll again' : 'Roll to see who goes first'),
        h('p', { class: 'dim' }, 'The highest roll starts. Then play passes to the left.'),
        h('div', { class: 'pc-scores' }, v.units.map((u) => h('div', { class: 'pc-score' }, pie(v, [], 30, u.color), h('b', {}, u.name),
          h('span', { class: 'dim' }, r.rolls[u.id] ? `rolled ${r.rolls[u.id]}` : r.contenders.includes(u.id) ? '…' : 'out'))))),
      !r.starter && inIt && !rolled ? btn('🎲 Roll', 'go huge', () => send({ t: 'roll' })) : null,
      rolled ? h('div', { class: 'pc-bigdie' }, die(rolled, { size: 110 })) : null,
    ];
  }

  function rollPhase(v) {
    const m = me(v);
    const who = nameOf(v, v.turn);
    if (!m.myTurn) return [card(h('h2', {}, `${who}’s turn`), h('p', { class: 'dim' }, v.line.text)), h('div', { class: 'pc-mini small' }, board(v, { focus: v.turn }))];
    const u = mine(v);
    const allIn = u && u.wedges.length >= v.settings.wedgesToWin;
    return [
      v.again ? h('div', { class: 'pc-pcard good' }, h('h2', {}, v.again === 'correct' ? 'Right! Roll again' : 'Roll Again space! Roll again')) : null,
      btn('🎲 Roll the die', 'go huge roll', () => send({ t: 'roll' })),
      allIn ? h('p', {}, 'You have every wedge: head for the hub, and land on it exactly!') : null,
    ];
  }

  function describe(v, id) {
    const sp = spaceOf(v, id);
    const c = sp?.cat != null ? catOf(v, sp.cat) : null;
    const u = mine(v);
    let note = '';
    if (sp?.kind === 'hq') note = u?.wedges.includes(sp.cat) ? 'you have this wedge' : 'win the wedge!';
    else if (sp?.kind === 'hub') note = u && u.wedges.length >= v.settings.wedgesToWin ? 'the winning question!' : 'pick any category';
    else if (sp?.kind === 'again') note = 'roll again';
    return { c, note, cat: sp?.cat ?? null };
  }

  function movePhase(v) {
    const m = me(v);
    const who = nameOf(v, v.turn);
    const dieEl = h('div', { class: 'pc-bigdie' }, die(v.die?.value, { size: 110, rolling: v.die?.n !== lastRoll }));
    lastRoll = v.die?.n;
    if (!m.myTurn) return [card(h('h2', {}, `${who} rolled ${v.die?.value}`), h('p', { class: 'dim' }, v.options.length > 1 ? 'They are picking where to go.' : 'Moving…')), dieEl, h('div', { class: 'pc-mini small' }, board(v, { focus: v.turn, highlight: v.options }))];
    if (v.options.length === 1) return [dieEl, card(h('h2', {}, `Moving to ${spaceName(v, v.options[0])}`))];
    // The list is in the same order as the numbers on the board.
    const go = (id) => send({ t: 'move', to: id });
    return [
      h('div', { class: 'pc-row' }, dieEl, card(h('h2', {}, `You rolled ${v.die?.value}`), h('p', { class: 'dim' }, 'Tap where to go: on the board or in the list.'))),
      h('div', { class: 'pc-mini' }, board(v, { highlight: v.options, onPick: go, focus: v.turn, labels: true })),
      h('div', { class: 'pc-dests' }, v.options.map((id, i) => {
        const { c, note, cat } = describe(v, id);
        return h('button', { type: 'button', class: 'pc-dest', 'data-id': id, style: { '--c': c?.color ?? '#5b6a99' }, onclick: () => go(id) },
          h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'sw' }, cat != null ? icon(v, cat, 18, '#fff') : h('span', {}, '⚂')), spaceName(v, id), note ? h('small', {}, note) : null);
      })),
    ];
  }

  function choosePhase(v) {
    const m = me(v);
    const who = nameOf(v, v.turn);
    if (!m.canChoose) {
      return card(h('h2', {}, v.chooser === 'opponents' ? (m.myTurn ? 'You made it to the hub!' : `${who} made it to the hub`) : `${who} is in the hub`),
        h('p', { class: 'dim' }, v.chooser === 'opponents' ? (m.myTurn ? 'The other players are picking the category for your winning question.' : 'Another player is picking.') : `${who} is picking a category.`));
    }
    const pick = (i) => send({ t: 'choose', cat: i });
    return [
      card(h('h2', {}, v.chooser === 'opponents' ? `Pick the category for ${who}’s winning question` : 'You are in the hub: pick any category'),
        v.chooser === 'opponents' ? h('p', { class: 'dim' }, 'Talk it over with the other players. Their hardest category?') : null),
      h('div', { class: 'pc-cats' }, v.categories.map((c, i) => h('button', { type: 'button', class: 'pc-cat', style: { '--c': c.color, '--ink': ink(c.color) }, onclick: () => pick(i) }, icon(v, i, 30, 'currentColor'), h('span', {}, c.name)))),
    ];
  }

  function qcard(v, withAnswer) {
    const q = v.question;
    const c = catOf(v, q.cat);
    const tag = q.final ? 'For the win' : q.hq && !q.hasWedge ? 'For the wedge' : '';
    return h('div', { class: 'pc-qcard', style: { '--c': c.color, '--ink': ink(c.color) } },
      h('div', { class: 'top' }, h('span', {}, icon(v, q.cat, 22, 'currentColor'), c.name), tag ? h('span', { class: 'tag' }, tag) : null),
      h('div', { class: 'q' }, q.text),
      withAnswer && q.answer ? h('div', { class: 'a' }, h('small', {}, 'Answer'), q.answer) : null);
  }

  function questionPhase(v) {
    const m = me(v);
    const who = nameOf(v, v.turn);
    if (m.myTurn) return [card(h('h2', {}, 'Answer out loud!'), h('p', { class: 'dim' }, v.hosted ? 'The host will say if you are right.' : `${nameOf(v, v.readerId)} reads it and says if you are right.`)), qcard(v, false)];
    if (!m.canJudge) return [card(h('h2', {}, `${who} is answering`), h('p', { class: 'dim' }, v.hosted ? 'The host reads the question and judges.' : '')), qcard(v, false)];
    return [
      card(h('h2', {}, m.reader ? `Read this to ${who}` : `${who} is answering`),
        h('p', { class: 'dim' }, m.reader ? 'Read the question out loud, listen, then tap Right or Wrong. Keep the answer to yourself!' : `${nameOf(v, v.readerId)} is reading. Anyone not answering can judge.`)),
      qcard(v, true),
      h('div', { class: 'pc-row' },
        btn('✓ Right', 'yes huge', () => send({ t: 'judge', correct: true })),
        btn('✗ Wrong', 'no huge', () => send({ t: 'judge', correct: false }))),
    ];
  }

  function resultPhase(v) {
    const r = v.result;
    const who = nameOf(v, v.turn);
    const text = r.win ? `🏆 ${who} wins!` : r.wedge != null ? `${who} wins the ${catOf(v, r.wedge).name} wedge!` : r.correct ? 'Right!' : 'Not quite';
    const u = unitOf(v, v.turn);
    const wedge = r.wedge != null && u;
    return [h('div', { class: `pc-pcard ${r.win || wedge ? 'gold' : r.correct ? 'good' : 'bad'}` },
      wedge ? h('div', { class: 'pc-wonpie' }, pie(v, u.wedges, 120, u.color, '', r.wedge)) : null,
      h('h2', {}, text), h('p', { class: 'dim' }, v.line.next)), qcard(v, true)];
  }

  function gameover(v) {
    const ws = (v.winners ?? []).map((id) => unitOf(v, id)).filter(Boolean);
    const won = ws.some((u) => u.id === me(v).unitId);
    return [
      won ? confetti(40) : null,
      card(h('h2', {}, ws.length > 1 ? `A tie: ${ws.map((u) => u.name).join(' and ')}!` : `${ws[0]?.name ?? 'Someone'} wins!`),
        won ? h('p', {}, 'That’s you! 🎉') : null,
        h('div', { class: 'pc-scores' }, ws.map((u) => h('div', { class: 'pc-wonpie' }, pie(v, u.wedges, 120, u.color), h('b', {}, u.name))))),
      me(v).canStart ? btn('Play again', 'go huge', () => send({ t: 'play-again' })) : h('p', { class: 'dim' }, v.hosted ? 'The host can start another game.' : 'The first player can start another game.'),
    ];
  }

  /** The first player (with no host) can keep the game moving when someone has wandered off. */
  function helper(v) {
    if (!me(v).canStart || ['lobby', 'gameover'].includes(v.phase)) return null;
    return h('details', { class: 'pc-pcard' }, h('summary', {}, 'Someone gone quiet?'),
      h('p', { class: 'dim' }, 'You started the game, so you can keep it moving.'),
      ['rolloff', 'roll', 'move', 'choose', 'result'].includes(v.phase) ? btn(v.phase === 'rolloff' ? 'Roll for everyone left' : v.phase === 'roll' ? `Roll for ${nameOf(v, v.turn)}` : 'Move on', '', () => send({ t: 'advance' })) : null,
      ['roll', 'move', 'choose', 'question'].includes(v.phase) ? btn(`Skip ${nameOf(v, v.turn)}’s turn`, '', () => send({ t: 'skip' })) : null);
  }

  function refresh() {
    const v = view?.game;
    if (!v || !view.room?.me) return;
    const body = {
      lobby, rolloff, roll: rollPhase, move: movePhase, choose: choosePhase, question: questionPhase, result: resultPhase, gameover,
    }[v.phase]?.(v) ?? h('p', {}, 'Waiting…');
    setKids(container, h('div', { class: 'pc' }, v.phase !== 'lobby' ? header(v) : null, body, v.phase !== 'lobby' ? scores(v) : null, helper(v), v.phase !== 'lobby' ? rules() : null));
  }

  return {
    update(v) { view = v; refresh(); },
    onMessage(m) { if (m.t === 'ack') navigator.vibrate?.(20); },
    destroy() {},
  };
}
