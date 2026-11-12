# Family Game Night

A private Apple TV app for family game nights. Open it and pick a game:

| Game | What it is |
| ---- | ---------- |
| **Jeopardy** | A trivia board on the TV, with phones as buzzers. |
| **Family Feud** | Two teams guess the top survey answers: face-off, strikes, steal and Fast Money. |
| **Singo Night** | Bingo with songs: a short clip of each song plays from an Apple Music playlist, hints fade in, then the answer is revealed. |

**Jeopardy and Family Feud run inside the app.** Phones open a web page and connect to the TV through a free online
relay, so all you need is internet: no server or computer on your network. The game rules and the phone pages live in the
[`gamenight`](https://github.com/justinxwynkoop/gamenight) repo; this repo is the Apple TV app.

Family only: installed from Xcode onto your own Apple TV.

## Install it

1. **MusicKit** (only for Singo Night). In the Apple Developer portal (Certificates, Identifiers & Profiles →
   Identifiers), register the bundle ID `family.singonight.app` (or your own, see step 3) and tick **MusicKit** under
   App Services.
2. Open **`FamilyGameNight.xcodeproj`** in Xcode 16 or later.
3. **Signing.** Select the FamilyGameNight target → Signing & Capabilities → pick your team. If you change the bundle
   ID, use the same one in step 1.
4. **Pair the Apple TV.** On the Apple TV: Settings → Remotes and Devices → Remote App and Devices. In Xcode:
   Window → Devices and Simulators, pick the Apple TV and pair. Both need to be on the same Wi-Fi.
5. **Run.** Choose your Apple TV as the run destination (not "Any tvOS Device") and press ⌘R.

To update later: in Xcode choose **Source Control → Pull…**, then run again. Builds signed with a paid developer
account last a year; reinstall from Xcode after that.

## Play

1. On the home screen choose **Jeopardy** or **Family Feud**. The first time, choose **Run on this Apple TV** on the
   screen that appears (the app remembers).
2. The lobby shows a QR code and a 4-digit room code. Players scan the code, or open the site and type the digits.
3. The host opens the site's `/host` page on a phone and types the room code and the **host PIN**. The PIN is never on
   the board: press **Play/Pause** on the Apple TV remote and read it in the menu.
4. The host picks a question set and starts. The host page's **Questions** tab is the question editor.

**Remote:** **Menu** goes back to the game picker. **Play/Pause** opens a panel with the PIN, the room code, whether
phones are connected, **New room code**, **Change server** and **Back to games**.

The phone site is `https://gamenight-one.vercel.app`. To change it, or the online relay behind it, see
`FamilyGameNight/GameNight/RelayConfig.swift`.

## Documentation

| Read | For |
| --- | --- |
| [docs/HOSTING.md](docs/HOSTING.md) | How the Apple TV hosts the game, where its settings live, updating the engine inside the app, troubleshooting |
| [docs/GAMES-ON-TV.md](docs/GAMES-ON-TV.md) | What the TV shows for Jeopardy and Family Feud, the remote, sounds |
| [docs/CUSTOM-FILES.md](docs/CUSTOM-FILES.md) | Your own sound files and extra question sets (kept out of GitHub) |
| [docs/SINGO.md](docs/SINGO.md) | Singo Night: Apple Music, how a round plays, notes |
| [docs/DEVELOPING.md](docs/DEVELOPING.md) | Code layout, tests, the cloud build, adding a game, art |
| [docs/SERVER-MODE.md](docs/SERVER-MODE.md) | Optional: use a Game Night server instead of hosting on the Apple TV |

In the `gamenight` repo: [how the online mode works and is set up](https://github.com/justinxwynkoop/gamenight/blob/main/docs/ONLINE.md),
[how the games are played](https://github.com/justinxwynkoop/gamenight/blob/main/docs/PLAYING.md) and
[writing, importing and dragging in question sets](https://github.com/justinxwynkoop/gamenight/blob/main/docs/QUESTION-SETS.md).

## Tests

```bash
swift test
```

runs the display's logic, the models and the game engine (loaded into JavaScriptCore) on any Mac. Every push is also
built and tested on GitHub's macOS machines; see [docs/DEVELOPING.md](docs/DEVELOPING.md).

## Roadmap

Done: the home screen, Singo Night, Jeopardy and Family Feud on the TV, sound, hosting the game on the Apple TV with an
online question editor, importing, and your own sounds and sets. **Next:** TestFlight, the "Random board" buttons online,
and the Singo items in [docs/SINGO.md](docs/SINGO.md).
