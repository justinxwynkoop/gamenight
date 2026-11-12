import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, importSets, parseText, TEXT_HELP } from '../public/importer.js';

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
  await assert.rejects(collect('hello there', 'feud'), /Line 1/, 'text that is not JSON or a link is read as the plain-text format');
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

test('the plain-text format for Family Feud, including Fast Money and aliases', () => {
  const doc = parseText(`title: Grandma's House
// a comment
? Name something in a kitchen
Spoon - 30
Fork - 25 | forks, silverware
T-shirt - 5
? Second question
Apple: 40
Pear – 30
Plum — 20
fast money
? Fast one
Dog - 50
Cat - 30
Fish - 20`, 'feud');
  assert.equal(doc.title, "Grandma's House");
  assert.equal(doc.rounds.length, 2);
  assert.deepEqual(doc.rounds[0].answers[1], { text: 'Fork', points: 25, aliases: ['forks', 'silverware'] });
  assert.deepEqual(doc.rounds[0].answers[2], { text: 'T-shirt', points: 5 }, 'a hyphen inside an answer is fine');
  assert.deepEqual(doc.rounds[1].answers.map((a) => a.points), [40, 30, 20], 'a colon, an en dash and an em dash also work');
  assert.equal(doc.fastMoney.length, 1);
  assert.throws(() => parseText('? Q\nnot an answer', 'feud'), /Line 2/);
  assert.throws(() => parseText('Spoon - 30', 'feud'), /Start a question/);
});

test('the plain-text format for Jeopardy: categories, Daily Doubles and Final', () => {
  const doc = parseText(`title: T
# Cat A
200 | c1 | a1
600* | c3 | a3
# Cat B
200 | x | y
final | Cat F | clue | answer`, 'jeopardy');
  assert.equal(doc.categories.length, 2);
  assert.equal(doc.categories[0].clues[1].dailyDouble, true);
  assert.deepEqual(doc.final, { category: 'Cat F', clue: 'clue', answer: 'answer' });
  assert.throws(() => parseText('# C\n200 only two |', 'jeopardy'), /Line 2/);
  assert.throws(() => parseText('anything', 'unknown-game'), /not supported/);
  assert.throws(() => parseText('  \n\n', 'feud'), /empty/);
});

test('text in a file goes through the importer and each set is checked by the game', async () => {
  const saved = [];
  const api = { put: async (id, doc) => { saved.push([id, doc]); } };
  const r = await importSets(TEXT_HELP.feud.split('\n(')[0], api, 'feud');
  assert.deepEqual(r.saved, ["Grandma's House"]);
  assert.equal(saved[0][0], 'grandma-s-house');
  assert.deepEqual((await importSets('{ "title": "J" }', api, 'feud')).saved, ['J']);
  await assert.rejects(importSets('hello there', api, 'feud'), /Start a question/);
});
