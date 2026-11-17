// Jeopardy on a phone, in the look and flow of the Apple TV game: a round buzzer with a countdown, typed answers that
// the game checks, a mini board to pick from, wagers, a reveal with everyone's buzz times, Final Jeopardy, awards,
// emoji reactions, and the captain's controls. The page (play.js) handles joining and the header (name, score).
import { h, money } from '../../common.js';
import { loadStyles, lobbyControls } from './setup.js';

export function mount(container, { send, flash }) {
  loadStyles();
  const root = h('div', { class: 'jp' });
  container.replaceChildren(root);

  let raw = null;          // { room, game }
  let v = null;            // raw.game
  let receivedAt = 0;      // when the last state arrived, so countdowns can be drawn from it
  let screenKey = '';
  let note = '';           // a short message on the buzz screen ("Too early!"), cleared after a moment
  let noteTimer = null;
  let sheet = false;       // the "fix scores" sheet
  let step = 200;
  const body = h('div', { class: 'jp-body', style: { display: 'contents' } });
  const reactBar = h('div', { class: 'jp-react' });
  const captainBar = h('div', { class: 'jp-captain' });
  const strip = h('div', { class: 'jp-strip' });
  const sheetEl = h('div');
  root.append(strip, body, reactBar, captainBar, sheetEl);
  let reactKey = '';

  const me = () => v.me;
  const nameOf = (id) => v.players.find((p) => p.id === id)?.name ?? 'Someone';
  const cap = (action, args = {}) => send({ t: 'cap', action, args });
  const secs = (ms) => (ms / 1000).toFixed(2);

  // ---------- small builders ----------
  const btn = (label, onclick, cls = '') => h('button', { type: 'button', class: `jp-btn ${cls}`, onclick }, label);
  const center = (...kids) => h('div', { class: 'jp-center' }, kids);
  const clueBlock = (c, extra = '') => [
    h('div', { class: 'jp-cat' }, `${c.cat} · ${extra || money(c.value)}`),
    h('div', { class: 'jp-clue' }, c.q),
  ];
  const timerEl = (withClock = false) => [
    withClock && h('div', { class: 'jp-clock', 'data-jp-clock': '' }),
    h('div', { class: 'jp-timer' }, h('i', { 'data-jp-bar': '' })),
  ];
  const myTime = (c) => (c && c.buzzMs != null && c.buzzedId === me().id ? h('span', { class: 'jp-mytime' }, `Buzzed in ${secs(c.buzzMs)}s`) : null);
  const buzzTimes = (c) => (c?.buzzes?.length ? [
    h('div', { class: 'jp-eyebrow' }, 'Buzz times'),
    h('div', { class: 'jp-times' }, c.buzzes.map((b, i) => {
      const p = v.players.find((x) => x.id === b.pid);
      return h('div', { class: b.pid === me().id ? 'me' : '', style: { '--c': p?.color ?? '#fff' } }, h('span', {}, `${i + 1}. ${p?.name ?? 'Someone'}`), h('b', {}, `${secs(b.ms)}s`));
    })),
  ] : null);

  function answerForm(prompt, type, placeholder, head) {
    const input = h('input', { class: 'jp-in', placeholder, autocomplete: 'off', autocorrect: 'off', spellcheck: false, enterkeyhint: 'send', maxLength: 80 });
    const go = () => { send({ t: type, text: input.value }); input.blur(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 60);
    return h('div', { class: 'jp-stack', style: { margin: '0 auto' } }, head, input, btn('Lock it in', go),
      timerEl(), h('div', { class: 'jp-muted jp-small', style: { textAlign: 'center' } }, prompt));
  }

  function wagerForm(type, min, max, head) {
    const input = h('input', { class: 'jp-in num', type: 'number', inputMode: 'numeric', min, max, placeholder: 'Amount' });
    const err = h('div', { class: 'jp-err' });
    const set = (n) => { input.value = String(n); };
    return h('div', { class: 'jp-stack', style: { margin: 'auto' } }, head,
      h('div', { class: 'jp-msg', style: { textAlign: 'center' } }, `Wager between ${money(min)} and ${money(max)}`), input,
      h('div', { class: 'jp-quick' }, btn('Min', () => set(min), 'ghost'), btn('Half', () => set(Math.max(min, Math.round(max / 2))), 'ghost'), btn('All in', () => set(max), 'ghost')),
      btn('Place wager', () => {
        const n = Number(input.value);
        if (input.value === '' || !Number.isFinite(n) || n < min || n > max) { err.textContent = `Pick a number from ${min} to ${max}.`; return; }
        send({ t: type, amount: n });
      }), err);
  }

  // ---------- the screens: { key, nodes } for the current state ----------
  function lobbyScreen() {
    const n = v.players.length;
    const sel = v.packs.filter((p) => p.selected).map((p) => p.title).join(', ');
    return {
      key: `lobby-${v.players.map((p) => p.id).join('')}-${me().isCaptain}-${JSON.stringify([v.packs.map((p) => p.selected), v.easyMode, v.era, v.archiveSeason, v.archiveLoading, v.archiveError, v.hostJudges, v.answerTime, v.asWritten, v.draft])}`,
      nodes: center(
        h('div', { class: 'jp-logo' }, 'YOU’RE IN!'),
        h('div', { class: 'jp-msg' }, `${n} player${n === 1 ? '' : 's'} in the room`),
        h('div', { class: 'jp-muted' }, me().isCaptain ? 'You’re the captain. Choose the questions, then tap Start game when everyone has joined.' : 'Waiting for the captain to start the game…'),
        me().isCaptain
          ? h('div', { class: 'jp-stack', style: { marginTop: '8px' } }, kickList(), lobbyControls(v, cap))
          : h('div', { class: 'jp-muted' }, v.draft ? `Board: ${v.draft.flat().join(', ')}` : `Packs: ${sel || '…'}`)),
    };
  }

  function kickList() {
    const others = v.players.filter((p) => p.id !== me().id);
    if (!others.length) return null;
    return [h('div', { class: 'jp-muted jp-small', style: { textAlign: 'center' } }, 'Tap a name to remove that player'),
      h('div', { class: 'jp-kick' }, others.map((p) => btn(`✕ ${p.name}`, () => { if (confirm(`Remove ${p.name} from the game?`)) cap('kick', { pid: p.id }); }, 'ghost')))];
  }

  function boardScreen() {
    const meCtrl = v.controllerId === me().id;
    const ctrl = v.players.find((p) => p.id === v.controllerId);
    if (v.hostJudges) {
      return {
        key: `board-host-${v.controllerId}-${meCtrl}`,
        nodes: center(meCtrl
          ? [h('div', { class: 'jp-big jp-sun' }, 'YOUR PICK!'), h('div', { class: 'jp-msg' }, 'Tell the host a category and an amount.')]
          : [h('div', { class: 'jp-msg' }, [h('b', {}, nameOf(v.controllerId)), ' is picking a clue…']), h('div', { class: 'jp-muted' }, 'Get your thumb ready.')]),
      };
    }
    const canPick = meCtrl || (me().isCaptain && ctrl && !ctrl.connected);
    if (canPick) {
      const used = v.board.map((c) => c.clues.map((x) => (x.used ? 1 : 0)).join('')).join('');
      return {
        key: `board-${v.round}-${used}`,
        nodes: [h('div', { class: 'jp-msg', style: { textAlign: 'center' } }, 'Your pick!'), miniBoard(v.board, (ci, ri) => send({ t: 'pick', ci, ri }))],
      };
    }
    return { key: `board-wait-${v.controllerId}`, nodes: center(h('div', { class: 'jp-msg' }, [h('b', {}, nameOf(v.controllerId)), ' is picking a clue…']), h('div', { class: 'jp-muted' }, 'Get your thumb ready.')) };
  }

  function miniBoard(board, onPick, dd = null) {
    const cells = board.map((c, ci) => h('div', { class: 'h', style: { '--col': `var(--c${ci})` } }, c.name));
    for (let ri = 0; ri < 5; ri++) {
      board.forEach((c, ci) => {
        const cl = c.clues[ri];
        cells.push(h('button', { type: 'button', class: dd?.[ci]?.[ri] ? 'dd' : '', style: { '--col': `var(--c${ci})` }, disabled: cl.used, onclick: () => onPick(ci, ri) }, cl.value));
      });
    }
    return h('div', { class: 'jp-mini' }, cells);
  }

  function clueScreen() {
    const c = v.clue;
    const ph = v.phase;
    const id = `${c.ci}${c.ri}${v.round}-${c.tried.length}`;
    const head = clueBlock(c);
    if (ph === 'answering' && c.buzzedId === me().id) {
      if (v.hostJudges) {
        return { key: `say-${id}`, nodes: [head, center(h('div', { class: 'jp-big jp-ok' }, 'YOU’RE UP!'), myTime(c), h('div', { class: 'jp-msg' }, 'Say your answer out loud.'),
          v.timer && timerEl(true), h('div', { class: 'jp-muted' }, 'The host will decide if you’re right.'))] };
      }
      return { key: `ans-${id}`, nodes: answerForm('No need to phrase it as a question. Small typos are fine.', 'answer', 'Your answer',
        [h('div', { class: 'jp-big jp-ok', style: { textAlign: 'center' } }, 'YOU GOT IT!'), h('div', { style: { textAlign: 'center' } }, myTime(c)), head]) };
    }
    let cls = 'idle'; let label = 'WAIT'; let sub = 'The buzzers unlock after the clue is read. Buzzing early locks you out for a moment.';
    if (ph === 'open') { cls = 'live'; label = 'BUZZ!'; sub = 'Go go go!'; }
    if (c.tried.includes(me().id)) { cls = 'locked'; label = 'OUT'; sub = 'You already took a shot at this one.'; }
    if (ph === 'answering') {
      cls = 'locked'; label = '…';
      const mine = c.buzzes.find((b) => b.pid === me().id);
      sub = mine ? `Beaten to it! Your time: ${secs(mine.ms)}s` : `${nameOf(c.buzzedId)} buzzed in first${c.buzzMs != null ? ` (${secs(c.buzzMs)}s)` : ''} and is answering.`;
    }
    if (note) sub = note;
    const bz = h('button', { type: 'button', class: `jp-buzzer ${cls}` }, label);
    bz.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Taps after someone else won still count, so everyone gets a buzz time.
      if (['reading', 'open', 'answering'].includes(v.phase)) send({ t: 'buzz' });
    });
    return {
      key: `buzz-${id}-${ph}-${cls}-${c.buzzes.length}-${note}`,
      nodes: [head, center(bz, v.timer?.kind === 'buzz' && ph === 'open' ? timerEl() : null, h('div', { class: 'jp-muted' }, sub))],
    };
  }

  function ddWagerScreen() {
    const c = v.clue;
    const mineCtl = v.controllerId === me().id;
    if (mineCtl) {
      return { key: `ddw-${c.ci}${c.ri}`, nodes: wagerForm('dd-wager', 5, me().maxDD ?? 1000,
        [h('div', { class: 'jp-big jp-sun', style: { textAlign: 'center' } }, 'DAILY DOUBLE!'), h('div', { class: 'jp-cat', style: { textAlign: 'center' } }, c.cat)]) };
    }
    return { key: `ddww-${c.ci}${c.ri}`, nodes: center(h('div', { class: 'jp-big jp-sun' }, 'DAILY DOUBLE!'), h('div', { class: 'jp-msg' }, `${nameOf(v.controllerId)} is wagering…`)) };
  }

  function ddAnswerScreen() {
    const c = v.clue;
    const head = clueBlock(c, `Wager ${money(c.wager)}`);
    const mineCtl = v.controllerId === me().id;
    if (mineCtl && v.hostJudges) return { key: `ddsay-${c.ci}${c.ri}`, nodes: [head, center(h('div', { class: 'jp-msg' }, 'Say your answer out loud.'), v.timer && timerEl(true), h('div', { class: 'jp-muted' }, 'The host will decide if you’re right.'))] };
    if (mineCtl) return { key: `dda-${c.ci}${c.ri}`, nodes: answerForm('No need to phrase it as a question.', 'answer', 'Your answer', head) };
    return { key: `ddaw-${c.ci}${c.ri}`, nodes: [head, center(h('div', { class: 'jp-msg' }, `${nameOf(v.controllerId)} is answering…`))] };
  }

  function revealScreen() {
    const c = v.clue; const r = v.lastResult;
    const mine = r && r.pid === me().id;
    return {
      key: `rev-${c.ci}${c.ri}-${r ? r.correct : ''}-${c.buzzes.length}`,
      nodes: center(h('div', { class: 'jp-muted' }, 'The answer was'), h('div', { class: 'jp-big jp-sun' }, c.answer),
        mine && h('div', { class: `jp-big ${r.correct ? 'jp-ok' : 'jp-no'}` }, `${r.correct ? '+' : '-'}${money(r.delta)}`),
        mine && r.correct && r.streak >= v.hotStreak && h('div', { class: 'jp-msg' }, `🔥 You’re on fire! ${r.streak} in a row`),
        buzzTimes(c)),
    };
  }

  function roundEndScreen() {
    return { key: `re-${v.round}`, nodes: center(h('div', { class: 'jp-logo' }, `ROUND ${v.round} DONE`), h('div', { class: 'jp-msg' }, `You have ${money(me().score)}`),
      h('div', { class: 'jp-muted' }, v.round < v.rounds ? 'The next round is worth double.' : 'Final Jeopardy is next.')) };
  }

  function finalWagerScreen() {
    const f = v.final;
    if (!f.eligible.includes(me().id)) return { key: 'fw-out', nodes: center(h('div', { class: 'jp-msg' }, 'You need a positive score to play Final Jeopardy.'), h('div', { class: 'jp-muted' }, 'Sit back and cheer!')) };
    if (me().finalWager !== undefined) return { key: 'fw-done', nodes: center(h('div', { class: 'jp-msg' }, `Wager locked: ${money(me().finalWager)}`), h('div', { class: 'jp-muted' }, 'Waiting for everyone else…')) };
    return { key: 'fw', nodes: wagerForm('final-wager', 0, me().score,
      [h('div', { class: 'jp-big jp-sun', style: { textAlign: 'center' } }, 'FINAL JEOPARDY'), h('div', { class: 'jp-cat', style: { textAlign: 'center', fontSize: '18px' } }, f.category)]) };
  }

  function finalAnswerScreen() {
    const f = v.final;
    if (!f.eligible.includes(me().id)) return { key: 'fa-out', nodes: center(h('div', { class: 'jp-clue' }, f.q), h('div', { class: 'jp-muted' }, 'Play along in your head!')) };
    if (me().finalAnswer !== undefined) return { key: 'fa-done', nodes: center(h('div', { class: 'jp-msg' }, `Locked in: “${me().finalAnswer}”`), h('div', { class: 'jp-muted' }, 'Waiting for the reveal…')) };
    return { key: 'fa', nodes: answerForm('Type your answer, then lock it in.', 'final-answer', 'Your final answer',
      [h('div', { class: 'jp-cat' }, `${f.category} · You wagered ${money(me().finalWager ?? 0)}`), h('div', { class: 'jp-clue' }, f.q)]) };
  }

  function finalRevealScreen() {
    const r = v.final.reveals.find((x) => x.id === me().id);
    return { key: `fr-${r ? r.correct : 'wait'}`, nodes: center(r
      ? [h('div', { class: 'jp-muted' }, 'The answer was'), h('div', { class: 'jp-big jp-sun' }, v.final.answer), h('div', { class: `jp-big ${r.correct ? 'jp-ok' : 'jp-no'}` }, r.correct ? 'Correct!' : 'Not quite')]
      : h('div', { class: 'jp-msg' }, 'Watch the TV for the big reveal…')) };
  }

  function gameoverScreen() {
    // Ties share a place.
    const mineScore = me().score;
    const place = v.players.filter((p) => p.score > mineScore).length + 1;
    const tied = v.players.filter((p) => p.score === mineScore).length > 1;
    const mine = (v.awards ?? []).filter((a) => a.pid === me().id);
    return { key: `go-${place}-${mineScore}-${mine.length}`, nodes: center(
      h('div', { class: 'jp-logo' }, place === 1 ? (tied ? 'IT’S A TIE!' : 'YOU WIN!') : 'GAME OVER'),
      h('div', { class: 'jp-msg' }, `You finished ${tied ? 'tied for ' : ''}#${place} with ${money(mineScore)}`),
      mine.map((a) => h('div', { class: 'jp-award' }, h('b', {}, a.title), a.detail))) };
  }

  function currentScreen() {
    switch (v.phase) {
      case 'lobby': return lobbyScreen();
      case 'board': return boardScreen();
      case 'reading': case 'open': case 'answering': return clueScreen();
      case 'dd-wager': return ddWagerScreen();
      case 'dd-answer': return ddAnswerScreen();
      case 'reveal': return revealScreen();
      case 'round-end': return roundEndScreen();
      case 'final-wager': return finalWagerScreen();
      case 'final-answer': return finalAnswerScreen();
      case 'final-reveal': return finalRevealScreen();
      case 'gameover': return gameoverScreen();
      default: return { key: 'x', nodes: center('…') };
    }
  }

  // ---------- reactions, captain bar, scores sheet, header strip ----------
  function renderReactions() {
    const ph = v.phase; const c = v.clue; const mid = me().id;
    let on = ['lobby', 'board', 'answering', 'reveal', 'dd-wager', 'dd-answer', 'round-end', 'final-reveal', 'gameover'].includes(ph);
    if (ph === 'board' && v.controllerId === mid) on = false;
    if (ph === 'answering' && c?.buzzedId === mid) on = false;
    if ((ph === 'dd-wager' || ph === 'dd-answer') && v.controllerId === mid) on = false;
    const key = String(on);
    if (key === reactKey) return;
    reactKey = key;
    reactBar.style.display = on ? 'flex' : 'none';
    reactBar.replaceChildren(...(on ? v.reactionChoices.map((e, i) => h('button', { type: 'button', onclick: () => { send({ t: 'react', e: i }); navigator.vibrate?.(15); } }, e)) : []));
  }

  function renderCaptain() {
    if (!me().isCaptain) { captainBar.style.display = 'none'; captainBar.replaceChildren(); return; }
    const ph = v.phase; const items = [];
    if (ph === 'lobby') items.push(['Start game', () => cap('start'), '']);
    if (['reading', 'open', 'answering', 'dd-wager', 'dd-answer'].includes(ph)) items.push(['Skip clue', () => cap('skip'), 'ghost']);
    if (v.lastResult && ['reveal', 'open', 'board'].includes(ph) && !v.hostJudges) items.push(['Flip last ruling', () => cap('override'), 'ghost']);
    if (['reveal', 'round-end', 'final-wager', 'final-answer', 'final-reveal'].includes(ph)) items.push(['Continue', () => cap('advance'), '']);
    if (ph === 'board') items.push(['End round early', () => { if (confirm('End this round now?')) cap('endRound'); }, 'ghost']);
    if (ph === 'gameover') items.push(['Play again', () => cap('playAgain'), '']);
    if (ph !== 'lobby' && v.players.length) items.push(['Fix scores', () => { sheet = true; renderSheet(); }, 'ghost']);
    captainBar.style.display = items.length ? 'flex' : 'none';
    captainBar.replaceChildren(...items.map(([label, fn, cls]) => btn(label, fn, cls)));
  }

  function renderSheet() {
    if (!sheet || !v || !me().isCaptain) { sheetEl.replaceChildren(); return; }
    const row = (p) => h('div', { class: 'jp-srow', style: { '--c': p.color } },
      h('span', { class: 'n' }, p.name), h('b', { class: p.score < 0 ? 'neg' : '' }, money(p.score)),
      btn('−', () => cap('adjustScore', { id: p.id, delta: -step }), 'ghost'), btn('+', () => cap('adjustScore', { id: p.id, delta: step })),
      btn('Set', () => {
        const x = prompt(`New score for ${p.name}:`, String(p.score));
        if (x === null) return;
        const n = Math.round(Number(String(x).replace(/[$,\s]/g, '')));
        if (!Number.isFinite(n)) { flash('That is not a number.'); return; }
        cap('adjustScore', { id: p.id, set: n });
      }, 'ghost set'));
    sheetEl.replaceChildren(h('div', { class: 'jp-sheet', onclick: (e) => { if (e.target === e.currentTarget) { sheet = false; renderSheet(); } } },
      h('div', { class: 'jp-sheet-in' },
        h('div', { class: 'hd' }, h('span', {}, 'Fix scores'), btn('Done', () => { sheet = false; renderSheet(); })),
        h('div', { class: 'jp-muted jp-small' }, 'Tap + or − to change a score by this much, or Set to type an exact score.'),
        h('div', { class: 'jp-quick' }, [100, 200, 500, 1000].map((n) => btn(money(n), () => { step = n; renderSheet(); }, n === step ? '' : 'ghost'))),
        v.players.map(row))));
  }

  function renderStrip() {
    const meP = v.players.find((p) => p.id === me().id);
    const round = v.phase === 'lobby' ? '' : v.round > v.rounds ? 'FINAL' : `ROUND ${v.round}`;
    strip.replaceChildren(h('span', {}, [me().isCaptain ? '★ captain' : '', meP && meP.streak >= v.hotStreak ? ` 🔥${meP.streak}` : ''].join('')), h('b', {}, round));
  }

  // ---------- drawing ----------
  function render() {
    if (!v?.me) return;
    renderStrip();
    const s = currentScreen();
    if (s.key !== screenKey) {
      screenKey = s.key;
      body.replaceChildren(...[].concat(s.nodes).flat(Infinity).filter(Boolean).map((n) => (n instanceof Node ? n : document.createTextNode(String(n)))));
    }
    renderReactions();
    renderCaptain();
    renderSheet();
    tick();
  }

  /** Redraws the countdown bar and clock from the last timer the server sent. */
  function tick() {
    const t = v?.timer;
    const left = t ? Math.max(0, t.leftMs - (performance.now() - receivedAt)) : 0;
    for (const el of root.querySelectorAll('[data-jp-bar]')) el.style.transform = `scaleX(${t ? Math.min(1, left / t.totalMs) : 0})`;
    for (const el of root.querySelectorAll('[data-jp-clock]')) el.textContent = t ? (left > 0 ? String(Math.ceil(left / 1000)) : 'TIME!') : '';
  }
  const ticker = setInterval(tick, 100);

  function say(text, ms) {
    note = text; clearTimeout(noteTimer);
    render();
    noteTimer = setTimeout(() => { note = ''; render(); }, ms);
  }

  return {
    update(r) { raw = r; v = r.game; receivedAt = performance.now(); render(); },
    onMessage(m) {
      if (m.t === 'buzz-result') {
        if (m.result === 'won') navigator.vibrate?.(60);
        else if (m.result === 'early') { navigator.vibrate?.([40, 40, 40]); say('Too early! Wait for the red button.', 900); }
        else if (m.result === 'late') say(`Beaten to it! Your time: ${secs(m.ms)}s`, 2500);
      } else if (m.t === 'ack') flash(m.what === 'wager' ? 'Wager locked in' : 'Answer sent');
    },
    destroy() { clearInterval(ticker); clearTimeout(noteTimer); },
  };
}
