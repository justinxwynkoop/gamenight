// The room: everything that is the same whatever game is being played.
// Players, teams, scores, who is connected, the host's roster controls, and
// which game is active. A game plugs in through the small interface below and
// never touches sockets or files.
//
// A game module (see games/index.js) exports:
//   { id, name, description, create(room) -> instance }
// and an instance provides:
//   inProgress()              true once play has begun (roster is then locked)
//   act(action, args)         host actions; throw GameError for unknown ones
//   onPlayer(player, msg)     a message from a phone or buzzer; may return a reply
//   publicView() / hostView() what the TV+phones / the host may see
//   toJSON() / restore(data)  saved with the room
//   init()                    optional, called when the game is newly chosen
//   contentChanged(setId)     optional, a question set was saved or deleted
//   tick()                    optional, called ~4x a second; the place to expire timers
//
// The game scores by changing `unit.score` on room.units(): players in
// individual mode, teams in team mode.

import { GameError, fail, cleanName, int, COLORS, MAX_PLAYERS, newToken } from './lib.js';

const VERSION = 2;

export class Room {
  constructor({ games = {}, now = () => performance.now(), onChange = () => {}, loadContent = () => null, listContent = () => [] } = {}) {
    this.games = games;
    this.clock = now;
    this.onChange = onChange;
    this.loadContent = loadContent; // (gameId, setId) => object | null
    this.listContent = listContent; // (gameId) => [{id, title}]
    this.nextId = 1;
    this.mode = 'players'; // 'players' | 'teams'
    this.players = []; // {id, token, name, color, teamId, score, kind}
    this.teams = []; // {id, name, color, score}
    this.gameId = null;
    this.game = null;
    this.settings = { sound: true, volume: 70 }; // sound plays on the TV
    this.soundPing = 0; // bumped by the host's "test sound" so the TV can play one
    this.connected = new Set(); // runtime only: player ids with a live socket
  }

  now() { return this.clock(); }
  changed() { this.onChange(); }
  #id(prefix) { return `${prefix}${this.nextId++}`; }

  // ---------- persistence ----------
  toJSON() {
    return {
      version: VERSION, nextId: this.nextId, mode: this.mode, players: this.players, teams: this.teams, settings: this.settings,
      gameId: this.gameId, game: this.game?.toJSON() ?? null,
    };
  }
  /** Returns false (and changes nothing) if the data is not something this version saved. */
  restore(data) {
    if (!data || typeof data !== 'object' || data.version !== VERSION) return false;
    this.nextId = data.nextId ?? 1;
    this.mode = data.mode ?? 'players';
    this.players = data.players ?? [];
    this.teams = data.teams ?? [];
    this.settings = { sound: true, volume: 70, ...data.settings };
    this.gameId = null; this.game = null;
    if (data.gameId && this.games[data.gameId]) {
      this.gameId = data.gameId;
      this.game = this.games[data.gameId].create(this);
      this.game.restore(data.game ?? {});
    }
    return true;
  }

