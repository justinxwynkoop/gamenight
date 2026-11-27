import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { SPIES, TEAM_SIZES, failsNeeded, T } from '../games/spynight/game.js';

function setup(n = 5, seed = 1) {
  let t = 1000;
  let s = seed;
  const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const room = new Room({ games: GAMES, now: () => t, random: rng });
  room.chooseGame('spynight');
  const ps = Array.from({ length: n }, (_, i) => room.join({ name: `P${i + 1}` }));
  for (const p of ps) room.setConnected(p.id, true);
  const wait = (ms) => { t += ms; room.game.tick(); };
  const view = (p) => room.playerView(p.id).game;
  const msg = (p, m) => room.playerMessage(p.id, m);
  return { room, g: room.game, ps, wait, view, msg };
}
const rolesOf = (g, ps) => ps.map((p) => g.roles[p.id]);
function toTeam({ g, ps, msg }) {
  g.start();
  for (const p of ps) msg(p, { t: 'got-it' });
}
const leader = ({ g, ps }) => ps.find((p) => p.id === g.leaderId);
function pickTeam(s, ids) {
  const l = leader(s);
  for (const id of ids) s.msg(l, { t: 'pick', pid: id });
  s.msg(l, { t: 'propose' });
}
const everyoneVotes = (s, approve) => { for (const p of s.ps) s.msg(p, { t: 'vote', approve }); };
function playCards(s, fails = []) {
  for (const id of s.g.team) {
    const p = s.ps.find((x) => x.id === id);
    s.msg(p, { t: 'card', card: fails.includes(id) ? 'fail' : 'success' });
  }
}
/** Runs one whole mission: the leader picks the first `size` players, all approve, those in `fails` play Fail. */
function runMission(s, fails = []) {
  const size = s.g.teamSize();
  const ids = [...s.ps.map((p) => p.id)];
  const team = [...fails, ...ids.filter((id) => !fails.includes(id))].slice(0, size);
  pickTeam(s, team);
  everyoneVotes(s, true);
  s.wait(T.voteResult + 1);
  playCards(s, fails);
  s.wait(T.missionResult + 1);
}

test('the tables match the rules', () => {
  assert.deepEqual(SPIES, { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 });
  assert.deepEqual(TEAM_SIZES[5], [2, 3, 2, 3, 3]);
  assert.deepEqual(TEAM_SIZES[10], [3, 4, 4, 5, 5]);
  assert.equal(failsNeeded(7, 3), 2);
  assert.equal(failsNeeded(6, 3), 1);
  assert.equal(failsNeeded(10, 2), 1);
});

test('five to ten players, individuals only', () => {
  const s = setup(4);
  assert.throws(() => s.g.start(), /at least 5/);
  assert.equal(s.room.publicView().room.individualsOnly, true);
  const big = setup(10);
  assert.throws(() => big.room.join({ name: 'Eleven' }), /full/);
  big.g.start();
  assert.equal(big.g.inProgress(), true);
});

test('roles: the right number of spies, only spies know the spies', () => {
  for (const n of [5, 6, 7, 8, 9, 10]) {
    const s = setup(n, n);
    s.g.start();
    const roles = rolesOf(s.g, s.ps);
    assert.equal(roles.filter((r) => r === 'spy').length, SPIES[n], `${n} players`);
    for (const p of s.ps) {
      const me = s.view(p).me;
      assert.equal(me.role, s.g.roles[p.id]);
      if (me.role === 'spy') {
        assert.equal(me.spies.length, SPIES[n] - 1);
        assert.ok(me.spies.every((x) => s.g.roles[x.id] === 'spy' && x.id !== p.id));
      } else assert.deepEqual(me.spies, []);
    }
  }
});

