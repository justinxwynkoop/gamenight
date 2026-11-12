import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, importSets } from '../public/importer.js';

const set = (title) => ({ title, rounds: [] });

function fakeNetwork(files) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const body = files[String(url)];
    return body === undefined ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => body };
  };
  return calls;
}

test('pasted text: one set, a list of sets, or garbage', async () => {
  assert.deepEqual((await collect(JSON.stringify(set('A')), 'feud')).map((x) => x.doc.title), ['A']);
  assert.deepEqual((await collect(JSON.stringify([set('A'), set('B')]), 'feud')).map((x) => x.doc.title), ['A', 'B']);
  await assert.rejects(collect('{ nope', 'feud'), /not valid JSON/);
  await assert.rejects(collect('hello there', 'feud'), /does not look like/);
  await assert.rejects(collect('   ', 'feud'), /Paste a link/);
});

test('a link to a .json file, a GitHub file, a GitHub folder and a whole repository', async () => {
  fakeNetwork({
    'https://example.com/sets/a.json': set('Direct'),
    'https://raw.githubusercontent.com/me/repo/main/data/feud/x.json': set('Blob'),
    'https://api.github.com/repos/me/repo/contents/data/feud?ref=main': [
      { type: 'file', name: 'one.json', download_url: 'https://raw/one' }, { type: 'file', name: 'two.json', download_url: 'https://raw/two' }, { type: 'file', name: 'notes.md', download_url: 'https://raw/n' }, { type: 'dir', name: 'sub' }],
    'https://raw/one': set('One'), 'https://raw/two': set('Two'),
    'https://api.github.com/repos/me/repo/contents/data/feud': [{ type: 'file', name: 'three.json', download_url: 'https://raw/three' }],
    'https://raw/three': set('Three'),
  });
  assert.deepEqual((await collect('https://example.com/sets/a.json', 'feud')).map((x) => x.doc.title), ['Direct']);
  assert.deepEqual((await collect('https://github.com/me/repo/blob/main/data/feud/x.json', 'feud')).map((x) => x.doc.title), ['Blob']);
  assert.deepEqual((await collect('https://github.com/me/repo/tree/main/data/feud', 'feud')).map((x) => x.doc.title), ['One', 'Two']);
  assert.deepEqual((await collect('https://github.com/me/repo', 'feud')).map((x) => x.doc.title), ['Three'], 'a repository is searched for data/<game> first');
  await assert.rejects(collect('https://github.com/me/empty', 'feud'), /No .json files/);
});

test('every set is saved on its own, and one that the game refuses does not stop the rest', async () => {
  const saved = [];
  const api = { put: async (id, doc) => { if (doc.title === 'Bad') throw new Error('Round 1 needs a question'); saved.push(id); } };
  const result = await importSets(JSON.stringify([set('Good One'), set('Bad'), set('Fine')]), api, 'feud');
  assert.deepEqual(saved, ['good-one', 'fine']);
  assert.deepEqual(result.saved, ['Good One', 'Fine']);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /Round 1 needs a question/);
});
