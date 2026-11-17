import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { cardSize, lines, FREE } from '../games/singo/game.js';

const songs = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `Song ${i}`, artist: `Band ${i % 4}` }));
function setup(players = ['Leo', 'Maya']) {
  const room = new Room({ games: GAMES, now: () => 1000 });
  room.chooseGame('singo');
  const ps = players.map((name) => room.join({ name }));
  return { room, g: room.game, ps };
}
const cardOf = (room, p) => room.playerView(p.id).game.card;

test('card sizes and lines', () => {
  assert.deepEqual([cardSize(40), cardSize(24), cardSize(23), cardSize(16), cardSize(9), cardSize(8)], [5, 5, 4, 4, 3, 0]);
  assert.equal(lines(5).length, 12);
  assert.deepEqual(lines(3)[6], [0, 4, 8]);
  assert.deepEqual(lines(3)[7], [2, 4, 6]);
});

test('a deal gives each player a different 5×5 card with a free middle, and late joiners get one too', () => {
  const { room, g, ps } = setup();
  assert.throws(() => g.deal(songs(8)), /at least 9/);
  g.deal(songs(40), 'Road Trip');
  const a = cardOf(room, ps[0]); const b = cardOf(room, ps[1]);
  assert.equal(a.length, 25);
  assert.equal(a[12].free, true);
  assert.equal(new Set(a.filter((x) => !x.free).map((x) => x.id)).size, 24);
  assert.notDeepEqual(a.map((x) => x.id), b.map((x) => x.id));
  const late = room.join({ name: 'Dad' });
  assert.equal(cardOf(room, late).length, 25);
  assert.equal(room.publicView().game.round.playlist, 'Road Trip');
  assert.equal(room.inProgress ? room.inProgress() : g.inProgress(), false);
});

test('a SINGO only counts when the whole line is marked and every song in it has played', () => {
  const { room, g, ps } = setup();
  g.deal(songs(30));
  const card = cardOf(room, ps[0]);
  const row = [0, 1, 2, 3, 4];
  for (const i of row) room.playerMessage(ps[0].id, { t: 'mark', i });
  let r = room.playerMessage(ps[0].id, { t: 'singo' });
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 5);                              // marked, but none of them has played
  for (const i of row.slice(0, 4)) g.call(card[i].id);
  r = room.playerMessage(ps[0].id, { t: 'singo' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [card[4].title]);
  g.call(card[4].id);
  r = room.playerMessage(ps[0].id, { t: 'singo' });
  assert.equal(r.ok, true);
  assert.equal(r.line.length, 5);
  assert.equal(room.player(ps[0].id).score, 1);
  assert.equal(room.playerMessage(ps[0].id, { t: 'singo' }).again, true);   // one win a round
  assert.equal(room.player(ps[0].id).score, 1);
  const pub = room.publicView().game;
  assert.deepEqual(pub.winners.map((w) => w.name), ['Leo']);
  assert.equal(pub.claims.at(-1).ok, true);
  assert.equal(pub.card, undefined);                              // the TV never sees anyone's card
});

test('the free middle counts toward a line', () => {
  const { room, g, ps } = setup();
  g.deal(songs(30));
  const card = cardOf(room, ps[1]);
  const diag = [0, 6, 12, 18, 24];
  for (const i of diag) { room.playerMessage(ps[1].id, { t: 'mark', i }); if (card[i].id) g.call(card[i].id); }
  assert.equal(cardOf(room, ps[1])[12].marked, true);
  assert.equal(room.playerMessage(ps[1].id, { t: 'singo' }).ok, true);
});

test('marks toggle, a new deal clears them, and an ended round takes no more claims', () => {
  const { room, g, ps } = setup();
  g.deal(songs(20));
  assert.equal(cardOf(room, ps[0]).length, 16);                    // 4×4 when there are fewer than 24 songs
  room.playerMessage(ps[0].id, { t: 'mark', i: 3 });
  assert.equal(cardOf(room, ps[0])[3].marked, true);
  room.playerMessage(ps[0].id, { t: 'mark', i: 3 });
  assert.equal(cardOf(room, ps[0])[3].marked, false);
  room.playerMessage(ps[0].id, { t: 'mark', i: 3 });
  g.call('s1'); g.call('s1');
  assert.equal(room.publicView().game.round.calledCount, 1);
  assert.throws(() => g.call('nope'), /not in this round/);
  g.deal(songs(20));
  assert.equal(cardOf(room, ps[0]).some((x) => x.marked), false);
  assert.equal(room.publicView().game.round.n, 2);
  g.endRound();
  assert.throws(() => room.playerMessage(ps[0].id, { t: 'singo' }), /over/);
});

test('only the Apple TV starts Singo: the host page cannot, and it is not in the host menus', () => {
  const room = new Room({ games: GAMES, now: () => 1000 });
  assert.throws(() => room.act('chooseGame', { id: 'singo' }), /Apple TV/);
  assert.ok(!room.hostView().room.games.some((g) => g.id === 'singo'));
  room.chooseGame('singo');
  room.chooseGame('jeopardy');                                    // Singo never locks the room
  assert.equal(room.gameId, 'jeopardy');
  assert.equal(FREE, 'free');
});
