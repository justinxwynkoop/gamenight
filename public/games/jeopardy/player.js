// Jeopardy on a phone: your buzzer. The TV runs the show; the phone shows only what you need right now, in the same
// look (dark stage, the set's blue, gold for the show, your colour for you, green and red for right and wrong):
// a WAIT button and the reading bar, then one big gold BUZZ button; when you win the buzz a big answer box (the
// keyboard opens as you press, so you can start typing straight away); wagers with thumbs, not the keyboard; and
// after each clue what happened and everyone's scores. The page (play.js) handles joining and the header.
import { h, money } from '../../common.js';
import { loadStyles, lobbyControls } from './setup.js';

const minus = (n) => money(n).replace('-', '−');
const signed = (n) => (n >= 0 ? '+' : '−') + money(Math.abs(n));
const secs = (ms) => (ms / 1000).toFixed(2);
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

const LOCKOUT = 250;          // ms locked out for pressing before the buzzer turns gold, as on the show
const RESEND = 350;           // ms between tries while the TV has not confirmed a press
const RESEND_FOR = 3000;      // ...for this long

export function mount(container, { send, flash, clock: roomClock = null }) {
  loadStyles();
  document.body.classList.add('jp-phone');
  const root = h('div', { class: 'jp' });
  container.replaceChildren(root);

  let v = null;            // the game's view
  let receivedAt = 0;      // when the last state arrived, so countdowns can be drawn from it
  let screenKey = '';
  let note = '';           // a short message on the buzz screen ("Too early!"), cleared after a moment
  let noteTimer = null;
  let pressed = false;     // this phone pressed the buzzer for the current opening: the button shows it at once
  let pressedKey = '';
  let lockedUntil = 0;     // pressed too early: locked out until then (this phone's clock), shown at once
  let liveTimer = null;    // turns the button gold at the moment the buzzers open
  let lockTimer = null;
  let pending = null;      // a press the TV has not confirmed yet: { msg, until }, sent again until it does
  let resendTimer = null;
  let buzzId = 0;
  let wonKey = '';         // the opening this phone was told it won, so the cue plays once
  let sheet = false;       // the "fix scores" sheet
  let step = 200;
  let wager = null;        // the amount on the wager stepper
  let typing = false;      // "Type an amount" instead of the stepper
  const body = h('div', { class: 'jp-body' });
  const reactBar = h('div', { class: 'jp-react' });
  const captainBar = h('div', { class: 'jp-captain' });
  const strip = h('div', { class: 'jp-strip' });
  const sheetEl = h('div');

  // ---------- this phone's own sounds ----------
  // Short, quiet cues for this player's own moments: their buzz, winning it, being too early, their turn to pick, and
  // their answer ruled right or wrong. iPhones can't vibrate from a web page, so the sound is the feedback there.
  // A phone only plays sound after a tap, so the first tap anywhere wakes it up. The host's "Sound off" mutes them.
  let actx = null;
  let soundOn = true;
  const wake = () => {
    try {
      actx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume().catch(() => {});
    } catch { actx = null; }
  };
  addEventListener('pointerdown', wake, { capture: true, passive: true });
  /** Notes as [frequency, start (s), length (s), wave, gain]. */
  const chirp = (notes) => {
    if (!soundOn || !actx || actx.state !== 'running') return;
    for (const [f, at, dur, type = 'triangle', gain = 0.18] of notes) {
      const t0 = actx.currentTime + at;
      const osc = actx.createOscillator(); const env = actx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(f, t0);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(env).connect(actx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }
  };
  const PHONE_SOUNDS = {
    press: [[660, 0, 0.06, 'square', 0.08]],
    won: [[880, 0, 0.1], [1320, 0.08, 0.25]],
    early: [[180, 0, 0.3, 'square', 0.1]],
    turn: [[784, 0, 0.12], [1047, 0.1, 0.3]],
    right: [[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.3]],
    wrong: [[220, 0, 0.35, 'sawtooth', 0.08]],
  };
  const cue = (name) => chirp(PHONE_SOUNDS[name]);

  // ---------- a buzz you can feel ----------
  // Android vibrates from a web page. iPhones can't, but Safari (iOS 18 and later) gives a light tap when a switch
  // toggle is flipped, and flipping a hidden one from inside the press gives that tap. Either way it is instant.
  const hapticSwitch = (() => {
    if (navigator.vibrate) return null;
    try {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10px;top:-10px';
      label.append(input);
      document.body.append(label);
      return label;
    } catch { return null; }
  })();
  const haptic = (pattern = 20) => {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* not allowed */ } return; }
    try { hapticSwitch?.click(); } catch { /* fine */ }
  };

  // ---------- the answer box ----------
  // One input for the whole game. It is focused the moment the buzzer is pressed (inside the tap, which is the only
  // time a phone lets a page open the keyboard), and shown when the buzz is won, so typing can start at once.
  const answerIn = h('input', { class: 'jp-in big', placeholder: 'Tap here and type', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: false, enterkeyhint: 'send', maxLength: 80 });
  const answerHead = h('div', { class: 'jp-ahead' });
  const answerHint = h('div', { class: 'jp-small jp-muted jp-center-t' }, 'No need to say “what is”. Small typos are fine.');
  const answerBox = h('div', { class: 'jp-answer' }, answerHead, h('label', { class: 'jp-label' }, 'YOUR ANSWER', answerIn),
    h('button', { type: 'button', class: 'jp-btn', onclick: () => submitAnswer() }, 'Lock it in'), answerHint);
  let answerType = null;   // 'answer' or 'final-answer' while the box is up
  let answerFor = '';      // which clue the box is for, so it starts empty for each one
  let draftTimer = null;
  answerIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAnswer(); });
  answerIn.addEventListener('input', () => {
    // The game keeps what is typed, so an answer not yet sent when the clock runs out still counts.
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => send({ t: 'draft', text: answerIn.value }), 250);
  });
  function submitAnswer() {
    if (!answerType) return;
    const text = answerIn.value.trim();
    if (!text) { flash('Type your answer first'); answerIn.focus(); return; }
    clearTimeout(draftTimer);
    send({ t: answerType, text });
    answerIn.blur();
  }
  root.append(strip, body, answerBox, reactBar, captainBar, sheetEl);

  const me = () => v.me;
  const player = (id) => v.players.find((p) => p.id === id) ?? null;
  const nameOf = (id) => player(id)?.name ?? 'Someone';
  const cap = (action, args = {}) => send({ t: 'cap', action, args });

  // ---------- small builders ----------
  const btn = (label, onclick, cls = '') => h('button', { type: 'button', class: `jp-btn ${cls}`, onclick }, label);
  const center = (...kids) => h('div', { class: 'jp-center' }, kids);
  const dot = (p, size = 30) => h('span', { class: 'jp-dot', style: { '--c': p?.color ?? '#AEB3D6', width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` } }, String(p?.name ?? '?').trim().slice(0, 1).toUpperCase());
  const named = (p) => h('b', { style: { color: p?.color } }, p?.name ?? 'Someone');
  const meta = (cat, value) => h('div', { class: 'jp-meta' }, h('span', {}, cat), value != null && h('b', {}, value));
  const clueCard = (q, dim = false) => h('div', { class: `jp-clue ${dim ? 'dim' : ''}` }, q);
  const bar = (fill = false) => h('div', { class: 'jp-bar' }, h('i', { [fill ? 'data-jp-fill' : 'data-jp-bar']: '' }));
  const clock = () => h('div', { class: 'jp-clock', 'data-jp-clock': '' });
  const eyebrow = (t) => h('div', { class: 'jp-eyebrow' }, t);

  function scoreList({ highlight = null, champion = null } = {}) {
    const sorted = v.players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return h('div', { class: 'jp-scores' }, eyebrow('SCORES'), sorted.map((p) => h('div', { class: `jp-row ${p.id === me().id ? 'me' : ''} ${p.id === champion ? 'champ' : ''}`, style: { '--c': p.color } },
      dot(p, 26), h('span', { class: 'n' }, p.id === champion ? `${p.name}, champion` : p.id === me().id ? `${p.name} (you)` : p.name),
      h('b', { class: p.score < 0 ? 'neg' : '' }, minus(p.score)), highlight?.[p.id] ?? null)));
  }

  /** The wager stepper: −/+ with your thumbs, quick picks, or type an amount. */
  function wagerForm(type, min, max, head) {
    if (wager == null || wager < min || wager > max) wager = Math.min(max, Math.max(min, Math.round(max / 2 / 100) * 100 || min));
    const amount = h('div', { class: 'jp-amount' }, money(wager));
    const go = h('button', { type: 'button', class: 'jp-btn huge', onclick: () => send({ t: type, amount: wager }) }, `Bet ${money(wager)}`);
    const stepBy = max >= 2000 ? 200 : 100;
    const set = (n) => { wager = Math.min(max, Math.max(min, Math.round(n))); amount.textContent = money(wager); go.textContent = `Bet ${money(wager)}`; navigator.vibrate?.(8); };
    const typed = h('input', { class: 'jp-in num', type: 'number', inputMode: 'numeric', min, max, placeholder: 'Amount', value: String(wager) });
    typed.addEventListener('input', () => { const n = Number(typed.value); if (Number.isFinite(n) && typed.value !== '') set(n); });
    return h('div', { class: 'jp-wager' }, head,
      h('div', { class: 'jp-small jp-muted' }, `Bet from ${money(min)} to ${money(max)}`),
      typing ? typed : h('div', { class: 'jp-stepper' },
        h('button', { type: 'button', class: 'round', 'aria-label': 'Less', onclick: () => set(wager - stepBy) }, '−'), amount,
        h('button', { type: 'button', class: 'round', 'aria-label': 'More', onclick: () => set(wager + stepBy) }, '+')),
      h('div', { class: 'jp-quick' }, btn(`Min ${money(min)}`, () => { set(min); typed.value = String(wager); }, 'ghost'), btn('Half', () => { set(Math.round(max / 2)); typed.value = String(wager); }, 'ghost'), btn('All in', () => { set(max); typed.value = String(wager); }, 'ghost')),
      h('div', { class: 'grow' }),
      h('button', { type: 'button', class: 'jp-link', onclick: () => { typing = !typing; screenKey = ''; render(); } }, typing ? 'Use the buttons' : 'Type an amount'),
      go);
  }

  // ---------- the screens: { key, nodes, answer } for the current state ----------
  function lobbyScreen() {
    const n = v.players.length;
    const sel = v.packs.filter((p) => p.selected).map((p) => p.title).join(', ');
    return {
      key: `lobby-${v.players.map((p) => p.id).join('')}-${me().isCaptain}-${JSON.stringify([v.packs.map((p) => [p.id, p.selected, p.fresh]), v.freshCount, v.seenCount, v.draftFresh, v.easyMode, v.era, v.archiveSeason, v.archiveLoading, v.archiveError, v.hostJudges, v.answerTime, v.asWritten, v.draft, v.finalForAll, v.readAloud])}`,
      nodes: center(
        h('div', { class: 'jp-logo' }, 'YOU’RE IN!'),
        h('div', { class: 'jp-msg' }, `${n} player${n === 1 ? '' : 's'} in the room`),
        h('div', { class: 'jp-muted' }, me().isCaptain ? 'You’re the captain. Choose the questions, then tap Start game when everyone has joined.' : 'Your phone is your buzzer. Waiting for the captain to start the game…'),
        me().isCaptain
          ? h('div', { class: 'jp-stack', style: { marginTop: '8px' } }, kickList(), lobbyControls(v, cap))
          : h('div', { class: 'jp-muted jp-small' }, v.draft ? `Board: ${v.draft.flat().join(', ')}` : `Questions: ${sel || '…'}`)),
    };
  }

  function kickList() {
    const others = v.players.filter((p) => p.id !== me().id);
    if (!others.length) return null;
    return [h('div', { class: 'jp-muted jp-small', style: { textAlign: 'center' } }, 'Make someone else captain, or remove a player'),
      h('div', { class: 'jp-kick' }, others.map((p) => btn(`★ ${p.name}`, () => { if (confirm(`Make ${p.name} the captain? They get these controls and you become a regular player.`)) cap('setCaptain', { pid: p.id }); }, 'ghost'))),
      h('div', { class: 'jp-kick' }, others.map((p) => btn(`✕ ${p.name}`, () => { if (confirm(`Remove ${p.name} from the game?`)) cap('kick', { pid: p.id }); }, 'ghost')))];
  }

  function introScreen() {
    const picker = player(v.controllerId);
    return { key: `intro-${v.round}`, nodes: center(
      eyebrow(v.round === 1 ? 'LET’S PLAY' : 'VALUES DOUBLE'),
      h('div', { class: 'jp-logo xl' }, `ROUND ${v.round}`),
      h('div', { class: 'jp-muted' }, 'Eyes on the TV for tonight’s categories.'),
      picker && h('div', { class: 'jp-msg' }, picker.id === me().id ? 'You pick first!' : [named(picker), ' picks first.'])) };
  }

  function boardScreen() {
    const meCtrl = v.controllerId === me().id;
    const ctrl = player(v.controllerId);
    if (v.hostJudges) {
      return {
        key: `board-host-${v.controllerId}-${meCtrl}`,
        nodes: center(meCtrl
          ? [h('div', { class: 'jp-logo' }, 'YOUR PICK!'), h('div', { class: 'jp-msg' }, 'Tell the host a category and an amount.')]
          : [dot(ctrl, 56), h('div', { class: 'jp-msg' }, [named(ctrl), ' is picking a clue…']), h('div', { class: 'jp-muted' }, 'Get your thumb ready.')]),
      };
    }
    const canPick = meCtrl || (me().isCaptain && ctrl && !ctrl.connected);
    if (canPick) {
      const used = v.board.map((c) => c.clues.map((x) => (x.used ? 1 : 0)).join('')).join('');
      return {
        key: `board-${v.round}-${used}`,
        nodes: [h('div', { class: 'jp-pickhead' }, h('div', { class: 'jp-logo' }, meCtrl ? 'YOUR PICK' : `PICK FOR ${(ctrl?.name ?? '').toUpperCase()}`), h('div', { class: 'jp-small jp-muted' }, 'Tap a value. It opens on the TV.')),
          miniBoard(v.board, (ci, ri) => { navigator.vibrate?.(15); send({ t: 'pick', ci, ri }); })],
      };
    }
    return { key: `board-wait-${v.controllerId}`, nodes: center(dot(ctrl, 56), h('div', { class: 'jp-msg' }, [named(ctrl), ' is picking a clue…']), h('div', { class: 'jp-muted' }, 'Get your thumb ready.')) };
  }

  function miniBoard(board, onPick) {
    const cells = board.map((c) => h('div', { class: 'h' }, c.name));
    const rows = Math.max(...board.map((c) => c.clues.length));
    for (let ri = 0; ri < rows; ri++) {
      board.forEach((c, ci) => {
        const cl = c.clues[ri];
        cells.push(h('button', { type: 'button', disabled: !cl || cl.used, onclick: () => onPick(ci, ri) }, cl && !cl.used ? `$${cl.value >= 1000 ? `${cl.value / 1000}K` : cl.value}` : ''));
      });
    }
    return h('div', { class: 'jp-mini', style: { gridTemplateColumns: `repeat(${board.length}, minmax(0, 1fr))` } }, cells);
  }

  function buzzScreen() {
    const c = v.clue;
    const ph = v.phase;
    const id = `${c.ci}-${c.ri}-${v.round}`;
    const opening = c.open || 0;
    // Which opening a press now would be for: the one under way, or the next one (its button may turn gold before the
    // TV's word that it opened arrives).
    if (`${id}-${target()}` !== pressedKey) { pressed = false; pressedKey = `${id}-${target()}`; }
    const tried = c.tried.includes(me().id);
    const head = meta(c.cat, money(c.value));
    // I won the buzz: the answer box is up.
    if (ph === 'answering' && c.buzzedId === me().id) {
      if (v.hostJudges) {
        return { key: `say-${id}-${opening}`, nodes: [head, clueCard(c.q), center(h('div', { class: 'jp-logo good' }, 'YOU’RE UP!'), h('div', { class: 'jp-msg' }, 'Say your answer out loud.'),
          v.timer && clock(), h('div', { class: 'jp-muted' }, 'The host will decide if you’re right.'))] };
      }
      return { key: `ans-${id}-${opening}`, answer: { type: 'answer', for: `${id}-${opening}`, head: h('div', { class: 'jp-won' }, h('div', { class: 'jp-logo good' }, 'YOU’RE IN!'), clock()) }, nodes: [head, clueCard(c.q)] };
    }
    const now = performance.now();
    const live = isLive(now);
    const locked = now < lockedUntil;
    let cls = 'wait'; let label = 'WAIT'; let sub = 'Eyes on the TV. Buzz when the bar fills and the button turns gold.';
    if (v.hostJudges && ph === 'reading') sub = 'The host is reading. Buzz when the button turns gold.';
    if (live) { cls = 'live'; label = 'BUZZ!'; sub = ''; }
    if (pressed && live) { cls = 'sent'; label = 'BUZZED'; sub = 'In! Waiting for the TV…'; }
    if (tried) { cls = 'out'; label = 'OUT'; sub = 'You already took a shot at this one.'; }
    let tint = null;
    if (!live && (ph === 'answering' || ph === 'ruling')) {
      // Someone else is answering: the button shows who (in their colour), not a dead grey circle, and during the
      // ruling a green or red ring for how it went.
      const up = player(c.buzzedId);
      cls = up ? `other ${ph === 'ruling' ? (v.lastResult?.correct ? 'good' : 'bad') : ''}` : 'out'; label = up ? up.name.toUpperCase() : '…'; tint = up?.color ?? null;
      const mine = c.buzzes.find((b) => b.pid === me().id && (b.open ?? 1) === opening);
      const who = player(c.buzzedId);
      const winner = c.buzzes.find((b) => b.pid === c.buzzedId && (b.open ?? 1) === opening);
      sub = ph === 'ruling' ? [named(who), ' answered. Watch the TV.']
        : mine ? `Beaten to it! You ${secs(mine.ms)}s, ${who?.name ?? 'them'} ${secs(winner?.ms ?? c.buzzMs ?? 0)}s`
          : [named(who), ` buzzed in first${c.buzzMs != null ? ` (${secs(c.buzzMs)}s)` : ''}.`];
      if (tried) sub = 'You already took a shot at this one.';
    }
    if (locked && !tried) { cls = 'locked'; label = 'TOO SOON'; sub = 'Too early! Locked out for a split second.'; }
    if (note) sub = note;
    const bz = h('button', { type: 'button', class: `jp-buzzer ${cls}`, 'aria-label': 'Buzz', style: tint ? { '--c': tint } : {} }, label);
    // The whole middle of the screen is the buzzer, and it fires the instant a finger lands (not when it lifts).
    const wrap = h('div', { class: 'jp-buzzwrap' }, bz);
    wrap.addEventListener('pointerdown', (e) => { e.preventDefault(); press(bz); });
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    // Turn gold at the very moment the buzzers open, by this phone's clock (kept in step with the TV's).
    scheduleLive(now);
    const reading = ph === 'reading' && v.timer?.kind === 'reading';
    return {
      key: `buzz-${id}-${opening}-${ph}-${cls}-${c.buzzes.length}-${note}`,
      nodes: [head, clueCard(c.q, live), wrap,
        reading && !live ? bar(true) : live && v.timer?.kind === 'buzz' ? bar() : null,
        sub && h('div', { class: 'jp-small jp-muted jp-center-t' }, sub)],
    };
  }

  /** When this phone's buzzer turns gold for the next opening, on this phone's clock, or null when nobody knows yet. */
  function liveAtLocal() {
    const c = v?.clue;
    if (!c || c.liveAt == null) return null;   // a TV that does not say ahead (or the host is reading): wait for it
    const local = roomClock?.toLocal?.(c.liveAt);
    if (local != null) return local;
    // The clock is not in step yet: go by the reading countdown that came with the state.
    if (v.phase === 'reading' && v.timer?.kind === 'reading') return receivedAt + v.timer.leftMs;
    return v.phase === 'open' ? 0 : null;
  }
  /** The opening a press now is for: the one under way, or the next one (the TV numbers them from 1). */
  function target() {
    const c = v.clue;
    if (v.phase === 'answering') return c.open || 0;
    return c.liveSeq ?? (v.phase === 'open' ? c.open || 0 : (c.open || 0) + 1);
  }
  /** Is the buzzer gold right now? */
  function isLive(now = performance.now()) {
    const c = v?.clue;
    if (!c || c.tried.includes(me().id)) return false;
    if (v.phase === 'open') return true;
    if (v.phase === 'reading' || v.phase === 'ruling') { const at = liveAtLocal(); return at != null && now >= at; }
    return false;
  }
  function scheduleLive(now) {
    clearTimeout(liveTimer);
    if (isLive(now)) return;
    const at = liveAtLocal();
    if (at == null || at - now > 60000) return;
    liveTimer = setTimeout(() => render(), Math.max(0, at - now));
  }

  /** A finger landed on the buzzer. */
  function press(bz) {
    const c = v?.clue;
    if (!c || !['reading', 'open', 'answering', 'ruling'].includes(v.phase)) return;
    const now = performance.now();
    const at = roomClock?.now?.() ?? null;
    const stamp = at != null ? { at: Math.round(at * 10) / 10 } : {};
    wake();
    const tried = c.tried.includes(me().id);
    if (tried) return;
    if (isLive(now)) {
      if (now < lockedUntil) { lockOut(now, c, stamp); return; }
      if (pressed) return;
      pressed = true;
      haptic(25); cue('press');
      bz.className = 'jp-buzzer sent'; bz.textContent = 'BUZZED';
      buzz({ t: 'buzz', seq: target(), ...stamp });
      if (!v.hostJudges) { answerIn.value = ''; answerFor = `${c.ci}-${c.ri}-${v.round}-${target()}`; answerIn.focus({ preventScroll: true }); }
      return;
    }
    if (v.phase === 'answering') {
      // Someone else won: the press still counts for a buzz time, so everyone sees how close it was.
      if (pressed) return;
      pressed = true;
      haptic(10);
      buzz({ t: 'buzz', seq: c.open || 0, ...stamp });
      return;
    }
    // Before the buzzer turned gold: locked out, like the show.
    lockOut(now, c, stamp);
  }
  function lockOut(now, c, stamp) {
    lockedUntil = now + LOCKOUT;
    haptic([30, 40, 30]); cue('early');
    send({ t: 'buzz', seq: c.open || 0, ...stamp });   // the TV keeps the same lockout
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => render(), LOCKOUT + 5);
    render();
  }
  /** Send a press, and keep sending it until the TV says it has it (a message can be lost while Wi-Fi hiccups). */
  function buzz(msg) {
    msg.id = `${Date.now().toString(36)}${(buzzId++).toString(36)}`;
    pending = { msg, until: performance.now() + RESEND_FOR };
    trySend();
  }
  function trySend() {
    clearTimeout(resendTimer);
    if (!pending) return;
    if (performance.now() > pending.until) { pending = null; return; }
    send(pending.msg);
    resendTimer = setTimeout(trySend, RESEND);
  }

  /** Their answer and the ruling, as the TV shows it. */
  function rulingScreen() {
    const c = v.clue; const r = v.lastResult;
    const mine = r && r.pid === me().id;
    const p = player(r?.pid);
    const blank = !r || !r.answer || r.timedOut;
    return { key: `rule-${c.ci}-${c.ri}-${c.tried.length}-${r?.correct}`, nodes: [meta(c.cat, money(c.value)), center(
      h('div', { class: 'jp-msg' }, mine ? 'You said' : [named(p), ' said']),
      h('div', { class: 'jp-logo' }, blank ? (r?.timedOut ? 'Time’s up' : '(nothing)') : `“${r.answer}”`),
      h('div', { class: `jp-stamp ${r?.correct ? 'good' : 'bad'}` }, r?.correct ? `RIGHT · ${signed(Math.abs(r.delta))}` : `NOT QUITE · −${money(Math.abs(r?.delta ?? 0))}`),
      !r?.correct && !c.dd && !c.tried.includes(me().id) && h('div', { class: 'jp-muted' }, 'Get ready: you can buzz in again in a moment.'))] };
  }

  function ddWagerScreen() {
    const c = v.clue;
    const head = [h('div', { class: 'jp-logo dd' }, 'DAILY DOUBLE'), h('div', { class: 'jp-meta center' }, c.cat)];
    if (v.controllerId === me().id) return { key: `ddw-${c.ci}${c.ri}-${typing}`, nodes: wagerForm('dd-wager', 5, me().maxDD ?? 1000, head) };
    return { key: `ddww-${c.ci}${c.ri}`, nodes: center(head, dot(player(v.controllerId), 56), h('div', { class: 'jp-msg' }, [named(player(v.controllerId)), ' is placing a bet…'])) };
  }

  function ddAnswerScreen() {
    const c = v.clue;
    const head = meta(c.cat, `Bet ${money(c.wager)}`);
    const mineCtl = v.controllerId === me().id;
    if (mineCtl && v.hostJudges) return { key: `ddsay-${c.ci}${c.ri}`, nodes: [head, clueCard(c.q), center(h('div', { class: 'jp-msg' }, 'Say your answer out loud.'), v.timer && clock(), h('div', { class: 'jp-muted' }, 'The host will decide if you’re right.'))] };
    if (mineCtl) return { key: `dda-${c.ci}${c.ri}`, answer: { type: 'answer', for: `dd-${c.ci}-${c.ri}-${v.round}`, head: h('div', { class: 'jp-won' }, h('div', { class: 'jp-logo dd' }, 'ONLY YOU'), clock()) }, nodes: [head, clueCard(c.q)] };
    return { key: `ddaw-${c.ci}${c.ri}`, nodes: [head, clueCard(c.q), center(h('div', { class: 'jp-msg' }, [named(player(v.controllerId)), ` bet ${money(c.wager)} and is answering…`]))] };
  }

  function revealScreen() {
    const c = v.clue; const r = v.lastResult;
    const p = player(r?.pid);
    const mineBuzz = c.buzzes.find((b) => b.pid === me().id && b.open === 1) ?? c.buzzes.find((b) => b.pid === me().id);
    const fastest = c.buzzes[0];
    let line;
    if (!r) line = h('div', { class: 'jp-msg' }, c.buzzes.length ? 'Nobody got it' : 'Nobody buzzed in');
    else if (r.correct) line = h('div', { class: 'jp-msg' }, r.pid === me().id ? 'You got it' : [named(p), ' got it'], ' · ', h('span', { class: 'good' }, signed(Math.abs(r.delta))));
    else line = h('div', { class: 'jp-msg' }, r.pid === me().id ? 'You missed it' : [named(p), ' missed it'], ' · ', h('span', { class: 'bad' }, `−${money(Math.abs(r.delta))}`));
    let mine = null;
    if (r?.pid === me().id && r.correct && r.streak >= v.hotStreak) mine = h('div', { class: 'jp-note good' }, `🔥 You’re on fire! ${r.streak} in a row`);
    else if (mineBuzz && !(r?.pid === me().id)) mine = h('div', { class: 'jp-note bad' }, mineBuzz.pid === fastest?.pid ? `You buzzed ${secs(mineBuzz.ms)}s` : `You buzzed ${secs(mineBuzz.ms)}s, too late this time`);
    else if (mineBuzz) mine = h('div', { class: 'jp-note' }, `You buzzed in ${secs(mineBuzz.ms)}s`);
    return {
      key: `rev-${c.ci}${c.ri}-${r ? `${r.correct}${r.overridden}` : ''}-${c.buzzes.length}`,
      nodes: h('div', { class: 'jp-reveal' }, eyebrow('THE ANSWER'), h('div', { class: 'jp-logo sun' }, c.answer), line, mine, scoreList()),
    };
  }

  function roundEndScreen() {
    const place = v.players.filter((p) => p.score > me().score).length + 1;
    return { key: `re-${v.round}`, nodes: [center(eyebrow(`ROUND ${v.round} DONE`), h('div', { class: 'jp-logo xl' }, ordinal(place)), h('div', { class: 'jp-msg' }, `You have ${minus(me().score)}`),
      h('div', { class: 'jp-muted' }, v.round < v.rounds ? 'The next round is worth double.' : 'Final Jeopardy is next.')), scoreList()] };
  }

  function finalWagerScreen() {
    const f = v.final;
    if (!f.eligible.includes(me().id)) return { key: 'fw-out', nodes: center(h('div', { class: 'jp-logo' }, 'FINAL JEOPARDY'), h('div', { class: 'jp-msg' }, 'Only players with money play Final Jeopardy tonight.'), h('div', { class: 'jp-muted' }, 'Sit back and cheer!')) };
    if (me().finalWager !== undefined) return { key: 'fw-done', nodes: center(h('div', { class: 'jp-lock' }, '🔒'), h('div', { class: 'jp-msg' }, `Wager locked: ${money(me().finalWager)}`), h('div', { class: 'jp-muted' }, 'Nobody sees it until the reveal. Waiting for everyone else…')) };
    return { key: `fw-${typing}`, nodes: wagerForm('final-wager', 0, me().maxFinal ?? me().score,
      [h('div', { class: 'jp-logo' }, 'FINAL JEOPARDY'), h('div', { class: 'jp-meta center' }, f.category)]) };
  }

  function finalAnswerScreen() {
    const f = v.final;
    if (!f.eligible.includes(me().id)) return { key: 'fa-out', nodes: [meta(f.category, 'FINAL'), clueCard(f.q), center(h('div', { class: 'jp-muted' }, 'Play along in your head!'))] };
    if (me().finalAnswer !== undefined) return { key: 'fa-done', nodes: center(h('div', { class: 'jp-lock' }, '🔒'), h('div', { class: 'jp-msg' }, `Locked in: “${me().finalAnswer}”`), h('div', { class: 'jp-muted' }, 'Watch the TV for the big reveal.')) };
    return { key: 'fa', answer: { type: 'final-answer', for: `final-${f.category}`, head: h('div', { class: 'jp-won' }, h('div', { class: 'jp-small jp-muted' }, `You bet ${money(me().finalWager ?? 0)}`), clock()), focus: true },
      nodes: [meta(f.category, 'FINAL'), clueCard(f.q)] };
  }

  function finalRevealScreen() {
    const f = v.final;
    const r = f.reveals.find((x) => x.id === me().id);
    const upNow = f.order?.[f.revealIndex] === me().id && f.stage !== 'done';
    if (f.stage === 'done') {
      return { key: `fr-done-${r?.correct}`, nodes: [center(eyebrow('THE CORRECT RESPONSE'), h('div', { class: 'jp-logo sun' }, f.answer ?? ''),
        r && h('div', { class: `jp-note ${r.correct ? 'good' : 'bad'}` }, r.correct ? `You got it! ${signed(r.wager)}` : `Not this time. ${r.wager ? `−${money(r.wager)}` : 'You kept your money.'}`)), scoreList()] };
    }
    if (r && !r.pending) {
      return { key: `fr-${r.correct}-${f.revealIndex}`, nodes: center(eyebrow(upNow ? 'YOUR REVEAL' : 'YOU WROTE'), h('div', { class: 'jp-logo' }, r.answer),
        h('div', { class: `jp-stamp ${r.correct ? 'good' : 'bad'}` }, r.correct ? 'RIGHT' : 'WRONG'),
        h('div', { class: 'jp-msg' }, r.wager ? (r.correct ? signed(r.wager) : `−${money(r.wager)}`) : 'You bet $0', ' · now ', minus(me().score))) };
    }
    if (upNow) return { key: `fr-up-${f.revealIndex}`, nodes: center(eyebrow('YOU’RE UP'), h('div', { class: 'jp-logo' }, r?.answer ?? ''), h('div', { class: 'jp-muted' }, 'Right or wrong? Watch the TV…')) };
    const cur = player(f.order?.[f.revealIndex]);
    return { key: `fr-wait-${f.revealIndex}`, nodes: center(h('div', { class: 'jp-logo' }, 'THE REVEAL'), cur && h('div', { class: 'jp-msg' }, ['Now: ', named(cur)]), h('div', { class: 'jp-muted' }, 'Lowest score first. Watch the TV…')) };
  }

  function gameoverScreen() {
    // Ties share a place.
    const mineScore = me().score;
    const place = v.players.filter((p) => p.score > mineScore).length + 1;
    const tied = v.players.filter((p) => p.score === mineScore).length > 1;
    const mine = (v.awards ?? []).filter((a) => a.pid === me().id);
    const sorted = v.players.slice().sort((a, b) => b.score - a.score);
    const starter = me().isCaptain ? null : player(v.captainId);
    return { key: `go-${place}-${mineScore}-${mine.length}`, nodes: [center(
      eyebrow(place === 1 ? (tied ? 'IT’S A TIE!' : 'YOU WON!') : 'YOU FINISHED'),
      h('div', { class: 'jp-logo xl sun' }, place === 1 && !tied ? 'CHAMPION' : ordinal(place)),
      mine.map((a) => h('div', { class: 'jp-msg' }, h('b', { class: 'sun' }, a.title), `: ${a.detail}`))), scoreList({ champion: sorted[0]?.id }),
    h('div', { class: 'jp-small jp-muted jp-center-t' }, starter ? `Waiting for ${starter.name} to start a new game` : 'Tap Play again for a new game')] };
  }

  function currentScreen() {
    switch (v.phase) {
      case 'lobby': return lobbyScreen();
      case 'round-intro': return introScreen();
      case 'board': return boardScreen();
      case 'reading': case 'open': case 'answering': return buzzScreen();
      case 'ruling': return v.clue?.buzzedId === me().id || v.lastResult?.pid === me().id || v.clue?.dd ? rulingScreen() : buzzScreen();
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
  let reactKey = '';
  function renderReactions() {
    const ph = v.phase; const c = v.clue; const mid = me().id;
    let on = ['lobby', 'round-intro', 'board', 'answering', 'ruling', 'reveal', 'dd-wager', 'dd-answer', 'round-end', 'final-reveal', 'gameover'].includes(ph);
    if (ph === 'board' && v.controllerId === mid) on = false;
    if (ph === 'answering' && c?.buzzedId === mid) on = false;
    if ((ph === 'dd-wager' || ph === 'dd-answer') && v.controllerId === mid) on = false;
    const key = String(on);
    if (key === reactKey) return;
    reactKey = key;
    reactBar.style.display = on ? 'flex' : 'none';
    reactBar.replaceChildren(...(on ? v.reactionChoices.map((e, i) => h('button', { type: 'button', onclick: () => { send({ t: 'react', e: i }); navigator.vibrate?.(15); } }, e)) : []));
  }

  /** Continue while some players have not locked in yet asks first, so nobody's wager or answer is skipped by a slip. */
  function carryOn() {
    const f = v.final;
    if (v.phase === 'final-wager' && f && f.wagered.length < f.eligible.length && !confirm('Not everyone has locked in a wager. Skip ahead anyway? Missing wagers count as $0.')) return;
    if (v.phase === 'final-answer' && f && f.answered.length < f.eligible.length && !confirm('Not everyone has locked in an answer. Reveal now anyway?')) return;
    cap('advance');
  }
  function renderCaptain() {
    if (!me().isCaptain) { captainBar.style.display = 'none'; captainBar.replaceChildren(); return; }
    const ph = v.phase; const items = [];
    if (ph === 'lobby') items.push(['Start game', () => cap('start'), '']);
    if (ph === 'round-intro') items.push(['Skip intro', () => cap('advance'), 'ghost']);
    if (['reading', 'open', 'answering', 'dd-wager', 'dd-answer'].includes(ph)) items.push(['Skip clue', () => { if (confirm('Skip this clue? Nobody wins or loses money on it.')) cap('skip'); }, 'ghost']);
    if (v.lastResult && ['reveal', 'board'].includes(ph) && !v.hostJudges) items.push(['Flip last ruling', () => cap('override'), 'ghost']);
    if (['reveal', 'round-end', 'final-reveal'].includes(ph)) items.push(['Continue', () => cap('advance'), '']);
    if (['final-wager', 'final-answer'].includes(ph)) items.push(['Continue', carryOn, 'ghost']);
    if (ph === 'board') items.push(['End round early', () => { if (confirm('End this round now?')) cap('endRound'); }, 'ghost']);
    if (ph === 'gameover') items.push(['Play again', () => cap('playAgain'), '']);
    if (ph !== 'lobby' && ph !== 'gameover') items.push(['End game', () => { if (confirm('End this game for everyone? Scores reset and everyone goes back to the lobby.')) cap('endGame'); }, 'ghost']);
    if (ph !== 'lobby' && v.players.length) items.push(['Fix scores', () => { sheet = true; renderSheet(); }, 'ghost']);
    const key = items.map((x) => x[0]).join('|');
    captainBar.style.display = items.length ? 'flex' : 'none';
    if (captainBar.dataset.key === key) return;
    captainBar.dataset.key = key;
    captainBar.replaceChildren(...items.map(([label, fn, cls]) => btn(label, fn, cls)));
  }

  function renderSheet() {
    if (!sheet || !v || !me().isCaptain) { sheetEl.replaceChildren(); return; }
    const row = (p) => h('div', { class: 'jp-srow', style: { '--c': p.color } },
      h('span', { class: 'n' }, p.name), h('b', { class: p.score < 0 ? 'neg' : '' }, minus(p.score)),
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
    const meP = player(me().id);
    const round = v.phase === 'lobby' ? 'LOBBY' : v.phase.startsWith('final') || v.phase === 'gameover' ? 'FINAL' : `ROUND ${v.round}`;
    strip.replaceChildren(h('b', {}, round), h('span', {}, [me().isCaptain ? '★ Captain' : '', meP && meP.streak >= v.hotStreak ? ` 🔥${meP.streak}` : ''].join('')));
  }

  // ---------- drawing ----------
  function render() {
    if (!v?.me) return;
    renderStrip();
    const s = currentScreen();
    if (s.key !== screenKey) {
      screenKey = s.key;
      body.replaceChildren(...[].concat(s.nodes).flat(Infinity).filter(Boolean).map((n) => (n instanceof Node ? n : document.createTextNode(String(n)))));
      body.onclick = s.answer ? () => answerIn.focus() : null;   // tap anywhere to type
      if (s.answer) answerHead.replaceChildren(s.answer.head);
    }
    // The answer box: shown while it is this phone's turn to type, hidden (but kept, and maybe focused) otherwise.
    const a = s.answer ?? null;
    if (a) {
      if (a.for !== answerFor) { answerFor = a.for; answerIn.value = ''; }
      answerType = a.type;
      answerBox.classList.add('on');
      root.classList.add('typing');
      if (a.focus && document.activeElement !== answerIn && !answerBox.dataset.focused) { answerBox.dataset.focused = a.for; setTimeout(() => answerIn.focus(), 60); }
    } else {
      if (answerType && document.activeElement === answerIn && !['open', 'reading'].includes(v.phase)) answerIn.blur();
      answerType = null;
      answerBox.classList.remove('on');
      root.classList.remove('typing');
      delete answerBox.dataset.focused;
    }
    renderReactions();
    renderCaptain();
    renderSheet();
    tick();
  }

  /** Redraws the countdown bars and clock from the last timer the server sent. */
  function tick() {
    const t = v?.timer;
    let left = t ? Math.max(0, t.leftMs - (performance.now() - receivedAt)) : 0;
    // The reading bar fills at the very moment the button turns gold (by the clock kept in step with the TV's).
    if (t?.kind === 'reading' && v.phase === 'reading') { const at = liveAtLocal(); if (at != null) left = Math.max(0, at - performance.now()); }
    const frac = t && t.totalMs ? Math.min(1, left / t.totalMs) : 0;
    for (const el of root.querySelectorAll('[data-jp-bar]')) el.style.transform = `scaleX(${frac})`;
    for (const el of root.querySelectorAll('[data-jp-fill]')) el.style.transform = `scaleX(${t ? 1 - frac : 0})`;
    for (const el of root.querySelectorAll('[data-jp-clock]')) { el.textContent = t ? (left > 0 ? String(Math.ceil(left / 1000)) : 'TIME!') : ''; el.classList.toggle('low', !!t && left < 4000); }
  }
  const ticker = setInterval(tick, 100);

  function say(text, ms) {
    note = text; clearTimeout(noteTimer);
    render();
    noteTimer = setTimeout(() => { note = ''; render(); }, ms);
  }

  /** This phone won the buzz: a cue you hear and feel, once. */
  function wonCue() {
    const c = v?.clue;
    const key = c ? `${c.ci}-${c.ri}-${v.round}-${c.open}` : '';
    if (key && key === wonKey) return;
    wonKey = key;
    haptic(60); cue('won');
  }

  return {
    update(r) {
      const before = v?.phase;
      const old = v;
      v = r.game; receivedAt = performance.now();
      if (typeof r.room?.settings?.sound === 'boolean') soundOn = r.room.settings.sound;
      // The press is in (the state shows it): no need to send it again.
      if (pending && v.clue?.buzzes?.some((b) => b.pid === v.me?.id && b.open >= (pending.msg.seq ?? 0))) { pending = null; clearTimeout(resendTimer); }
      if (v.phase !== 'open' && v.phase !== 'answering' && v.phase !== 'reading' && v.phase !== 'ruling') { pending = null; clearTimeout(resendTimer); }
      // Won the buzz (the room may decide a split second after the press, once any earlier press has had time to arrive).
      if (v.me && v.phase === 'answering' && v.clue?.buzzedId === v.me.id && old?.clue?.buzzedId !== v.me.id) wonCue();
      else if (v.me && v.phase === 'answering' && v.clue && v.clue.buzzedId !== v.me.id && old?.phase !== 'answering') {
        // Someone else won while this phone's press was still on its way: put the keyboard away again.
        if (document.activeElement === answerIn && !answerType) setTimeout(() => { if (!answerType) answerIn.blur(); }, 0);
      }
      if (old && v.me) {
        // Their turn to pick a clue.
        if (v.phase === 'board' && v.controllerId === v.me.id && (old.phase !== 'board' || old.controllerId !== v.me.id)) {
          cue('turn'); navigator.vibrate?.([30, 60, 30]);
        }
        // Their own answer, ruled right or wrong.
        const r1 = v.lastResult; const r0 = old.lastResult;
        if (r1 && r1.pid === v.me.id && JSON.stringify(r1) !== JSON.stringify(r0)) {
          cue(r1.correct ? 'right' : 'wrong');
        }
      }
      if (before !== v.phase && !['dd-wager', 'final-wager'].includes(v.phase)) { wager = null; typing = false; }
      render();
    },
    onMessage(m) {
      if (m.t === 'buzz-result') {
        // An answer for a press we are still sending: stop sending it. (Answers to repeats of it are ignored.)
        if (m.id != null && pending?.msg.id === m.id) { pending = null; clearTimeout(resendTimer); }
        else if (m.id != null) return;
        if (m.result === 'won') wonCue();
        else if (m.result === 'early') {
          // The TV saw it as too early. Usually this phone already knew (and showed it at once); if not, show it now.
          pressed = false;
          if (document.activeElement === answerIn && !answerType) answerIn.blur();
          if (m.id != null) { lockedUntil = performance.now() + LOCKOUT; cue('early'); clearTimeout(lockTimer); lockTimer = setTimeout(() => render(), LOCKOUT + 5); render(); }
        } else if (m.result === 'late') {
          if (document.activeElement === answerIn && !answerType) answerIn.blur();
          say(`Beaten to it! Your time: ${secs(m.ms)}s`, 2500);
        }
      } else if (m.t === 'ack') flash(m.what === 'wager' ? 'Wager locked in' : 'Answer locked in', 'ok');
    },
    destroy() { clearTimeout(liveTimer); clearTimeout(lockTimer); clearTimeout(resendTimer); hapticSwitch?.remove(); removeEventListener('pointerdown', wake, { capture: true }); actx?.close?.().catch?.(() => {}); clearInterval(ticker); clearTimeout(noteTimer); clearTimeout(draftTimer); document.body.classList.remove('jp-phone'); },
  };
}
