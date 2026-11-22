// The phone's side of the online relay: the same connection the pages get from common.js connect(), but carried by
// Supabase Realtime instead of a WebSocket to a home server (see engine/relay.js for the channels).
import { Realtime } from './phoenix.js';

export const ROOM_CODE = /^[A-Z0-9]{4}$/;
/** A room code as typed: four digits (or letters, which older rooms used). */
export const cleanCode = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

/**
 * config   { url, key }: the Supabase project and its publishable key
 * room     the 4-digit room code
 * clientId this browser tab's id (unique per tab)
 * hello    the hello message (or a function that makes it) to say whenever the link is (re)made
 */
export function connectRelay({
  config, room, clientId, hello, onState, onMessage = () => {}, onStatus = () => {},
  WebSocketImpl, setTimer = setTimeout, clearTimer = clearTimeout, pingMs = 4000, quietMs = 20000, now = () => Date.now(),
  hires = () => globalThis.performance?.now?.() ?? Date.now(),
}) {
  const toTv = `gn:${room}`;
  const mine = `gn:${room}:${clientId}`;
  const asking = new Map(); let nextAsk = 1;
  let lastN = null;   // the number of the last view that arrived (the TV numbers them), said with each ping
  let lastHeard = 0; let connected = false; let ready = false; let closed = false; let timer = null;

  const setConnected = (value) => { if (connected !== value) { connected = value; onStatus(value); } };
  let lastSaid = null;   // the last tap, said again if the TV turns out to have forgotten us
  const say = (msg) => { if (msg.t !== 'ping' && msg.t !== 'hello' && msg.t !== 'sync') lastSaid = { msg, at: now() }; rt.send(toTv, 'm', { c: clientId, m: msg }); };
  const clock = createClockSync({ hires, probe: (c) => { if (ready) say({ t: 'sync', c }); }, setTimer });
  const sayHello = () => say(typeof hello === 'function' ? hello() : hello);

  const rt = new Realtime({
    url: config.url, key: config.key, WebSocketImpl, setTimer, clearTimer,
    onStatus(up) { if (!up) { ready = false; setConnected(false); } },
    // (Re)joined: say hello, and set the clock again (after a reconnect the old answers may no longer hold).
    onJoined(topic) { if (topic === mine) { ready = true; sayHello(); clock.restart(); } },
    onBroadcast(topic, event, payload) {
      if (topic !== mine || event !== 'm' || !payload) return;
      lastHeard = now();
      setConnected(true);
      if (payload.t === 'rpc-reply') { const q = asking.get(payload.id); if (q) { asking.delete(payload.id); q(payload); } }
      else if (payload.t === 'state') {
        // A view sent again (ours was lost, or arrived late) that we already have changes nothing.
        if (payload.n != null && payload.n === lastN) return;
        if (payload.n != null) lastN = payload.n;
        onState(payload.view);
      }
      else if (payload.t === 'sync') clock.answer(payload);
      else if (payload.t === 'who') {
        // The TV restarted and forgot us: introduce ourselves again, then repeat a tap it just dropped. Its clock
        // started again too.
        sayHello();
        clock.restart();
        if (lastSaid && now() - lastSaid.at < 3000) { const again = lastSaid.msg; lastSaid = null; say(again); }
      }
      else if (payload.t !== 'pong') onMessage(payload);
    },
  });

  // Phones ping now and then: the TV drops a client that goes quiet, and hello again if the TV has forgotten us.
  const beat = () => {
    if (closed) return;
    if (ready) {
      if (connected && now() - lastHeard > quietMs) setConnected(false);
      // The ping says which view arrived last, so the TV can send the newest again if it was lost on the way.
      if (!connected) sayHello(); else say({ t: 'ping', n: lastN, ...(clock.lag() != null ? { lag: Math.round(clock.lag()) } : {}) });
      clock.probeNow();
    }
    timer = setTimer(beat, pingMs);
  };

  rt.join(mine);
  rt.join(toTv);
  rt.connect();
  timer = setTimer(beat, pingMs);

  // A phone that comes back to the front checks its link at once (a socket that slept may be dead without knowing),
  // and sets its clock again (a sleeping phone's clock may have paused).
  const onVisible = () => {
    if (globalThis.document?.visibilityState !== 'visible' || closed) return;
    rt.checkNow();
    if (ready) { sayHello(); clock.restart(); }
  };
  globalThis.document?.addEventListener?.('visibilitychange', onVisible);
  globalThis.addEventListener?.('online', onVisible);

  return {
    /** Where the connection has got to, in plain words (for the "waiting" screen). */
    status() {
      if (rt.lastIssue && !ready) return `Supabase: ${rt.lastIssue}`;
      if (!rt.up) return 'Connecting to the online relay…';
      if (!connected) return 'Connected to the relay. The TV has not answered yet.';
      return 'Connected to the TV.';
    },
    send(msg) { if (!ready) return false; say(msg); return true; },
    /** The room's clock, kept in step: { now(), toLocal(roomTime), synced(), lag() }. */
    clock,
    act(action, args = {}) { if (ready) say({ t: 'act', action, args }); },
    /** Ask the room something that is not an action (host only). Resolves with { ok, data | error }. */
    rpc(op, args = {}) {
      return new Promise((resolve) => {
        const id = nextAsk++;
        asking.set(id, resolve);
        setTimer(() => { if (asking.delete(id)) resolve({ ok: false, error: 'The TV did not answer' }); }, 8000);
        if (!ready) { asking.delete(id); resolve({ ok: false, error: 'Not connected' }); return; }
        say({ t: 'rpc', id, op, args });
      });
    },
    close() { closed = true; clearTimer(timer); clock.stop(); globalThis.document?.removeEventListener?.('visibilitychange', onVisible); globalThis.removeEventListener?.('online', onVisible); rt.close(); },
  };
}

