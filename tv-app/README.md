# Family Game Night

A private Apple TV app for family game nights. Open it and pick a game:

| Game | What it is | Status |
| ---- | ---------- | ------ |
| **Singo Night** | Bingo with songs. Plays a short clip of each song from an Apple Music playlist, fades in hints, then reveals the answer. | Working (moved in from the `singo` repo) |
| **Jeopardy** | Trivia board on the TV, phones as buzzers. The Apple TV is the TV display for the [`gamenight`](https://github.com/justinxwynkoop/gamenight) server. | Built (display only); see [Jeopardy on the TV](#jeopardy-on-the-tv) |
| **Family Feud** | Two teams guess the top survey answers: face-off, strikes, steal and Fast Money. It uses the same TV display as Jeopardy. | Built (display only); see [Family Feud on the TV](#family-feud-on-the-tv) |

On the home screen, moving the remote highlights a tile: it grows, and the
background glows in that game's colour. Click to open a game. Menu goes back to
the game picker.

Family only: installed from Xcode, never the App Store or TestFlight.

> **Not yet built or tested.** This was written without Xcode. Expect a round of
> build fixes on first open, then check on a real Apple TV (see
> [First things to check](#first-things-to-check)).

## First-time setup

1. **Turn on MusicKit for the app ID.** In the Apple Developer portal
   (Certificates, Identifiers & Profiles → Identifiers), register the bundle ID
   `family.singonight.app` (or your own, see step 3) and tick **MusicKit**
   under App Services. If you already did this for the standalone Singo app,
   it's done.
2. **Open `FamilyGameNight.xcodeproj`** in Xcode 16 or later.
3. **Signing.** Select the FamilyGameNight target → Signing & Capabilities →
   pick your team. If you change the bundle ID, use the same one in step 1.
4. **Pair the Apple TV.** On the Apple TV: Settings → Remotes and Devices →
   Remote App and Devices. In Xcode: Window → Devices and Simulators, pick the
   Apple TV and pair. Both need to be on the same Wi-Fi.
5. **Run.** Choose the Apple TV as the run destination and press ⌘R. Apple
   Music access is only asked for the first time you open Singo Night.

The bundle ID is the same one the standalone Singo app used, so installing this
**replaces** that app on the Apple TV instead of adding a second icon. The
Apple TV needs an Apple Music account with an active subscription for Singo
Night. The tvOS Simulator can't play Apple Music, so test playback on a real
Apple TV. Jeopardy doesn't use Apple Music.

## How Apple Music works (Singo Night)

**Singo Night doesn't sign in to anything.** There's no login screen and no
password in the code. It uses Apple's MusicKit, which works through
whichever Apple Account is signed into Apple Music **on the Apple TV the app
is running on**:

- **Playlists:** the playlist screen shows the library of the account signed
  into that Apple TV.
- **Playback:** songs stream from that account, so it needs an active Apple
  Music subscription.
- **Permission:** the first time the app runs on an Apple TV, it asks for
  Apple Music access. That's a one-time "Allow" on the TV, not a login.

So it depends on the Apple TV, not on who built the app:

| Situation | Whose playlists show up |
| --------- | ----------------------- |
| You install the app on your Apple TV | Yours (the account on your Apple TV) |
| Your brother installs the app on his Apple TV | His |
| Your brother installs from his Mac onto your Apple TV | Yours: it's still your Apple TV |
| An Apple TV with several people set up | Whoever is the current user; switch in Control Center (hold the TV button) |

To check or change the account: on the Apple TV, **Settings → Users and
Accounts** (and **Settings → Apps → Music** for the Music app's own settings).
To switch accounts for a game night, switch the current user in Control
Center or sign a different account in there.

### The two Apple accounts involved

These are separate and don't affect each other:

1. **The developer account in Xcode** (Xcode → Settings → Apple Accounts). It
   only signs the app so the Apple TV will install it, and it's what MusicKit
   is turned on for (the `family.singonight.app` App ID). It has no access to
   anyone's music, photos or messages.
2. **The Apple Music account on the Apple TV.** This is where the playlists
   and songs come from.

### Setting it up on another Mac (e.g. your brother's)

1. Clone the repo and open `FamilyGameNight.xcodeproj`.
2. **Signing:** either
   - sign in to Xcode with an account on the same developer team, and the
     existing App ID with MusicKit already works; or
   - use his own paid developer team: change the bundle ID under
     **Signing & Capabilities** to something unique (e.g.
     `com.hisname.singo`), then register that ID in the developer portal and
     tick **MusicKit** under App Services. Without MusicKit on the App ID,
     the app can't load playlists or play songs.
3. Pair his Apple TV with Xcode and press ⌘R. The first launch asks for Apple
   Music access on that TV, then shows that TV's playlists.

## Playing a Singo round

1. Pick a playlist. The setup screen shows the playlist on the left with
   **Start Round**, and the settings on the right: click a row to change it.
   **Round:** clip length, where each song starts, the add-time button, and
   whether the next song starts automatically. **Hints:** genre, release
   year, title, album art and artist, each of which can be turned off. A
   timeline under the hints shows when each one appears. Choices are
   remembered.
2. A "Round starts in 5…1" countdown plays first. Songs play in a random
   order, and each one goes on the called list as soon as its music starts,
   so a Singo can be checked straight away.

   The hints that are on are spread evenly over the clip. With the defaults
   (title hint off) and a 30-second clip:

   | Time  | What happens |
   | ----- | ------------ |
   | 0s    | Black screen, song starts 45s in, ring starts filling; a fill-in title hint starts here |
   | 7.5s  | Genre and release year |
   | 15s   | Album art fades in heavily blurred, sharpening until 30s |
   | 22.5s | Artist |
   | 30s   | Reveal: title and sharp art (hints that are off stay off) |
   | 38s   | Next song starts; the music plays on through the answer (8 seconds, set in Round Setup), or waits for the host if auto-advance is off |

   Turn a hint off and the rest spread out to fill the gap; turn the title
   hint on (non-fill-in) and it takes the first slot.

   Hint times scale with the clip length, so a 60-second clip shows the
   default hints at 15, 30 and 45 seconds.

### Remote

| Press | Does |
| ----- | ---- |
| Play/Pause | Pause or resume the song and the clock |
| Replay | Restart the clip from the start offset (hints already shown stay up) |
| +15 sec | Before the reveal: pushes the reveal back. After: keeps the answer up longer |
| Called songs | Pauses and opens a full-screen list of every revealed song, in order or A–Z, to check a Singo |
| Skip / Next | Next song (the skipped song stays on the called list) |
| Menu/Back | Pauses and asks whether to end the round |

The control buttons sit dimmed along the bottom; swipe to move between them and
click to press. They're buttons rather than swipe shortcuts so a stray swipe
can't skip a song.

## Code layout

```
FamilyGameNight/
  FamilyGameNightApp.swift   App entry: shows the home screen
  Home/
    FamilyGame.swift         The list of games: title, tile art, colour
    HomeView.swift           Game picker, focus effects, GameHost (opens a game)
    HomeBackground.swift     Glow that follows the highlighted game
  Singo/                     Singo Night, moved in whole
    SingoRootView.swift      Singo's entry (Apple Music gate, playlist picker)
    Core/                    Game rules, no Apple frameworks (unit tested)
    Music/                   MusicKit, playback, round controller
    Views/                   SwiftUI screens
  GameNight/                 The Jeopardy TV display
    JeopardyRootView.swift   Asks for the server address once, then shows the display
    GameNightClient.swift    WebSocket connection to the server (joins as the TV)
    ServerSettings.swift     Remembers the server address
    SoundDirector.swift      Plays the sounds and music, downloads your own files
    Core/                    No Apple frameworks (unit tested)
      ServerState.swift      The data the server sends, as Swift types
      DisplayScreen.swift    Which screen to show; ranking and placing
      Countdown.swift        Local countdown between server updates
      SoundSynth.swift       The built-in sounds, made from tones
      SoundPlanner.swift     Which sound goes with which change; countdown ticks
      ServerAddress.swift    Parsing what you type: host, port, URLs
      Formatting.swift       Money, join address, player colours
    Display/                 SwiftUI screens
      JeopardyDisplayView    Picks the screen for the current state
      Lobby, Board, Clue (and Daily Double), Final, Leaderboard, Winner
      Status screens, address entry, QR code, score panel, timers, theme
  Assets.xcassets            App icon, Top Shelf, home screen tiles
Config/Info.plist            Local-network permission and plain-http allowance
Tests/SingoCoreTests/        Tests for Singo's Core
Tests/GameNightCoreTests/    Tests for the display's logic; Fixtures/ are real server messages
Tools/                       Art generators (Pillow) and the fixture recorder
```

The Xcode project uses a synced folder, so new files under `FamilyGameNight/`
show up in Xcode on their own.

### Adding a game

1. Add a case to `FamilyGame` (title, blurb, tile image name, accent colour).
2. Add its tile art to `Assets.xcassets` (1120×672, shown at 560×336).
3. Add its screen to `GameHost` in `HomeView.swift`. The screen gets an `exit`
   closure to call when the player presses Menu on its first screen.

## Art

The app icon, Top Shelf images and the two home screen tiles are drawn by
`Tools/make_app_art.py` (needs Python with Pillow, and the free Bebas Neue font for
the lettering: `apt install fonts-bebas-neue` on Debian/Ubuntu; elsewhere install it from
Google Fonts and point `BEBAS` at the file in the script):

```bash
python3 Tools/make_app_art.py FamilyGameNight/Assets.xcassets
```

`Tools/make_icon.py` holds the Singo Night drawing code it reuses. To use your
own art instead, replace the images in `Assets.xcassets` in Xcode.

## Tests

The Singo rules (`FamilyGameNight/Singo/Core`) and the Jeopardy display's logic
(`FamilyGameNight/GameNight/Core`) build without Apple frameworks, so they test
on the Mac directly:

```bash
swift test
```

Or open `Package.swift` in Xcode and press ⌘U.

`Tests/GameNightCoreTests/Fixtures/` holds the messages the Game Night server
sends, recorded from a scripted game (join, clues, buzzes, Daily Double, Final
Jeopardy, winner) so the tests read real data. If the server's messages change,
record new ones with `Tools/record-fixtures.mjs` (individual play), `Tools/record-team-fixtures.mjs` (team play), `Tools/record-round-fixtures.mjs` (two rounds) and `Tools/record-feud-fixtures.mjs` (Family Feud); their headers say how.

## Family Feud on the TV

The Family Feud tile opens the same TV display as Jeopardy (they share the saved server address). The
display draws whichever game the host has started on the server, so either tile works; the host picks
**Family Feud** in the game picker on their phone. Setup is the same as for Jeopardy (see above), and
the server needs the Family Feud version of `gamenight` (it adds `games/feud` and its question sets).

What the TV shows: the two team scores and the points on the board, the survey question, the answers
as numbered slots that flip over, three strike boxes, a banner for what is happening (face-off, who
plays, steal, round result), and Fast Money (the questions with a countdown, then the two players'
answers revealed beside the points, a running total and whether they reached the goal). The winner
screen adds the Fast Money result. Sounds follow the web TV: a ding for each answer, the big X for a
strike, the buzzers, and the fanfare. The Family Feud sound names for the server's `data/sounds/` are `ding`, `strike`,
`strikeout`, `faceoff`, `fastmoney`, `fmpoints`, `roundstart`, `winner` and `zero`, and the music `feud-lobby`.
`strikeout` and `zero` use your `strike` file if they have none of their own. Answers on the board flip over like cards. In Fast Money the host reveals each answer in two steps: what the
player said (typed out a letter at a time), then the points. A strike puts a big boxed X in the middle of
the screen, which then slides down into the next empty strike box.

`Tools/record-feud-fixtures.mjs` records the Family Feud states used by the tests (see the header for how).
The expected sounds in `FeudTests.swift` come from running the web TV's own `onChange()` on the same
recorded states.

## Jeopardy on the TV

The Jeopardy tile makes the Apple TV the **TV display** for a Game Night server
(the [`gamenight`](https://github.com/justinxwynkoop/gamenight) repo: Node.js,
runs on a Raspberry Pi or any computer on the network). Phones buzz and answer,
the host judges from a phone, and the server decides who was first. The Apple TV
only draws what the server tells it.

**Try it**
1. On a computer on your network: clone `gamenight`, then
   `npm install && HOST_PIN=1234 npm start`. It prints an address such as
   `192.168.1.50:3000`.
2. On the Apple TV open Family Game Night → Jeopardy and type that address
   (typing is easiest with an iPhone nearby: the Apple TV offers its keyboard).
   Say Allow if it asks to find devices on your network. The address is
   remembered.
3. Scan the QR code on the TV with a phone to join. The host scans the small
   **Host** code on the lobby screen (also in the Play/Pause panel during a game)
   to open the host page, enters the PIN once (the phone remembers it), and picks
   the question set and starts. The PIN is deliberately not shown on the TV: the
   host page shows every answer, and everyone can see the screen. Tip: have the
   host add that page to their phone's home screen, and give the Pi a fixed
   address in your router, so it is one tap from then on.

**Remote:** Menu goes back to the game picker. Play/Pause opens a small panel to
change the server or leave. The TV shows a "Reconnecting…" badge if the server
drops and keeps trying.

**Teams:** with six or more players the server splits everyone into Red and Blue
(Green and Yellow join above ten players, or when the host picks four teams). The
lobby shows each team and who is on it, and the score panel shows teams. The server
does the splitting; see the `gamenight` README, "Players and teams".

**Screens:** lobby (QR code, who has joined or who is on each team), board, clue (buzzers open, who is
answering, answer revealed, with a draining countdown), Daily Double, Final
Jeopardy (wagers with everyone's scores listed, clue and timer, judged answers), leaderboard, winner. Team
mode shows teams. If the server runs a game this app doesn't know, it says so.

**Sound:** see [Sound](#sound).

**Fonts:** the display uses the system's heavy condensed font. To use Anton (the
face in the design mockups), add `Anton-Regular.ttf` to the app target, list it
under "Fonts provided by application" in the Info settings, and it is picked up
automatically.

## Sound

The Jeopardy display plays the same sounds as the web TV: buzzers open, a buzz-in,
correct, wrong, Daily Double, Final Jeopardy, time's up, a tick for the last five
seconds of a countdown, and a fanfare for the winner. They are built from simple
tones in code (`GameNight/Core/SoundSynth.swift`, the same recipes as the web
TV's `public/audio.js`), so there are no audio files to ship. Which sound goes
with which change is `GameNight/Core/SoundPlanner.swift`, a port of the web TV's
logic, tested against the recorded server messages.

The host controls it from their phone: sound on/off and volume apply to the
Apple TV, and the host's **Test on TV** button plays a sound here too. The Apple
TV's own volume still sets how loud it is in the room.

**Your own sounds.** Anything you put in the server's `data/sounds/` folder
replaces the built-in sound of the same name, and the Apple TV downloads it when
Jeopardy opens (so re-open Jeopardy after adding files). Names: `open`, `buzz`,
`correct`, `wrong`, `timeup`, `tick`, `reveal`, `dd`, `final`, `fanfare`, `ding`, `strike`, `strikeout`, `faceoff`, `roundstart`, `winner`, `zero`, `fmpoints`, `fastmoney`, plus these
music files: `think` (loops during the Final Jeopardy countdown), `lobby`
(loops while players join; `think` is used if there is no `lobby`) and `feud-lobby` (the same, but only
when Family Feud is the game). Use `.mp3`,
`.wav` or `.m4a`; the Apple TV can't play `.ogg`, so those are skipped and the
built-in sound is used. Music only plays if you provide a file.

## Roadmap

1. ✅ Home screen with the game tiles; Singo Night running inside it.
2. ✅ Jeopardy: connect to the server and show the lobby.
3. ✅ Jeopardy: board, clues, Daily Double, Final Jeopardy, leaderboard, winner.
4. ✅ Jeopardy: sound effects (see [Sound](#sound)).
5. **Find the server automatically** with Bonjour instead of typing an address.
6. ✅ Family Feud: the game in the `gamenight` server, and its TV screens here (see
   [Family Feud on the TV](#family-feud-on-the-tv)).

The host picks which game is active from their phone; the Apple TV shows
whatever is active.

## First things to check

- Menu on Singo's playlist screen returns to the game picker; Menu inside
  Singo's setup screens goes back one step; Menu during a round still asks
  whether to end it.
- After backing out of a game, focus lands on that game's tile.
- The tile art and focus effect look right on the Apple TV.
- Jeopardy: the address prompt appears once; after that the tile connects by
  itself. Menu and Play/Pause behave as described above. Text is readable from
  across the room (sizes are in tvOS points at 1920×1080; adjust in `Display/`).
- The Local Network permission prompt appears the first time Jeopardy connects.
- Sound: buzzers opening, buzz-in, correct/wrong and the countdown ticks play
  through the TV, and the host's sound toggle and volume take effect.

## Singo notes

- Music videos in a playlist are skipped so the screen stays dark.
- Duplicate songs in a playlist are played once.
- If a library song is missing its genre, year or artwork, the app looks it up
  in the Apple Music catalog.
- For songs too short for the start offset, the clip starts earlier so it
  still fits.
- If three songs in a row fail to play (no subscription, no network), the round
  pauses with a message instead of running through the playlist.
- The Apple TV won't go to its screensaver during a round.
- Title hint styles (set before the round): off (default), blanks only,
  blanks + first letter, blanks + first letter of each word, or "fills in as
  it plays": starts as blanks when the song starts and fills in letters
  (first letters first) until about 70% are showing at the end of the clip. "Fills in, no blanks"
  does the same without the lines under each letter.
- Game screen: the album art is a big rounded square in the middle with a
  progress line around its edge that fills clockwise; the countdown is below
  it, the title hint above, genre and year on the left, artist on the right.
- The playlist's name and art sit in the top-right corner during the game.
- Background (in Round Setup): black, a glow in the playlist artwork's
  color, drifting colored light, floating bubbles, or bouncing balls. (They
  can't follow the beat: Apple Music doesn't let apps read the audio or a
  song's tempo.)
- Long titles shrink so the title hint always fits in two lines.
- Hints you turn off stay off, even at the reveal. The reveal always shows
  the song title.
- **Turn on Do Not Disturb before a round** (hold the TV button on the remote
  to open Control Center). Otherwise tvOS pops up a "Now Playing" card with
  the song title and artist each time a song starts. The setup screen shows
  this reminder too.
- If a song won't play, the reason shows on screen. Playback details also
  print in Xcode's console (filter for "playback") while running from Xcode.
- Builds signed with a paid developer account last a year; reinstall from Xcode
  after that.

## Singo: not built yet

Singo check by game type, printable bingo cards, saving a game if the Apple TV
sleeps, a sound cue at the reveal, and editing individual hint times.
