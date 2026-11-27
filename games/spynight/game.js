// Spy Night: a game of secret roles for five to ten players, each on their own phone.
//
// Most of the room are the Resistance; a few are Spies, and the Spies know who each other are. Five times a leader picks a team
// for a mission, everyone votes on it in secret, and the team plays Success or Fail cards in secret. Three successful missions
// win it for the Resistance, three failed ones for the Spies, and so do five teams in a row that nobody will approve.
// (This is a social deduction game of the same family as The Resistance and Werewolf; it has its own name and look.)
//
// No sockets, files or real timers: reveals advance from tick(), and every time comes from room.now().
import { GameError, fail } from '../../lib.js';

const GAME = 'spynight';
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
export const MISSIONS = 5;
export const WINS = 3;                 // missions a side needs
export const MAX_REJECTS = 5;          // teams in a row that nobody approves: the Spies win

/** How many Spies for this many players. */
export const SPIES = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
/** How many players go on each of the five missions. */
export const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
};
/** The fourth mission with seven or more players needs two Fail cards to fail. */
export const failsNeeded = (players, mission) => (players >= 7 && mission === 3 ? 2 : 1);

export const T = {
  voteResult: 7000,      // everyone's vote, shown on the TV, before the game moves on
  missionResult: 7000,   // the mission's result (how many Fail cards, never who), before the next team
  leaderAway: 25000,     // a leader who has been away this long loses the pick: the next player leads
  awayGrace: 12000,      // someone whose phone blinks off is waited for this long before their vote counts as Reject (or their card as Success)
  moveOnGuard: 1200,     // a "Move on" this soon after the screen changed is a double tap: ignored
};

const isRole = (r) => r === 'spy' || r === 'resistance';

export class SpyNightGame {
  constructor(room) {
    this.room = room;
    this.#reset();
  }

