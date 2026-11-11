// Random boards. These tests use a small made-up clue file in the dataset's format, never the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { parseDataset, makeBoard, sourceOf, createRandomBoards, datasetPath } from '../games/jeopardy/clues.js';
import { validateSet } from '../games/jeopardy/game.js';

const HEADER = 'round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes';
/** episodes: [{ date, notes, dd }] each with 6 categories per round, five clues each, and a Final. */
function fakeFile(episodes, { extra = [] } = {}) {
  const lines = [HEADER];
  for (const e of episodes) {
    for (const round of [1, 2]) {
      for (let c = 0; c < 6; c++) {
        for (let r = 0; r < 5; r++) {
          const value = (r + 1) * 100 * round;
          const dd = e.dd && c === 2 && r === 3 && (round === 1 || e.dd === 2) ? 999 : 0;
          lines.push([round, value, dd, `CAT ${e.date} R${round} ${c}`, '', `Clue ${e.date} ${round}-${c}-${r} \\'quoted\\' &amp; <i>more</i>`, `answer ${c}${r}`, e.date, e.notes ?? ''].join('\t'));
        }
      }
    }
    lines.push([3, 0, 0, `FINAL ${e.date}`, '', `Final clue ${e.date}`, 'final answer', e.date, e.notes ?? ''].join('\t'));
  }
  lines.push(...extra);
  return lines.join('\n') + '\n';
}
const seeded = (n = 7) => () => { n = (n * 1664525 + 1013904223) % 4294967296; return n / 4294967296; };
const EPISODES = [
  ...['2010-01-04', '2011-02-07', '2012-03-05', '2013-04-01', '2014-05-05', '2015-06-01', '2016-07-04'].map((date) => ({ date, dd: 1 })),
  { date: '1999-01-01', notes: '' },
  { date: '2005-02-02', notes: '2005 Teen Tournament quarterfinal game 1.' },
  { date: '2006-03-03', notes: '2006 Kids Week game 2.' },
  { date: '2007-04-04', notes: '2007 Tournament of Champions final game 1.' },
];

test('classifies where a game came from', () => {
  assert.equal(sourceOf(''), 'everyday');
  assert.equal(sourceOf('2005 Teen Tournament quarterfinal game 1.'), 'kids');
  assert.equal(sourceOf('2006 Kids Week game 2.'), 'kids');
  assert.equal(sourceOf('2007 Tournament of Champions final game 1.'), 'special');
  assert.equal(sourceOf('2010 Celebrity Jeopardy! game 3.'), 'special');
});

test('parses: whole categories only, cleaned text, claims clue/answer the right way round', async () => {
  const extra = ['1\t200\t0\tSHORT\t\tonly one clue\tx\t2012-03-05\t'];   // an incomplete category is dropped
  const idx = await parseDataset(fakeFile(EPISODES.slice(0, 1), { extra }));
  assert.equal(idx.categories.length, 12);
  assert.ok(!idx.categories.some((c) => c.name === 'SHORT'));
  const q = idx.categories[0].clues[0];
  assert.equal(q.clue, "Clue 2010-01-04 1-0-0 'quoted' & more");
  assert.equal(q.answer, 'Answer 00');
  assert.deepEqual(idx.categories[0].clues.map((c) => c.value), [100, 200, 300, 400, 500]);
  assert.equal(idx.finals.size, 1);
  await assert.rejects(parseDataset('a\tb\n1\t2'), /missing/);
});

test('a board is valid, laid out $200-$1,000, with a Final', async () => {
  const idx = await parseDataset(fakeFile(EPISODES));
  for (const round of [1, 2]) {
    const { set } = makeBoard(idx, { round, since: 2001 }, seeded());
    assert.ok(validateSet(set));
    assert.equal(set.categories.length, 6);
    assert.deepEqual(set.categories[0].clues.map((c) => c.value), [200, 400, 600, 800, 1000]);
    assert.ok(set.final.clue);
  }
});

