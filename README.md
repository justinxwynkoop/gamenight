# Game Night

A party-game system for a Raspberry Pi. The Pi plugs into a TV and shows the
game; players join and play from their phones; the host runs it from a phone or
tablet. One Node.js server is the single source of truth, so buzzer order is
decided by one clock (the server's), not by anyone's device.

**Games:** Jeopardy-style trivia today. The server is built so more games (a
Family Feud-style survey game is planned) plug in without touching the rest; see
[Adding a game](#adding-a-game).

This is **Phase 1** of the project plan (phones only). The server already speaks
the protocol the light-up ESP32 buzzers will use; see [Buzzers](#buzzers-phase-3).

| Page | Who | Address |
| --- | --- | --- |
| TV | the TV (Pi kiosk browser) | `/tv` |
| Player | everyone's phone (what the QR code opens) | `/` |
| Host | the host's phone or tablet, answers visible | `/host` (PIN) |
| Editor | whoever writes the questions | `/editor` (PIN; `?game=<id>` picks the game) |

## Try it on any computer

```bash
npm install
HOST_PIN=1234 npm start
```

It prints the addresses. Open `/tv` on a big screen, `/host` on a phone, and
scan the QR code on the TV with other phones. Everything must be on the same
network. `npm test` runs the game-rule tests and a full server test.

## How a game goes (Jeopardy)

The host first picks the game (skipped while only one is installed) and whether
players play individually or in teams.

1. **Lobby.** Players scan the QR code, enter a name and pick a colour (or a
   team). The host picks the question set and individual or team mode.
2. **Board.** The host taps a square. The clue shows on the TV; the answer shows
   only on the host page.
3. **Buzzers.** The host reads the clue, then taps **Open buzzers**. First press
   wins, the TV shows who, everyone else is locked out.
4. **Judge.** **Correct** scores and gives that player control. **Wrong**
   deducts, locks that player out of the clue, and re-opens buzzing for the
   rest. **Skip / reveal** shows the answer with no score.
5. **Daily Doubles.** The clue stays hidden until the host enters the wager.
   Max wager is the player's score or the top board value, whichever is higher.
6. **Final Jeopardy.** Players with a positive score wager and type an answer on
   their phone. The host judges each; wagers and answers appear on the TV only
   as they are judged.

Other things the host can do: adjust, set or rename any score; give the buzz to a
player directly (dead phone); re-open buzzers after a mistaken press; switch the
TV between the board and a full leaderboard; remove players.

**Early buzzes.** Pressing before the host opens buzzers locks that player out for
a short time after they open (default 500 ms, adjustable or off in the lobby).

**Reconnects.** A phone that sleeps or refreshes rejoins as the same player with
its score (an id is kept in the browser). The whole game, scores included, is
saved to `data/state.json` and survives a server restart.

## Questions

Use `/editor`: six categories of five clues, a Final Jeopardy clue, and optional
Daily Double flags. If no Daily Double is flagged, one is placed at random each
game. Sets are plain JSON files in `data/<game>/` (for Jeopardy, `data/jeopardy/`),
so you can also edit or share them as files. `data/jeopardy/family-night.json`
is a sample.

## Host PIN

The host and editor pages show answers, so they need a PIN. Set it with the
`HOST_PIN` environment variable. If you don't, a random 4-digit PIN is created
on first run, saved in `data/config.json`, and printed when the server starts.
The PIN is a guard against curious players on the same Wi-Fi, not real security;
don't reuse a password.

## Setting up the Raspberry Pi

*Written from the plan; not yet tried on real hardware. Check each step.*

### Which Pi

A **Pi 4** is the target. This is a small Node server plus a simple page in a
kiosk browser, so a Pi 4 of any RAM size runs it comfortably. A Pi 5 also works
but isn't needed. A Pi 3 / 3B+ works too, just slower to boot and load pages
(and 1 GB of RAM is tight for heavier games later); keep one as a spare.

What to buy or gather for a Pi 4:

- Official 5 V 3 A USB-C power supply. A weak phone charger causes random reboots.
- Micro-HDMI to HDMI cable (Pi 4 has micro-HDMI; a Pi 3 uses full-size HDMI).
- microSD card, 32 GB, A1 or better, from a reputable seller (fakes are common).
  Keep a spare card cloned from the first one.
- A case with a small heatsink. An active fan isn't needed for this workload.

### Software

1. Flash Raspberry Pi OS with desktop (64-bit) with Raspberry Pi Imager and
   connect the Pi to the Game Night network. Give it a DHCP reservation so its
   address never changes.
2. Install Node 20 or newer (the OS package may be older):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs git
   ```
3. Get the code and install:
   ```bash
   git clone https://github.com/justinxwynkoop/gamenight.git ~/gamenight
   cd ~/gamenight && npm install
   ```
4. Run it as a service: edit `deploy/gamenight.service` (user, path, `HOST_PIN`),
   copy it to `/etc/systemd/system/`, then
   `sudo systemctl daemon-reload && sudo systemctl enable --now gamenight`.
5. Boot the TV straight into the board. On the current desktop (labwc), add this
   line to `~/.config/labwc/autostart`:
   ```bash
   chromium --kiosk --noerrdialogs --disable-infobars --autoplay-policy=no-user-gesture-required http://localhost/tv &
   ```
   (The binary is `chromium-browser` on older images. Use `:3000` in the URL if
   you didn't set `PORT=80`.)

### Network

The server needs the Pi, the phones and (later) the buzzers on one network with
**client isolation off**; the host home's Wi-Fi and internet are optional.
Follow the Game Night SSID steps in the project plan, including the offline test
(Teleport off, no uplink) before the first real game. Phones may show "No
internet"; that's expected.

The QR code points at the Pi's LAN address. Override it with `PUBLIC_URL` if the
Pi has several interfaces. Set `WIFI_SSID` and `WIFI_PASSWORD` to also serve a
Wi-Fi join QR at `/api/wifi-qr.svg` (for a printed table sign).

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP/WebSocket port |
| `HOST_PIN` | random, saved | Host and editor PIN |
| `PUBLIC_URL` | detected LAN IP | Address in the join QR code |
| `DATA_DIR` | `./data` | Question sets, saved game, PIN |
| `WIFI_SSID`, `WIFI_PASSWORD` | unset | Enables the Wi-Fi QR |

## Buzzers (Phase 3)

A physical buzzer is just another player. Over the same WebSocket (`ws://<pi>/ws`),
JSON text messages:

```text
→ {"t":"hello","role":"player","token":"<saved token>"}     (token omitted the first time)
← {"t":"need-join"}                                         (unknown token)
→ {"t":"join","name":"Buzzer 3","color":"#22c55e","teamId":"t1","kind":"buzzer"}
← {"t":"joined","token":"…"}                                (store this in flash)
→ {"t":"buzz"}                                              (on button press)
← {"t":"buzz-result","ok":true}   or   {"ok":false,"reason":"early|penalty|locked-out|closed"}
← {"t":"state","view":{…}}                                  (every change)
```

Every `view` is `{ room, game }`: `room` is shared by all games (players, teams,
scores, `room.me` for the receiving player) and `game` is the active game's own
state. For Jeopardy, everything the LED ring needs is there: `view.room.me.unitId`,
`view.game.clue.step` (`reading`, `open`, `answering`, `revealed`),
`view.game.clue.buzzedBy` and `view.game.clue.lockedOut`. Map them to the light
states in the plan (`open` → pulsing, `buzzedBy === me.unitId` → solid,
`lockedOut` → red flash). A buzzer sends `{"t":"buzz"}` whichever game is on;
what a game does with it is up to the game.
Send `{"t":"ping"}` every few seconds if the firmware needs a keepalive.
Buzzers show up in the host's player list tagged "buzzer"; assign them to teams
there.

## Layout

```text
lib.js                  small shared helpers and GameError
room.js                 the room: players, teams, scores, host roster controls, saving
games/index.js          the list of installed games
games/jeopardy/         Jeopardy rules (pure, no I/O) and its game module
server.js               HTTP, WebSocket, saving, QR codes, question-set API
public/                 the four pages (tv, host, play, editor): thin shells
public/games/jeopardy/  Jeopardy's own TV, host, phone and editor screens
data/<game>/            question sets for each game
test/                   node --test suites (room, Jeopardy rules, full server)
deploy/                 systemd unit
```

## Adding a game

The room handles everything games have in common: joining by QR code, names and
colours, teams, scores, reconnecting, the host's player controls, saving, and the
buzzer connection. A game supplies its rules and its screens.

1. **Rules.** Create `games/<id>/index.js` exporting `{ id, name, description,
   validateContent, create(room) }`. `create` returns an object with
   `inProgress()`, `act(action, args)` (host actions), `onPlayer(player, msg)`
   (a message from a phone or buzzer; may return a reply), `publicView()` and
   `hostView()` (what the TV and phones may see / what the host may see),
   `toJSON()` and `restore()`. Optional: `init()` and `contentChanged(setId)`.
   The full contract is the comment at the top of `room.js`. Score by changing
   `unit.score` on `room.units()`. Keep it free of sockets and files so it can be
   tested like `games/jeopardy/game.js`.
2. **Screens.** Add `public/games/<id>/` with `tv.js` (`render(view)` returns an
   element), `host.js` (`render(view, ctx)` returns `{ label, toolbar, cards }`),
   `player.js` (`mount(container, ctx)` returns `{ update(view), onMessage(msg),
   destroy() }`) and `editor.js` (`mount(container, api)`). `public/games/jeopardy/`
   is the working example.
3. **Register it** in `games/index.js`. The host page then offers it in the game
   picker, and `/editor?game=<id>` edits its content, stored under `data/<id>/`.

## Not built yet

From the plan: ESP32 firmware and enclosures (Phases 3-4), sound effects, and
a timer on buzzed answers. Next game: a Family Feud-style survey game.
