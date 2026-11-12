// The phone's side of the online relay: the same connection the pages get from common.js connect(), but carried by
// Supabase Realtime instead of a WebSocket to the Pi (see engine/relay.js for the channels).
import { Realtime } from './phoenix.js';

export const ROOM_CODE = /^[A-Z]{4}$/;
export const cleanCode = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

/**
 * config   { url, key }: the Supabase project and its publishable key
 * room     the 4-letter room code
 * clientId this browser tab's id (unique per tab)
 * hello    the hello message (or a function that makes it) to say whenever the link is (re)made
 */
export function connectRelay({
  config, room, clientId, hello, onState, onMessage = () => {}, onStatus = () => {},
  WebSocketImpl, setTimer = setTimeout, clearTimer = clearTimeout, pingMs = 8000, quietMs = 20000, now = () => Date.now(),
}) {
  const toTv = `gn:${room}`;
  const mine = `gn:${room}:${clientId}`;
  const asking = new Map(); let nextAsk = 1;
  let lastHeard = 0; let connected = false; let ready = false; let closed = false; let timer = null;

  const setConnected = (value) => { if (connected !== value) { connected = value; onStatus(value); } };
  const say = (msg) => rt.send(toTv, 'm', { c: clientId, m: msg });
  const sayHello = () => say(typeof hello === 'function' ? hello() : hello);

  const rt = new Realtime({
    url: config.url, key: config.key, WebSocketImpl, setTimer, clearTimer,
    onStatus(up) { if (!up) { ready = false; setConnected(false); } },
    onJoined(topic) { if (topic === mine) { ready = true; sayHello(); } },
    onBroadcast(topic, event, payload) {
      if (topic !== mine || event !== 'm' || !payload) return;
      lastHeard = now();
      setConnected(true);
      if (payload.t === 'rpc-reply') { const q = asking.get(payload.id); if (q) { asking.delete(payload.id); q(payload); } }
      else if (payload.t === 'state') onState(payload.view);
      else if (payload.t !== 'pong') onMessage(payload);
    },
  });

  // Phones ping now and then: the TV drops a client that goes quiet, and hello again if the TV has forgotten us.
  const beat = () => {
    if (closed) return;
    if (ready) {
      if (connected && now() - lastHeard > quietMs) setConnected(false);
      if (!connected) sayHello(); else say({ t: 'ping' });
    }
    timer = setTimer(beat, pingMs);
  };

  rt.join(mine);
  rt.join(toTv);
  rt.connect();
  timer = setTimer(beat, pingMs);

  return {
    /** Where the connection has got to, in plain words (for the "waiting" screen). */
    status() {
      if (rt.lastIssue && !ready) return `Supabase: ${rt.lastIssue}`;
      if (!rt.up) return 'Connecting to the online relay…';
      if (!connected) return 'Connected to the relay. The TV has not answered yet.';
      return 'Connected to the TV.';
    },
    send(msg) { if (!ready) return false; say(msg); return true; },
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
    close() { closed = true; clearTimer(timer); rt.close(); },
  };
}