test('mix mode uses six different episodes; episode mode uses one', async () => {
  const idx = await parseDataset(fakeFile(EPISODES));
  const mix = makeBoard(idx, { mode: 'mix', since: 2001 }, seeded(3));
  assert.equal(new Set(mix.set.categories.map((c) => c.name.split(' ')[1])).size, 6);
  assert.equal(mix.date, null);
  const one = makeBoard(idx, { mode: 'episode', since: 2001 }, seeded(3));
  assert.equal(new Set(one.set.categories.map((c) => c.name.split(' ')[1])).size, 1);
  assert.match(one.set.final.clue, new RegExp(one.date));
  assert.match(one.set.title, /^Episode of /);
});

test('round 2 can come from the same episode as round 1', async () => {
  const idx = await parseDataset(fakeFile(EPISODES));
  const a = makeBoard(idx, { mode: 'episode', round: 1, since: 2001 }, seeded(5));
  const b = makeBoard(idx, { mode: 'episode', round: 2, since: 2001, date: a.date }, seeded(9));
  assert.equal(b.date, a.date);
  assert.throws(() => makeBoard(idx, { mode: 'episode', round: 2, since: 2001, date: '1999-01-01' }, seeded()), /not available/);
});

test('bothRounds only picks an episode whose other round is complete too', async () => {
  // Remove one round-2 category from the 2010 episode, so it can no longer supply both rounds.
  const text = fakeFile(EPISODES.slice(0, 3)).split('\n').filter((l) => !l.includes('CAT 2010-01-04 R2 5')).join('\n');
  const idx = await parseDataset(text);
  for (let n = 1; n < 30; n++) {
    assert.notEqual(makeBoard(idx, { mode: 'episode', round: 1, since: 2001, bothRounds: true }, seeded(n)).date, '2010-01-04');
  }
  const seen = new Set();
  for (let n = 1; n < 30; n++) seen.add(makeBoard(idx, { mode: 'episode', round: 1, since: 2001 }, seeded(n)).date);
  assert.ok(seen.has('2010-01-04'), 'without the option that episode is fine for round 1');
});

test('round 2 of the same episode still works when round 1\'s categories are being avoided', async () => {
  const idx = await parseDataset(fakeFile(EPISODES));
  const a = makeBoard(idx, { mode: 'episode', round: 1, since: 2001, bothRounds: true }, seeded(6));
  const b = makeBoard(idx, { mode: 'episode', round: 2, since: 2001, bothRounds: true, date: a.date, avoid: a.set.categories.map((c) => c.name) }, seeded(6));
  assert.equal(b.date, a.date);
});

test('filters by source and by era', async () => {
  const idx = await parseDataset(fakeFile(EPISODES));
  const kids = makeBoard(idx, { source: 'kids', since: 1990, mode: 'episode' }, seeded());
  assert.ok(['2005-02-02', '2006-03-03'].includes(kids.date));
  const special = makeBoard(idx, { source: 'special', since: 1990, mode: 'episode' }, seeded());
  assert.equal(special.date, '2007-04-04');
  // Nothing from the 1999 episode when asking for 2001 onwards.
  for (let n = 1; n < 30; n++) assert.notEqual(makeBoard(idx, { mode: 'episode', since: 2001 }, seeded(n)).date, '1999-01-01');
  assert.throws(() => makeBoard(idx, { source: 'special', since: 2010, mode: 'episode' }, seeded()), /No complete episodes/);
  assert.throws(() => makeBoard(idx, { source: 'nope' }), /Unknown source/);
});

test('real Daily Doubles are kept only when they fit the round, and only for a whole episode', async () => {
  const idx = await parseDataset(fakeFile(EPISODES.slice(0, 7).map((e, i) => (i === 1 ? { ...e, dd: 2 } : e))));
  const flagged = (set) => set.categories.flatMap((c) => c.clues).filter((q) => q.dailyDouble).length;
  // dd:1 has one in each round, so round 1 fits (1) but round 2 (needs 2) does not.
  const r1 = makeBoard(idx, { mode: 'episode', round: 1, since: 2001, date: '2012-03-05' }, seeded());
  assert.equal(flagged(r1.set), 1);
  const r2 = makeBoard(idx, { mode: 'episode', round: 2, since: 2001, date: '2012-03-05' }, seeded());
  assert.equal(flagged(r2.set), 0);
  // dd:2 has two in round 2, but both are in the same column here, so they do not fit either.
  assert.equal(flagged(makeBoard(idx, { mode: 'episode', round: 2, since: 2001, date: '2011-02-07' }, seeded()).set), 0);
  // A mix of episodes never carries flags: the game places them.
  const mix = makeBoard(idx, { mode: 'mix', since: 2001 }, seeded());
  assert.equal(flagged(mix.set), 0);
});