  // ---------- who is playing ----------
  /** Things that hold a score: players in individual mode, teams in team mode. */
  units() { return this.mode === 'teams' ? this.teams : this.players; }
  unit(id) { return this.units().find((u) => u.id === id) ?? null; }
  unitOf(player) {
    if (this.mode === 'teams') return this.teams.find((t) => t.id === player.teamId) ?? null;
    return player;
  }
  /** Units that can actually play: someone is attached to them. */
  eligibleUnits() {
    if (this.mode !== 'teams') return this.players;
    return this.teams.filter((t) => this.players.some((p) => p.teamId === t.id));
  }
  player(id) { return this.players.find((p) => p.id === id) ?? fail('No such player'); }
  playerByToken(token) { return token ? this.players.find((p) => p.token === token) ?? null : null; }
  #freeColor() {
    const used = new Set(this.units().map((u) => u.color));
    return COLORS.find((c) => !used.has(c)) ?? COLORS[this.players.length % COLORS.length];
  }

  join({ name, color, teamId, kind = 'phone' }) {
    name = cleanName(name);
    if (!name) fail('Enter a name');
    if (this.players.length >= MAX_PLAYERS) fail('The game is full');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('That name is taken');
    if (this.mode === 'teams' && !this.teams.some((t) => t.id === teamId)) fail('Pick a team');
    color = COLORS.includes(color) ? color : this.#freeColor();
    const player = {
      id: this.#id('p'), token: newToken(), name, color, kind, score: 0,
      teamId: this.mode === 'teams' ? teamId : null,
    };
    this.players.push(player);
    this.changed();
    return player;
  }
  setConnected(playerId, on) {
    on ? this.connected.add(playerId) : this.connected.delete(playerId);
    this.changed();
  }

  // ---------- roster controls (host) ----------
  inProgress() { return !!this.game?.inProgress(); }
  #lobbyOnly(what) { if (this.inProgress()) fail(`${what} before the game starts, or end the game first`); }

  chooseGame(id) {
    this.#lobbyOnly('Pick the game');
    const mod = this.games[id] ?? fail('No such game');
    if (this.gameId === id && this.game) return;
    this.gameId = id;
    this.game = mod.create(this);
    this.game.init?.();
    this.changed();
  }
  setMode(mode) {
    if (!['players', 'teams'].includes(mode)) fail('Unknown mode');
    this.#lobbyOnly('Change the mode');
    this.mode = mode;
    this.players.forEach((p) => { p.teamId = null; });
    if (mode === 'teams' && !this.teams.length) ['Team 1', 'Team 2'].forEach((n) => this.addTeam(n));
    this.changed();
  }
  addTeam(name) {
    name = cleanName(name);
    if (!name) fail('Team needs a name');
    if (this.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) fail('That team name is taken');
    this.teams.push({ id: this.#id('t'), name, color: this.#freeColor(), score: 0 });
    this.changed();
  }
  removeTeam(id) {
    this.teams = this.teams.filter((t) => t.id !== id);
    this.players.forEach((p) => { if (p.teamId === id) p.teamId = null; });
    this.changed();
  }
  setPlayerTeam(playerId, teamId) {
    const p = this.player(playerId);
    if (teamId && !this.teams.some((t) => t.id === teamId)) fail('No such team');
    p.teamId = teamId || null;
    this.changed();
  }
  renameUnit(id, name) {
    const u = this.unit(id) ?? fail('No such player');
    name = cleanName(name);
    if (!name) fail('Name cannot be empty');
    u.name = name;
    this.changed();
  }
  removePlayer(id) {
    this.player(id);
    this.players = this.players.filter((p) => p.id !== id);
    this.connected.delete(id);
    this.changed();
  }
  /** Lobby only: forget every player and team (a new party). */
  clearRoster() {
    this.#lobbyOnly('Clear the players');
    this.players = []; this.teams = []; this.connected.clear();
    if (this.mode === 'teams') ['Team 1', 'Team 2'].forEach((n) => this.addTeam(n));
    this.changed();
  }
  adjustScore(id, { delta, set }) {
    const u = this.unit(id) ?? fail('No such player');
    if (set !== undefined) {
      const n = int(set); if (Number.isNaN(n)) fail('Score must be a number'); u.score = n;
    } else {
      const n = int(delta); if (Number.isNaN(n)) fail('Adjustment must be a number'); u.score += n;
    }
    this.changed();
  }
  resetScores() { this.units().forEach((u) => { u.score = 0; }); }
  setRoomSettings({ sound, volume }) {
    if (typeof sound === 'boolean') this.settings.sound = sound;
    if (volume !== undefined) {
      const v = int(volume);
      if (!(v >= 0 && v <= 100)) fail('Volume must be 0 to 100');
      this.settings.volume = v;
    }
    this.changed();
  }
  testSound() { this.soundPing += 1; this.changed(); }
  /** Called by the server a few times a second so games can run timers. */
  tick() { this.game?.tick?.(); }

  /** A host action: roster actions are handled here, anything else goes to the active game. */
  act(action, args = {}) {
    switch (action) {
      case 'chooseGame': return this.chooseGame(args.id);
      case 'setMode': return this.setMode(args.mode);
      case 'addTeam': return this.addTeam(args.name);
      case 'removeTeam': return this.removeTeam(args.id);
      case 'setPlayerTeam': return this.setPlayerTeam(args.playerId, args.teamId);
      case 'renameUnit': return this.renameUnit(args.id, args.name);
      case 'removePlayer': return this.removePlayer(args.id);
      case 'clearRoster': return this.clearRoster();
      case 'adjustScore': return this.adjustScore(args.id, { delta: args.delta, set: args.set });
      case 'setRoomSettings': return this.setRoomSettings(args);
      case 'testSound': return this.testSound();
      default:
        if (!this.game) throw new GameError('Pick a game first');
        return this.game.act(action, args);
    }
  }
  /** A message from a player's phone or buzzer that the room itself does not handle. */
  playerMessage(playerId, msg) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p || !this.game) return undefined;
    return this.game.onPlayer(p, msg);
  }
  contentChanged(gameId, setId) {
    if (this.gameId === gameId) this.game?.contentChanged?.(setId);
  }

  // ---------- views ----------
  #unitViews() {
    const connected = (u) => (this.mode === 'teams'
      ? this.players.some((p) => p.teamId === u.id && this.connected.has(p.id))
      : this.connected.has(u.id));
    const members = (u) => (this.mode === 'teams' ? this.players.filter((p) => p.teamId === u.id).length : 1);
    return this.units().map((u) => ({
      id: u.id, name: u.name, color: u.color, score: u.score, connected: connected(u), members: members(u),
    }));
  }
  #roomView() {
    return {
      mode: this.mode,
      teams: this.teams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      units: this.#unitViews(),
      gameId: this.gameId,
      inProgress: this.inProgress(),
      settings: { ...this.settings, ping: this.soundPing },
    };
  }
  /** What the TV and phones may see. */
  publicView() {
    return { room: this.#roomView(), game: this.game?.publicView() ?? null };
  }
  /** The host also sees answers, the roster and the list of games. */
  hostView() {
    const room = this.#roomView();
    room.games = Object.values(this.games).map((g) => ({ id: g.id, name: g.name, description: g.description }));
    room.players = this.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, teamId: p.teamId, kind: p.kind, connected: this.connected.has(p.id),
    }));
    return { room, game: this.game?.hostView() ?? null };
  }
  playerView(playerId, base = this.publicView()) {
    const p = this.players.find((x) => x.id === playerId);
    const me = p ? { id: p.id, name: p.name, color: p.color, unitId: this.unitOf(p)?.id ?? null } : null;
    return { ...base, room: { ...base.room, me } };
  }
}
