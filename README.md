# Game Night

A party-game system: the TV shows the game, players join and play from their
phones, and the host runs it from a phone or tablet. One copy of the game rules
decides everything (buzzer order included), so nobody's device can cheat.

**It runs in two ways, with the same rules and the same phone pages:**

- **Online mode (new).** The game runs *inside the Apple TV app* (the
  [`familygamenight`](https://github.com/justinxwynkoop/familygamenight) repo). Phones use a web page on Vercel and
  talk to the TV through a free Supabase Realtime relay. No Pi or computer is needed, only internet. See
  **[docs/ONLINE.md](docs/ONLINE.md)**.
- **Server mode (this README).** A Node.js server on a Raspberry Pi (or any computer) serves the TV page, the phone
  pages and the game, all on your own Wi-Fi.

**Games:** Jeopardy and Family Feud. More plug in without touching the rest; see [Adding a game](#adding-a-game).

**More docs:** [Online mode](docs/ONLINE.md) · [Question sets, the editor, importing and the text format](docs/QUESTION-SETS.md)

The server already speaks the protocol the light-up ESP32 buzzers will use; see [Buzzers](#buzzers-phase-3).

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

The host first picks the game (skipped while only one is installed). Whether
people play on their own or in teams is worked out for you (see
[Players and teams](#players-and-teams)).

1. **Setup.** Players scan the QR code, enter a name and pick a colour. On the
   host page the host chooses **1 round or 2 rounds** before Final Jeopardy, then a
   question set for each round (a set can't be used twice). Final Jeopardy comes
   from the last round's set. **Start game** stays greyed out, with the reason
   shown, until every round has a board and someone has joined.
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
   their phone. Everyone's scores (players and teams) show on the TV and on every
   phone while wagering, so a wager can be judged against the rest; anyone not
   playing the final round is marked "sitting out". The host judges each answer;
   wagers and answers appear on the TV only as they are judged.

Two-round games: **Round 2 (Double Jeopardy!)** has every value doubled and two
Daily Doubles; whoever has the lowest score picks first. When the first board is
cleared the host taps **Start Double Jeopardy** (or **Start Final Jeopardy** to
skip ahead; both ask first if squares are left).

Other things the host can do: adjust, set or rename any score; give the buzz to a
player directly (dead phone); re-open buzzers after a mistaken press; switch the
TV between the board and a full leaderboard; remove players.

## The host screen

`/host` is laid out like an app: **Game**, **Players**, **Scores** and **Settings**
tabs (a bar along the bottom on a phone, a rail down the side on a tablet or
laptop). The one thing to do next is always a large button pinned at the bottom
(Start game, Open buzzers, Correct / Wrong, Back to the board...). Choices open as
slide-up sheets. Game rules and timers live under Settings, and ending the game
is tucked away at the bottom of Settings behind a confirmation.

## Random boards

The host screen can build a fresh board from real past clues, so you never run out.
It needs a clue file that is **kept only on the Pi** (it is about 80 MB and is not part of
this repository). Install it once, on the Pi:

```bash
cd ~/gamenight && ./scripts/get-clues.sh
```

That downloads `combined_season1-42.tsv` from the public
[jeopardy_clue_dataset](https://github.com/jwolle1/jeopardy_clue_dataset) into
`data/clues/`. Both that folder and the boards built from it (`data/jeopardy/random-*.json`)
are git-ignored. The clues belong to their owners: use them for your own family nights and
don't publish or share the file or the boards.

On the host screen, setup now has a **Random boards** card (it says "Not set up on this Pi
yet" until the file is there). Choose:

| Choice | Options |
|---|---|
| Where the clues come from | Regular episodes, Kids and Teen games, or Tournaments and special events |
| How recent | any year, 2001+, 2010+, 2018+ |
| Categories | **A mix** (six categories from six different games) or **One real game** (all six from one show; with two rounds both come from the same show; real Daily Doubles are kept) |
| Family-friendly | on by default; leaves out clues with adult topics (a simple word filter, so still glance at a clue before reading it) |

**Build the board** fills every round; each round's card also has a **Random** button to
re-roll just that one. The newest 12 random boards are kept and older ones are removed.

**About difficulty.** The clue file has no difficulty rating for a clue or a category, so
there is no "easy / hard" setting. What it does have is used instead: within each category
the clues run from the lowest value (easier) to the highest (harder), as on the show;
Double Jeopardy! categories come from the show's second round; and *Kids and Teen games*
are written for younger players. Tournament games use the same kind of clues but with
stronger players, so they are not necessarily harder.

The first board after a quiet spell takes a few seconds while the file loads (it is dropped
from memory after 10 idle minutes; it needs roughly 150 MB while loaded, so a Pi with 1 GB
or more is fine). The server stays responsive while it loads.

## Family Feud

Pick **Family Feud** in the game picker. It is always **two teams** (Red and Blue); players are
dealt onto them at random and the host can move anyone.

1. **Setup.** Choose a question set, the winning score (200 to 500) and whether to play Fast Money.
2. **Face-off.** One player from each team steps up (a different player each round; the host can
   change who). The host reads the question and opens the buzzers; only those two phones can buzz.
   The first one answers out loud and the host taps the matching survey answer, or **Not on the board**.
   The top answer wins the face-off outright; otherwise the other player gets a go and the better answer
   wins. If both miss, replay it or pick a winner.
3. **Play or pass.** The winners choose. Their team then names answers; the host taps each one and it
   flips on the TV. A **strike** puts a big boxed X in the middle of the TV, which then slides down into
   the next empty strike box. Three **strikes** and the other team gets one **steal** guess: a good steal takes the
   whole pot, a miss leaves it with the first team.
4. **Scoring.** Points on the board are banked when the round ends. Rounds 4 and 5 are worth double and
   triple (switch off under Settings). First team to the winning score, or the last round, ends the
   rounds.
5. **Fast Money.** The leading team picks two players. Each answers five questions in turn (40 and 45
   seconds by default, since typing takes longer than talking; change them under Settings), typing on
   their phone, or the host types what they say. On the phone the questions come one at a time with a big
   answer box and a microphone button; **Skip** (or just saying "skip", or sending nothing) moves on, and
   after the last question it goes back to any skipped ones while there is time, then shows a review with a
   **Send my answers** button. Answers go to the host as you go, and whatever is there is sent when time runs
   out. (The microphone button uses the browser's speech recognition. Browsers usually only allow that on a
   secure `https` page, which this plain-`http` server isn't, so it may say "Voice isn't allowed here"; the
   microphone on the phone's own keyboard always works and fills the box the same way.) The reveal then goes as on the show, one answer at a
   time: the host reads the question, taps **Reveal what they said** (the TV types the answer out on the
   board), says "survey says", then taps the points button (the TV shows the points). Each survey list is
   shown on the host screen with a tag where each player's answer landed, so the rank is visible without
   opening anything, and the points button already says what it will score (for example **#1 Apple ·
   +34**; the game also scores a repeat of player 1's answer as zero). An answer left blank is a zero
   that needs just one tap, and shows as NO ANSWER. Reach 200 points to win.
6. **Undo.** A mis-tap is easy on a phone, so **Undo** takes back the last reveal, strike or choice,
   including the points.

Question sets live in `data/feud/` and are written in the editor (`/editor?game=feud`). Each has 3 to 8
rounds of a question with 3 to 8 ranked answers (points are how many out of 100 said it), optional
"also accept" words for matching, and exactly five Fast Money questions. Five sample sets ship with the
repo; their survey numbers are made up, not real survey results.

### More Family Feud questions

The sample sets are small, so the repo can also build many more from the public
[ProtoQA](https://github.com/iesl/protoqa-data) data: about 9,700 survey questions with ranked answers
and points (CC BY 4.0, Boratko et al., 2020; most of it was collected from Family Feud fan sites). It is
**not** kept in this repository. On the Pi:

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
on this Pi yet" and shows the command.) The newest 12 random boards are kept.

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

## Players and teams

- **Up to 5 players** play as individuals.
- **6 or more** and the game is split into two teams, **Red** and **Blue**, picked
  at random (as even as possible). Nobody chooses a team.
- **More than 10 players** (more than 5 on a team) and **Green** and **Yellow**
  come in too, for four teams. The host can also choose four teams sooner.
- On a phone, the player's **team colour lights up**: a frame round the screen and
  a banner with the team name and teammates.
- **The host** has an **Auto / Individual players / Teams** switch (Auto is the
  default and does the above), a **2 teams / 4 teams** choice, **Shuffle teams**
  to deal again at random, and can move any player to another team from the
  Players list. Rearranging only happens in the lobby; once a game starts nothing
  moves, and anyone who joins late is put on the smallest team.
- Teams can be renamed from the host page (scores list) and keep their colour.

**Timers.** There are three, all shown on the TV and on the host page.

1. **Buzz-in window:** when the host taps **Open buzzers**, players get 10 seconds to buzz in
   (or switch this off in the lobby with **No timer**). If nobody does, the TV flashes **TIME'S UP**,
   plays a buzzer and locks buzzing; the host then taps **Nobody — reveal answer**. **Restart timer**
   opens buzzing again for another 10 seconds. After a wrong answer, or when the host re-opens
   buzzers, the players still in get a fresh window.
2. **Answer timer:** when someone buzzes in (or a Daily Double wager is set) a countdown starts on the
   TV, the host page and the buzzing player's phone.
3. **Final Jeopardy timer**, described below.

The answer timer is **5 or 10 seconds** (10 by default), chosen by the host in the lobby. **A Daily Double
gets double that** (10 seconds if you chose 5, 20 if you chose 10), including when the host restarts its
timer. At zero the
TV flashes TIME'S UP and plays a buzzer, and the host still decides: tap Correct or Wrong, or
**Restart timer** to give more time. Tick **Time-out counts as wrong** if you'd rather it be scored
automatically. The Final Jeopardy countdown (30 seconds by default, adjustable in the lobby) starts
when the clue is shown.

**Early buzzes.** Pressing before the host opens buzzers locks that player out for
a short time after they open (default 500 ms, adjustable or off in the lobby).

**Reconnects.** A phone that sleeps or refreshes rejoins as the same player with
its score (an id is kept in the browser). The whole game, scores included, is
saved to `data/state.json` and survives a server restart.

## Questions

(How to write, import and drag in sets, including the plain-text format and the online editor, is in
[docs/QUESTION-SETS.md](docs/QUESTION-SETS.md).) Use `/editor`: six categories of five clues, a Final Jeopardy clue, and optional
Daily Double flags. If no Daily Double is flagged, one is placed at random each
game. Sets are plain JSON files in `data/<game>/` (for Jeopardy, `data/jeopardy/`),
so you can also edit or share them as files. Eleven family-friendly samplers
ship with the repo (each is six categories of five clues plus a Final Jeopardy, from easy
at $200 to harder at $1,000; Daily Doubles are placed at random):

| Set | Covers |
| --- | --- |
| `family-night` | a bit of everything |
| `animal-kingdom` | pets, wild Africa, ocean life, birds, bugs, babies |
| `movies-and-cartoons` | Disney, Pixar, cartoons, sidekicks, superheroes, lyrics |
| `around-the-usa` | capitals, landmarks, nicknames, rivers, parks, symbols |
| `science-lab` | space, the body, chemistry, weather, dinosaurs, inventions |
| `food-and-cooking` | produce, world dishes, breakfast, desserts, tools, snacks |
| `sports-night` | Olympics, baseball, basketball, football, soccer, gear |
| `world-geography` | capitals, continents, oceans, places, flags, languages |
| `history-highlights` | Egypt and Rome, the Revolution, explorers, women, Greece, the 1900s |
| `music-and-pop-culture` | instruments, rhymes, legends, musicals, music basics, games |
| `holidays-and-seasons` | Christmas, Halloween, Thanksgiving, spring, summer, celebrations |

The host picks one in the lobby.

## Sound

The TV plays short sound effects: buzzers open, a buzz-in, correct, wrong, a Daily Double, Final
Jeopardy, time's up, and a tick for the last five seconds. They are generated in the browser, so
there is nothing to install. The host can turn sound off, change the volume, or press **Test on
TV** at the bottom of the host page.

Browsers keep sound off until a page has had a click or key press. On the Pi, the kiosk launch
line in the setup steps allows it from the start. On a laptop, click once on the TV page (a small
notice appears until you do).

### Your own sounds

To use your own audio, put files on the Pi in `data/sounds/`. Files go in one folder per game, so
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

**Getting a file onto the Pi.** From your computer, with the Pi on the same network (Windows 10 and
later, macOS and Linux all have `scp`):

```bash
scp think.mp3 YOURUSERNAME@gamenight.local:~/gamenight/data/sounds/jeopardy/think.mp3
```

Or copy it with a USB stick into `~/gamenight/data/sounds/` on the Pi.

`data/sounds/` is git-ignored on purpose: this repository is public, so audio you didn't create
(a TV show's music, for instance) can't be accidentally published from here. Whether using such
audio at a private family game night suits you is your call; the app just plays what you put there.

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

### Software: the easy way (one command, then desktop icons)

On the Pi's desktop, open a terminal **once** and paste this. It installs what's needed, asks you to
choose a host PIN, and puts icons on the desktop:

```bash
git clone https://github.com/justinxwynkoop/gamenight.git ~/gamenight && ~/gamenight/deploy/setup-pi.sh
```

(If you already cloned it: `cd ~/gamenight && git pull && deploy/setup-pi.sh`. It is safe to run
again.) It needs the Pi online and asks for the Pi's password once, to install Node.js.

After that you never need the terminal. The desktop has four icons (the first time you
double-click one, the Pi may ask whether to run it; choose **Execute**):

| Icon | What it does |
| --- | --- |
| **Game Night** | Starts the game server if it isn't running, then shows the board full screen. Press **Alt+F4** to leave the full-screen board; the server and any game in progress keep running. |
| **Game Night Host Info** | Shows the host page address, a QR code for it and the PIN. Scan it with the host's phone. Close it before guests arrive. Only a browser on the Pi itself can open this page. |
| **Game Night Stop** | Stops the server. |
| **Game Night Update** | Downloads the newest version (the Pi must be online). Then Stop and start it again. |

Everything the server prints is saved in `data/server.log` if something doesn't start.

If the board opens as a **white screen**, Chromium is waiting on a hidden "choose password for new
keyring" prompt. The icons already start Chromium with `--password-store=basic` to avoid it. In an
ordinary Chromium window you can stop the prompt by choosing a blank password once and continuing. The icons
call `deploy/gamenight.sh`, which you can also run by hand (`tv`, `info`, `start`, `stop`, `update`).
These scripts were tested on a laptop, not yet on a real Pi.

### Software: by hand

The steps below do the same thing without the setup script, and add running the server as a
background service that starts at boot.

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
   chromium --kiosk --noerrdialogs --disable-infobars --password-store=basic --autoplay-policy=no-user-gesture-required http://localhost/tv &
   ```
   (The binary is `chromium-browser` on older images. Use `:3000` in the URL if
   you didn't set `PORT=80`.)

### Network

The server needs the Pi, the phones and (later) the buzzers on one network with
**client isolation off**; the host home's Wi-Fi and internet are optional.
Follow the Game Night SSID steps in the project plan, including the offline test
(Teleport off, no uplink) before the first real game. Phones may show "No
internet"; that's expected.

The QR code points at the Pi's current address and **follows it**: if the Pi joins a
different network (a new house, a different Wi-Fi), the TV notices within a few seconds
and redraws the code, and the server logs the new addresses. You don't need to restart
anything. Each house's router hands the Pi a different address, so the DHCP
reservation above only helps on your own network. Set `PUBLIC_URL` to pin the address
(for example if the Pi has several network connections and the wrong one is picked);
that turns the automatic update off.

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
games/feud/             Family Feud rules and its game module
engine/hub.js           what happens when a TV, host or phone sends a message (no idea how it travelled)
engine/core.js          room + hub + games wired to plain functions: runs in Node or inside the Apple TV app
engine/relay.js         the room's side of the online relay (room codes, channels, dropping quiet phones)
engine/jsc/             the entry point and shims for JavaScriptCore (the Apple TV)
server.js               server mode: HTTP, WebSocket, saving, QR codes, question-set API
public/                 the pages (tv, host, play, editor): thin shells, shared by both modes
public/relay/           the browser's online relay client (Supabase Realtime)
public/importer.js      importing sets: files, links, GitHub folders, the plain-text format
public/games/jeopardy/  Jeopardy's own TV, host, phone and editor screens
web/                    GENERATED copy of public/ for Vercel (node scripts/build-web.mjs); committed
dist/                   GENERATED engine.js for the Apple TV (node scripts/build-engine.mjs); not committed
relay.config.json       the Supabase project URL and publishable key (public by design)
docs/                   online mode, question sets
scripts/                build scripts, browser and live-relay checks, data helpers
data/<game>/            question sets for each game
data/sounds/            your own sound files, in a folder per game (not in git)
test/                   node --test suites (rules, full server, engine bundle, relay, importer)
.github/workflows/     CI: tests, web/ up to date, a real-browser check, a live Supabase check
deploy/                 desktop launcher + setup script, systemd unit
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
   `toJSON()` and `restore()`. Optional: `init()`, `contentChanged(setId)` and `tick()` (called a few times a second, for timers).
   A game's TV screen can also export `onChange(prev, view, sound)` to play sounds.
   A game that can only be played by a set number of teams adds `needs: { teams: 2 }` to
   its module (the room then always plays in teams, and the host cannot change that), and
   its `publicView()` can set `scoreFormat: 'points'` so scores show without a `$`.
   The full contract is the comment at the top of `room.js`. Score by changing
   `unit.score` on `room.units()`. Keep it free of sockets and files so it can be
   tested like `games/jeopardy/game.js`.
2. **Screens.** Add `public/games/<id>/` with `tv.js` (`render(view)` returns an
   element), `host.js` (`render(view, ctx)` returns `{ title, sub, body, dock, settings, danger }`:
   the Game tab's content, the action bar pinned under it, cards for the Settings tab and
   buttons for its danger zone; `ctx` gives `act`, `sets`, `setInfo`, `openSheet`, `confirm`, `go`...),
   `player.js` (`mount(container, ctx)` returns `{ update(view), onMessage(msg),
   destroy() }`) and `editor.js` (`mount(container, api)`). `public/games/jeopardy/`
   and `public/games/feud/` are the working examples.
3. **Register it** in `games/index.js`. The host page then offers it in the game
   picker, and `/editor?game=<id>` edits its content, stored under `data/<id>/`.

## Not built yet

From the plan: ESP32 firmware and enclosures (Phases 3-4). Next game: a Family
Feud-style survey game.
