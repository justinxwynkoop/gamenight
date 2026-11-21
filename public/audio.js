// Sound effects for the TV: the recordings in builtin-sounds/ (CC0), with a WebAudio-synthesized stand-in for each. Browsers keep audio locked until the page has had
// a click or key press; the kiosk launch flag in the README (autoplay-policy)
// removes that on a kiosk, and elsewhere the first click or key unlocks it.

let ctx = null;
let master = null;
const cfg = { enabled: true, volume: 0.7 };
const custom = {};  // "name" or "game/name" -> decoded audio the family dropped into data/sounds/ (or data/sounds/<game>/)
let game = null;    // the game being played; its own sounds win over the shared ones
let musicNode = null;
let musicBuf = null;     // what it is playing
let musicOwner = null;   // who started the music, so one screen can't switch off another's
let resolveReady = () => {};

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = cfg.volume * 0.5;
      master.connect(ctx.destination);
    } catch { ctx = null; return null; }
  }
  if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
  return ctx;
}

/** One note: frequency, start offset, length, and optionally a slide to another frequency. */
function tone(freq, at, dur, { type = 'sine', gain = 0.6, to = null } = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Recorded sounds and music that ship with the site (free to use, CC0: see builtin-sounds/<game>/CREDITS.txt), carried
// over from the Buzzworthy game. A family's own file with the same name wins; a sound with no file is synthesized below.
// "shared" files serve every game (and the main menu): the theme loops in every lobby.
const BUILTIN = {
  jeopardy: ['open', 'buzz', 'correct', 'wrong', 'timeup', 'reveal', 'dd', 'final', 'fanfare', 'roundstart', 'think',
    'pick', 'board', 'lock', 'bet', 'join', 'applause'],
  shared: ['lobby'],
  // Spy Night's own: original, made by tv-app/Tools/make_spynight_sounds.py (CC0, see builtin-sounds/spynight/CREDITS.txt).
  spynight: ['lobby', 'roundstart', 'pick', 'open', 'correct', 'wrong', 'lock', 'ding', 'strike', 'fanfare', 'winner', 'join'],
};

/** Fetch and decode the family's files in data/sounds/ (server mode), then the built-in recordings for any name still missing. */
async function loadCustom() {
  const c = ensure();
  if (!c) return;
  let list = [];
  // Online there is no server with the family's own files.
  if (!globalThis.GN_RELAY) { try { list = await (await fetch('/api/sounds')).json(); } catch { list = []; } }
  const theirs = new Set(list.map(({ name, game: owner }) => (owner ? `${owner}/${name}` : name)));
  for (const [owner, names] of Object.entries(BUILTIN)) {
    for (const name of names) {
      const shared = owner === 'shared';
      if (theirs.has(name) || (!shared && theirs.has(`${owner}/${name}`))) continue;
      list.push({ name, url: `/builtin-sounds/${owner}/${name}.mp3`, game: shared ? null : owner });
    }
  }
  await Promise.all(list.map(async ({ name, url, game: owner }) => {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      custom[owner ? `${owner}/${name}` : name] = await new Promise((ok, no) => c.decodeAudioData(data, ok, no));
    } catch { /* a file the browser can't decode: keep the built-in sound */ }
  }));
}
// Recordings play louder than the synthesized notes: the master gain (volume x 0.5) leaves the synth headroom for
// notes that overlap, but a recording is already mixed, and at half volume the effects got lost under a room of talk.
const FILE_GAIN = 2;     // effects: the host's volume itself
const MUSIC_GAIN = 1.2;  // music sits a little under the effects
function playBuffer(buf, loop = false, gain = FILE_GAIN) {
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = loop;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
  return src;
}

// A sound with no file of its own borrows another's if the family provided one (the third strike and a Fast Money zero use the strike buzzer).
const ALIAS = { strikeout: 'strike', zero: 'strike' };

/**
 * The file for the first of these names that has one, from this game's own folder or else the shared one. The names
 * come first: the shared "lobby" theme wins over a game's own "think" (its stand-in), or Jeopardy's lobby would play
 * the Final Jeopardy music.
 */
function findCustom(...names) {
  for (const n of names) {
    if (game && custom[`${game}/${n}`]) return custom[`${game}/${n}`];
    if (custom[n]) return custom[n];
  }
  return null;
}

