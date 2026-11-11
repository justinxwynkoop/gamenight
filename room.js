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
// and the module may declare `needs: { teams: 2 }` when the game can only be played by that many teams
// (the room then always plays in teams, and the host cannot switch to individuals).
//
// The game scores by changing `unit.score` on room.units(): players in
// individual mode, teams in team mode.

import { GameError, fail, cleanName, int, COLORS, MAX_PLAYERS, INDIVIDUAL_MAX, TEAM_SIZE, TEAM_DEFS, newToken } from './lib.js';

const VERSION = 2;

export class Room {
  constructor({ games = {}, now = () => performance.now(), onChange = () => {}, loadContent = () => null, listContent = () => [], random = Math.random } = {}) {
    this.rng = random; // for dealing players onto teams; tests pass a fixed one
    this.games = games;
    this.clock = now;
    this.onChange = onChange;
    this.loadContent = loadContent; // (gameId, setId) => object | null
    this.listContent = listContent; // (gameId) => [{id, title}]
    this.nextId = 1;
    this.mode = 'players'; // what is actually being played: 'players' | 'teams'
    this.modeSetting = 'auto'; // the host's choice: 'auto' | 'players' | 'teams'. Auto means teams once there are more than INDIVIDUAL_MAX players.
    this.teamCount = 2; // the host's choice, 2 or 4 (more than 2 × TEAM_SIZE players always means 4)
    this.players = []; // {id, token, name, color, teamId, score, kind}
    this.teams = []; // {id, key, name, color, score}
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
      version: VERSION, nextId: this.nextId, mode: this.mode, modeSetting: this.modeSetting, teamCount: this.teamCount,
      players: this.players, teams: this.teams, settings: this.settings,
      gameId: this.gameId, game: this.game?.toJSON() ?? null,
    };
  }
  /** Returns false (and changes nothing) if the data is not something this version saved. */
  restore(data) {
    if (!data || typeof data !== 'object' || data.version !== VERSION) return false;
    this.nextId = data.nextId ?? 1;
    this.mode = data.mode ?? 'players';
    this.modeSetting = data.modeSetting ?? (this.mode === 'teams' ? 'teams' : 'players'); // saves from before auto teams
    this.teamCount = data.teamCount === 4 ? 4 : 2;
    this.players = data.players ?? [];
    this.teams = (data.teams ?? []).map((t, i) => ({ key: TEAM_DEFS[i]?.key ?? `team${i + 1}`, ...t }));
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
    color = COLORS.includes(color) ? color : this.#freeColor();
    const player = {
      id: this.#id('p'), token: newToken(), name, color, kind, score: 0,
      // Normally nobody chooses: the room puts you on a team. A valid team given here is respected (a buzzer, say).
      teamId: this.mode === 'teams' && this.teams.some((t) => t.id === teamId) ? teamId : null,
    };
    this.players.push(player);
    this.#reconcile();
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
    this.#reconcile();   // a game may need teams (or not)
    this.changed();
  }
  /** How to play: 'auto' (individuals up to INDIVIDUAL_MAX players, teams beyond that), or force 'players' or 'teams'. */
  setMode(mode) {
    if (!['auto', 'players', 'teams'].includes(mode)) fail('Unknown mode');
    this.#fixedTeams('How to play');
    this.#lobbyOnly('Change the mode');
    this.modeSetting = mode;
    this.#reconcile();
    this.changed();
  }
  /** Two teams (Red, Blue) or four (adding Green, Yellow). With more than 2 × TEAM_SIZE players it is always four. */
  setTeamCount(count) {
    const n = int(count);
    if (![2, 4].includes(n)) fail('Choose 2 or 4 teams');
    this.#fixedTeams('The number of teams');
    this.#lobbyOnly('Change the number of teams');
    if (n === 2 && this.players.length > 2 * TEAM_SIZE) fail(`With more than ${2 * TEAM_SIZE} players you need four teams`);
    this.teamCount = n;
    this.#reconcile();
    this.changed();
  }
  /** Deal everyone onto the teams again, at random. */
  shuffleTeams() {
    this.#lobbyOnly('Shuffle the teams');
    if (this.mode !== 'teams') fail('Not playing in teams');
    this.#deal();
    this.changed();
  }

  // ---------- keeping teams in step with the roster ----------
  /** Teams the active game insists on (0 when it does not mind). */
  #neededTeams() { return this.games[this.gameId]?.needs?.teams ?? 0; }
  #fixedTeams(what) {
    const n = this.#neededTeams();
    if (n) fail(`${what} is fixed: ${this.games[this.gameId].name} is always played by ${n} teams`);
  }
  #effectiveMode() {
    if (this.#neededTeams()) return 'teams';
    if (this.modeSetting === 'auto') return this.players.length > INDIVIDUAL_MAX ? 'teams' : 'players';
    return this.modeSetting;
  }
  #wantedTeamCount() { return this.#neededTeams() || (this.teamCount === 4 || this.players.length > 2 * TEAM_SIZE ? 4 : 2); }
  /**
   * Makes mode, teams and who is on which team match the roster and the host's choices.
   * Before the game starts it may switch between individuals and teams, add or drop Green and Yellow,
   * and deal everyone out again at random when the make-up of the teams changes. Once a game is
   * running nothing is rearranged; a player who joins is just put on the smallest team.
   */
  #reconcile() {
    if (this.inProgress()) { if (this.mode === 'teams') this.#placeUnassigned(); return; }
    const mode = this.#effectiveMode();
    const modeChanged = mode !== this.mode;
    this.mode = mode;
    if (mode === 'players') {
      this.teams = [];
      this.players.forEach((p) => { p.teamId = null; });
      return;
    }
    const before = this.teams.length;
    this.#ensureTeams(this.#wantedTeamCount());
    if (modeChanged || this.teams.length !== before) this.#deal(); else this.#placeUnassigned();
  }
  /** Exactly the first `count` teams, keeping any a host renamed. Players on a dropped team become unassigned. */
  #ensureTeams(count) {
    this.teams = TEAM_DEFS.slice(0, count).map((def) => this.teams.find((t) => t.key === def.key)
      ?? { id: this.#id('t'), key: def.key, name: def.name, color: def.color, score: 0 });
    const ids = new Set(this.teams.map((t) => t.id));
    this.players.forEach((p) => { if (!ids.has(p.teamId)) p.teamId = null; });
  }
  #shuffled(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** Everyone onto a team at random, as even as possible (team sizes differ by at most one). */
  #deal() {
    const n = this.teams.length;
    if (!n) return;
    this.#shuffled(this.players).forEach((p, i) => { p.teamId = this.teams[i % n].id; });
  }
  /** Players with no team go on the smallest team; if several are tied, at random. */
  #placeUnassigned() {
    if (!this.teams.length) return;
    const valid = new Set(this.teams.map((t) => t.id));
    for (const p of this.players) {
      if (valid.has(p.teamId)) continue;
      const sizes = this.teams.map((t) => this.players.filter((x) => x.teamId === t.id).length);
      const least = Math.min(...sizes);
      const options = this.teams.filter((_, i) => sizes[i] === least);
      p.teamId = options[Math.floor(this.rng() * options.length)].id;
    }
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
    this.#reconcile();
    this.changed();
  }
  /** Lobby only: forget every player and team (a new party). */
  clearRoster() {
    this.#lobbyOnly('Clear the players');
    this.players = []; this.connected.clear();
    this.#reconcile();
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
      case 'setTeamCount': return this.setTeamCount(args.count);
      case 'shuffleTeams': return this.shuffleTeams();
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
      // Who is on a team, so players can see who they are playing with.
      ...(this.mode === 'teams' ? { memberNames: this.players.filter((p) => p.teamId === u.id).map((p) => p.name) } : {}),
    }));
  }
  #roomView() {
    return {
      mode: this.mode,
      modeSetting: this.modeSetting,
      teamCount: this.teams.length,
      fixedTeams: this.#neededTeams(),   // a game that insists on this many teams (0: the host chooses)
      individualMax: INDIVIDUAL_MAX,
      teamSize: TEAM_SIZE,
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
