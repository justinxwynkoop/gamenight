// The game engine hosted by a web browser: the TV page on the website (web/tv.html) runs the same engine the Apple TV
// app runs, and phones reach it through the same Supabase relay. So any screen with a browser (a laptop on the TV, a
// smart TV's browser) can be the TV. scripts/build-web.mjs bundles this file into web/tvhost.js.
//
//   const tv = await hostTv({ config, game, onState, onStatus });
//   tv.code, tv.pin, tv.joinUrl, tv.qrSvg       for the screen
//   tv.act(action, args)                         the TV acts on the game, like the Apple TV's buttons
//   tv.newRoom()                                 a new room code (reloads the page)
import { GAMES } from '../../games/index.js';
import { createEngine } from '../core.js';
import { Realtime } from '../../public/relay/phoenix.js';
import QRCode from 'qrcode';

const KEYS = { room: 'gn-tv-room', code: 'gn-tv-code', pin: 'gn-tv-pin', sets: 'gn-tv-sets', memory: 'gn-tv-memory' };
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const json = (text) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

/** One season of the public clue archive (github.com/jwolle1/jeopardy_clue_dataset), as raw text, or null. */
async function downloadSeason(season) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/seasons/season${season}.tsv`);
    const text = r.ok ? await r.text() : '';
    return text.startsWith('round') ? text : null;
  } catch { return null; }
}

/**
 * config     { url, key }: the Supabase project and its publishable key
 * game       'jeopardy', 'feud', 'spynight', 'piechase' or 'guysvsgals' to start that game (null: the host picks)
 * onState    (view) => void, what the TV shows
 * onStatus   (phonesConnected: boolean, issue: string | null) => void
 */
export async function hostTv({ config, game = null, onState, onStatus = () => {} }) {
  let content = {};
  try { content = await (await fetch('/sets.json', { cache: 'no-cache' })).json(); } catch { /* no shipped sets: the editor still works */ }

  let saved = get(KEYS.room);
  // A page for one game never resumes a room that was playing another: that room starts fresh.
  if (saved && game) { const was = json(saved)?.gameId; if (was && was !== game) saved = null; }
  const code = /^\d{4}$/.test(get(KEYS.code) ?? '') ? get(KEYS.code) : undefined;
  // The PIN stays with the room code, so a host page that is signed in keeps working when the TV page reloads.
  const pin = code && /^\d{4}$/.test(get(KEYS.pin) ?? '') ? get(KEYS.pin) : String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
  put(KEYS.pin, pin);

  let rt = null;
  let saveTimer = null;
  // Set when this page is about to start over (a new room code, another game). From then on nothing is saved, or the
  // save as the page unloads would write the old room (and its players) straight back, and they would be in the
  // "new" room when the page comes back.
  let leaving = false;
  const engine = createEngine({
    games: GAMES,
    pin,
    saved,
    content,
    userSets: json(get(KEYS.sets)) ?? {},
    onSetsChanged: (changes) => put(KEYS.sets, JSON.stringify(changes)),
    // Which clues this TV has shown, so the next game deals new ones. It outlives the room (a new room code keeps it).
    memory: json(get(KEYS.memory)) ?? {},
    onMemory: (data) => put(KEYS.memory, JSON.stringify(data)),
    now: () => performance.now(),
    code,
    broadcast: (topic, event, payload) => rt?.send(topic, event, payload),
    // Only the TV's own display is local; phones and the host are answered through the relay.
    send: (id, message) => { if (id === 'tv' && message?.t === 'state') onState(message.view); },
    save: (text) => { if (leaving) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (!leaving) put(KEYS.room, text); }, 400); },
    onError: (e) => console.error(e),
  });
  put(KEYS.code, engine.code);

  rt = new Realtime({
    url: config.url, key: config.key, WebSocketImpl: globalThis.WebSocket,
    onStatus: (up) => onStatus(up, up ? null : rt?.lastIssue ?? null),
    onBroadcast: (topic, event, payload) => engine.onBroadcast(topic, event, payload),
  });
  rt.join(engine.relayTopic);
  rt.connect();

  engine.open('tv');
  if (game) { try { engine.room.chooseGame(game); } catch { /* a game is under way, or no such game */ } }
  engine.receive('tv', { t: 'hello', role: 'tv' });

  async function loadArchive(want) {
    let season = want.season;
    for (let attempt = 0; attempt < 3; attempt++) {
      const text = await downloadSeason(season);
      if (text) { engine.archiveLoaded(text, season, want.id); return; }
      season = Math.max(3, season - 1 - attempt);
    }
    engine.archiveFailed(want.id);
  }
  // Often enough that the buzzers open on the dot, and a buzz is settled the moment the wait for a slower phone is over.
  setInterval(() => {
    engine.tick();
    const want = engine.takeArchiveRequest();
    if (want) loadArchive(want);
  }, 50);
  addEventListener('pagehide', () => { clearTimeout(saveTimer); if (leaving) return; try { put(KEYS.room, JSON.stringify(engine.room)); } catch { /* fine */ } });

  /** Forget this room's players and game, and start the page again. */
  const startOver = (keepCode, go) => {
    leaving = true;
    clearTimeout(saveTimer);
    put(KEYS.room, null);
    if (!keepCode) { put(KEYS.code, null); put(KEYS.pin, null); }
    go();
  };

  const joinUrl = `${location.origin}/?r=${engine.code}`;
  let qrSvg = '';
  let hostQrSvg = '';
  const qrOptions = { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } };
  try { qrSvg = await QRCode.toString(joinUrl, qrOptions); } catch { /* no QR: the code is on screen */ }
  // The host code: opens the host page already signed in (the PIN is in the address, which the page then removes).
  try { hostQrSvg = await QRCode.toString(`${location.origin}/host?r=${engine.code}&pin=${pin}`, qrOptions); } catch { /* the PIN is in the corner menu */ }

  return {
    code: engine.code,
    pin,
    joinUrl,
    qrSvg,
    hostQrSvg,
    /** The TV acts on the game itself (Start, Continue, a clue it was clicked, ...), like the Apple TV's buttons. */
    act(action, args = {}) { engine.receive('tv', { t: 'act', action, args }); },
    chooseGame(id) { try { engine.room.chooseGame(id); } catch { /* under way */ } },
    newRoom() { startOver(false, () => location.reload()); },
    /** Forget the game in this room (same code) and show the game picker. */
    changeGame() { startOver(true, () => location.replace(location.pathname)); },
  };
}
