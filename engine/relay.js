// The room's side of the online relay (Supabase Realtime broadcast), with no idea of the transport itself.
//
// Channels (one room = a 4-digit code):
//   gn:<CODE>         phones and the host send here, the TV listens.   event "m", payload { c: <clientId>, m: <message> }
//   gn:<CODE>:<id>    the TV sends to one client here, that client listens.   event "m", payload <message>
// The room code is the only thing that finds the room, and the host PIN still guards every host action, so this is
// meant for a family game night, not secrets. A client that goes quiet for a while is dropped (its player shows as
// away until it comes back with its token).
export const CODE_CHARS = '0123456789';   // four digits: easy to read off a TV and to type on a phone's number pad
export const CLIENT_ID = /^[A-Za-z0-9_-]{6,40}$/;

export function newRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return code;
}

/**
 * engine      from createEngine
 * code        the room code
 * broadcast   (topic, event, payload) => void, put a message on the relay
 * now         () => milliseconds
 * quietMs     how long a client may be silent before it is dropped (phones ping every 4 seconds)
 */
export function createRelayHost({ engine, code, broadcast, now, quietMs = 25_000 }) {
  const seen = new Map();      // clientId -> last time we heard from it
  const lastSent = new Map();  // clientId -> the last view we sent it, as text (a view that has not changed is not sent again)
  const sentNo = new Map();    // clientId -> the number of that view (each new one counts up)
  const lastMsg = new Map();   // clientId -> that state message, to send again if it never arrived

  const topic = `gn:${code}`;
  // View numbers start with a mark of this TV run, so a phone never mistakes a restarted TV's first views for ones it has.
  const run = Math.floor(Math.random() * 36 ** 4).toString(36);

  // A broadcast can be lost on the way (Supabase Realtime does not promise delivery), and a view that has not changed
  // is not sent again, so a lost one would leave that phone (or the host page) on an old screen: the buzzers still
  // shut, or the host with no Correct / Wrong. Each view carries a number, every ping says the last number that
  // arrived, and a phone that is behind gets the latest view again at once.
  function toClient(id, message) {
    if (message?.t === 'state') {
      const text = JSON.stringify(message.view);
      if (lastSent.get(id) === text) return;
      lastSent.set(id, text);
      const n = `${run}.${(Number(String(sentNo.get(id) ?? '').split('.')[1]) || 0) + 1}`;
      sentNo.set(id, n);
      message = { ...message, n };
      lastMsg.set(id, message);
    }
    broadcast(`${topic}:${id}`, 'm', message);
  }
  function forget(id) { lastSent.delete(id); lastMsg.delete(id); }

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
      if (payload.m.t === 'hello') forget(id);   // a client that says hello wants the full view again
      // A ping that says an older view (or none) arrived last: the newest one was lost on the way, so send it again.
      if (payload.m.t === 'ping' && 'n' in payload.m && lastMsg.has(id) && payload.m.n !== sentNo.get(id)) broadcast(`${topic}:${id}`, 'm', lastMsg.get(id));
      engine.receive(id, payload.m);
    },
    /** Drop clients that have gone quiet. Call a few times a second along with engine.tick(). */
    sweep() {
      const t = now();
      for (const [id, at] of seen) {
        if (t - at > quietMs) { seen.delete(id); forget(id); engine.close(id); }
      }
    },
    /** Did this client arrive through the relay (so replies go back through it)? */
    knows: (id) => seen.has(id),
    clients: () => seen.size,
  };
}
