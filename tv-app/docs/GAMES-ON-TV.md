# Jeopardy and Family Feud on the TV

What the Apple TV shows for each game, how the remote behaves, and how the sounds work. How the games are *played*
(rules, the host page, teams, timers) is in the `gamenight` repo's
[PLAYING.md](https://github.com/justinxwynkoop/gamenight/blob/main/docs/PLAYING.md). Both games use the same display;
each home-screen tile starts its own game, and the host can also switch games in the lobby.

## Remote

**Menu** goes back to the game picker. **Play/Pause** opens a small panel: the host PIN, the room code, whether phones
are connected, **New room code**, **Change server** and **Back to games**. A "Reconnecting…" or "Connecting phones…"
badge appears in the corner if the connection drops, and it keeps trying.

In **Jeopardy** the remote can also play: the buttons on screen (pick a clue on the board, Start game, Continue, Skip clue,
Flip last ruling, pack and era choices in the lobby) are all focusable. Only this Apple TV can do this; a phone or
browser that merely claims to be the TV is ignored by the game.

## Jeopardy screens

Jeopardy has its own look (dark stage, six bright column colours, Unbounded and Outfit type, both open source and
bundled in `GameNight/Fonts`): the lobby with eight seats, the question packs, an era row for real-show clues and a board
preview you can swap categories in; the board, with the player who picks marked; the clue, with a countdown ring, a big
**BUZZ IN!** and who buzzed and how fast; the answer with everyone's buzz times; Daily Double; round end; Final Jeopardy
(wagers locked in, clue and timer, answers revealed one by one); and the winner with awards. Scores run along the
bottom, with 🔥 for streaks, and emoji reactions from phones float up the screen. It is always individuals, up to ten.
The code is `GameNight/Display/BuzzTheme.swift`, `JeopardyLobbyBoard.swift` and `JeopardyClueFinal.swift`.

The lobby fetches one season of the public clue archive for each room (`GameNightClient.loadArchive`) and keeps nothing.

## Family Feud screens

The two team scores and the points on the board, the answers as numbered slots that flip over, three strike boxes, a
banner for what is happening (face-off, who plays, steal, round result), and Fast Money (the questions with a countdown,
then the two players' answers revealed beside the points, a running total and whether they reached the goal). The
winner screen adds the Fast Money result.

- **The survey question is not shown while the families are guessing**, so nobody gets a head start: the host reads it
  out. It appears when the round ends. In Fast Money the TV shows "Question 1" to "Question 5" while answers are being
  given, and the questions return on the reveal. (The phones follow the same rule.)
- A strike puts a big boxed X in the middle of the screen, which then slides down into the next empty strike box.
- In Fast Money the host reveals each answer in two steps: what the player said (typed out a letter at a time), then the
  points.

## Sound

The TV plays buzzers opening, a buzz-in, correct, wrong, Daily Double, Final Jeopardy, time's up, a tick for the last
five seconds of a countdown, and a fanfare for the winner (Jeopardy's sounds and music are unchanged by the new look). They are built from simple tones in code
(`GameNight/Core/SoundSynth.swift`), so no audio files ship with the app. Which sound goes with which change is
`GameNight/Core/SoundPlanner.swift`, tested against recorded game states. The host's phone controls sound on/off and
volume, and its **Test on TV** button plays a sound; the Apple TV's own volume still sets how loud it is in the room.

To use your own sound files instead, see [CUSTOM-FILES.md](CUSTOM-FILES.md).

## Fonts

The display uses the system's heavy condensed font. To use Anton instead, add `Anton-Regular.ttf` to the app target,
list it under "Fonts provided by application" in the Info settings, and it is picked up automatically.
