// Family Feud on a phone: the face-off buzzer, the question and the board, Play or Pass for the team that won
// the face-off, a box to type the guess when nobody is hosting, the captain's controls, and the Fast Money form.
// The page (play.js) handles joining and the header; this fills the rest.
import { h, ink } from '../../common.js';
import { buildFastMoneyForm } from './fmform.js';

export function mount(container, { send, flash }) {
  let view = null;
  let receivedAt = 0;
  let screenKey = '';
  let buzzBtn; let statusLine; let peek; let clockEl; let fmBox = null;
  let quiet = 0;   // answers sent along the way: the server's "saved" replies for these are not shown
  let actions; let guessBox; let guessIn; let boardEl; let capBox;
  const cap = (action, args = {}) => send({ t: 'cap', action, args });

  function buildBuzz() {
    buzzBtn = h('button', { class: 'buzz', type: 'button' }, 'WAIT');
    buzzBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (view?.room?.me) send({ t: 'buzz' }); });
    statusLine = h('div', { class: 'status-line' });
    actions = h('div', { class: 'fd-actions' });
    // The guess box is built once, so what is being typed survives the updates that arrive meanwhile.
    guessIn = h('input', { class: 'fm-input', placeholder: 'Type your answer', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'send', maxLength: 40, 'aria-label': 'Your answer' });
    const go = () => { const text = guessIn.value.trim(); if (!text) return; send({ t: 'guess', text }); guessIn.value = ''; };
    guessIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    guessBox = h('div', { class: 'card fd-guess hidden' }, h('div', { class: 'tag' }, 'Your answer'), h('div', { class: 'row' }, guessIn, h('button', { type: 'button', class: 'btn primary', onclick: go }, 'Send')));
    peek = h('div', { class: 'card clue-peek hidden' });
    boardEl = h('div', { class: 'card pm-board hidden' });
    capBox = h('div', { class: 'card fd-cap hidden' });
    return h('div', { style: { display: 'contents' } }, buzzBtn, statusLine, actions, guessBox, peek, boardEl, capBox, h('div', { class: 'card', id: 'fd-board' }));
  }

  const unit = (v, id) => v.room.units.find((u) => u.id === id);

  function myState(v) {
    const me = v.room.me;
    const g = v.game;
    const mine = me && unit(v, me.unitId);
    if (!me?.unitId) return { label: 'NO TEAM', cls: 'out', line: 'Ask the host to put you on a team.' };
    if (g.status === 'lobby') return { label: 'WAIT', cls: 'out', line: g.me?.captain ? 'You’re the captain: start the game below when everyone is in.' : g.hosted ? 'The host starts the game when everyone is in' : g.title ? `${g.title} starts soon` : 'Waiting for the host' };
    if (g.status === 'done') {
      const [top, next] = [...v.room.units].sort((a, b) => b.score - a.score);
      const tie = top && next && top.score === next.score;
      const won = !tie && top?.id === me.unitId;
      return { label: tie ? 'TIE!' : won ? 'WE WON!' : 'GOOD GAME', cls: won ? 'won' : 'out', color: won ? mine.color : null,
        line: tie ? `A tie at ${top.score}! Thanks for playing.` : `${top?.name} won, ${top?.score} to ${next?.score ?? 0}. Thanks for playing!` };
    }
    const r = g.round;
    if (!r) return { label: 'WAIT', cls: 'out', line: '' };
    const f = r.faceoff;
    const iAmRep = f.reps.some((p) => p.playerId === me.id);
    if (r.step === 'faceoff') {
      if (!iAmRep) return { label: 'WATCH', cls: 'out', line: f.reps.length ? `Face-off: ${f.reps.map((p) => p.name).join(' vs ')}` : 'Face-off!' };
      if (f.open) return { label: 'BUZZ', cls: 'live', line: 'You’re up for the face-off. Go!', color: mine.color };
      if (f.turn === me.unitId) return { label: 'YOU!', cls: 'won', line: g.settings.typed ? 'Type your answer below!' : 'Answer out loud!', color: mine.color };
      if (f.turn) return { label: 'WAIT', cls: 'out', line: `${unit(v, f.turn)?.name ?? 'The other team'} is answering` };
      return { label: 'READY', cls: 'out', line: f.attempts.length >= 2 ? 'Both missed. The buzzers open again in a moment.' : 'You’re up for the face-off. Wait for the host to open buzzers.', color: mine.color };
    }
    if (r.step === 'choose') return { label: f.winner === me.unitId ? 'YOU WON' : 'WAIT', cls: f.winner === me.unitId ? 'won' : 'out', line: f.winner === me.unitId ? 'Your team won the face-off. Play or pass?' : `${unit(v, f.winner)?.name} won the face-off`, color: f.winner === me.unitId ? mine.color : null };
    if (r.step === 'play') {
      const ours = r.control === me.unitId;
      return { label: ours ? 'YOUR TEAM' : 'WAIT', cls: ours ? 'won' : 'out', line: ours ? `Talk it over, then ${g.settings.typed ? 'type an answer' : 'answer out loud'} · ${3 - r.strikes} strikes left` : `${unit(v, r.control)?.name} is playing`, color: ours ? mine.color : null };
    }
    if (r.step === 'steal') {
      const ours = r.control === me.unitId;
      return { label: ours ? 'STEAL!' : 'WAIT', cls: ours ? 'live' : 'out', line: ours ? 'One guess to steal it!' : `${unit(v, r.control)?.name} is trying to steal`, color: ours ? mine.color : null };
    }
    const won = r.result?.winner === me.unitId;
    return { label: won ? '✔' : '—', cls: won ? 'won' : 'out', line: `${unit(v, r.result?.winner)?.name} won ${r.result?.awarded ?? 0} points`, color: won ? mine.color : null };
  }

  function updateBuzz(v) {
    const s = myState(v);
    buzzBtn.textContent = s.label;
    // Outside the face-off buzz the button is only a status light, so it shrinks to leave room for the board.
    const buzzing = v.game.round?.step === 'faceoff' && v.game.round.faceoff.reps.some((p) => p.playerId === v.room.me?.id);
    buzzBtn.className = `buzz ${s.cls} ${v.game.round && !buzzing ? 'compact' : ''}`;
    buzzBtn.style.background = s.color ?? '';
    buzzBtn.style.color = s.color ? ink(s.color) : '';
    statusLine.textContent = s.line ?? '';
    const g = v.game;
    const r = g.round;
    if (r) {
      peek.classList.remove('hidden');
      const said = r.said && h('div', { class: `fd-said ${r.said.index === -1 ? 'miss' : 'hit'}` }, `${r.said.name}: “${r.said.text}” `, r.said.index === -1 ? '✕' : '✓');
      peek.replaceChildren(h('div', { class: 'tag' }, `Round ${r.number}${r.multiplier > 1 ? ` · ×${r.multiplier}` : ''} · ${r.pot} on the board`),
        h('div', { class: 'q' }, r.question), ...(said ? [said] : []));
      boardEl.classList.remove('hidden');
      boardEl.replaceChildren(...r.answers.map((a) => h('div', { class: `pm-slot ${a.revealed ? 'up' : a.late ? 'late' : ''}` },
        h('span', { class: 'n' }, String(a.n)), h('span', { class: 't' }, a.text ?? ''), h('span', { class: 'p' }, a.points ?? ''))),
      h('div', { class: 'pm-x' }, Array.from({ length: r.maxStrikes }, (_, i) => h('span', { class: i < r.strikes ? 'on' : '' }, '✕'))));
    } else { peek.classList.add('hidden'); boardEl.classList.add('hidden'); }
    // Play or pass, for anyone on the team that won the face-off.
    actions.replaceChildren(...(g.me?.canChoose ? [
      h('button', { type: 'button', class: 'btn ok big', onclick: () => send({ t: 'choose', play: true }) }, 'PLAY'),
      h('button', { type: 'button', class: 'btn big', onclick: () => send({ t: 'choose', play: false }) }, 'PASS')] : []));
    const guessing = !!g.me?.canGuess;
    if (guessing && guessBox.classList.contains('hidden')) setTimeout(() => guessIn.focus(), 60);
    guessBox.classList.toggle('hidden', !guessing);
    captainControls(v);
    const board = container.querySelector('#fd-board');
    if (board) {
      const sorted = [...v.room.units].sort((a, b) => b.score - a.score);
      board.replaceChildren(h('h2', {}, 'Scores'), h('div', { class: 'list' }, sorted.map((u) => h('div', { class: `item ${u.id === v.room.me.unitId ? 'me' : ''}` },
        h('span', { class: 'swatch', style: { background: u.color } }), h('span', { class: 'nm' }, u.id === v.room.me.unitId ? `${u.name} (you)` : u.name), h('span', { class: 'pts' }, String(u.score))))));
    }
  }

  // ---------- the captain (the first player) runs the game when nobody is hosting ----------
  function captainControls(v) {
    const g = v.game;
    const out = [];
    const btn = (label, onclick, kind = 'primary') => h('button', { type: 'button', class: `btn ${kind}`, onclick }, label);
    if (g.me?.captain) {
      if (g.status === 'lobby') {
        const sets = g.sets ?? [];
        out.push(h('div', { class: 'tag' }, 'Captain'),
          h('label', { class: 'fd-toggle' }, h('input', { type: 'checkbox', checked: !!g.settings.typed, onchange: (e) => cap('setSettings', { typed: e.target.checked }) }),
            h('span', {}, h('b', {}, 'No host: type answers on phones'), h('small', {}, 'The survey checks each answer. Leave off when someone hosts and you answer out loud.'))),
          sets.length > 1 && h('label', { class: 'fd-field' }, h('span', {}, 'Questions'), h('select', { onchange: (e) => cap('chooseSet', { id: e.target.value }) },
            sets.map((x) => h('option', { value: x.id, selected: x.id === g.setId }, x.title)))),
          btn('Start the game', () => cap('startGame'), 'ok'));
      } else if (g.status === 'round' && g.round.step === 'roundEnd') {
        out.push(btn('Next round', () => cap('nextRound')), g.round.answers.some((a) => !a.revealed && !a.late) && btn('Show the other answers', () => cap('revealRest'), ''));
      } else if (g.status === 'round' && g.round.step === 'faceoff' && !g.settings.typed && !g.round.faceoff.open && !g.round.faceoff.turn && !g.round.faceoff.winner) {
        out.push(btn('Open the buzzers', () => cap('openBuzzers'), 'ok'));
      } else if (g.status === 'done') {
        out.push(btn('Play again', () => cap('endGame')));
      }
    }
    const shown = out.filter(Boolean);
    capBox.classList.toggle('hidden', !shown.length);
    // Rebuilding the lobby controls on every update would close an open drop-down, so they are only rebuilt when they change.
    const key = JSON.stringify([g.status, g.round?.step, g.settings.typed, g.setId, g.me?.captain, g.round?.faceoff?.open, g.round?.answers?.map((a) => a.revealed || a.late)]);
    if (capBox.dataset.key !== key) { capBox.dataset.key = key; capBox.replaceChildren(...shown); }
  }

  // ---------- Fast Money ----------
  function fmScreen(v) {
    const f = v.game.fm;
    const me = v.room.me;
    const slot = f.players[0].id === me.id && f.step === 'p1' ? 'p1' : f.players[1].id === me.id && f.step === 'p2' ? 'p2' : null;
    if (!slot) {
      fmBox = null;
      const playing = f.players.some((p) => p.id === me.id);
      const line = f.step === 'pick' || f.step === 'team' ? 'Fast Money is about to start.'
        : playing ? (f.step === 'reveal' || f.step === 'results' ? 'Eyes on the TV for the reveal!' : 'Wait for your turn. Don’t listen to your partner’s answers!')
          : `${f.players.find((p) => (p.slot === 'p1' ? f.step === 'p1' : f.step === 'p2'))?.name ?? 'Two players'} are playing Fast Money. Watch the TV!`;
      const captain = v.game.me?.captain;
      const btn = (label, onclick) => h('button', { type: 'button', class: 'btn primary', style: { width: '100%', marginTop: '12px' }, onclick }, label);
      const extra = !captain ? null
        : f.step === 'team' ? h('div', {}, v.room.units.map((u) => btn(`${u.name} plays`, () => cap('fmTeam', { id: u.id }))))
          : f.step === 'pick' ? btn(`Start Fast Money (${f.players.map((p) => p.name).join(' then ')})`, () => cap('fmStart'))
            : (f.step === 'p1' || f.step === 'p2') && f.timer?.timedOut && !v.game.settings.typed ? btn(f.step === 'p1' ? 'Player 2 is next' : 'Reveal the answers', () => cap('fmNext'))
              : f.step === 'reveal' && !v.game.settings.typed ? btn('Reveal the next answer', () => cap('fmRevealNext'))
                : f.step === 'results' ? btn('Show the winner', () => cap('finishGame')) : null;
      return { key: `fm-wait-${f.step}-${captain}-${f.timer?.timedOut ?? ''}`, node: h('div', { class: 'card' }, h('h2', {}, 'Fast Money'), h('p', {}, line), extra) };
    }
    const key = `fm-${slot}`;
    if (fmBox?.key === key) { fmBox.form.setNote(f.submitted[slot] ? 'Answers sent. You can change them until time is up.' : ''); return { key, node: fmBox.node }; }
    clockEl = h('div', { class: 'status-line' });
    // One question at a time, with a microphone, Skip, and a way back to skipped questions (see fmform.js).
    const form = buildFastMoneyForm(f.rows.map((row) => row.question), { send: (m) => { quiet += 1; send(m); } });
    const node = h('div', { class: 'card' }, h('h2', {}, 'Fast Money — you’re up!'), clockEl, form.node);
    fmBox = { key, node, form, auto: () => form.auto() };
    return { key, node };
  }

  function tickClock() {
    const f = view?.game?.fm;
    if (!f || !fmBox || !clockEl?.isConnected) return;
    const tm = f.timer;
    if (!tm) { clockEl.textContent = ''; return; }
    if (tm.timedOut) { clockEl.textContent = 'Time’s up!'; fmBox.auto(); return; }
    const left = Math.max(0, Math.ceil((tm.leftMs - (performance.now() - receivedAt)) / 1000));
    clockEl.textContent = `${left}s left`;
    if (left <= 0) fmBox.auto();
  }

  function refresh() {
    if (!view) return;
    const v = view;
    if (!v.room.me) return;
    const g = v.game;
    if (g.status === 'fastmoney' && g.fm) {
      const res = fmScreen(v);
      if (screenKey !== res.key) { screenKey = res.key; container.replaceChildren(res.node); }
      tickClock();
      return;
    }
    if (screenKey !== 'game') {
      fmBox = null;
    }
    if (screenKey !== 'game') { screenKey = 'game'; container.replaceChildren(buildBuzz()); }
    updateBuzz(v);
  }

  const timer = setInterval(() => { if (view?.game?.fm?.timer) tickClock(); }, 250);

  return {
    update(v) { view = v; receivedAt = performance.now(); refresh(); },
    onMessage(m) {
      if (m.t === 'guess-result') { if (m.reason === 'already-up') flash(`${m.label} is already up. Try another!`); else if (m.ok) navigator.vibrate?.(m.hit ? 60 : [80, 60, 80]); }
      else if (m.t === 'buzz-result') { if (m.ok) navigator.vibrate?.(60); else if (m.reason === 'not-your-turn') flash('Only the two face-off players buzz.'); }
      else if (m.t === 'ack') { if (quiet > 0) quiet -= 1; else flash('Answers saved', 'ok'); }
    },
    destroy() { clearInterval(timer); },
  };
}