  #reset() {
    this.phase = 'lobby';          // lobby | roles | team | vote | vote-result | mission | mission-result | gameover
    this.roles = {};               // playerId -> 'spy' | 'resistance'
    this.order = [];               // the players, in seating order, fixed when the game starts
    this.leaderId = null;
    this.mission = 0;              // 0..4
    this.rejects = 0;              // teams rejected in a row this mission
    this.track = [];               // one entry per finished mission
    this.team = [];                // the proposed (or sent) team
    this.votes = {};               // playerId -> true (approve) | false (reject)
    this.approved = null;
    this.cards = {};               // playerId -> 'success' | 'fail' (secret until the mission is over)
    this.ready = {};               // playerId -> true, in the roles phase
    this.winner = null;            // 'resistance' | 'spies'
    this.why = '';
    this.timer = null;             // { at, fire }
    this.lastMission = null;       // { success, fails } for the TV's result screen
    this.leaderAwaySince = null;   // runtime only: when the leader was first seen away
    this.awaySince = {};           // runtime only: playerId -> when they were first seen away
    this.phaseAt = 0;              // runtime only: when the screen last changed
    this.history = [];             // every vote that was held, in the open: { mission, leaderId, team, votes, approved }
  }
  #changed() { this.room.changed(); }
  /** Moves to the next screen (and notes when, so a double tap on Move on can be told from a real one). */
  #to(phase) { this.phase = phase; this.phaseAt = this.#now(); }
  #now() { return this.room.now(); }
  #player(id) { return this.room.players.find((p) => p.id === id) ?? null; }
  #connected(id) { return this.room.connected.has(id); }
  #setTimer(ms, fire) { this.timer = { at: this.#now() + ms, fire }; }
  #shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.room.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- the room's side of the contract ----------
  /** The roster is locked once the roles are dealt. */
  inProgress() { return this.phase !== 'lobby'; }
  /** Everyone who was dealt a role is needed (a leader, a voter, a team member), so nobody can be removed mid-game. */
  removeBlocked() { return this.phase === 'lobby' ? null : 'Players can only be removed before the game starts (end the game first, or skip a player who is away)'; }
  tick() {
    const t = this.timer;
    if (t && this.#now() >= t.at) { this.timer = null; t.fire(); return; }
    // Someone who was being waited for has gone away (for a while: a phone that blinks off is given a moment): carry on without them.
    // Never while nobody at all is here (a restart): the whole room would be counted as Reject.
    this.#watchAway();
    const done = (ids, have) => this.#anyoneHere() && ids.every((id) => have(id) || this.#awayLong(id));
    if (this.phase === 'roles' && done(this.order, (id) => this.ready[id])) this.#startTeam();
    else if (this.phase === 'vote' && done(this.order, (id) => id in this.votes)) this.#revealVotes();
    else if (this.phase === 'mission' && done(this.team, (id) => this.cards[id])) this.#finishMission();
    else this.#leaderWatch();
  }
  #anyoneHere() { return this.order.some((id) => this.#connected(id)); }
  /** Notes who has just gone away and who is back. */
  #watchAway() {
    const now = this.#now();
    for (const id of this.order) {
      if (this.#connected(id)) delete this.awaySince[id];
      else this.awaySince[id] ??= now;
    }
  }
  /** Away for longer than the grace period: not waited for any more. */
  #awayLong(id) {
    const since = this.awaySince[id];
    return since != null && this.#now() - since >= T.awayGrace;
  }
  /** A leader who is away for too long does not hold the game up: the pick passes to the next player.
   *  (Only while someone else is here to see it; a whole room reconnecting after a restart gets time to come back.) */
  #leaderWatch() {
    if (this.phase !== 'team' || this.#connected(this.leaderId) || !this.order.some((id) => this.#connected(id))) { this.leaderAwaySince = null; return; }
    const now = this.#now();
    if (this.leaderAwaySince == null) { this.leaderAwaySince = now; return; }
    if (now - this.leaderAwaySince >= T.leaderAway) this.#skipLeader();
  }
  /** Passes the pick to the next player (a mission is not lost: this is not a rejected team). */
  #skipLeader() {
    this.#nextLeader();
    this.#startTeam();
  }
  size() { return MISSIONS; }
  /** How many players go on this mission. */
  teamSize() { return TEAM_SIZES[this.order.length]?.[this.mission] ?? 0; }

  // ---------- starting ----------
  start() {
    if (this.phase !== 'lobby') fail('The game is already under way');
    const players = this.room.players;
    if (players.length < MIN_PLAYERS) fail(`Spy Night needs at least ${MIN_PLAYERS} players (there are ${players.length})`);
    if (players.length > MAX_PLAYERS) fail(`Spy Night takes at most ${MAX_PLAYERS} players`);
    this.order = players.map((p) => p.id);
    const spies = new Set(this.#shuffle(this.order).slice(0, SPIES[players.length]));
    this.roles = Object.fromEntries(this.order.map((id) => [id, spies.has(id) ? 'spy' : 'resistance']));
    this.leaderId = this.order[Math.floor(this.room.rng() * this.order.length)];
    this.mission = 0; this.rejects = 0; this.track = []; this.history = []; this.winner = null; this.why = '';
    this.ready = {};
    this.#to('roles');
    this.#changed();
  }
  kick(id) {
    if (this.phase !== 'lobby') fail('Players can only be removed before the game starts');
    this.room.removePlayer(id);
  }

  // ---------- one round ----------
  /** In the roles phase each player taps "Got it" once they have seen their role; then the first team is picked. */
  gotIt(pid) {
    if (this.phase !== 'roles' || !this.roles[pid]) return;
    this.ready[pid] = true;
    this.#changed();
    if (this.#anyoneHere() && this.order.every((id) => this.ready[id] || this.#awayLong(id))) this.#startTeam();
  }
  #startTeam() {
    this.leaderAwaySince = null;
    this.#to('team');
    this.team = []; this.votes = {}; this.approved = null; this.cards = {};
    this.#changed();
  }
  #nextLeader() {
    const i = this.order.indexOf(this.leaderId);
    this.leaderId = this.order[(i + 1) % this.order.length];
  }

  /** The leader adds or removes a player from the team. */
  toggleMember(pid, target) {
    if (this.phase !== 'team') fail('It is not time to pick a team');
    if (pid !== this.leaderId) fail('Only the leader picks the team');
    if (!this.order.includes(target)) fail('No such player');
    if (this.team.includes(target)) this.team = this.team.filter((id) => id !== target);
    else {
      if (this.team.length >= this.teamSize()) fail(`This mission takes ${this.teamSize()} players. Take someone off first.`);
      this.team.push(target);
    }
    this.#changed();
  }
  /** The leader sends the team to a vote. */
  propose(pid) {
    if (this.phase !== 'team') fail('It is not time to pick a team');
    if (pid !== this.leaderId) fail('Only the leader can call the vote');
    if (this.team.length !== this.teamSize()) fail(`Pick ${this.teamSize()} players for this mission`);
    this.#to('vote'); this.votes = {};
    this.#changed();
  }
  /** Everyone votes in secret to approve or reject the team. Voting again before the reveal changes the vote. */
  vote(pid, approve) {
    if (this.phase !== 'vote' || !this.roles[pid]) return;
    this.votes[pid] = !!approve;
    this.#changed();
    if (this.#anyoneHere() && this.order.every((id) => id in this.votes || this.#awayLong(id))) this.#revealVotes();
  }
  #revealVotes() {
    if (this.phase !== 'vote') return;
    for (const id of this.order) if (!(id in this.votes)) this.votes[id] = false;   // someone who is away rejects
    const yes = this.order.filter((id) => this.votes[id]).length;
    this.approved = yes > this.order.length - yes;                                  // a tie is a rejection
    this.history.push({ mission: this.mission + 1, leaderId: this.leaderId, team: this.team.slice(), votes: { ...this.votes }, approved: this.approved });
    this.#to('vote-result');
    this.#setTimer(T.voteResult, () => this.#afterVotes());
    this.#changed();
  }
  #afterVotes() {
    if (this.phase !== 'vote-result') return;
    if (this.approved) {
      this.#to('mission'); this.cards = {};
      this.#changed();
      return;
    }
    this.rejects += 1;
    if (this.rejects >= MAX_REJECTS) { this.#end('spies', `${MAX_REJECTS} teams in a row were rejected`); return; }
    this.#nextLeader();
    this.#startTeam();
  }

  /** A team member plays a Success or Fail card in secret. The Resistance may only play Success. */
  playCard(pid, card) {
    if (this.phase !== 'mission' || !this.team.includes(pid)) return;
    if (card !== 'success' && card !== 'fail') fail('Play Success or Fail');
    if (card === 'fail' && this.roles[pid] !== 'spy') fail('The Resistance can only play Success');
    if (this.cards[pid]) return;                    // one card each; it cannot be taken back
    this.cards[pid] = card;
    this.#changed();
    if (this.#anyoneHere() && this.team.every((id) => this.cards[id] || this.#awayLong(id))) this.#finishMission();
  }
  #finishMission() {
    if (this.phase !== 'mission') return;
    const needed = failsNeeded(this.order.length, this.mission);
    const fails = this.team.filter((id) => this.cards[id] === 'fail').length;   // an absent member's card is Success
    const success = fails < needed;
    // Who played what is kept, but not shown to anyone until the game is over.
    const cards = Object.fromEntries(this.team.map((id) => [id, this.cards[id] === 'fail' ? 'fail' : 'success']));
    const entry = { mission: this.mission + 1, size: this.team.length, team: this.team.slice(), leaderId: this.leaderId, success, fails, needed, cards };
    this.track.push(entry);
    this.lastMission = { success, fails, needed };
    this.#to('mission-result');
    this.#setTimer(T.missionResult, () => this.#afterMission());
    this.#changed();
  }
  #afterMission() {
    if (this.phase !== 'mission-result') return;
    const good = this.track.filter((m) => m.success).length;
    const bad = this.track.length - good;
    if (good >= WINS) { this.#end('resistance', `${WINS} missions succeeded`); return; }
    if (bad >= WINS) { this.#end('spies', `${WINS} missions failed`); return; }
    this.mission += 1; this.rejects = 0;
    this.#nextLeader();
    this.#startTeam();
  }
  #end(winner, why) {
    this.winner = winner; this.why = why;
    this.#to('gameover');
    this.timer = null;
    this.#changed();
  }

  /** The TV or the host moves things along when the game waits (or someone has gone to sleep). */
  advance() {
    // A second tap on "Move on" a moment after the first would skip the screen that has just come up (the vote result nobody has read yet).
    if (this.#now() - this.phaseAt < T.moveOnGuard) return;
    switch (this.phase) {
      case 'roles': this.#startTeam(); break;
      case 'team': this.#skipLeader(); break;   // the leader is away or taking too long: the next player picks
      case 'vote': this.#revealVotes(); break;
      case 'vote-result': this.timer = null; this.#afterVotes(); break;
      case 'mission': this.#finishMission(); break;
      case 'mission-result': this.timer = null; this.#afterMission(); break;
      default: break;
    }
  }
  /** Back to the lobby, everyone still in the room. */
  endGame() {
    this.#reset();
    this.room.resetScores();
    this.#changed();
  }

  // ---------- who may do what ----------
  /** Host and TV actions. */
  act(action, a = {}) {
    switch (action) {
      case 'start': return this.start();
      case 'advance': return this.advance();
      case 'endGame': case 'playAgain': return this.endGame();
      case 'kick': return this.kick(String(a.pid ?? a.id ?? ''));
      default: throw new GameError(`Unknown action ${action}`);
    }
  }
  /** With a host on the host page, the host starts and moves things along; without one, the first player to join does. */
  #starter(pid) { return !this.room.hosts && this.room.players[0]?.id === pid; }
  /** A message from a phone. */
  onPlayer(player, msg) {
    const pid = player.id;
    switch (msg.t) {
      case 'start': case 'advance': case 'play-again':
        if (!this.#starter(pid)) fail('Only the host can do that');
        this.act(msg.t === 'play-again' ? 'playAgain' : msg.t);
        return undefined;
      case 'end-game':
        if (!this.#starter(pid)) fail('Only the host can do that');
        this.act('endGame');
        return undefined;
      case 'got-it': this.gotIt(pid); return undefined;
      case 'pick': this.toggleMember(pid, String(msg.pid ?? '')); return undefined;
      case 'propose': this.propose(pid); return undefined;
      case 'vote': this.vote(pid, msg.approve === true); return { t: 'ack', what: 'vote' };
      case 'card': this.playCard(pid, String(msg.card ?? '')); return { t: 'ack', what: 'card' };
      default: return undefined;
    }
  }

  // ---------- views ----------
  #players() {
    // Once the roles are dealt only the dealt players are in the game (someone who joined late watches, and is counted in the next one).
    const list = this.phase === 'lobby' ? this.room.players : this.room.players.filter((p) => this.order.includes(p.id));
    return list.map((p) => ({ id: p.id, name: p.name, color: p.color, connected: this.#connected(p.id) }));
  }
  /** One line for the TV: what is going on and what happens next. */
  #line() {
    const name = (id) => this.#player(id)?.name ?? 'Someone';
    switch (this.phase) {
      case 'lobby': return { text: 'Waiting for players', next: `Spy Night needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players` };
      case 'roles': return { text: 'Look at your phone: you have a secret role', next: 'Tap “Got it” when you have seen it' };
      case 'team': return { text: `${name(this.leaderId)} is picking ${this.teamSize()} players for mission ${this.mission + 1}`, next: 'Talk it over, then everyone votes' };
      case 'vote': return { text: 'Vote: approve or reject this team', next: 'Votes stay secret until everyone has voted' };
      case 'vote-result': return { text: this.approved ? 'The team is approved' : 'The team is rejected', next: this.approved ? 'The team plays its mission cards' : `${name(this.order[(this.order.indexOf(this.leaderId) + 1) % this.order.length])} leads next` };
      case 'mission': return { text: 'The team is on the mission', next: 'Each member plays a card in secret' };
      case 'mission-result': return { text: this.lastMission?.success ? 'The mission succeeded' : 'The mission failed', next: 'The next leader picks a team' };
      default: return { text: this.winner === 'resistance' ? 'The Resistance wins' : 'The Spies win', next: this.why };
    }
  }
  /** What the TV and every phone may see: never a role, a card, or a vote that is still secret. */
  publicView() {
    const n = this.order.length || this.room.players.length;
    const sizes = TEAM_SIZES[n] ?? [];
    const track = Array.from({ length: MISSIONS }, (_, i) => {
      const m = this.track[i];
      const current = this.phase !== 'lobby' && this.phase !== 'gameover' && i === this.mission;
      return {
        mission: i + 1, size: sizes[i] ?? null, needed: failsNeeded(n, i), result: m ? (m.success ? 'success' : 'fail') : null, fails: m ? m.fails : null,
        // Who went on the mission (the team that was approved): for the mission under way too, once the team is on it.
        team: m ? m.team : current && ['mission', 'mission-result'].includes(this.phase) ? this.team.slice() : null,
        // Who played Success and who played Fail: only at the very end, when every role is shown too.
        cards: this.phase === 'gameover' && m ? (m.cards ?? null) : null,
        current,
      };
    });
    const v = {
      game: GAME, scoreFormat: 'none', lobbyTitle: 'Spy Night',
      phase: this.phase, status: this.phase,
      minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS, hosted: this.room.hosts > 0,
      players: this.#players(),
      spyCount: SPIES[n] ?? null, resistanceCount: SPIES[n] ? n - SPIES[n] : null,
      leaderId: this.phase === 'lobby' ? null : this.leaderId,
      mission: this.mission, track, wins: { resistance: this.track.filter((m) => m.success).length, spies: this.track.filter((m) => !m.success).length },
      rejects: this.rejects, maxRejects: MAX_REJECTS,
      team: this.team.slice(), teamSize: this.phase === 'lobby' ? null : this.teamSize(),
      line: this.#line(),
    };
    if (this.phase === 'roles') v.readyIds = Object.keys(this.ready);
    if (this.phase === 'vote') v.votedIds = Object.keys(this.votes);      // who has voted, never how
    if (this.phase === 'vote-result') { v.votes = { ...this.votes }; v.approved = this.approved; }   // revealed together, once everyone has voted
    v.history = this.history.map((x) => ({ ...x }));                       // past votes are public: they are the clues
    if (this.phase === 'mission') v.playedIds = Object.keys(this.cards);   // who has played, never what
    if (this.phase === 'mission-result') v.result = this.lastMission;      // how many Fail cards, never from whom
    if (this.phase === 'gameover') { v.winner = this.winner; v.why = this.why; v.roles = { ...this.roles }; }
    return v;
  }
  /** One player's phone: the shared view and what only they may know. */
  playerView(player) {
    const v = this.publicView();
    const role = this.roles[player.id];
    const canStart = this.#starter(player.id);
    if (!role) { v.me = { id: player.id, role: null, canStart, watching: this.phase !== 'lobby' }; return v; }
    v.me = {
      id: player.id, role, canStart,
      // A Spy knows the other Spies; the Resistance knows nothing more than their own side.
      spies: role === 'spy' ? this.order.filter((id) => this.roles[id] === 'spy' && id !== player.id).map((id) => ({ id, name: this.#player(id)?.name ?? '?' })) : [],
      isLeader: this.leaderId === player.id && this.phase !== 'gameover',
      onTeam: this.team.includes(player.id) && ['vote', 'vote-result', 'mission', 'mission-result'].includes(this.phase),
      myVote: this.phase === 'vote' && player.id in this.votes ? this.votes[player.id] : null,
      myCard: this.phase === 'mission' ? this.cards[player.id] ?? null : null,
      ready: !!this.ready[player.id],
    };
    return v;
  }
  /** The host sees the same as the TV: roles stay secret even from the host, who may be playing on another phone. */
  hostView() { return this.publicView(); }

  // ---------- saving ----------
  toJSON() {
    return {
      phase: this.phase, roles: this.roles, order: this.order, leaderId: this.leaderId, mission: this.mission, rejects: this.rejects,
      track: this.track, team: this.team, votes: this.votes, approved: this.approved, cards: this.cards, ready: this.ready,
      winner: this.winner, why: this.why, lastMission: this.lastMission, history: this.history,
    };
  }
  restore(data) {
    this.#reset();
    this.phase = data.phase ?? 'lobby';
    this.roles = Object.fromEntries(Object.entries(data.roles ?? {}).filter(([, r]) => isRole(r)));
    this.order = data.order ?? []; this.leaderId = data.leaderId ?? null; this.mission = data.mission ?? 0; this.rejects = data.rejects ?? 0;
    this.track = data.track ?? []; this.team = data.team ?? []; this.votes = data.votes ?? {}; this.approved = data.approved ?? null;
    this.cards = data.cards ?? {}; this.ready = data.ready ?? {}; this.winner = data.winner ?? null; this.why = data.why ?? ''; this.lastMission = data.lastMission ?? null; this.history = data.history ?? [];
    // A reveal that was showing carries on from its start (the timers do not survive a restart).
    if (this.phase === 'vote-result') this.#setTimer(T.voteResult, () => this.#afterVotes());
    if (this.phase === 'mission-result') this.#setTimer(T.missionResult, () => this.#afterMission());
  }
}
