// Jeopardy on the TV: the board, the clue stage, Final Jeopardy and the winner.
import { h, money, ink, unitById, qrImg } from '../../common.js';
import { flat } from './flat.js';

const qr = qrImg;

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
      stage.push(h('div', { class: 'banner who', style: { background: c, color: ink(c) } }, nameOf(v, who) + (cl.dd ? ` · wager ${money(cl.wager)}` : '')));
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
    body.push(h('div', { class: 'cluecat' }, h('span', {}, f.category), h('span', {}, 'Final Jeopardy')), h('div', { class: 'text' }, f.text),
      h('p', { style: { fontSize: '3vmin', color: '#cdd6ff' } }, 'Type your answer on your phone'));
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
export function render(view) {
  const v = flat(view);
  if (v.status === 'done') return done(v);
  if (v.status === 'final' && v.final) return final(v);
  if (v.view === 'leaderboard') return leaderboard(v);
  if (v.status === 'clue' && v.clue) return clue(v);
  return board(v);
}
