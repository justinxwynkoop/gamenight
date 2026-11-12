// The bundle's entry point: this is what the Apple TV app loads into JavaScriptCore (see scripts/build-engine.mjs).
// Everything crosses the boundary as strings (JSON), which is what Swift bridges best.
import { GAMES } from '../../games/index.js';
import { createEngine } from '../core.js';

let engine = null;
const parse = (json) => (typeof json === 'string' ? JSON.parse(json) : json);

globalThis.Engine = {
  /** The games this engine can run, for the host's menus. */
  games: () => JSON.stringify(Object.values(GAMES).map((g) => ({ id: g.id, name: g.name, description: g.description, needs: g.needs ?? null }))),

  /** options: { pin, code?, saved?: string, content?: { <gameId>: { <setId>: set } } }. The room code is the relay's. */
  start(optionsJson) {
    const o = parse(optionsJson);
    engine = createEngine({
      games: GAMES,
      pin: o.pin,
      saved: o.saved ?? null,
      content: o.content ?? {},
      now: () => performance.now(),
      code: o.code || undefined,
      broadcast: (topic, event, payload) => __native.broadcast(topic, event, JSON.stringify(payload)),
      send: (id, message) => __native.send(id, JSON.stringify(message)),
      save: (json) => __native.save(json),
      onError: (e) => console.error(e),
    });
    return true;
  },
  roomCode: () => engine.code,
  /** The channel the TV must listen on (see engine/relay.js). */
  relayTopic: () => engine.relayTopic,
  /** A broadcast arrived from the relay: (topic, event, payloadJson). */
  onBroadcast(topic, event, json) { let p; try { p = JSON.parse(json); } catch { return; } engine.onBroadcast(topic, event, p); },
  open: (id) => engine.open(id),
  close: (id) => engine.close(id),
  receive(id, json) { let m; try { m = JSON.parse(json); } catch { return; } engine.receive(id, m); },
  tick: () => engine.tick(),
  putSet: (gameId, id, json) => engine.putSet(gameId, id, parse(json)),
  removeSet: (gameId, id) => engine.removeSet(gameId, id),
  listSets: (gameId) => JSON.stringify(engine.listSets(gameId)),
};
