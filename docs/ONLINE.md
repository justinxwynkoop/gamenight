# Online mode: the Apple TV hosts the game

Game Night's online mode needs **no computer or server on your network**: the game runs inside the Apple TV app and
phones connect over the internet. (There is also an optional [server mode](SERVER-MODE.md) that runs everything on your
own network instead; both use the same rules and the same phone pages.)

## How it fits together

```
 phone browser ──────┐                                     ┌────── Apple TV app
 (gamenight-one.     │      Supabase Realtime (broadcast)  │       (familygamenight repo)
  vercel.app, the    ├────── channels  gn:<CODE>  ─────────┤        ┌───────────────────────┐
  web/ folder)       │               gn:<CODE>:<id>        │        │ JavaScriptCore runs   │
 host phone ─────────┘                                     └────────┤ engine.js: the room,  │
                                                                    │ Jeopardy, Family Feud │
                                                                    └───────────────────────┘
```

- **The engine** is the same JavaScript the server uses (`room.js`, `games/`, `engine/hub.js`). The build script
  `scripts/build-engine.mjs` bundles it into one file, `dist/engine.js`, which the Apple TV app loads into
  JavaScriptCore. The engine knows nothing about networks: messages go in and out of it as JSON. So one set of rules
  serves both modes, and the rules are tested once.
- **The relay** is Supabase Realtime *broadcast*: a message bus. There is no database and nothing is stored there.
  Each room uses these channels:
  - `gn:<CODE>`: phones and the host send here; the TV listens. Event `m`, payload `{ c: <clientId>, m: <message> }`.
  - `gn:<CODE>:<clientId>`: the TV sends to one phone here; that phone listens. Event `m`, payload `<message>`.
  `engine/relay.js` is the room's side of this (it also drops phones that go quiet for 25 seconds, and skips sending
  a screen state that has not changed). `public/relay/phoenix.js` is a tiny Realtime client that runs in browsers and
  Node. The Apple TV has its own copy of that client in Swift (`RealtimeClient.swift`, in the other repo).
- **The phone pages** are `public/` (the same pages the server serves). `common.js` has one function, `connect()`,
  that opens the game connection. If `globalThis.GN_RELAY` is set (by `config.js`) it uses the relay; otherwise it
  opens a WebSocket to the server. Everything else on the pages is identical in both modes.
- **`web/`** is `public/` copied by `scripts/build-web.mjs` for Vercel, without the TV page, plus a `config.js` with the
  relay settings and a `vercel.json` with the page addresses. It is committed, and CI fails if it is out of date.
- **Question sets** are asked for and saved through the same relay (`rpc` messages from the host to the TV): which
  sets exist, what is in one, save, delete. They are stored on the Apple TV. See [QUESTION-SETS.md](QUESTION-SETS.md).

### Room codes and the host PIN

- A room is a 4-digit code the TV shows on the lobby screen and in the Play/Pause menu. The menu's **New room code**
  button starts a fresh, empty room with a new random code.