test('no view but a player’s own ever carries a role before the game is over', () => {
  const s = setup(7, 3);
  s.g.start();
  const secret = (v) => JSON.stringify(v);
  const leaks = /"role"|:"(spy|resistance)"|"spies":\[/;
  assert.ok(!leaks.test(secret(s.room.publicView().game)));
  assert.ok(!leaks.test(secret(s.room.hostView().game)));
  const spy = s.ps.find((p) => s.g.roles[p.id] === 'spy');
  const good = s.ps.find((p) => s.g.roles[p.id] === 'resistance');
  assert.equal(s.view(good).me.spies.length, 0);
  assert.equal(s.view(spy).me.role, 'spy');
  assert.equal(s.room.publicView().game.roles, undefined);
});

test('the first team waits for everyone to see their role, then the leader picks', () => {
  const s = setup(5);
  s.g.start();
  assert.equal(s.g.phase, 'roles');
  for (const p of s.ps.slice(0, 4)) s.msg(p, { t: 'got-it' });
  assert.equal(s.g.phase, 'roles');
  assert.equal(s.room.publicView().game.readyIds.length, 4);
  s.msg(s.ps[4], { t: 'got-it' });
  assert.equal(s.g.phase, 'team');
  const lead = leader(s);
  assert.equal(s.view(lead).me.isLeader, true);
  assert.equal(s.view(s.ps.find((p) => p !== lead)).me.isLeader, false);
});

test('only the leader picks, to exactly the right size, and may include themselves', () => {
  const s = setup(5);
  toTeam(s);
  const lead = leader(s);
  const other = s.ps.find((p) => p !== lead);
  assert.throws(() => s.msg(other, { t: 'pick', pid: lead.id }), /leader/);
  assert.throws(() => s.msg(lead, { t: 'propose' }), /Pick 2/);
  s.msg(lead, { t: 'pick', pid: lead.id });
  s.msg(lead, { t: 'pick', pid: other.id });
  assert.throws(() => s.msg(lead, { t: 'pick', pid: s.ps[3].id === lead.id ? s.ps[2].id : s.ps[3].id }), /takes 2/);
  s.msg(lead, { t: 'pick', pid: other.id });                       // tapping again takes them off
  assert.deepEqual(s.g.team, [lead.id]);
  s.msg(lead, { t: 'pick', pid: other.id });
  s.msg(lead, { t: 'propose' });
  assert.equal(s.g.phase, 'vote');
});

test('votes stay secret until everyone has voted, then show together; a tie rejects', () => {
  const s = setup(6);
  toTeam(s);
  pickTeam(s, [s.ps[0].id, s.ps[1].id]);
  for (const p of s.ps.slice(0, 5)) s.msg(p, { t: 'vote', approve: true });
  const mid = s.room.publicView().game;
  assert.equal(mid.phase, 'vote');
  assert.equal(mid.votes, undefined);
  assert.equal(mid.votedIds.length, 5);
  assert.equal(s.view(s.ps[0]).me.myVote, true);
  s.msg(s.ps[0], { t: 'vote', approve: false });                    // changing a vote before the reveal is fine
  s.msg(s.ps[1], { t: 'vote', approve: false });
  s.msg(s.ps[5], { t: 'vote', approve: false });
  const v = s.room.publicView().game;
  assert.equal(v.phase, 'vote-result');
  assert.equal(Object.keys(v.votes).length, 6);
  assert.equal(v.approved, false);                                   // 3 to 3 is a tie, so rejected
  assert.equal(v.history.length, 1);
});

test('a rejected team passes the lead on; five in a row and the Spies win', () => {
  const s = setup(5);
  toTeam(s);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    seen.push(s.g.leaderId);
    pickTeam(s, s.ps.slice(0, 2).map((p) => p.id));
    everyoneVotes(s, false);
    s.wait(T.voteResult + 1);
    if (i < 4) assert.equal(s.g.phase, 'team');
  }
  assert.equal(new Set(seen).size, 5);                               // each time a different leader, clockwise
  const order = s.g.order;
  for (let i = 1; i < 5; i++) assert.equal(order.indexOf(seen[i]), (order.indexOf(seen[i - 1]) + 1) % 5);
  assert.equal(s.g.phase, 'gameover');
  assert.equal(s.g.winner, 'spies');
  assert.match(s.g.why, /5 teams/);
});

test('an approved team plays cards in secret; the Resistance cannot play Fail', () => {
  const s = setup(5, 2);
  toTeam(s);
  const good = s.ps.find((p) => s.g.roles[p.id] === 'resistance');
  const spy = s.ps.find((p) => s.g.roles[p.id] === 'spy');
  const other = s.ps.find((p) => p !== good && p !== spy);
  const team = [good, spy];
  pickTeam(s, team.map((p) => p.id));
  everyoneVotes(s, true);
  s.wait(T.voteResult + 1);
  assert.equal(s.g.phase, 'mission');
  assert.throws(() => s.msg(good, { t: 'card', card: 'fail' }), /only play Success/);
  s.msg(other, { t: 'card', card: 'success' });                      // not on the team: ignored
  assert.deepEqual(s.room.publicView().game.playedIds, []);
  s.msg(spy, { t: 'card', card: 'fail' });
  assert.deepEqual(s.room.publicView().game.playedIds, [spy.id]);   // who has played, never what
  assert.ok(!JSON.stringify(s.room.publicView().game).includes('"fail"'));
  s.msg(spy, { t: 'card', card: 'success' });                        // a card cannot be taken back
  s.msg(good, { t: 'card', card: 'success' });
  assert.equal(s.g.phase, 'mission-result');
  const r = s.room.publicView().game;
  assert.deepEqual(r.result, { success: false, fails: 1, needed: 1 });
  assert.equal(r.track[0].result, 'fail');
});