test('the family filter leaves out adult clues unless switched off', async () => {
  const text = fakeFile(EPISODES).replace('answer 12', 'a sexual thing');
  const idx = await parseDataset(text);
  assert.ok(idx.categories.filter((c) => c.adult).length >= 1);
  for (let n = 1; n < 25; n++) assert.equal(makeBoard(idx, { round: 1, since: 2001 }, seeded(n)).set.categories.some((c) => c.clues.some((q) => /sexual/.test(q.answer))), false);
  const seen = [];
  for (let n = 1; n < 60; n++) seen.push(makeBoard(idx, { round: 1, since: 2001, family: false }, seeded(n)).set.categories.some((c) => c.clues.some((q) => /sexual/.test(q.answer))));
  assert.ok(seen.some(Boolean), 'with the filter off, such a clue can appear');
});

test('categories named in "avoid" are left out', async () => {
  const idx = await parseDataset(fakeFile(EPISODES));
  const first = makeBoard(idx, { since: 2001 }, seeded(4));
  const names = first.set.categories.map((c) => c.name);
  const second = makeBoard(idx, { since: 2001, avoid: names }, seeded(4));
  assert.equal(second.set.categories.filter((c) => names.includes(c.name)).length, 0);
});

test('without the clue file it says so, and finds one in data/clues', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gn-clues-'));
  try {
    const src = createRandomBoards({ dataDir: dir, env: {} });
    assert.equal(src.status().available, false);
    await assert.rejects(src.make(), (e) => e.code === 'no-dataset');
    mkdirSync(path.join(dir, 'clues'));
    writeFileSync(path.join(dir, 'clues', 'combined_season1-42.tsv'), fakeFile(EPISODES));
    assert.match(datasetPath(dir, {}), /combined/);
    const { set } = await src.make({ since: 2001 });
    assert.ok(validateSet(set));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- through the real server ----------
const root = path.resolve(import.meta.dirname, '..');
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

test('API: needs the PIN, reports a missing file, builds and saves a board, keeps only a few', async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'gn-api-'));
  cpSync(path.join(root, 'data/jeopardy'), path.join(dataDir, 'jeopardy'), { recursive: true });
  const port = await freePort();
  const proc = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST_PIN: '1357', DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => { proc.stdout.on('data', (d) => String(d).includes('running') && resolve()); proc.on('exit', (c) => reject(new Error(`exit ${c}`))); });
  const url = `http://127.0.0.1:${port}/api/games/jeopardy/random`;
  const call = (method, body, pin = '1357') => fetch(url, { method, headers: { 'x-host-pin': pin, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  try {
    assert.equal((await call('GET', null, 'wrong')).status, 401);
    assert.equal((await (await call('GET')).json()).available, false);
    const missing = await call('POST', { round: 1 });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, 'no-dataset');

    mkdirSync(path.join(dataDir, 'clues'));
    writeFileSync(path.join(dataDir, 'clues', 'combined_season1-42.tsv'), fakeFile(EPISODES));
    assert.equal((await (await call('GET')).json()).available, true);
    const ok = await call('POST', { round: 2, mode: 'episode', since: 2001, junk: 'ignored' });
    assert.equal(ok.status, 200);
    const made = await ok.json();
    assert.match(made.id, /^random-[a-z0-9]+$/);
    assert.equal(made.categories.length, 6);
    const saved = await (await fetch(`${url.replace('/random', '')}/sets/${made.id}`, { headers: { 'x-host-pin': '1357' } })).json();
    assert.equal(saved.categories.length, 6);
    assert.equal((await call('POST', { source: 'special', since: 2010 })).status, 422);

    for (let i = 0; i < 15; i++) assert.equal((await call('POST', { since: 2001 })).status, 200);
    assert.ok(readdirSync(path.join(dataDir, 'jeopardy')).filter((f) => f.startsWith('random-')).length <= 12);
  } finally {
    await new Promise((res) => { proc.once('exit', res); proc.kill('SIGTERM'); });
    rmSync(dataDir, { recursive: true, force: true });
  }
});