- The code is the only thing that finds a room, and anyone who knows the site address could try codes. The **host PIN**
  (a random 4 digits, shown only in the TV's Play/Pause menu, never on the board) still guards everything the host
  can do, including seeing answers. Four digits is 10,000 codes. This is meant for a family game night, not secrets.
  To make codes harder to guess, widen `CODE_CHARS` and the length in `engine/relay.js` and `public/relay/client.js`.
- The Supabase publishable key in `relay.config.json` is *meant* to be public (it is in every phone's page). Never
  put a Supabase **secret** key anywhere in either repo.

## Setting it up from scratch

1. **Supabase** (free): create a project. Realtime *broadcast* needs no tables and no settings. Copy the project URL
   and the *publishable* key into `relay.config.json`.
2. **Vercel** (free): import this repo as a project, set **Root Directory** to `web`, **Framework Preset** to *Other*,
   and leave every command empty. Every push to `main` redeploys. Note the project's address
   (for example `https://gamenight-one.vercel.app`).
3. **The Apple TV app** (the `familygamenight` repo): set the Supabase URL and key and the Vercel address in
   `FamilyGameNight/GameNight/RelayConfig.swift`, then build it from Xcode onto the Apple TV.
4. On the Apple TV: open Jeopardy or Family Feud, and on the address screen choose **Run on this Apple TV**. The app
   remembers this choice.

## Day to day

1. Open a game tile on the Apple TV. It shows a QR code, the join address and the room code.
2. Players scan the QR code (or open the site and type the code). The host opens `<site>/host` on a phone, types the
   room code (the QR code carries it) and the PIN from the TV's Play/Pause menu. The host page has a **Questions**
   tab that opens the editor without asking for the PIN or code again.
3. Press **Play/Pause** on the TV for the menu: host PIN, room code, "Phones: connected" (or why not), **New room code**,
   **Change server** (to go back to server mode) and **Back to games**.

## Changing the engine or the pages

- Rules or game logic (`room.js`, `games/`, `engine/`): change them, run `npm test`, then rebuild the engine for the app:
  `node scripts/build-engine.mjs ../familygamenight/FamilyGameNight/GameNight/Engine/engine.js`, and commit that file
  in the app repo. The app only changes when you rebuild and run it.
- Phone pages (`public/`): run `node scripts/build-web.mjs` and commit `web/`. Vercel redeploys by itself; phones
  get the change on reload. Server mode serves `public/` directly, so it sees the change too.
- The question sets that ship inside the app come from `data/<game>/*.json`:
  `node scripts/bundle-sets.mjs ../familygamenight/FamilyGameNight/GameNight/Engine/sets.json`.

## Tests

`npm test` runs everything in Node, including:

- `test/engine.test.js`: the bundled engine, loaded into a bare VM with none of Node's or a browser's globals (as
  JavaScriptCore has), driven only through JSON strings, as the Swift app does.
- `test/relay.test.js`: a pretend TV and pretend phones talking through a stand-in Supabase server, including
  reconnects, clients that go quiet, junk messages and saving sets.
- `test/importer.test.js`: importing sets from files, links and the plain-text format.

Two checks need more than Node and run in GitHub Actions (`.github/workflows/ci.yml`):

- `scripts/e2e-phone.mjs` drives the real phone, host and editor pages in Chromium against the stand-in relay.
  It exists because a bug once slipped through only in browsers (`setTimeout` called as a method of another object
  throws "Illegal invocation" there, but not in Node). Run it locally with Playwright installed.
- `scripts/relay-live.mjs` plays a join through the **real** Supabase project. (A cloud sandbox may not allow
  WebSockets, which is why this runs in CI.)

## Troubleshooting

| What you see | Likely cause |
| --- | --- |
| Phone says "Waiting for the TV" | Wrong room code, or the TV is not on a game. The line under it says how far the connection got. |
| Phone says "Supabase: …" | Supabase refused something, for example a wrong key in `relay.config.json`. |
| TV menu says "Phones: not connected (…)" | The TV cannot reach Supabase; the reason is in the brackets. Check the TV's internet. |
| Vercel site shows "This page is unavailable" | Root Directory is not `web`. |
| Vercel site asks to log in | Turn off Deployment Protection for production in the Vercel project's settings. |
| Menu goes to the Apple TV's home screen | The display lost the remote's focus; see the app repo's notes. |
| The TV opens another game's lobby | A game was in progress. Opening a tile for a different game starts a fresh room. |

## Limits

- Needs the internet on the TV and on every phone. A buzz crosses the internet (usually well under half a second),
  so the host's judgement still decides ties; it is not a hardware-grade buzzer. Light-up buzzers are only
  for [server mode](SERVER-MODE.md).
- Supabase's free plan has message and connection limits, and pauses a project that has been idle for a long time.
  Opening the Supabase dashboard wakes it.
- The **Random board** buttons (built from large clue and survey files) are not available online yet; they need a
  server ([SERVER-MODE.md](SERVER-MODE.md)).
