// The engine: a Room, a hub and the games, wired to a handful of plain functions so that it runs anywhere there is a
// JavaScript engine: Node (tests), or JavaScriptCore inside the Apple TV app. It touches no files, sockets or timers
// of its own; whoever hosts it passes those in.
//
//   const engine = createEngine({ games, pin, now, send, save, saved, content });
//   engine.open(id) / engine.close(id) / engine.receive(id, message)   clients (the TV itself is just client "tv")
//   engine.tick()                                                        call about four times a second
//   engine.putSet(gameId, id, set) / engine.removeSet(gameId, id)        question sets (kept by whoever hosts the engine)
//
// send(clientId, message)   deliver a message to a client
// save(json)                the room changed; keep this text so a restart can pick up where it left off (debounce it)
// saved                     the text save() last gave (or null)
import { Room } from '../room.js';
import { createHub } from './hub.js';
import { createRelayHost, newRoomCode } from './relay.js';
import { GameError } from '../lib.js';

const SET_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;

export function createEngine({ games, pin, now, send, save = () => {}, saved = null, content = {}, userSets = {}, onSetsChanged = () => {}, onError, code = newRoomCode(), broadcast = null }) {
  // sets[gameId][setId] = set: the sets that came with the app, then what the family saved or deleted (userSets,
  // { game: { id: set | null } }, where null means deleted). onSetsChanged(changes) gets the family's changes to keep.
  const sets = {};
  for (const [gameId, byId] of Object.entries(content)) sets[gameId] = { ...byId };
  const changes = {};
  for (const [gameId, byId] of Object.entries(userSets)) {
    for (const [id, set] of Object.entries(byId ?? {})) {
      if (!games[gameId] || !SET_ID.test(id)) continue;
      (changes[gameId] ??= {})[id] = set;
      if (set) (sets[gameId] ??= {})[id] = set; else delete sets[gameId]?.[id];
    }
  }

  let queued = false;
  const room = new Room({
    games,
    ...(now ? { now } : {}),
    loadContent: (gameId, id) => sets[gameId]?.[id] ?? null,
    listContent: (gameId) => Object.entries(sets[gameId] ?? {})
      .map(([id, s]) => ({ id, title: s?.title ?? id })).sort((a, b) => a.title.localeCompare(b.title)),
    onChange() {
      if (queued) return;
      queued = true;
      Promise.resolve().then(() => {
        queued = false;
        hub.broadcast();
        try { save(JSON.stringify(room)); } catch (e) { onError?.(e); }
      });
    },
  });
  if (saved) { try { room.restore(JSON.parse(saved)); } catch { /* start fresh */ } }
  if (!room.gameId && Object.keys(games).length === 1) room.chooseGame(Object.keys(games)[0]);

  const pinOk = (given) => String(given ?? '') === String(pin);
  // The TV's own display is client "tv" and is served directly; clients that arrived over the relay are answered through it.
  const clock = now ?? (() => room.now());
  let relay = null;
  // What the host page asks for besides room actions (the Pi answers these over HTTP; here they go through the hub).
  const rpc = (op, args) => {
    switch (op) {
      case 'listSets': return games[args.game] ? room.listContent(args.game) : [];
      case 'getSet': {
        const set = games[args.game] && sets[args.game]?.[args.id];
        if (!set) throw new GameError('No such set');
        return set;
      }
      case 'games': return Object.values(games).map((g) => ({ id: g.id, name: g.name, description: g.description }));
      case 'putSet': {
        const game = games[args.game] ?? (() => { throw new GameError('No such game'); })();
        if (!SET_ID.test(String(args.id))) throw new GameError('Set id must be lowercase letters, numbers and dashes');
        game.validateContent(args.doc);
        (sets[args.game] ??= {})[args.id] = args.doc;
        (changes[args.game] ??= {})[args.id] = args.doc;
        room.contentChanged?.(args.game, args.id);
        onSetsChanged(changes);
        return { ok: true };
      }
      case 'deleteSet': {
        if (!games[args.game]) throw new GameError('No such game');
        if (!SET_ID.test(String(args.id))) throw new GameError('Set id must be lowercase letters, numbers and dashes');
        if (room.gameId === args.game && room.inProgress() && room.game?.usesContent?.(args.id)) throw new GameError('That set is in play');
        delete sets[args.game]?.[args.id];
        (changes[args.game] ??= {})[args.id] = null;
        room.contentChanged?.(args.game, args.id);
        onSetsChanged(changes);
        return { ok: true };
      }
      default: throw new GameError('Not available here');
    }
  };
  const hub = createHub({
    room, pinOk, rpc, ...(onError ? { onError } : {}),
    send: (id, message) => { if (relay?.knows(id)) relay.send(id, message); else send(id, message); },
  });
  if (broadcast) relay = createRelayHost({ engine: { open: (id) => hub.open(id), close: (id) => hub.close(id), receive: (id, m) => hub.receive(id, m) }, code, broadcast, now: clock });

  return {
    room,
    open: (id) => hub.open(id),
    close: (id) => hub.close(id),
    receive: (id, message) => hub.receive(id, message),
    tick() { room.tick(); relay?.sweep(); },
    code,
    /** The relay's room channel (the TV listens here), or null when there is no relay. */
    relayTopic: relay?.topic ?? null,
    /** Something arrived on the relay. */
    onBroadcast: (channel, event, payload) => relay?.onBroadcast(channel, event, payload),
    broadcast: () => hub.broadcast(),
    putSet(gameId, id, set) { (sets[gameId] ??= {})[id] = set; room.contentChanged?.(gameId, id); },
    removeSet(gameId, id) { delete sets[gameId]?.[id]; room.contentChanged?.(gameId, id); },
    listSets: (gameId) => room.listContent(gameId),
  };
}
