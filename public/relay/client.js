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
      if (payload.t === 'state') onState(payload.view);
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
    send(msg) { if (!ready) return false; say(msg); return true; },
    act(action, args = {}) { if (ready) say({ t: 'act', action, args }); },
    close() { closed = true; clearTimer(timer); rt.close(); },
  };
}
