// The room's side of the online relay (Supabase Realtime broadcast), with no idea of the transport itself.
//
// Channels (one room = a 4-letter code):
//   gn:<CODE>         phones and the host send here, the TV listens.   event "m", payload { c: <clientId>, m: <message> }
//   gn:<CODE>:<id>    the TV sends to one client here, that client listens.   event "m", payload <message>
// The room code is the only thing that finds the room, and the host PIN still guards every host action, so this is
// meant for a family game night, not secrets. A client that goes quiet for a while is dropped (its player shows as
// away until it comes back with its token).
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O: easy to read off a TV
export const CLIENT_ID = /^[A-Za-z0-9_-]{6,40}$/;

export function newRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return code;
}

/**
 * engine      from createEngine
 * code        the room code
 * broadcast   (topic, event, payload) => void, put a message on the relay
 * now         () => milliseconds
 * quietMs     how long a client may be silent before it is dropped (phones ping every 8 seconds)
 */
export function createRelayHost({ engine, code, broadcast, now, quietMs = 25_000 }) {
  const seen = new Map();      // clientId -> last time we heard from it
  const lastSent = new Map();  // clientId -> the last text we sent it (a view that has not changed is not sent again)

  const topic = `gn:${code}`;

  function toClient(id, message) {
    const text = JSON.stringify(message);
    if (message?.t === 'state') { if (lastSent.get(id) === text) return; lastSent.set(id, text); }
    broadcast(`${topic}:${id}`, 'm', message);
  }

  return {
    topic,
    /** What the engine says to a client other than the TV itself. */
    send: toClient,
    /** Something arrived on the room channel. */
    onBroadcast(channel, event, payload) {
      if (channel !== topic || event !== 'm' || !payload || typeof payload !== 'object') return;
      const id = payload.c;
      if (typeof id !== 'string' || !CLIENT_ID.test(id) || id === 'tv' || typeof payload.m !== 'object' || payload.m === null) return;
      if (!seen.has(id)) engine.open(id);
      seen.set(id, now());
      if (payload.m.t === 'hello') lastSent.delete(id);   // a client that says hello wants the full view again
      engine.receive(id, payload.m);
    },
    /** Drop clients that have gone quiet. Call a few times a second along with engine.tick(). */
    sweep() {
      const t = now();
      for (const [id, at] of seen) {
        if (t - at > quietMs) { seen.delete(id); lastSent.delete(id); engine.close(id); }
      }
    },
    /** Did this client arrive through the relay (so replies go back through it)? */
    knows: (id) => seen.has(id),
    clients: () => seen.size,
  };
}
