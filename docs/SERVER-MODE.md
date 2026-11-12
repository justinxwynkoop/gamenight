# Server mode: run the game on a Raspberry Pi (or any computer)

The original way to run Game Night, and still fully supported. A small Node.js server does the work: it serves the TV
page, the phone pages and the game over your own Wi-Fi. Nothing here needs the internet. For the newer way, where the
Apple TV app runs the game and phones connect over the internet, see [ONLINE.md](ONLINE.md).

| Page | Who | Address |
| --- | --- | --- |
| TV | the TV (a kiosk browser) | `/tv` |
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
on this Pi yet" and shows the command.) The newest 12 random boards are kept.


## Your own sounds


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

