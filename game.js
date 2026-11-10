// Game Night: pure game logic. No network, no files, no timers.
// The server owns one Game, feeds it events, and broadcasts the views it produces.
//
// Fairness: buzz() is called in the order messages arrive at the server and
// stamps the press with the server clock. Device clocks are never consulted.

export const COLS = 6;
export const ROWS = 5;
export const MAX_PLAYERS = 30;
export const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#a3e635', '#f8fafc',
];

export class GameError extends Error {}

const fail = (msg) => { throw new GameError(msg); };
const key = (c, r) => `${c},${r}`;
const cleanName = (s, max = 20) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const int = (n) => (Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : NaN);

export function validateSet(set) {
  if (!set || typeof set !== 'object') fail('Question set must be an object');
  if (!cleanName(set.title, 80)) fail('Question set needs a title');
  if (!Array.isArray(set.categories) || set.categories.length !== COLS) fail(`Need exactly ${COLS} categories`);
  set.categories.forEach((cat, c) => {
    if (!cleanName(cat?.name, 40)) fail(`Category ${c + 1} needs a name`);
    if (!Array.isArray(cat.clues) || cat.clues.length !== ROWS) fail(`Category ${c + 1} needs exactly ${ROWS} clues`);
    cat.clues.forEach((cl, r) => {
      if (!String(cl?.clue ?? '').trim()) fail(`Category ${c + 1}, clue ${r + 1} is missing its clue text`);
      if (!String(cl?.answer ?? '').trim()) fail(`Category ${c + 1}, clue ${r + 1} is missing its answer`);
      if (!(int(cl.value) > 0)) fail(`Category ${c + 1}, clue ${r + 1} needs a positive value`);
    });
  });
  const f = set.final;
  if (!f || !cleanName(f.category, 40) || !String(f.clue ?? '').trim() || !String(f.answer ?? '').trim()) {
    fail('Final Jeopardy needs a category, clue and answer');
  }
  return true;
}

export class Game {
  constructor({ now = () => performance.now(), onChange = () => {}, loadSet = () => null } = {}) {
    this.now = now;
    this.onChange = onChange;
    this.loadSet = loadSet; // (id) => set object | null
    this.nextId = 1;
    this.mode = 'players'; // 'players' | 'teams'
    this.settings = { earlyPenalty: true, penaltyMs: 500 };
    this.players = []; // {id, token, name, color, teamId, score, kind}
    this.teams = []; // {id, name, color, score}
    this.setId = null;
    this.set = null; // loaded question set
    this.run = this.#blankRun('lobby');
    this.connected = new Set(); // runtime only: player ids with a live socket
  }

