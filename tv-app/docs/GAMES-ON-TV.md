# Jeopardy and Family Feud on the TV

What the Apple TV shows for each game, how the remote behaves, and how the sounds work. How the games are *played*
(rules, the host page, teams, timers) is in the `gamenight` repo's
[PLAYING.md](https://github.com/justinxwynkoop/gamenight/blob/main/docs/PLAYING.md). Both games use the same display;
each home-screen tile starts its own game, and the host can also switch games in the lobby.

## Remote

**Menu** goes back to the game picker. **Play/Pause** opens a small panel: the host PIN, the room code, whether phones
are connected, **New room code**, **Change server** and **Back to games**. A "Reconnecting…" or "Connecting phones…"
badge appears in the corner if the connection drops, and it keeps trying.

## Jeopardy screens

Lobby (QR code, who has joined or who is on each team), board, clue (buzzers open, who is answering, answer revealed,
with a draining countdown), Daily Double, Final Jeopardy (wagers with everyone's scores listed, clue and timer, judged
answers), leaderboard, winner. With six or more players the game splits everyone into Red and Blue (Green and Yellow
join above ten players, or when the host picks four teams), and the lobby and score panel show teams.

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
five seconds of a countdown, and a fanfare for the winner. They are built from simple tones in code
(`GameNight/Core/SoundSynth.swift`), so no audio files ship with the app. Which sound goes with which change is
`GameNight/Core/SoundPlanner.swift`, tested against recorded game states. The host's phone controls sound on/off and
volume, and its **Test on TV** button plays a sound; the Apple TV's own volume still sets how loud it is in the room.

To use your own sound files instead, see [CUSTOM-FILES.md](CUSTOM-FILES.md).

## Fonts

The display uses the system's heavy condensed font. To use Anton instead, add `Anton-Regular.ttf` to the app target,
list it under "Fonts provided by application" in the Info settings, and it is picked up automatically.
