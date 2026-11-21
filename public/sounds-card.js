// The host page's "Your own sounds" card: pick a file from this phone or computer and it is sent to the TV, which keeps it
// (the files never go to GitHub or any server). The card is built once and reused, because the host page redraws itself
// on every update and would otherwise throw away a half-finished choice.
import { h, hostRpc } from './common.js';
import { button, card, eyebrow } from './ui.js';
import { guessSounds } from './sound-guess.js';

const PIECE_BYTES = 90 * 1024;   // raw bytes per piece; about 120 KB once it is base64

let root = null;
let info = null;        // what the TV said: { available, files, games, names, extensions }
let loading = false;
let status = '';        // progress or an error under the form
let busy = false;
const choice = { game: 'shared', name: 'lobby' };
let bulk = [];          // files picked together, each with the game and sound it is for ({ file, game, name | null, note? })

const base64 = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function refresh() {
  if (loading) return;
  loading = true;
  const r = await hostRpc('listSounds', {});
  loading = false;
  info = r.ok ? r.data : { available: false, files: [], error: r.error };
  draw();
}

/** Sends one file to the TV a piece at a time, so each message stays small. Resolves with an error message, or null once the TV has it. */
async function sendFile(file, target, prefix = '') {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!info.extensions.includes(ext)) return 'The Apple TV plays .mp3, .m4a and .wav files.';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const total = Math.max(1, Math.ceil(bytes.length / PIECE_BYTES));
  for (let index = 0; index < total; index++) {
    status = `${prefix}Sending ${file.name}… ${Math.round((index / total) * 100)}%`; draw();
    const r = await hostRpc('putSound', { ...target, ext, index, total, data: base64(bytes.subarray(index * PIECE_BYTES, (index + 1) * PIECE_BYTES)) });
    if (!r.ok) return r.error ?? 'The TV did not take it';
  }
  return null;
}

async function send(file) {
  busy = true;
  const error = await sendFile(file, { ...choice });
  busy = false;
  status = error ?? `Added. It is on the TV now (${kb(file.size)}).`;
  if (error) draw(); else await refresh();
}

/** Sends every picked file that has a sound chosen, one after another, and says which went and which did not. */
async function sendAll() {
  const todo = bulk.filter((b) => b.name);
  if (!todo.length) { status = 'Nothing to add: pick a sound for at least one file.'; draw(); return; }
  busy = true;
  const failed = [];
  for (const [i, b] of todo.entries()) {
    const error = await sendFile(b.file, { game: b.game, name: b.name }, `(${i + 1} of ${todo.length}) `);
    if (error) failed.push(`${b.file.name}: ${error}`);
  }
  busy = false;
  bulk = bulk.filter((b) => failed.some((f) => f.startsWith(`${b.file.name}:`)));
  status = failed.length ? `${todo.length - failed.length} of ${todo.length} added. Not added: ${failed.join('; ')}` : `All ${todo.length} added. They are on the TV now.`;
  await refresh();
}

function pickMany(files) {
  const guesses = guessSounds([...files].map((f) => f.name), info.names);
  const byName = new Map([...files].map((f) => [f.name, f]));
  bulk = guesses.map((g) => ({ file: byName.get(g.file), game: g.game, name: g.name, note: g.duplicateOf ? `Same sound as ${g.duplicateOf}` : '' }));
  status = '';
  draw();
}

/** One row of the several-at-once list: the file, and the game and sound it will be added as. */
function bulkRow(b) {
  const soundsFor = (game) => info.names.filter((n) => n.games.includes(game));
  const gameSel = h('select', { 'aria-label': `Game for ${b.file.name}`, disabled: busy, onchange: (e) => {
    b.game = e.target.value;
    if (b.name && !soundsFor(b.game).some((n) => n.name === b.name)) b.name = null;
    draw();
  } }, info.games.map((g) => h('option', { value: g.id, selected: g.id === b.game }, g.label)));
  const nameSel = h('select', { 'aria-label': `Sound for ${b.file.name}`, disabled: busy, onchange: (e) => { b.name = e.target.value || null; b.note = ''; draw(); } },
    h('option', { value: '', selected: !b.name }, '— Skip this one —'),
    soundsFor(b.game).map((n) => h('option', { value: n.name, selected: n.name === b.name }, n.labels?.[b.game] ?? n.label)));
  return h('div', { class: 'rowi', style: { display: 'grid', gap: '6px' } },
    h('div', { class: 't' }, b.file.name, h('span', { class: 's' }, ` · ${kb(b.file.size)}`)),
    b.note ? h('div', { class: 's' }, b.note) : null,
    h('div', { class: 'inline' }, gameSel, nameSel));
}