  #blankRun(status) {
    return { status, used: [], dd: [], control: null, clue: null, final: null, view: 'board' };
  }
  #id(prefix) { return `${prefix}${this.nextId++}`; }
  #changed() { this.onChange(); }

  // ---------- persistence ----------
  toJSON() {
    return {
      nextId: this.nextId, mode: this.mode, settings: this.settings,
      players: this.players, teams: this.teams, setId: this.setId, run: this.run,
    };
  }
  restore(data) {
    if (!data || typeof data !== 'object') return;
    Object.assign(this, {
      nextId: data.nextId ?? 1, mode: data.mode ?? 'players',
      settings: { ...this.settings, ...data.settings },
      players: data.players ?? [], teams: data.teams ?? [], setId: data.setId ?? null,
    });
    this.set = this.setId ? this.loadSet(this.setId) : null;
    this.run = { ...this.#blankRun('lobby'), ...data.run };
    if (this.run.status !== 'lobby' && !this.set) this.run = this.#blankRun('lobby');
  }

  // ---------- contestants ----------
  unitOf(player) {
    if (this.mode === 'teams') return this.teams.find((t) => t.id === player.teamId) ?? null;
    return player;
  }
  /** Things that hold a score: players in individual mode, teams in team mode. */
  units() {
    return this.mode === 'teams' ? this.teams : this.players;
  }
  unit(id) { return this.units().find((u) => u.id === id) ?? null; }
  /** Units that can actually buzz: someone is attached to them. */
  eligibleUnits() {
    if (this.mode !== 'teams') return this.players;
    return this.teams.filter((t) => this.players.some((p) => p.teamId === t.id));
  }

  join({ name, color, teamId, kind = 'phone' }) {
    name = cleanName(name);
    if (!name) fail('Enter a name');
    if (this.players.length >= MAX_PLAYERS) fail('The game is full');
    if (this.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('That name is taken');
    if (this.mode === 'teams' && !this.teams.some((t) => t.id === teamId)) fail('Pick a team');
    color = COLORS.includes(color) ? color : this.#freeColor();
    const player = {
      id: this.#id('p'), token: cryptoToken(), name, color, kind, score: 0,
      teamId: this.mode === 'teams' ? teamId : null,
    };
    this.players.push(player);
    this.#changed();
    return player;
  }
  playerByToken(token) {
    return token ? this.players.find((p) => p.token === token) ?? null : null;
  }
  #freeColor() {
    const used = new Set(this.units().map((u) => u.color));
    return COLORS.find((c) => !used.has(c)) ?? COLORS[this.players.length % COLORS.length];
  }
  setConnected(playerId, on) {
    on ? this.connected.add(playerId) : this.connected.delete(playerId);
    this.#changed();
  }

  // ---------- lobby / setup (host) ----------
  setMode(mode) {
    if (!['players', 'teams'].includes(mode)) fail('Unknown mode');
    if (this.run.status !== 'lobby') fail('Change the mode before the game starts');
    this.mode = mode;
    this.players.forEach((p) => { p.teamId = null; });
    if (mode === 'teams' && !this.teams.length) ['Team 1', 'Team 2'].forEach((n) => this.addTeam(n));
    this.#changed();
  }
  addTeam(name) {
    name = cleanName(name);
    if (!name) fail('Team needs a name');
    if (this.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) fail('That team name is taken');
    this.teams.push({ id: this.#id('t'), name, color: this.#freeColor(), score: 0 });
    this.#changed();
  }
  removeTeam(id) {
    this.teams = this.teams.filter((t) => t.id !== id);
    this.players.forEach((p) => { if (p.teamId === id) p.teamId = null; });
    this.#changed();
  }
  setPlayerTeam(playerId, teamId) {
    const p = this.#player(playerId);
    if (teamId && !this.teams.some((t) => t.id === teamId)) fail('No such team');
    p.teamId = teamId || null;
    this.#changed();
  }
  renameUnit(id, name) {
    const u = this.unit(id) ?? fail('No such player');
    name = cleanName(name);
    if (!name) fail('Name cannot be empty');
    u.name = name;
    this.#changed();
  }
  removePlayer(id) {
    this.#player(id);
    this.players = this.players.filter((p) => p.id !== id);
    this.connected.delete(id);
    this.#changed();
  }
  #player(id) { return this.players.find((p) => p.id === id) ?? fail('No such player'); }

  setSettings({ earlyPenalty, penaltyMs }) {
    if (typeof earlyPenalty === 'boolean') this.settings.earlyPenalty = earlyPenalty;
    if (penaltyMs !== undefined) {
      const ms = int(penaltyMs);
      if (!(ms >= 0 && ms <= 5000)) fail('Penalty must be 0 to 5000 ms');
      this.settings.penaltyMs = ms;
    }
    this.#changed();
  }
  chooseSet(id) {
    if (this.run.status !== 'lobby') fail('Pick the question set before the game starts');
    const set = this.loadSet(id) ?? fail('No such question set');
    validateSet(set);
    this.setId = id;
    this.set = set;
    this.#changed();
  }
  /** The editor saved a set that may be the one in play. */
  refreshSet() {
    if (this.setId && this.run.status === 'lobby') this.set = this.loadSet(this.setId);
    this.#changed();
  }

  startGame() {
    if (this.run.status !== 'lobby') fail('Game already started');
    if (!this.set) fail('Choose a question set first');
    if (this.eligibleUnits().length < 1) fail('Nobody has joined yet');
    this.units().forEach((u) => { u.score = 0; });
    const flagged = [];
    this.set.categories.forEach((cat, c) => cat.clues.forEach((cl, r) => { if (cl.dailyDouble) flagged.push(key(c, r)); }));
    let dd = flagged;
    if (!dd.length) dd = [key(Math.floor(Math.random() * COLS), 1 + Math.floor(Math.random() * (ROWS - 1)))];
    this.run = { ...this.#blankRun('board'), dd };
    this.#changed();
  }
  /** Lobby only: forget every player and team (a new party). */
  clearRoster() {
    if (this.run.status !== 'lobby') fail('Finish or end the game first');
    this.players = []; this.teams = []; this.connected.clear();
    if (this.mode === 'teams') ['Team 1', 'Team 2'].forEach((n) => this.addTeam(n));
    this.#changed();
  }
  /** Back to the lobby. Keeps players and teams, clears scores. */
  endGame() {
    this.units().forEach((u) => { u.score = 0; });
    this.run = this.#blankRun('lobby');
    this.#changed();
  }
  setView(view) {
    if (!['board', 'leaderboard'].includes(view)) fail('Unknown view');
    this.run.view = view;
    this.#changed();
  }

  // ---------- scores ----------
  adjustScore(id, { delta, set }) {
    const u = this.unit(id) ?? fail('No such player');
    if (set !== undefined) {
      const n = int(set); if (Number.isNaN(n)) fail('Score must be a number'); u.score = n;
    } else {
      const n = int(delta); if (Number.isNaN(n)) fail('Adjustment must be a number'); u.score += n;
    }
    this.#changed();
  }

  // ---------- the board ----------
  #cell(c, r) { return this.set?.categories[c]?.clues[r] ?? fail('No such square'); }
  #inClue(...steps) {
    const cl = this.run.clue;
    if (this.run.status !== 'clue' || !cl) fail('No clue is open');
    if (steps.length && !steps.includes(cl.step)) fail(`Not allowed during step "${cl.step}"`);
    return cl;
  }

  select(c, r) {
    if (this.run.status !== 'board') fail('Return to the board first');
    const cell = this.#cell(c, r);
    if (this.run.used.includes(key(c, r))) fail('That square is already used');
    const dd = this.run.dd.includes(key(c, r));
    this.run.status = 'clue';
    this.run.view = 'board';
    this.run.clue = {
      c, r, value: int(cell.value), dd,
      step: dd ? 'wager' : 'reading',
      wager: null, ddUnit: dd ? this.#validControl() : null,
      buzzedBy: null, buzzedPlayer: null, buzzedAt: null,
      lockedOut: [], early: [], penaltyUntil: {}, openedAt: null, correct: null,
    };
    this.#changed();
  }
  #validControl() {
    const id = this.run.control;
    return this.eligibleUnits().some((u) => u.id === id) ? id : null;
  }

  /** Host picks who gets the Daily Double (defaults to whoever is in control). */
  setDailyDoubleUnit(id) {
    const cl = this.#inClue('wager');
    if (!this.eligibleUnits().some((u) => u.id === id)) fail('No such player');
    cl.ddUnit = id;
    this.#changed();
  }
  setDailyDoubleWager(amount) {
    const cl = this.#inClue('wager');
    const u = this.unit(cl.ddUnit) ?? fail('Pick who is playing the Daily Double');
    const max = Math.max(u.score, 1000);
    const n = int(amount);
    if (!(n >= 0 && n <= max)) fail(`Wager must be between 0 and ${max}`);
    cl.wager = n;
    cl.value = n;
    cl.step = 'answering';
    cl.buzzedBy = u.id;
    this.#changed();
  }

  openBuzzers() {
    const cl = this.#inClue('reading');
    if (cl.dd) fail('Daily Doubles do not use buzzers');
    const t = this.now();
    for (const id of cl.early) cl.penaltyUntil[id] = t + this.settings.penaltyMs;
    cl.early = [];
    cl.step = 'open';
    cl.openedAt = t;
    this.#changed();
  }

  /** A press from a phone or a physical buzzer. Returns what happened to it. */
  buzz(playerId) {
    const p = this.players.find((x) => x.id === playerId);
    const cl = this.run.clue;
    if (!p || this.run.status !== 'clue' || !cl || cl.dd) return { ok: false, reason: 'closed' };
    const u = this.unitOf(p);
    if (!u) return { ok: false, reason: 'no-team' };
    const t = this.now();
    if (cl.step === 'reading') {
      if (this.settings.earlyPenalty && !cl.early.includes(u.id)) { cl.early.push(u.id); this.#changed(); }
      return { ok: false, reason: this.settings.earlyPenalty ? 'early' : 'closed' };
    }
    if (cl.step !== 'open') return { ok: false, reason: 'closed' };
    if (cl.lockedOut.includes(u.id)) return { ok: false, reason: 'locked-out' };
    const until = cl.penaltyUntil[u.id] ?? 0;
    if (t < until) return { ok: false, reason: 'penalty', retryMs: Math.ceil(until - t) };
    cl.step = 'answering';
    cl.buzzedBy = u.id;
    cl.buzzedPlayer = p.id;
    cl.buzzedAt = t;
    this.#changed();
    return { ok: true, unitId: u.id, playerId: p.id };
  }

  correct() {
    const cl = this.#inClue('answering');
    const u = this.unit(cl.buzzedBy) ?? fail('Nobody is answering');
    u.score += cl.value;
    this.run.control = u.id;
    cl.correct = u.id;
    cl.step = 'revealed';
    this.#markUsed(cl);
    this.#changed();
  }
  wrong() {
    const cl = this.#inClue('answering');
    const u = this.unit(cl.buzzedBy) ?? fail('Nobody is answering');
    u.score -= cl.value;
    if (cl.dd) {
      cl.step = 'revealed';
      this.#markUsed(cl);
    } else {
      cl.lockedOut.push(u.id);
      cl.buzzedBy = null; cl.buzzedPlayer = null; cl.buzzedAt = null;
      const anyoneLeft = this.eligibleUnits().some((x) => !cl.lockedOut.includes(x.id));
      if (anyoneLeft) { cl.step = 'open'; cl.openedAt = this.now(); } else { cl.step = 'revealed'; this.#markUsed(cl); }
    }
    this.#changed();
  }
  /** Nobody got it: show the answer. */
  reveal() {
    const cl = this.#inClue('reading', 'open', 'answering');
    cl.step = 'revealed';
    cl.buzzedBy = null;
    this.#markUsed(cl);
    this.#changed();
  }
  /** Host gives the buzz to someone directly (dead phone, missed press). */
  awardBuzz(unitId) {
    const cl = this.#inClue('reading', 'open');
    if (cl.dd) fail('Daily Doubles do not use buzzers');
    const u = this.eligibleUnits().find((x) => x.id === unitId) ?? fail('No such player');
    cl.step = 'answering';
    cl.buzzedBy = u.id;
    cl.buzzedPlayer = null;
    cl.buzzedAt = this.now();
    this.#changed();
  }
  /** Re-open buzzers for everyone (host undo / mistaken press). Locked-out units stay out. */
  reopen() {
    const cl = this.#inClue('answering');
    if (cl.dd) fail('Daily Doubles do not use buzzers');
    cl.buzzedBy = null; cl.buzzedPlayer = null; cl.buzzedAt = null;
    cl.step = 'open';
    cl.openedAt = this.now();
    this.#changed();
  }
  #markUsed(cl) {
    const k = key(cl.c, cl.r);
    if (!this.run.used.includes(k)) this.run.used.push(k);
  }
  closeClue() {
    const cl = this.#inClue('revealed');
    this.run.clue = null;
    this.run.status = 'board';
    void cl;
    this.#changed();
  }
  boardCleared() { return this.run.used.length >= COLS * ROWS; }

  // ---------- Final Jeopardy ----------
  /** Before the round: everyone with a positive score. Once it starts the list is frozen,
   *  so a player who bets it all and loses still appears in the results. */
  finalists() {
    const ids = this.run.final?.ids;
    if (ids) return ids.map((id) => this.unit(id)).filter(Boolean);
    return this.eligibleUnits().filter((u) => u.score > 0);
  }
  startFinal() {
    if (this.run.status !== 'board') fail('Return to the board first');
    if (!this.finalists().length) fail('Nobody has a positive score to play Final Jeopardy');
    this.run.status = 'final';
    this.run.final = { step: 'wager', ids: this.finalists().map((u) => u.id), wagers: {}, answers: {}, results: {} };
    this.#changed();
  }
  #inFinal(...steps) {
    const f = this.run.final;
    if (this.run.status !== 'final' || !f) fail('Final Jeopardy is not running');
    if (steps.length && !steps.includes(f.step)) fail(`Not allowed during step "${f.step}"`);
    return f;
  }
  setFinalWager(unitId, amount) {
    const f = this.#inFinal('wager');
    const u = this.finalists().find((x) => x.id === unitId) ?? fail('That player is not in Final Jeopardy');
    const n = int(amount);
    if (!(n >= 0 && n <= u.score)) fail(`Wager must be between 0 and ${u.score}`);
    f.wagers[u.id] = n;
    this.#changed();
  }
  setFinalAnswer(unitId, text) {
    const f = this.#inFinal('clue');
    const u = this.finalists().find((x) => x.id === unitId) ?? fail('That player is not in Final Jeopardy');
    f.answers[u.id] = String(text ?? '').trim().slice(0, 200);
    this.#changed();
  }
  /** Player-side helpers: act on behalf of the player's unit. */
  finalWagerFrom(playerId, amount) {
    const u = this.unitOf(this.#player(playerId)) ?? fail('Join a team first');
    this.setFinalWager(u.id, amount);
  }
  finalAnswerFrom(playerId, text) {
    const u = this.unitOf(this.#player(playerId)) ?? fail('Join a team first');
    this.setFinalAnswer(u.id, text);
  }
  finalNext() {
    const f = this.#inFinal();
    if (f.step === 'wager') {
      for (const u of this.finalists()) f.wagers[u.id] ??= 0;
      f.step = 'clue';
    } else if (f.step === 'clue') {
      f.step = 'judge';
    } else fail('Nothing further');
    this.#changed();
  }
  finalJudge(unitId, ok) {
    const f = this.#inFinal('judge');
    const u = this.finalists().find((x) => x.id === unitId) ?? fail('That player is not in Final Jeopardy');
    if (f.results[u.id] !== undefined) fail('Already judged');
    const w = f.wagers[u.id] ?? 0;
    u.score += ok ? w : -w;
    f.results[u.id] = !!ok;
    if (this.finalists().every((x) => f.results[x.id] !== undefined)) f.step = 'results';
    this.#changed();
  }
  finishFinal() {
    this.#inFinal();
    this.run.final.step = 'results';
    this.#changed();
  }
  finishGame() {
    this.run.status = 'done';
    this.run.clue = null;
    this.#changed();
  }

  // ---------- views ----------
  #unitViews() {
    const connected = (u) =>
      this.mode === 'teams'
        ? this.players.some((p) => p.teamId === u.id && this.connected.has(p.id))
        : this.connected.has(u.id);
    const count = (u) => (this.mode === 'teams' ? this.players.filter((p) => p.teamId === u.id).length : 1);
    return this.units().map((u) => ({
      id: u.id, name: u.name, color: u.color, score: u.score,
      connected: connected(u), members: count(u),
    }));
  }

  /** What the TV and phones may see. Answers appear only once revealed. */
  publicView() {
    const run = this.run;
    const set = this.set;
    const cl = run.clue;
    const view = {
      mode: this.mode, settings: this.settings, status: run.status, view: run.view,
      title: set?.title ?? null, control: run.control,
      categories: set ? set.categories.map((c) => c.name) : [],
      board: set
        ? set.categories.map((cat, c) => cat.clues.map((cl2, r) => ({ value: int(cl2.value), used: run.used.includes(key(c, r)) })))
        : [],
      units: this.#unitViews(),
      teams: this.teams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      clue: null, final: null,
    };
    if (cl) {
      const cell = this.#cell(cl.c, cl.r);
      const showText = cl.step !== 'wager';
      view.clue = {
        c: cl.c, r: cl.r, category: set.categories[cl.c].name, value: cl.value, dd: cl.dd,
        step: cl.step, text: showText ? cell.clue : null,
        answer: cl.step === 'revealed' ? cell.answer : null,
        buzzedBy: cl.buzzedBy, buzzedPlayer: cl.buzzedPlayer, ddUnit: cl.ddUnit, wager: cl.wager,
        lockedOut: cl.lockedOut, correct: cl.correct,
      };
    }
    if (run.final && set) {
      const f = run.final;
      const showClue = f.step !== 'wager';
      const judged = f.step === 'judge' || f.step === 'results';
      view.final = {
        step: f.step, category: set.final.category,
        text: showClue ? set.final.clue : null,
        answer: f.step === 'results' ? set.final.answer : null,
        finalists: this.finalists().map((u) => ({
          id: u.id,
          wagered: f.wagers[u.id] !== undefined,
          answered: !!f.answers[u.id],
          // Wager and answer are shown on the TV only once the host judges that player.
          wager: f.results[u.id] !== undefined ? f.wagers[u.id] : null,
          answer: f.results[u.id] !== undefined ? f.answers[u.id] ?? '' : null,
          result: f.results[u.id] ?? null,
          judged: judged && f.results[u.id] !== undefined,
        })),
      };
    }
    return view;
  }

  /** The host also sees answers, the roster and every final answer. */
  hostView() {
    const view = this.publicView();
    const cl = this.run.clue;
    if (cl) view.clue.answer = this.#cell(cl.c, cl.r).answer;
    if (cl) view.clue.text = this.#cell(cl.c, cl.r).clue;
    if (view.final) {
      const f = this.run.final;
      view.final.answer = this.set.final.answer;
      view.final.text = this.set.final.clue;
      view.final.finalists.forEach((fu) => {
        fu.wager = f.wagers[fu.id] ?? null;
        fu.answer = f.answers[fu.id] ?? null;
      });
    }
    view.players = this.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, teamId: p.teamId, kind: p.kind,
      connected: this.connected.has(p.id),
    }));
    view.dailyDoubles = this.run.dd;
    view.setId = this.setId;
    view.boardCleared = this.boardCleared();
    return view;
  }

  playerView(playerId) {
    const view = this.publicView();
    const p = this.players.find((x) => x.id === playerId);
    view.me = p ? { id: p.id, name: p.name, color: p.color, unitId: this.unitOf(p)?.id ?? null } : null;
    return view;
  }
}

function cryptoToken() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
