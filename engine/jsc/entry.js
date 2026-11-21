// The bundle's entry point: this is what the Apple TV app loads into JavaScriptCore (see scripts/build-engine.mjs).
// Everything crosses the boundary as strings (JSON), which is what Swift bridges best.
import { GAMES } from '../../games/index.js';
import { createEngine } from '../core.js';

let engine = null;
const parse = (json) => (typeof json === 'string' ? JSON.parse(json) : json);

globalThis.Engine = {
  /** The games this engine can run, for the host's menus. */
  games: () => JSON.stringify(Object.values(GAMES).filter((g) => !g.appOnly).map((g) => ({ id: g.id, name: g.name, description: g.description, needs: g.needs ?? null }))),

  /** options: { pin, game?, code?, saved?: string, content?: { <gameId>: { <setId>: set } }, userSets?: { <gameId>: { <setId>: set | null } }, memory?: object }. The room code is the relay's. */
  start(optionsJson) {
    const o = parse(optionsJson);
    // A tile for one game never resumes a room that was playing another: that room starts fresh.
    if (o.saved && o.game) {
      try { const was = JSON.parse(o.saved).gameId; if (was && was !== o.game) o.saved = null; } catch { o.saved = null; }
    }
    engine = createEngine({
      games: GAMES,
      pin: o.pin,
      saved: o.saved ?? null,
      content: o.content ?? {},
      userSets: o.userSets ?? {},
      onSetsChanged: (c) => { if (__native.saveSets) __native.saveSets(JSON.stringify(c)); },
      // Which clues this Apple TV has shown (kept by the app between rooms), so the next game deals new ones.
      memory: o.memory ?? null,
      onMemory: (m) => { if (__native.saveMemory) __native.saveMemory(JSON.stringify(m)); },
      // The family's own sounds, kept by the app (sent from the host page, see engine/sounds.js).
      sounds: __native.saveSoundChunk ? {
        save: (chunk) => !!__native.saveSoundChunk(JSON.stringify(chunk)),
        list: () => JSON.parse(__native.listSounds()),
        remove: (game, name) => __native.removeSound(game, name),
      } : null,
      now: () => performance.now(),
      code: o.code || undefined,
      broadcast: (topic, event, payload) => __native.broadcast(topic, event, JSON.stringify(payload)),
      send: (id, message) => __native.send(id, JSON.stringify(message)),
      save: (json) => __native.save(json),
      onError: (e) => console.error(e),
    });
    if (o.game) { try { engine.room.chooseGame(String(o.game)); } catch { /* no such game */ } }
    return true;
  },
  /** Pick the game from the TV itself (the home-screen tile). Ignored once a game is under way. */
  chooseGame(id) { try { engine.room.chooseGame(String(id)); } catch { /* a game is in progress, or no such game */ } },
  roomCode: () => engine.code,
  /** The channel the TV must listen on (see engine/relay.js). */
  relayTopic: () => engine.relayTopic,
  /** A broadcast arrived from the relay: (topic, event, payloadJson). */
  onBroadcast(topic, event, json) { let p; try { p = JSON.parse(json); } catch { return; } engine.onBroadcast(topic, event, p); },
  open: (id) => engine.open(id),
  close: (id) => engine.close(id),
  receive(id, json) { let m; try { m = JSON.parse(json); } catch { return; } engine.receive(id, m); },
  tick() {
    engine.tick();
    // A game that wants clues from the internet (a season of the real show) asks here; the app downloads and answers.
    const want = engine.takeArchiveRequest();
    if (want && __native.loadArchive) __native.loadArchive(JSON.stringify(want));
  },
  /** The app got a season: (id, season, tsvText). */
  archiveLoaded: (id, season, tsv) => engine.archiveLoaded(String(tsv), Number(season), Number(id)),
  archiveFailed: (id) => engine.archiveFailed(Number(id)),
  putSet: (gameId, id, json) => engine.putSet(gameId, id, parse(json)),
  removeSet: (gameId, id) => engine.removeSet(gameId, id),
  listSets: (gameId) => JSON.stringify(engine.listSets(gameId)),
};
