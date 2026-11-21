import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../engine/core.js';
import { GAMES } from '../games/index.js';
import { SOUND_NAMES, MAX_PIECE } from '../engine/sounds.js';

/** An engine with a stand-in for the app's sound store, and a host who has said the PIN. */
function setup({ withStore = true } = {}) {
  const sent = [];
  const files = new Map();   // "game__name" -> { ext, pieces: [], total }
  const store = {
    save: ({ game, name, ext, index, total, data }) => {
      const key = `${game}__${name}`;
      let f = files.get(key);
      if (!f || f.total !== total || f.ext !== ext) { f = { ext, total, pieces: [], done: false }; files.set(key, f); }
      f.pieces[index] = data;
      f.done = f.pieces.filter(Boolean).length === total;
      return f.done;
    },
    list: () => [...files].filter(([, f]) => f.done).map(([k, f]) => { const [game, name] = k.split('__'); return { game, name, ext: f.ext, bytes: f.pieces.join('').length }; }),
    remove: (game, name) => { files.delete(`${game}__${name}`); },
  };
  const engine = createEngine({ games: GAMES, pin: '4321', send: (id, m) => sent.push([id, m]), ...(withStore ? { sounds: store } : {}) });
  engine.open('h');
  engine.receive('h', { t: 'hello', role: 'host', pin: '4321' });
  let n = 0;
  const rpc = (op, args) => {
    const id = ++n;
    engine.receive('h', { t: 'rpc', id, op, args });
    return sent.filter(([, m]) => m.t === 'rpc-reply' && m.id === id).at(-1)?.[1];
  };
  return { engine, rpc, files, sent };
}

test('the host can see which sounds a TV can keep, and what is there', () => {
  const { rpc } = setup();
  const r = rpc('listSounds', {});
  assert.equal(r.ok, true);
  assert.equal(r.data.available, true);
  assert.deepEqual(r.data.files, []);
  assert.deepEqual(r.data.games.map((g) => g.id), ['shared', 'jeopardy', 'feud', 'spynight']);
  assert.ok(r.data.names.some((n) => n.name === 'lobby'));
});

test('a TV that cannot keep files says so, and refuses uploads', () => {
  const { rpc } = setup({ withStore: false });
  assert.equal(rpc('listSounds', {}).data.available, false);
  const r = rpc('putSound', { game: 'jeopardy', name: 'lobby', ext: 'mp3', index: 0, total: 1, data: 'AAAA' });
  assert.equal(r.ok, false);
  assert.match(r.error, /cannot keep/);
});

test('a file arrives in pieces and is listed once the last piece is in', () => {
  const { rpc } = setup();
  const piece = (index) => rpc('putSound', { game: 'jeopardy', name: 'lobby', ext: 'MP3', index, total: 3, data: 'AAAA' });
  assert.deepEqual(piece(0).data, { ok: true, done: false });
  assert.deepEqual(piece(2).data, { ok: true, done: false });
  assert.deepEqual(rpc('listSounds', {}).data.files, []);          // not finished yet
  assert.deepEqual(piece(1).data, { ok: true, done: true });
  assert.deepEqual(rpc('listSounds', {}).data.files, [{ game: 'jeopardy', name: 'lobby', ext: 'mp3', bytes: 12 }]);
  assert.equal(rpc('deleteSound', { game: 'jeopardy', name: 'lobby' }).data.ok, true);
  assert.deepEqual(rpc('listSounds', {}).data.files, []);
});

test('only known games, sounds, file types and sizes are accepted', () => {
  const { rpc } = setup();
  const ok = { game: 'feud', name: 'ding', ext: 'mp3', index: 0, total: 1, data: 'AAAA' };
  assert.equal(rpc('putSound', ok).ok, true);
  const bad = (change, re) => { const r = rpc('putSound', { ...ok, ...change }); assert.equal(r.ok, false); assert.match(r.error, re); };
  bad({ game: 'bingo' }, /Choose/);
  bad({ name: '../../etc' }, /no sound called/);
  bad({ game: 'feud', name: 'dd' }, /no sound called/);       // a Jeopardy sound, not a Feud one
  bad({ ext: 'ogg' }, /mp3, \.m4a and \.wav/);
  bad({ total: 0 }, /too big/);
  bad({ total: 65 }, /too big/);
  bad({ index: 1 }, /Bad piece number/);
  bad({ data: '' }, /Bad piece/);
  bad({ data: 'not base64!' }, /Bad piece/);
  bad({ data: 'A'.repeat(MAX_PIECE + 1) }, /Bad piece/);
  assert.equal(rpc('deleteSound', { game: 'jeopardy', name: 'nope' }).ok, false);
});

test('every sound the app uses can be uploaded, for the games that use it', () => {
  const names = new Set(SOUND_NAMES.map((n) => n.name));
  for (const n of ['open', 'buzz', 'correct', 'wrong', 'timeup', 'tick', 'reveal', 'dd', 'final', 'fanfare', 'ding', 'strike', 'strikeout', 'faceoff', 'roundstart', 'winner', 'zero', 'fmpoints', 'fastmoney', 'pick', 'board', 'lock', 'bet', 'join', 'applause', 'think', 'lobby']) {
    assert.ok(names.has(n), n);
  }
});

test('only the host can do this: a player or the TV page is turned away', () => {
  const { engine, sent } = setup();
  engine.open('p');
  engine.receive('p', { t: 'hello', role: 'player' });
  engine.receive('p', { t: 'rpc', id: 9, op: 'putSound', args: { game: 'feud', name: 'ding', ext: 'mp3', index: 0, total: 1, data: 'AAAA' } });
  assert.equal(sent.some(([id, m]) => id === 'p' && m.t === 'rpc-reply'), false);
});

test('Spy Night has its own sounds, with names that say what they mean there', () => {
  const { rpc } = setup();
  const names = rpc('listSounds', {}).data.names;
  const mine = names.filter((n) => n.games.includes('spynight'));
  for (const n of ['lobby', 'roundstart', 'pick', 'open', 'correct', 'wrong', 'lock', 'ding', 'strike', 'fanfare', 'winner', 'join']) {
    assert.ok(mine.some((m) => m.name === n), n);
  }
  assert.equal(names.find((n) => n.name === 'ding').labels.spynight, 'A mission succeeds');
  assert.equal(names.find((n) => n.name === 'ding').label, 'A survey answer flips over');
  const ok = rpc('putSound', { game: 'spynight', name: 'strike', ext: 'mp3', index: 0, total: 1, data: 'AAAA' });
  assert.equal(ok.ok, true);
  assert.equal(rpc('putSound', { game: 'spynight', name: 'buzz', ext: 'mp3', index: 0, total: 1, data: 'AAAA' }).ok, false);   // Spy Night has no buzzers
});
