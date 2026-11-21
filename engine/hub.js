// The hub: everything that happens when a TV, the host or a player's phone talks to the room, with no idea how the
// messages travel. A "client" is whatever sits at the other end of a connection; the hub only knows its id and calls
// send(clientId, message) to reply. The Node server wires it to WebSockets, the Apple TV app wires it to a hosted
// message relay (Supabase Realtime), and tests wire it to plain functions.
//
// Messages from a client:  { t: 'hello', role: 'tv' | 'host' | 'player', pin?, token? }, { t: 'join', name, color, teamId, kind } or { t: 'join', reclaim: playerId } (an away player's seat),
//                          { t: 'act', action, args } (host), { t: 'rpc', id, op, args } (host), { t: 'ping', lag? }, { t: 'sync', c } (clock sync), and anything else from a joined player
//                          (a buzz, a wager...) goes to the active game.
// Messages to a client:    { t: 'state', view }, { t: 'bad-pin' }, { t: 'need-join' }, { t: 'joined', token },
//                          { t: 'pong' }, { t: 'sync', c, at } (the room's clock), { t: 'who' } (say hello again: the room does not know you, e.g. the TV restarted), { t: 'rpc-reply', id, ok, data | error }, { t: 'error', message }, and whatever reply the game gives a player.
import { GameError } from '../lib.js';

/**
 * room     the Room (room.js)
 * pinOk    (pin) => boolean: is this the host PIN?
 * send     (clientId, message) => void
 * rpc      (op, args) => data, for the host's questions that are not about the room (which sets exist, what is in one)
 * trustedTv (clientId) => boolean: is this the TV itself (not a browser that said it was the TV)? The TV itself may act on the game.
 * onError  (error) => void, for a bug (not a GameError, which is shown to the person who caused it)
 */
export function createHub({ room, pinOk, send, rpc = null, trustedTv = () => false, onError = (e) => console.error(e) }) {
  const clients = new Map(); // id -> { role, playerId }

  const liveCount = (playerId) => [...clients.values()].filter((c) => c.playerId === playerId).length;

  function viewFor(client, cache) {
    if (client.role === 'host') return (cache.host ??= room.hostView());
    const pub = (cache.pub ??= room.publicView());
    return client.role === 'player' ? room.playerView(client.playerId, pub) : pub;
  }
  /** Tells the room how many hosts are connected, so a game can step aside for them (Jeopardy has no captain with a host). */
  const syncHosts = () => room.setHosts?.([...clients.values()].filter((c) => c.role === 'host').length);
  function sendState(id) {
    const client = clients.get(id);
    if (client?.role) send(id, { t: 'state', view: viewFor(client, {}) });
  }
  /** Everyone who has said hello gets the latest view of the room. */
  function broadcast() {
    const cache = {};
    for (const [id, client] of clients) if (client.role) send(id, { t: 'state', view: viewFor(client, cache) });
  }

  function attachPlayer(client, player) {
    client.playerId = player.id;
    room.setConnected(player.id, true);
  }

  function handle(id, client, msg) {
    // A client the room has never heard say hello (the TV page reloaded, or the Apple TV app restarted, and forgot it)
    // is asked to introduce itself again, instead of its taps being dropped without a word.
    // Clock sync: the phone asks the room's time and keeps the answer that came back quickest, so its buzzer turns gold
    // at the same instant as everyone else's and its presses are timed on the room's clock.
    if (msg.t === 'sync') { send(id, { t: 'sync', c: Number(msg.c) || 0, at: room.now() }); return; }
    if (msg.t !== 'hello' && !client.role) { send(id, { t: 'who' }); return; }
    switch (msg.t) {
      case 'hello': {
        if (msg.role === 'tv') client.role = 'tv';
        else if (msg.role === 'host') {
          if (!pinOk(msg.pin)) { send(id, { t: 'bad-pin' }); return; }
          client.role = 'host';
          syncHosts();
        } else if (msg.role === 'player') {
          client.role = 'player';
          const p = room.playerByToken(msg.token);
          if (p) attachPlayer(client, p);
          else send(id, { t: 'need-join' });
        } else return;
        sendState(id);
        return;
      }
      case 'join': {
        if (client.role !== 'player') return;
        const p = msg.reclaim
          ? room.reclaim(String(msg.reclaim))
          : room.join({ name: msg.name, color: msg.color, teamId: msg.teamId, kind: msg.kind === 'buzzer' ? 'buzzer' : 'phone' });
        attachPlayer(client, p);
        send(id, { t: 'joined', token: p.token });
        return;
      }
      case 'act': {
        // The host, or the TV itself (never a client that merely claimed to be the TV).
        if (client.role !== 'host' && !(client.role === 'tv' && trustedTv(id))) return;
        room.act(msg.action, msg.args ?? {});
        return;
      }
      case 'rpc': {
        if (client.role !== 'host' || !rpc) return;
        try { send(id, { t: 'rpc-reply', id: msg.id, ok: true, data: rpc(String(msg.op), msg.args ?? {}) }); }
        catch (e) {
          if (!(e instanceof GameError)) throw e;
          send(id, { t: 'rpc-reply', id: msg.id, ok: false, error: e.message });
        }
        return;
      }
      case 'ping':
        // A phone says how long its messages are taking, so the room knows how long to wait for its buzz.
        if (client.playerId && msg.lag != null) room.noteLag?.(client.playerId, msg.lag);
        send(id, { t: 'pong' });
        return;
      default: {
        // Anything else from a joined player belongs to the active game (a buzz, a wager, ...).
        if (client.role === 'player' && client.playerId) {
          const reply = room.playerMessage(client.playerId, msg);
          if (reply) send(id, reply);
        }
      }
    }
  }

  return {
    /** A new connection. */
    open(id) { clients.set(id, { role: null, playerId: null }); },
    /** The connection went away. A player stays "connected" while another of their connections is open. */
    close(id) {
      const client = clients.get(id);
      clients.delete(id);
      if (client?.role === 'host') syncHosts();
      if (client?.playerId && !liveCount(client.playerId)) room.setConnected(client.playerId, false);
    },
    /** A message arrived from a client. Unknown clients are opened automatically. */
    receive(id, msg) {
      if (!msg || typeof msg !== 'object') return;
      if (!clients.has(id)) clients.set(id, { role: null, playerId: null });
      try { handle(id, clients.get(id), msg); } catch (e) {
        if (e instanceof GameError) send(id, { t: 'error', message: e.message });
        else { onError(e); send(id, { t: 'error', message: 'Something went wrong' }); }
      }
    },
    broadcast,
    sendState,
    clientCount: () => clients.size,
  };
}
