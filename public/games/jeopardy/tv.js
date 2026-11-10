// Jeopardy on the TV: the board, the clue stage, Final Jeopardy and the winner.
import { h, money, ink, unitById, qrImg } from '../../common.js';
import { flat } from './flat.js';

const qr = qrImg;

// ---------- countdown ----------
// The server sends how much time is left when something changes; between pushes the
// TV counts down locally, so the bar stays smooth and nothing is sent every second.
let live = null; // { leftMs, totalMs, at, bar, num, shown }
let play = () => {};
let musicPlaying = () => false;
setInterval(() => {
  if (!live) return;
  const left = Math.max(0, live.leftMs - (performance.now() - live.at));
  if (live.bar) { live.bar.firstChild.style.width = `${(left / live.totalMs) * 100}%`; live.bar.classList.toggle('low', left <= 3000); }
  const secs = Math.ceil(left / 1000);
  if (live.num) live.num.textContent = String(secs);
  if (secs !== live.shown) { live.shown = secs; if (secs > 0 && secs <= 5 && left < live.totalMs && !musicPlaying()) play('tick'); }
}, 100);

/** Builds the bar and number for a running timer and starts counting it down. */
function timerParts(timer) {
  if (!timer || timer.timedOut) { live = null; return { bar: null, num: null }; }
  const bar = h('div', { class: 'timer' }, h('i'));
  const num = h('span', { class: 'tnum' }, String(Math.ceil(timer.leftMs / 1000)));
  live = { leftMs: timer.leftMs, totalMs: timer.totalMs, at: performance.now(), bar, num, shown: Math.ceil(timer.leftMs / 1000) };
  bar.firstChild.style.width = `${(timer.leftMs / timer.totalMs) * 100}%`;
  return { bar, num };
}

/** Sound cues for a change of state. prev and view are the raw { room, game } views. */
export function onChange(prev, view, sound) {
  play = sound.play; musicPlaying = sound.musicPlaying;
  const p = prev.game; const g = view.game;
  const pc = p.clue; const c = g.clue;
  if (c) {
    const changed = !pc || pc.c !== c.c || pc.r !== c.r;
    if (c.dd && c.step === 'wager' && changed) sound.play('dd');
    else if (c.step === 'open' && pc?.step !== 'open') sound.play('open');
    else if (c.step === 'answering' && pc?.step !== 'answering') sound.play('buzz');
    else if (c.lockedOut.length > (changed ? 0 : pc.lockedOut.length)) sound.play('wrong');
    else if (c.step === 'revealed' && pc && pc.step !== 'revealed') {
      if (c.correct) sound.play('correct');
      else if (pc.step === 'answering') sound.play('wrong');   // a wrong Daily Double
      else sound.play('reveal');
    }
    if (c.timer?.timedOut && !pc?.timer?.timedOut) sound.play('timeup');
  }
  const pf = p.final; const f = g.final;
  // Final Jeopardy music (the optional "think" file) runs with the countdown and stops with it.
  const running = !!(f && f.step === 'clue' && f.timer && !f.timer.timedOut);
  const wasRunning = !!(pf && pf.step === 'clue' && pf.timer && !pf.timer.timedOut);
  if (running && (!wasRunning || f.timer.leftMs > pf.timer.leftMs + 1500)) sound.music('think', { owner: 'final', loop: true }); // started, or the host restarted it
  else if (!running) sound.stopMusic('final');
  if (f) {
    if (!pf) sound.play('final');
    else {
      if (f.timer?.timedOut && !pf.timer?.timedOut) sound.play('timeup');
      f.finalists.forEach((fu, i) => {
        if (fu.result !== null && pf.finalists[i]?.result === null) sound.play(fu.result ? 'correct' : 'wrong');
      });
    }
  }
  if (g.status === 'done' && p.status !== 'done') sound.play('fanfare');
}