const SOUNDS = {
  open: () => tone(880, 0, 0.09, { type: 'triangle', gain: 0.4 }),
  buzz: () => { tone(1046, 0, 0.14); tone(1568, 0.09, 0.3); },
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, i === 3 ? 0.45 : 0.14, { type: 'triangle' })),
  wrong: () => tone(160, 0, 0.55, { type: 'square', gain: 0.35, to: 95 }),
  timeup: () => { tone(330, 0, 0.7, { type: 'sawtooth', gain: 0.4, to: 220 }); tone(247, 0.02, 0.7, { type: 'square', gain: 0.25, to: 165 }); },
  tick: () => tone(1250, 0, 0.035, { type: 'square', gain: 0.18 }),
  reveal: () => { tone(523, 0, 0.12, { type: 'triangle', gain: 0.4 }); tone(392, 0.11, 0.25, { type: 'triangle', gain: 0.4 }); },
  dd: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, i === 4 ? 0.7 : 0.16, { type: 'triangle' })),
  final: () => { tone(196, 0, 0.9, { type: 'triangle' }); tone(294, 0.05, 0.9, { type: 'triangle', gain: 0.4 }); },
  // Family Feud: a bright bell for a revealed answer, a harsh buzzer for a strike, and game-show stings.
  ding: () => { tone(1318, 0, 0.9, { type: 'sine', gain: 0.42 }); tone(1976, 0, 0.9, { type: 'sine', gain: 0.22 }); tone(2637, 0, 0.7, { type: 'sine', gain: 0.12 }); tone(660, 0, 0.08, { type: 'triangle', gain: 0.3 }); },
  strike: () => { tone(110, 0, 0.8, { type: 'sawtooth', gain: 0.45 }); tone(116, 0, 0.8, { type: 'sawtooth', gain: 0.35 }); tone(55, 0, 0.8, { type: 'square', gain: 0.2 }); },
  strikeout: () => { SOUNDS.strike(); tone(220, 0.85, 0.2, { type: 'sawtooth', gain: 0.3 }); tone(294, 1.05, 0.2, { type: 'sawtooth', gain: 0.3 }); tone(392, 1.25, 0.5, { type: 'sawtooth', gain: 0.35, to: 440 }); },
  fmpoints: () => { tone(1568, 0, 0.18, { type: 'triangle', gain: 0.4 }); tone(2093, 0.1, 0.55, { type: 'triangle', gain: 0.4 }); tone(3136, 0.1, 0.4, { type: 'sine', gain: 0.12 }); },
  fastmoney: () => { [[392, 0], [523, 0.15], [659, 0.3], [784, 0.45]].forEach(([f, at]) => tone(f, at, 0.14, { type: 'triangle', gain: 0.45 })); tone(1047, 0.62, 0.8, { type: 'triangle', gain: 0.4 }); tone(784, 0.62, 0.8, { type: 'triangle', gain: 0.3 }); tone(659, 0.62, 0.8, { type: 'triangle', gain: 0.25 }); },
  faceoff: () => { tone(784, 0, 0.08, { type: 'square', gain: 0.35 }); tone(1568, 0.07, 0.35, { type: 'triangle', gain: 0.4 }); },
  roundstart: () => { [[523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.12]].forEach(([f, at, d]) => tone(f, at, d, { type: 'triangle', gain: 0.45 })); tone(1047, 0.33, 0.6, { type: 'triangle', gain: 0.45 }); tone(784, 0.33, 0.6, { type: 'triangle', gain: 0.3 }); tone(659, 0.33, 0.6, { type: 'triangle', gain: 0.25 }); },
  winner: () => { [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.14], [1047, 0.42, 0.3], [784, 0.76, 0.14], [1047, 0.9, 0.14]].forEach(([f, at, d]) => tone(f, at, d, { type: 'triangle', gain: 0.45 })); tone(1047, 1.06, 0.9, { type: 'triangle', gain: 0.4 }); tone(784, 1.06, 0.9, { type: 'triangle', gain: 0.3 }); tone(659, 1.06, 0.9, { type: 'triangle', gain: 0.25 }); },
  zero: () => { [[392, 0], [370, 0.2], [349, 0.4]].forEach(([f, at]) => tone(f, at, 0.22, { type: 'triangle', gain: 0.4 })); tone(294, 0.6, 0.5, { type: 'triangle', gain: 0.4, to: 233 }); },
  fanfare: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, i === 6 ? 0.8 : 0.16, { type: 'triangle' })),
  // Jeopardy: a clue is picked, the board fills, a wager or Final answer locks in, a Daily Double bet, a player joins,
  // and the end of a round. Each has a recording; these are the stand-ins if it can't be decoded.
  pick: () => { tone(1046, 0, 0.08, { type: 'triangle', gain: 0.4 }); tone(1318, 0.06, 0.16, { type: 'triangle', gain: 0.35 }); },
  board: () => [523, 587, 659, 698, 784, 880].forEach((f, i) => tone(f, i * 0.07, 0.08, { type: 'triangle', gain: 0.3 })),
  lock: () => { tone(660, 0, 0.06, { type: 'square', gain: 0.2 }); tone(990, 0.05, 0.12, { type: 'triangle', gain: 0.35 }); },
  bet: () => { tone(1976, 0, 0.25, { gain: 0.3 }); tone(2637, 0.08, 0.4, { gain: 0.25 }); },
  join: () => { tone(784, 0, 0.08, { gain: 0.4, to: 1175 }); tone(1175, 0.08, 0.18, { gain: 0.3 }); },
  applause: () => { tone(523, 0, 0.9, { type: 'triangle', gain: 0.3 }); tone(659, 0.05, 0.85, { type: 'triangle', gain: 0.25 }); tone(784, 0.1, 0.8, { type: 'triangle', gain: 0.25 }); },
};

