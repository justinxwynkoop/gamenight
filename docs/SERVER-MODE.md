# Server mode: run the game on your own computer (no internet needed)

The offline backup. A small Node.js server on any Windows, Mac or Linux computer serves the TV page, the phone pages and
the game over your own Wi-Fi, so nothing here needs the internet. Normally you don't need this: the Apple TV app, or the
website's TV page (`/tv` on the site, in any browser), runs the game, and phones connect over the internet (see
[ONLINE.md](ONLINE.md)).

| Page | Who | Address |
| --- | --- | --- |
| TV | the TV (any browser, full screen) | `/tv` |
| Player | everyone's phone (what the QR code opens) | `/` |
| Host | the host's phone or tablet, answers visible | `/host` (PIN) |
| Editor | whoever writes the questions | `/editor` (PIN; `?game=<id>` picks the game) |

## Start it

**Windows:** install [Node.js](https://nodejs.org) (the LTS version) once, then double-click **`Start Game Night.bat`**
in this folder. It installs what it needs the first time and prints the addresses.

**Mac or Linux:**

```bash
npm install
HOST_PIN=1234 npm start
```

It prints the addresses. Open `/tv` on a big screen, `/host` on a phone, and
scan the QR code on the TV with other phones. Everything must be on the same
network. `npm test` runs the game-rule tests and a full server test.


## If a phone can't join

Open **`/check`** on that phone (for example `http://192.168.1.50/check`, using the address
shown on the TV). It tests, one line at a time, that the page loads, the browser is new
enough, scripts and storage work, and the live connection (the part buzzing needs) gets
through, and says what to try for any line that fails. The join page also offers it after a
few seconds if it cannot connect.

The usual causes, in order: the phone is sending web traffic over **mobile data** instead of
Wi-Fi (turn mobile data off, especially on Android); a **VPN, ad-blocker or private-DNS app**
is intercepting local traffic; the phone is on a **guest network**; the address was typed as a
`.local` name (some Android phones cannot open those, so use the numeric address, which is
what the QR code uses); or the link opened inside a QR-scanner app's built-in browser instead
of Chrome.


## Host PIN

The host and editor pages show answers, so they need a PIN. Set it with the
`HOST_PIN` environment variable. If you don't, a random 4-digit PIN is created
on first run, saved in `data/config.json`, and printed when the server starts.
The PIN is a guard against curious players on the same Wi-Fi, not real security;
don't reuse a password.


## Jeopardy and Family Feud in server mode

Both games run here, with the same TV screens as the website's TV page. Jeopardy's real-show clue seasons are
downloaded when a room starts, so with no internet you play the question sets that ship with the game and your own.

## More Family Feud questions

The sample sets are small, so the repo can also build many more from the public
[ProtoQA](https://github.com/iesl/protoqa-data) data: about 9,700 survey questions with ranked answers
and points (CC BY 4.0, Boratko et al., 2020; most of it was collected from Family Feud fan sites). It is
**not** kept in this repository. On the server:

```bash
cd ~/gamenight && ./scripts/get-feud-sets.sh
```

That downloads the data into `data/surveys/` and builds 20 **Survey Mix** sets (each 5 rounds plus 5
Fast Money questions) into `data/feud/`; they appear in the host's set list. Both folders are git-ignored,
so none of it is ever committed. Run it again with a different batch: `./scripts/get-feud-sets.sh 30 7`
(30 sets, seed 7; the same seed gives the same sets, and the old `protoqa-*` sets are replaced). The data
holds enough for about 600 sets.

Questions are tidied (Title Case becomes a sentence), the top eight answers are kept, and a word filter
leaves out dating, drinking, politics, money worries and similar topics, since many original Family
Feud questions are for adults. It isn't perfect, so glance at a question before reading it out, and use
Undo and the editor freely. Use the data for your own family nights; don't publish it.

**Random board button.** Once the survey data is installed, the host's setup screen has a **Random board**
card for Family Feud: **Build a random board** makes a fresh set (5 rounds and 5 Fast Money questions)
at once and picks it, with a switch for the family-friendly filter. (Without the data it says "Not set up
on this server yet" and shows the command.) The newest 12 random boards are kept.


## Your own sounds


To use your own audio, put files on the server in `data/sounds/`. Files go in one folder per game, so
each game keeps its own sounds:

```
data/sounds/jeopardy/    Jeopardy's sounds
data/sounds/feud/        Family Feud's sounds
data/sounds/             sounds every game shares (used when a game has none of its own)
```

(The folders are created when the server starts.) A file in a game's folder wins over a shared one with
the same name, and a sound with no file anywhere falls back to the built-in one. Use these names
(`.mp3`, `.wav`, `.ogg` or `.m4a`):

- **Jeopardy:** `open`, `buzz`, `correct`, `wrong`, `timeup`, `tick`, `reveal`, `dd` (Daily Double),
  `final` (Final Jeopardy sting), `fanfare` (winner).
- **Family Feud:** `ding` (an answer flips), `strike` (the buzzer; also used for the third strike and
  a Fast Money zero), `strikeout` (the third strike), `faceoff` (a face-off buzz), `open` (buzzers
  open), `fastmoney` (plays when Fast Money begins), `fmpoints` (Fast Money points shown),
  `roundstart`, `winner`, `zero`, `timeup`, `tick`, `correct` (a round won).
- **Music, any game:** `lobby` loops on the TV while players are joining, before the game starts, and
  stops when it starts (`think` is used if there is no `lobby`, so one file covers both). `think`
  plays during the Final Jeopardy countdown; a 30-second file matches the default time.

Music only plays if you provide a file. Files are read when the TV page loads, so reload it after
adding some. Anything with a different name is ignored.

**Getting a file onto the server.** Copy it into the server's `data/sounds/<game>/` folder (a USB stick works), then reload the TV page.


`data/sounds/` is git-ignored on purpose: this repository is public, so audio you didn't create
(a TV show's music, for instance) can't be accidentally published from here. Whether using such
audio at a private family game night suits you is your call; the app just plays what you put there.


## Network

The computer and the phones must be on the same Wi-Fi, with **client isolation off** (guest networks usually have it
on). The QR code points at the computer's current address and follows it if the computer joins another network. Set
`PUBLIC_URL` to pin the address (for example if the computer has several network connections and the wrong one is
picked); that turns the automatic update off.

Set `WIFI_SSID` and `WIFI_PASSWORD` to also serve a Wi-Fi join QR at `/api/wifi-qr.svg` (for a printed table sign).


## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP/WebSocket port |
| `HOST_PIN` | random, saved | Host and editor PIN |
| `PUBLIC_URL` | detected, kept up to date | Address in the join QR code (setting it pins it) |
| `DATA_DIR` | `./data` | Question sets, saved game, PIN, custom sounds |
| `WIFI_SSID`, `WIFI_PASSWORD` | unset | Enables the Wi-Fi QR |


## Buzzers (Phase 3)

A physical buzzer is just another player. Over the same WebSocket (`ws://<server>/ws`),
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