test('the Resistance wins with three successful missions', () => {
  const s = setup(5);
  toTeam(s);
  for (let i = 0; i < 3; i++) runMission(s);
  assert.equal(s.g.phase, 'gameover');
  assert.equal(s.g.winner, 'resistance');
  const v = s.room.publicView().game;
  assert.equal(v.wins.resistance, 3);
  assert.equal(Object.keys(v.roles).length, 5);                      // everyone's role is revealed at the end
});

test('the Spies win with three failed missions', () => {
  const s = setup(5, 4);
  toTeam(s);
  const spies = s.ps.filter((p) => s.g.roles[p.id] === 'spy').map((p) => p.id);
  for (let i = 0; i < 3; i++) runMission(s, [spies[0]]);
  assert.equal(s.g.winner, 'spies');
  assert.equal(s.g.phase, 'gameover');
});

test('with seven or more players the fourth mission needs two Fail cards', () => {
  const s = setup(7, 5);
  toTeam(s);
  const spies = s.ps.filter((p) => s.g.roles[p.id] === 'spy').map((p) => p.id);
  runMission(s, [spies[0]]);                                          // 1: fails
  runMission(s);                                                      // 2: succeeds
  runMission(s, [spies[0]]);                                          // 3: fails
  assert.equal(s.g.mission, 3);
  runMission(s, [spies[0]]);                                          // 4: one Fail is not enough
  assert.equal(s.g.track[3].success, true);
  assert.equal(s.g.track[3].needed, 2);
  assert.equal(s.g.phase, 'team');
  assert.equal(s.g.mission, 4);
  assert.equal(s.room.publicView().game.track[3].needed, 2);
});

test('the lead moves clockwise after every mission and the reject count starts again', () => {
  const s = setup(5);
  toTeam(s);
  const first = s.g.leaderId;
  pickTeam(s, s.ps.slice(0, 2).map((p) => p.id));
  everyoneVotes(s, false);
  s.wait(T.voteResult + 1);
  assert.equal(s.g.rejects, 1);
  runMission(s);
  assert.equal(s.g.rejects, 0);
  assert.equal(s.g.order.indexOf(s.g.leaderId), (s.g.order.indexOf(first) + 2) % 5);
});

test('people who are away do not hold the game up', () => {
  const s = setup(5);
  toTeam(s);
  s.room.connected.delete(s.ps[4].id);
  pickTeam(s, [s.ps[0].id, s.ps[1].id]);
  for (const p of s.ps.slice(0, 4)) s.msg(p, { t: 'vote', approve: true });
  assert.equal(s.g.phase, 'vote-result');
  assert.equal(s.g.votes[s.ps[4].id], false);                        // the absent player counts as a reject: 4 to 1 still passes
  assert.equal(s.g.approved, true);
});

test('the host or TV can move a stuck stage along', () => {
  const s = setup(5);
  s.g.start();
  s.g.act('advance');
  assert.equal(s.g.phase, 'team');
  pickTeam(s, s.ps.slice(0, 2).map((p) => p.id));
  s.g.act('advance');
  assert.equal(s.g.phase, 'vote-result');
  s.g.act('advance');
  assert.equal(s.g.phase, 'team');                                    // everyone was away: the team is rejected
});

test('the game survives a save and restore, secrets and all', () => {
  const s = setup(6, 7);
  toTeam(s);
  pickTeam(s, s.ps.slice(0, 2).map((p) => p.id));
  s.msg(s.ps[0], { t: 'vote', approve: true });
  const saved = JSON.parse(JSON.stringify(s.g.toJSON()));
  const t = setup(6, 99);
  t.g.restore(saved);
  assert.deepEqual(t.g.roles, s.g.roles);
  assert.equal(t.g.phase, 'vote');
  assert.deepEqual(t.g.votes, { [s.ps[0].id]: true });
  assert.equal(t.g.leaderId, s.g.leaderId);
});