export const audio = {
  loaded: false,
  /** Resolves once the files in data/sounds/ have been fetched and decoded (or there are none). */
  ready: new Promise((ok) => { resolveReady = ok; }),
  /** Which game is on screen, so its own folder of sounds is used. */
  setGame(id) { game = id ?? null; },
  /** Apply the host's room settings: { sound: boolean, volume: 0-100 }. */
  configure(s = {}) {
    if (typeof s.sound === 'boolean') { cfg.enabled = s.sound; if (!s.sound) audio.stopMusic(); }
    if (typeof s.volume === 'number') { cfg.volume = Math.min(1, Math.max(0, s.volume / 100)); if (master) master.gain.value = cfg.volume * 0.5; }
  },
  /** Create the audio context early so a kiosk with autoplay allowed is ready for the first sound. */
  init() { if (ensure() && !audio.loaded) { audio.loaded = true; loadCustom().catch(() => {}).finally(() => resolveReady()); } },
  /** True while the browser is still holding audio back (waiting for a click or key press). */
  get blocked() { return !!ctx && ctx.state !== 'running'; },
  get enabled() { return cfg.enabled; },
  /** The host's volume (0 to 1), or 0 with the sound off: for a clue's sound or video. */
  get level() { return cfg.enabled ? cfg.volume : 0; },
  play(name) {
    if (!cfg.enabled || cfg.volume <= 0) return;
    const c = ensure();
    if (!c || c.state !== 'running') return; // never queue sounds that would fire late, all at once, when audio unlocks
    const buf = findCustom(name) ?? (ALIAS[name] ? findCustom(ALIAS[name]) : null);
    if (buf) playBuffer(buf); else SOUNDS[name]?.();
  },
  /**
   * Music for a stretch of the game. Only plays if a file with this name (or the fallback name) was provided.
   * `owner` tags who started it; `loop` keeps it going until stopped. Returns whether it started.
   */
  music(name, { owner = null, loop = false, fallback = null } = {}) {
    const buf = findCustom(name, ...[].concat(fallback ?? []));
    if (!cfg.enabled || cfg.volume <= 0 || !buf) return false;
    const c = ensure();
    if (!c || c.state !== 'running') return false;
    audio.stopMusic();
    const node = playBuffer(buf, loop, MUSIC_GAIN);
    musicNode = node; musicOwner = owner; musicBuf = buf;
    node.onended = () => { if (musicNode === node) { musicNode = null; musicOwner = null; } };
    return true;
  },
  /** Stop the music. With an owner, only if that owner started it. */
  stopMusic(owner) {
    if (owner && musicOwner !== owner) return;
    try { musicNode?.stop(); } catch { /* already stopped */ }
    musicNode = null; musicOwner = null; musicBuf = null;
  },
  /**
   * True when the music playing is a stand-in and this tune has since loaded: the long theme decodes after the short
   * "think" track, so a lobby opened in the first seconds started on the stand-in and would otherwise keep it.
   */
  upgrade(name) { const want = findCustom(name); return !!want && !!musicNode && musicBuf !== want; },
  get musicOwner() { return musicOwner; },
  get musicPlaying() { return !!musicNode; },
  /**
   * Read text out loud with the browser's own voice, at the host's volume. `done` is called once the voice finishes
   * (or, if the browser refuses to speak, once a person would have read it). Returns false, and never calls `done`,
   * when nothing can be said at all (sound off, or no voice in this browser).
   */
  speak(text, done = () => {}) {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined' || !cfg.enabled || cfg.volume <= 0 || !text) return false;
    let called = false;
    const started = Date.now();
    const readTime = 1500 + String(text).length * 55;
    const finish = () => { if (!called) { called = true; done(); } };
    const later = () => setTimeout(finish, Math.max(0, readTime - (Date.now() - started)));
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/_{2,}/g, 'blank'));
      u.volume = Math.min(1, cfg.volume * 1.2);
      const voices = synth.getVoices();
      u.voice = voices.find((v) => /en[-_]US/i.test(v.lang) && /natural|enhanced|premium|google/i.test(v.name))
        ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
      u.onend = finish;
      u.onerror = later;            // e.g. not allowed before a click: give people the time to read it themselves
      synth.speak(u);
      setTimeout(finish, 3000 + String(text).length * 90);   // a voice that never ends
      return true;
    } catch { later(); return true; }
  },
  stopSpeaking() { try { globalThis.speechSynthesis?.cancel(); } catch { /* nothing to stop */ } },
};