const byScore = (units) => [...units].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
const pts = (n, cls = '') => h('span', { class: `pts ${n < 0 ? 'neg' : ''} ${cls}` }, money(n));
const nameOf = (v, id) => unitById(v, id)?.name ?? '';
const colorOf = (v, id) => unitById(v, id)?.color ?? '#fff';

function scoreRow(u, v, big = false) {
  return h('div', { class: `score ${big ? 'big' : ''} ${v.control === u.id ? 'ctl' : ''} ${u.connected ? '' : 'off'}` },
    h('span', { class: 'swatch', style: { background: u.color } }),
    h('span', { class: 'nm' }, u.name),
    pts(u.score));
}

function sidebar(v) {
  const sorted = byScore(v.units);
  const shown = sorted.slice(0, 8);
  return h('aside', { class: 'scores' },
    h('h3', {}, v.mode === 'teams' ? 'Teams' : 'Scores'),
    shown.map((u) => scoreRow(u, v)),
    sorted.length > shown.length && h('div', { class: 'more' }, `+ ${sorted.length - shown.length} more`),
    h('div', { class: 'qr-mini' }, qr(), 'Scan to join'));
}

function board(v) {
  const flat = [];
  v.categories.forEach((name, c) => flat.push(h('div', { class: 'cat' }, name)));
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const cell = v.board[c][r];
      flat.push(h('div', { class: `tile ${cell.used ? 'used' : ''}` }, cell.used ? '' : money(cell.value)));
    }
  }
  return h('div', { class: 'tv-layout' }, h('div', { class: 'tv-main' }, h('div', { class: 'board' }, flat)), sidebar(v));
}

function leaderboard(v, title = 'Leaderboard') {
  const sorted = byScore(v.units);
  const cols = sorted.length > 10;
  return h('div', { class: 'tv-layout full' }, h('div', { class: 'tv-main' }, h('div', { class: 'stage', style: { alignContent: 'center' } },
    h('div', { style: { width: '100%' } },
      h('div', { class: 'text', style: { marginBottom: '2vmin' } }, title),
      h('div', { class: 'final-grid', style: { gridTemplateColumns: cols ? '1fr 1fr' : '1fr', maxWidth: cols ? '100%' : '80vmin', margin: '0 auto' } },
        sorted.map((u) => scoreRow(u, v, true)))))));
}

function clue(v) {
  const cl = v.clue;
  const who = cl.buzzedBy;
  const stage = [h('div', { class: 'cluecat' }, h('span', {}, cl.category), h('span', {}, cl.dd ? 'Daily Double' : money(cl.value)))];
  if (cl.step === 'wager') {
    stage.push(h('div', {}, h('div', { class: 'dd-big' }, 'DAILY DOUBLE!'),
      h('div', { class: 'text', style: { marginTop: '3vmin' } },
        cl.ddUnit ? h('span', { style: { color: colorOf(v, cl.ddUnit) } }, nameOf(v, cl.ddUnit)) : 'Who has control?',
        cl.ddUnit && ', make your wager')));
  } else {
    stage.push(h('div', {}, h('div', { class: 'text' }, cl.text),
      cl.step === 'revealed' && h('div', { class: 'answer' }, cl.answer)));
    if (cl.step === 'open') stage.push(h('div', { class: 'banner open' }, 'Buzz in!'));
    else if (cl.step === 'answering' && who) {
      const c = colorOf(v, who);
      const { bar, num } = timerParts(cl.timer);
      const late = cl.timer?.timedOut;
      stage.push(h('div', { class: `banner who ${late ? 'timeup' : ''}`, style: late ? {} : { background: c, color: ink(c) } },
        h('span', {}, nameOf(v, who) + (cl.dd ? ` · wager ${money(cl.wager)}` : '')),
        late ? h('span', { class: 'tnum' }, 'TIME’S UP') : num), bar);
    } else if (cl.step === 'revealed') {
      const ok = cl.correct;
      stage.push(h('div', { class: 'banner', style: ok ? { background: '#15803d' } : {} },
        ok ? `${nameOf(v, ok)} · ${cl.dd ? '+' + money(cl.wager) : '+' + money(cl.value)}` : 'Time!'));
    }
  }
  return h('div', { class: 'tv-layout' }, h('div', { class: 'tv-main' }, h('div', { class: 'stage' }, stage)), sidebar(v));
}

