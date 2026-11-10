# Game Night

Jeopardy-style trivia for a Raspberry Pi. The Pi plugs into a TV and shows the
board; players buzz in from their phones; the host runs the game from a phone
or tablet. One Node.js server is the single source of truth, so buzzer order is
decided by one clock (the server's), not by anyone's device.

This is **Phase 1** of the project plan (phones only). The server already speaks
the protocol the light-up ESP32 buzzers will use; see [Buzzers](#buzzers-phase-3).

| Page | Who | Address |
| --- | --- | --- |
| TV board | the TV (Pi kiosk browser) | `/tv` |
| Player | everyone's phone (what the QR code opens) | `/` |
| Host | the host's phone or tablet, answers visible | `/host` (PIN) |
| Editor | whoever writes the questions | `/editor` (PIN) |

## Try it on any computer

```bash
npm install
HOST_PIN=1234 npm start
```

It prints the addresses. Open `/tv` on a big screen, `/host` on a phone, and
scan the QR code on the TV with other phones. Everything must be on the same
network. `npm test` runs the game-rule tests and a full server test.

## How a game goes

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
game. Sets are plain JSON files in `data/sets/`, so you can also edit or share
them as files. `data/sets/family-night.json` is a sample.

## Host PIN

The host and editor pages show answers, so they need a PIN. Set it with the
`HOST_PIN` environment variable. If you don't, a random 4-digit PIN is created
on first run, saved in `data/config.json`, and printed when the server starts.
The PIN is a guard against curious players on the same Wi-Fi, not real security;
don't reuse a password.

## Setting up the Raspberry Pi

*Written from the plan; not yet tried on real hardware. Check each step.*

1. Flash Raspberry Pi OS with desktop (64-bit) and connect it to the Game Night
   network. Give it a DHCP reservation so its address never changes.
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

Pi 5 and HDMI notes from the plan still apply: official 27 W supply, micro-HDMI
cable.

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

Everything the LED ring needs is in `view`: `view.me.unitId`, `view.clue.step`
(`reading`, `open`, `answering`, `revealed`), `view.clue.buzzedBy` and
`view.clue.lockedOut`. Map them to the light states in the plan
(`open` → pulsing, `buzzedBy === me.unitId` → solid, `lockedOut` → red flash).
Send `{"t":"ping"}` every few seconds if the firmware needs a keepalive.
Buzzers show up in the host's player list tagged "buzzer"; assign them to teams
there.

## Layout

```text
game.js        game rules (pure, no I/O) – the thing tests lean on
server.js      HTTP, WebSocket, saving, QR codes
public/        tv / host / play / editor pages (plain JS, no build step)
data/sets/     question sets
test/          node --test suites
deploy/        systemd unit
```

## Not built yet

From the plan: ESP32 firmware and enclosures (Phases 3-4), sound effects, and
a timer on buzzed answers.
