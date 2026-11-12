# Game Night

Family game night on the TV: **Jeopardy** and **Family Feud**. The game shows on the TV, everyone plays from their
phone, and the host runs it from a phone. One copy of the rules decides everything (buzzer order included), so
nobody's device can cheat.

The game runs **inside the Apple TV app** ([`familygamenight`](https://github.com/justinxwynkoop/familygamenight)).
Phones open a web page (hosted on Vercel) and talk to the TV through a free Supabase relay, so all you need is
internet: no computer or server on your network.

## Quick start

1. On the Apple TV, open **Jeopardy** or **Family Feud**. The lobby shows a QR code and a 4-digit room code.
2. Players scan the QR code, or go to the site and type the code, then pick a name and colour.
3. The host opens `/host` on a phone (the TV shows how), types the room code and the **host PIN** from the TV's
   Play/Pause menu, picks a question set and starts.
4. The host page's **Questions** tab is the question editor: write sets, or drag in a file.

Setting it all up the first time (Supabase, Vercel, the app) is in **[docs/ONLINE.md](docs/ONLINE.md)**.

## Documentation

| Read | For |
| --- | --- |
| [docs/ONLINE.md](docs/ONLINE.md) | How it works, setup from scratch, day to day, changing the code, tests, troubleshooting |
| [docs/PLAYING.md](docs/PLAYING.md) | How Jeopardy and Family Feud are played; the host page; players and teams; timers |
| [docs/QUESTION-SETS.md](docs/QUESTION-SETS.md) | The editor, importing, drag and drop, the plain-text and JSON formats |
| [docs/ADDING-A-GAME.md](docs/ADDING-A-GAME.md) | Adding a new game |
| [docs/SERVER-MODE.md](docs/SERVER-MODE.md) | The alternative: run a Node server on your own network instead (optional) |

## The pages

| Page | Who | Address |
| --- | --- | --- |
| Player | everyone's phone | `/` |
| Host | the host's phone or tablet; answers visible | `/host` (PIN) |
| Editor | whoever writes the questions | `/editor` (PIN) |

## What is in this repo

```text
room.js, lib.js         the room: players, teams, scores, host controls (no sockets or files)
games/                  Jeopardy and Family Feud rules, one folder per game
engine/                 the hub, the online relay, and the entry point the Apple TV app loads
public/                 the phone, host and editor pages (public/relay/ is the online connection)
web/                    GENERATED copy of public/ for Vercel (node scripts/build-web.mjs); committed
data/<game>/            the question sets that ship with the app
docs/                   the documentation above
scripts/                build scripts, browser and live-relay checks, data helpers
test/                   node --test suites
server.js, deploy/      server mode (optional)
relay.config.json       the Supabase project URL and publishable key (public by design)
```

## Working on it

```bash
npm install
npm test                                  # rules, engine, relay, importer, importing
node scripts/build-web.mjs                # after changing public/ (then commit web/)
node scripts/build-engine.mjs <out.js>    # the engine for the Apple TV app
```

CI (`.github/workflows/ci.yml`) runs the tests, checks `web/` is up to date, drives the real pages in a browser, and
plays a join through the real Supabase project. Details are in [docs/ONLINE.md](docs/ONLINE.md).
