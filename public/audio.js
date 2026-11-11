// Sound effects for the TV, synthesized with WebAudio, so there are no audio
// files to ship or license. Browsers keep audio locked until the page has had
// a click or key press; the kiosk launch flag in the README (autoplay-policy)
// removes that on the Pi, and elsewhere the first click or key unlocks it.

let ctx = null;
let master = null;
const cfg = { enabled: true, volume: 0.7 };
const custom = {};  // name -> decoded audio the family dropped into data/sounds/
let musicNode = null;
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

/** Fetch and decode any files in data/sounds/. They replace the built-in sound of the same name. */
async function loadCustom() {
  const c = ensure();
  if (!c) return;
  const list = await (await fetch('/api/sounds')).json();
  await Promise.all(list.map(async ({ name, url }) => {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      custom[name] = await new Promise((ok, no) => c.decodeAudioData(data, ok, no));
    } catch { /* a file the browser can't decode: keep the built-in sound */ }
  }));
}
function playBuffer(buf, loop = false) {
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = loop;
  src.connect(master);
  src.start();
  return src;
}

// A sound with no file of its own borrows another's if the family provided one (the third strike and a Fast Money zero use the strike buzzer).
const ALIAS = { strikeout: 'strike', zero: 'strike' };

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
};

export const audio = {
  loaded: false,
  /** Resolves once the files in data/sounds/ have been fetched and decoded (or there are none). */
  ready: new Promise((ok) => { resolveReady = ok; }),
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
  play(name) {
    if (!cfg.enabled || cfg.volume <= 0) return;
    const c = ensure();
    if (!c || c.state !== 'running') return; // never queue sounds that would fire late, all at once, when audio unlocks
    const buf = custom[name] ?? custom[ALIAS[name]];
    if (buf) playBuffer(buf); else SOUNDS[name]?.();
  },
  /**
   * Music for a stretch of the game. Only plays if a file with this name (or the fallback name) was provided.
   * `owner` tags who started it; `loop` keeps it going until stopped. Returns whether it started.
   */
  music(name, { owner = null, loop = false, fallback = null } = {}) {
    const buf = [name, ...[].concat(fallback ?? [])].map((n) => custom[n]).find(Boolean);
    if (!cfg.enabled || cfg.volume <= 0 || !buf) return false;
    const c = ensure();
    if (!c || c.state !== 'running') return false;
    audio.stopMusic();
    const node = playBuffer(buf, loop);
    musicNode = node; musicOwner = owner;
    node.onended = () => { if (musicNode === node) { musicNode = null; musicOwner = null; } };
    return true;
  },
  /** Stop the music. With an owner, only if that owner started it. */
  stopMusic(owner) {
    if (owner && musicOwner !== owner) return;
    try { musicNode?.stop(); } catch { /* already stopped */ }
    musicNode = null; musicOwner = null;
  },
  get musicOwner() { return musicOwner; },
  get musicPlaying() { return !!musicNode; },
};