test('playing again returns to the lobby with the same players', () => {
  const s = setup(5);
  toTeam(s);
  for (let i = 0; i < 3; i++) runMission(s);
  assert.equal(s.g.phase, 'gameover');
  s.g.act('playAgain');
  assert.equal(s.g.phase, 'lobby');
  assert.equal(s.g.inProgress(), false);
  assert.equal(s.room.players.length, 5);
  s.g.start();
  assert.equal(s.g.phase, 'roles');
});

test('everyone can see who went on each mission, but who played Fail only comes out when the game is over', () => {
  const s = setup(5, 4);
  toTeam(s);
  const spies = s.ps.filter((p) => s.g.roles[p.id] === 'spy').map((p) => p.id);
  runMission(s, [spies[0]]);                          // mission 1 fails: a Spy was on it
  let track = s.room.publicView().game.track;
  assert.equal(track[0].team.length, 2);              // who went is public
  assert.equal(track[0].cards, null, 'who played what is not');
  assert.ok(!/"cards":\{/.test(JSON.stringify(s.room.hostView().game)), 'the host page is told no more than the TV');
  assert.equal(track[1].team, null);                  // the next mission has no team yet
  runMission(s, [spies[0]]);
  runMission(s, [spies[0]]);
  assert.equal(s.g.phase, 'gameover');
  track = s.room.publicView().game.track;
  assert.equal(track[0].cards[spies[0]], 'fail');
  assert.ok(Object.entries(track[0].cards).every(([id, c]) => (id === spies[0] ? c === 'fail' : c === 'success')));
  assert.equal(track[3].cards, null, 'a mission that was not played has none');
});

test('P1: nobody can be removed once the roles are dealt, and the host page is told why', () => {
  const s = setup(6);
  s.room.removePlayer(s.ps[5].id);                                    // fine in the lobby
  assert.equal(s.room.players.length, 5);
  assert.equal(s.room.hostView().room.removeBlocked, null);
  s.g.start();
  assert.throws(() => s.room.removePlayer(s.ps[0].id), /before the game starts/);
  assert.throws(() => s.room.act('removePlayer', { id: s.ps[0].id }), /before the game starts/);
  assert.equal(s.room.players.length, 5);
  assert.match(s.room.hostView().room.removeBlocked, /before the game starts/);
});

test('P1: a leader who is away loses the pick after a while, and the host or first player can skip them at once', () => {
  const s = setup(5);
  toTeam(s);
  const first = s.g.leaderId;
  s.room.connected.delete(first);
  s.wait(1000);
  assert.equal(s.g.phase, 'team');
  assert.equal(s.g.leaderId, first, 'not yet');
  s.wait(T.leaderAway + 1000);
  assert.equal(s.g.phase, 'team');
  assert.notEqual(s.g.leaderId, first, 'the pick passed on');
  assert.equal(s.g.rejects, 0, 'a skipped leader is not a rejected team');
  assert.equal(s.g.mission, 0);
  // The new leader can pick as usual.
  pickTeam(s, s.ps.slice(0, s.g.teamSize()).map((p) => p.id));
  assert.equal(s.g.phase, 'vote');
});

test('P1: skipping the leader by hand (host Move on, or the first player on their phone), and a first player can end a stuck game', () => {
  const s = setup(5);
  toTeam(s);
  const first = s.g.leaderId;
  s.g.act('advance');
  assert.equal(s.g.phase, 'team');
  assert.notEqual(s.g.leaderId, first);
  // No host page: the first player.
  const second = s.g.leaderId;
  assert.throws(() => s.msg(s.ps[1], { t: 'advance' }), /Only the host/);
  s.msg(s.ps[0], { t: 'advance' });
  assert.notEqual(s.g.leaderId, second);
  assert.throws(() => s.msg(s.ps[1], { t: 'end-game' }), /Only the host/);
  s.msg(s.ps[0], { t: 'end-game' });
  assert.equal(s.g.phase, 'lobby');
  assert.equal(s.room.players.length, 5);
});

test('a whole room that is away (a restart) does not cycle the leaders', () => {
  const s = setup(5);
  toTeam(s);
  const first = s.g.leaderId;
  for (const p of s.ps) s.room.connected.delete(p.id);
  s.wait(T.leaderAway * 3);
  assert.equal(s.g.leaderId, first);
});