function draw() {
  if (!root) return;
  const kids = [eyebrow('Your own sounds')];
  if (!info) kids.push(h('p', { class: 'dim' }, 'Checking the TV…'));
  else if (!info.available) {
    kids.push(h('p', { class: 'dim' }, info.error ?? 'This TV cannot keep your own sounds. The Apple TV app can.'));
  } else {
    kids.push(h('p', { class: 'dim' }, 'Add music and sounds here and the TV keeps them. They stay on the TV, not on the internet, and they stay through app updates. (If the Apple TV runs short of space it can clear them; the list below then shows what is left, and you can add them again.)'));
    const label = (game, name) => `${info.games.find((g) => g.id === game)?.label ?? game}: ${(() => { const n = info.names.find((x) => x.name === name); return n?.labels?.[game] ?? n?.label ?? name; })()}`;
    if (info.files.length) {
      kids.push(h('div', { class: 'list' }, info.files.map((f) => h('div', { class: 'rowi' },
        h('div', { class: 'grow' }, h('div', { class: 't' }, label(f.game, f.name)), h('div', { class: 's' }, `${f.name}.${f.ext} · ${kb(f.bytes)}`)),
        button({ label: 'Remove', kind: 'ghost', size: 'sm', disabled: busy, onclick: async () => { const r = await hostRpc('deleteSound', { game: f.game, name: f.name }); status = r.ok ? '' : r.error; await refresh(); } })))));
    } else kids.push(h('p', { class: 'dim' }, 'Nothing added yet. The built-in sounds are used.'));

    const gameSel = h('select', { 'aria-label': 'Which game', onchange: (e) => {
      choice.game = e.target.value;
      if (!info.names.find((n) => n.name === choice.name)?.games.includes(choice.game)) choice.name = info.names.find((n) => n.games.includes(choice.game)).name;
      draw();
    } }, info.games.map((g) => h('option', { value: g.id, selected: g.id === choice.game }, g.label)));
    const nameSel = h('select', { 'aria-label': 'Which sound', onchange: (e) => { choice.name = e.target.value; } },
      info.names.filter((n) => n.games.includes(choice.game)).map((n) => h('option', { value: n.name, selected: n.name === choice.name }, n.labels?.[choice.game] ?? n.label)));
    const file = h('input', { type: 'file', accept: 'audio/*,.mp3,.m4a,.wav', 'aria-label': 'Sound file', disabled: busy });
    const many = h('input', { type: 'file', multiple: true, accept: 'audio/*,.mp3,.m4a,.wav', 'aria-label': 'Several sound files', disabled: busy,
      onchange: (e) => { if (e.target.files.length) pickMany(e.target.files); } });
    kids.push(
      h('div', { class: 'eyebrow' }, 'Add several at once'),
      h('p', { class: 'dim' }, 'Choose all your files together. The page guesses the game and sound from each file’s name, and you can change any guess.'),
      h('label', { class: 'field' }, h('span', {}, 'Files (.mp3, .m4a or .wav)'), many),
      ...(bulk.length ? [h('div', { class: 'list' }, bulk.map(bulkRow)),
        button({ label: busy ? 'Sending…' : `Add ${bulk.filter((b) => b.name).length} to the TV`, kind: 'primary', block: true, disabled: busy, onclick: sendAll })] : []),
      h('div', { class: 'eyebrow' }, 'Or add one'),
      h('label', { class: 'field' }, h('span', {}, 'Game'), gameSel),
      h('label', { class: 'field' }, h('span', {}, 'Sound'), nameSel),
      h('label', { class: 'field' }, h('span', {}, 'File (.mp3, .m4a or .wav)'), file),
      button({ label: busy ? 'Sending…' : 'Add to the TV', kind: 'primary', block: true, disabled: busy, onclick: () => { if (file.files[0]) send(file.files[0]); else { status = 'Choose a file first.'; draw(); } } }),
      h('p', { class: 'dim' }, 'A game’s own file wins over an “Every game” one. Adding the same sound again replaces it.'));
  }
  if (status) kids.push(h('p', { class: 'dim', role: 'status' }, status));
  root.replaceChildren(...kids);
}

/** The card, the same element every time. It loads what the TV has the first time it is shown. */
export function soundsCard() {
  if (!root) { root = card(); draw(); }
  if (!info && !loading) refresh();
  return root;
}
