// The host page's "Your own sounds" card: pick a file from this phone or computer and it is sent to the TV, which keeps it
// (the files never go to GitHub or any server). The card is built once and reused, because the host page redraws itself
// on every update and would otherwise throw away a half-finished choice.
import { h, hostRpc } from './common.js';
import { button, card, eyebrow } from './ui.js';

const PIECE_BYTES = 90 * 1024;   // raw bytes per piece; about 120 KB once it is base64

let root = null;
let info = null;        // what the TV said: { available, files, games, names, extensions }
let loading = false;
let status = '';        // progress or an error under the form
let busy = false;
const choice = { game: 'shared', name: 'lobby' };

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

/** Sends one file to the TV a piece at a time, so each message stays small. */
async function send(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!info.extensions.includes(ext)) { status = 'The Apple TV plays .mp3, .m4a and .wav files.'; draw(); return; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const total = Math.max(1, Math.ceil(bytes.length / PIECE_BYTES));
  busy = true;
  for (let index = 0; index < total; index++) {
    status = `Sending ${file.name}… ${Math.round((index / total) * 100)}%`; draw();
    const r = await hostRpc('putSound', { ...choice, ext, index, total, data: base64(bytes.subarray(index * PIECE_BYTES, (index + 1) * PIECE_BYTES)) });
    if (!r.ok) { busy = false; status = r.error ?? 'The TV did not take it'; draw(); return; }
  }
  busy = false;
  status = `Added. It is on the TV now (${kb(bytes.length)}).`;
  await refresh();
}

function draw() {
  if (!root) return;
  const kids = [eyebrow('Your own sounds')];
  if (!info) kids.push(h('p', { class: 'dim' }, 'Checking the TV…'));
  else if (!info.available) {
    kids.push(h('p', { class: 'dim' }, info.error ?? 'This TV cannot keep your own sounds. The Apple TV app can.'));
  } else {
    kids.push(h('p', { class: 'dim' }, 'Add music and sounds here and the TV keeps them. They stay on the TV, not on the internet, and they stay through app updates.'));
    const label = (game, name) => `${info.games.find((g) => g.id === game)?.label ?? game}: ${info.names.find((n) => n.name === name)?.label ?? name}`;
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
      info.names.filter((n) => n.games.includes(choice.game)).map((n) => h('option', { value: n.name, selected: n.name === choice.name }, n.label)));
    const file = h('input', { type: 'file', accept: 'audio/*,.mp3,.m4a,.wav', 'aria-label': 'Sound file', disabled: busy });
    kids.push(
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
