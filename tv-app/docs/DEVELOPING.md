# Developing

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
  GameNight/                 The TV display (shared by both games) and Jeopardy
    JeopardyRootView.swift   Starts the game on the Apple TV, or asks for a server address if you chose **Change server**; then shows the display
    GameNightClient.swift    The TV's source of state: a server over WebSocket, or the engine running here
    ServerSettings.swift     Remembers the server address, or that the Apple TV hosts
    RelayConfig.swift        Supabase URL and publishable key, and the Vercel site address
    Engine/                  engine.js and sets.json, GENERATED from the gamenight repo (see above)
    Sounds/, Sets/           Your own sound files and extra sets, copied in on your Mac (git ignores them)
    SoundDirector.swift      Plays the sounds and music, downloads your own files
    Core/                    Platform-light (unit tested)
      EngineHost.swift       Runs engine.js in JavaScriptCore
      RealtimeClient.swift   Supabase Realtime client
      BundledSounds.swift    Finds your sound files inside the app
      LocalSets.swift        Finds extra question sets inside the app
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
  Feud/                      Family Feud (everything specific to it lives here)
    Core/                    No Apple frameworks (unit tested)
      FeudState.swift        The data the server sends for Family Feud, as Swift types
      FeudSounds.swift       Its sound cues and built-in sounds; the Fast Money tick
      FeudDisplay.swift      Which Family Feud screen to show
    Display/
      FeudScreens.swift      The round (flipping answers, strikes, the big X), Fast Money, the winner
  Assets.xcassets            App icon, Top Shelf, home screen tiles
Config/Info.plist            Local-network permission and plain-http allowance
Tests/SingoCoreTests/        Tests for Singo's Core
Tests/GameNightCoreTests/    Tests for the display's logic; Fixtures/ are real server messages
  Feud/                      Family Feud's tests
Tools/                       Art generators (Pillow), the fixture recorder, install-sounds.sh and install-sets.sh
```

The Xcode project uses a synced folder, so new files under `FamilyGameNight/`
show up in Xcode on their own.

### Adding a game

1. Add a case to `FamilyGame` (title, blurb, tile image name, accent colour).
2. Add its tile art to `Assets.xcassets` (1120×672, shown at 560×336).
3. Add its screen to `GameHost` in `HomeView.swift` (a game the server runs, like Family Feud, reuses the
   TV display in `GameNight/` and keeps its own models, sounds and screens in a folder of its own, as `Feud/` does). The screen gets an `exit`
   closure to call when the player presses Menu on its first screen.


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


## Cloud build and tests

Every push runs `.github/workflows/ci.yml` on GitHub's macOS machines: the unit tests (`swift test`: the display's logic,
the Family Feud models, and `EngineHostTests`, which load the real `engine.js` into JavaScriptCore and play a game
through the app's own decoder) and a build of the tvOS app without signing. A green run means the app builds and the
tests pass; it does not replace trying it on the Apple TV.


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


## First things to check

- Menu on Singo's playlist screen returns to the game picker; Menu inside
  Singo's setup screens goes back one step; Menu during a round still asks
  whether to end it.
- After backing out of a game, focus lands on that game's tile.
- The tile art and focus effect look right on the Apple TV.
- Jeopardy: a fresh install starts the game on the Apple TV with no prompt; **Change server** in the Play/Pause menu
  offers a server address instead, and **Run on this Apple TV** there switches back. Menu and Play/Pause behave as described above. Text is readable from
  across the room (sizes are in tvOS points at 1920×1080; adjust in `Display/`).
- Server mode only: the Local Network permission prompt appears the first time the display connects to a server.
- Sound: buzzers opening, buzz-in, correct/wrong and the countdown ticks play
  through the TV, and the host's sound toggle and volume take effect.