/**
 * Keeps this device's clock in step with the room's (the TV's), the way network time does: ask the time, note when
 * the question went and the answer came back, and assume the answer was given halfway. The answer that came back
 * quickest is the most exact, so the best of the recent ones is used. A handful of quick questions on (re)connecting,
 * then one with each ping.
 *
 *   hires()      this device's clock in ms (performance.now(): smooth, never jumps)
 *   probe(c)     ask the room the time, sending c (the room answers { t: 'sync', c, at })
 */
export function createClockSync({ hires, probe, setTimer = setTimeout, keep = 12, burst = [0, 120, 260, 420, 650, 1000, 1600] }) {
  let samples = [];        // { offset, rtt }
  let best = null;
  let gen = 0;
  const recent = [];       // the last few round trips, for how long a message usually takes
  const pick = () => { best = samples.reduce((b, x) => (!b || x.rtt < b.rtt ? x : b), null); };
  const clock = {
    /** Throw away what we knew and ask again, quickly (after connecting, a TV restart, or the phone waking up). */
    restart() {
      samples = []; best = null; recent.length = 0;
      const g = ++gen;
      for (const ms of burst) setTimer(() => { if (g === gen) probe(hires()); }, ms);
    },
    probeNow() { probe(hires()); },
    stop() { gen++; },
    /** An answer from the room. */
    answer({ c, at }) {
      const back = hires();
      const sent = Number(c); const roomAt = Number(at);
      if (!Number.isFinite(sent) || !Number.isFinite(roomAt)) return;
      const rtt = back - sent;
      if (rtt < 0 || rtt > 5000) return;
      samples.push({ offset: roomAt - (sent + back) / 2, rtt });
      if (samples.length > keep) samples.shift();
      recent.push(rtt); if (recent.length > 5) recent.shift();
      pick();
    },
    synced: () => best != null,
    /** How far the room's clock is ahead of this one (ms), or null before the first answer. */
    offset: () => best?.offset ?? null,
    /** How sure we are: half the quickest round trip (the most the offset can be out by), or null. */
    error: () => (best ? best.rtt / 2 : null),
    /** How long a message from here usually takes to reach the room (half a typical round trip), or null. */
    lag: () => (recent.length ? recent.slice().sort((a, b) => a - b)[Math.floor(recent.length / 2)] / 2 : null),
    /** The room's time now, or null before the first answer. */
    now: () => (best ? hires() + best.offset : null),
    /** When a moment on the room's clock happens on this device's clock, or null before the first answer. */
    toLocal: (roomTime) => (best ? roomTime - best.offset : null),
  };
  return clock;
}