function final(v) {
  const f = v.final;
  const body = [];
  if (f.step === 'wager') {
    body.push(h('div', { class: 'text' }, 'Final Jeopardy'), h('div', { class: 'answer' }, f.category),
      h('p', { style: { fontSize: '3vmin', color: '#cdd6ff' } }, 'Place your wagers on your phone'));
  } else if (f.step === 'clue') {
    const { bar, num } = timerParts(f.timer);
    body.push(h('div', { class: 'cluecat' }, h('span', {}, f.category), h('span', {}, 'Final Jeopardy')), h('div', { class: 'text' }, f.text),
      f.timer && h('div', { class: 'bigtimer' }, f.timer.timedOut ? 'TIME’S UP' : num),
      h('p', { style: { fontSize: '3vmin', color: '#cdd6ff' } }, 'Type your answer on your phone'), bar);
  } else {
    body.push(h('div', { class: 'cluecat' }, h('span', {}, f.category), h('span', {}, 'Final Jeopardy')),
      h('div', { class: 'text', style: { fontSize: '4.4vmin' } }, f.text),
      f.step === 'results' && h('div', { class: 'answer', style: { marginTop: '1.5vmin', fontSize: '4vmin' } }, f.answer));
  }
  if (f.step !== 'clue') {
    body.push(h('div', { class: 'final-grid' }, f.finalists.map((fu) => {
      const u = unitById(v, fu.id);
      const judged = fu.result !== null;
      return h('div', { class: `frow ${judged ? (fu.result ? 'ok' : 'no') : ''}` },
        h('span', {}, h('span', { class: 'swatch', style: { background: u.color } }), ' ', u.name),
        h('span', {}, judged ? `“${fu.answer || '—'}”` : f.step === 'wager' ? (fu.wagered ? 'Wager locked in ✓' : 'Wagering…') : '…'),
        h('span', {}, judged ? money(fu.wager) : ''),
        h('span', { class: 'res' }, judged ? (fu.result ? '✔' : '✘') : ''));
    })));
  }
  return h('div', { class: 'tv-layout full' }, h('div', { class: 'tv-main' }, h('div', { class: 'stage', style: { alignContent: 'center' } }, h('div', { style: { width: '100%' } }, body))));
}

function done(v) {
  const sorted = byScore(v.units);
  const top = sorted[0];
  const winners = sorted.filter((u) => u.score === top?.score);
  return h('div', { class: 'tv-layout full' }, h('div', { class: 'tv-main' }, h('div', { class: 'stage', style: { alignContent: 'center' } },
    h('div', { style: { width: '100%' } },
      h('div', { class: 'text' }, winners.length > 1 ? 'It’s a tie!' : 'Winner'),
      h('div', { class: 'winner' }, winners.map((w) => w.name).join(' & ')),
      h('div', { class: 'final-grid', style: { gridTemplateColumns: sorted.length > 10 ? '1fr 1fr' : '1fr', maxWidth: sorted.length > 10 ? '100%' : '80vmin', margin: '0 auto' } },
        sorted.map((u) => scoreRow(u, { control: null }, true)))))));
}

/** Returns the element to show for the current state. The TV page swaps it in. */
export function render(view, ctx) {
  if (ctx?.sound) { play = ctx.sound.play; musicPlaying = ctx.sound.musicPlaying; }
  const v = flat(view);
  live = null; // each screen sets up its own countdown, if it has one
  if (v.status === 'done') return done(v);
  if (v.status === 'final' && v.final) return final(v);
  if (v.view === 'leaderboard') return leaderboard(v);
  if (v.status === 'clue' && v.clue) return clue(v);
  return board(v);
}
