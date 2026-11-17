# How the games are played

This is what the host and players do in each game. Setup and running are in the [README](../README.md) and
[ONLINE.md](ONLINE.md).

## Jeopardy

Jeopardy is played by **individuals, up to eight**, with every phone as a buzzer. It runs on the Apple TV, and the
Siri Remote can do everything the players can (pick a clue, start, continue), so a game can start with nobody
touching the host page. The first player to join is the **captain**.

1. **Lobby.** Players scan the QR code (or type the room code) and join. The TV, or the captain's phone, chooses what
   to play:
   - **Your own boards** (the ones in the question editor), the **house packs** that come with the app, and
     **topics from the real show** (a random season of the public clue archive is fetched for each room, and you can
     choose the era: any, classic 80s and 90s, 2000s, recent). Switch on as many packs as you like; the game mixes
     twelve categories from them.
   - **Easy mode** keeps only casual, family-friendly packs.
   - **Preview the board** shows the twelve categories and lets you swap any of them before you start.
   - If you switch on **one or two of your own boards and nothing else**, they are played **just as you wrote them**
     (your categories, your values, your Daily Doubles), one board per round.
   - **A host judges out loud** switches typed answers off: players say their answer, and the host (on the host page
     or with the remote) taps Correct or Wrong.
2. **Board.** The player in control picks a clue on their phone (or on the TV with the remote). Round 2 is worth
   double and has two Daily Doubles; the lowest score picks first.
3. **Buzzers.** The clue is shown and read, then the buzzers open with a **7-second countdown** on the TV and the
   phone. The first press wins. A press before the buzzers open locks that player out for a moment. Everyone who
   pressed is timed, and the times are shown after the clue.
4. **Answer.** The winner has **15 seconds** to **type** the answer on their phone. The game checks it, forgiving case,
   articles ("the"), punctuation and small typos, and any "also accept" words on your own clues. **Right** scores and
   gives that player control. **Wrong** (or no answer) deducts the value and opens the buzzers again, for 6 seconds,
   for everyone who has not tried.
5. **Daily Doubles.** The clue stays hidden until the player in control wagers on their phone. The wager is at most their
   score or the round's top value, whichever is higher.
6. **Final Jeopardy.** Players with a positive score wager, then type an answer in 35 seconds. The answers are shown
   one at a time on the TV, lowest score first.
7. **Winner.** The champion, everyone's scores, and awards (Fastest Finger, Big Brain, On Fire, High Roller, Fearless).
   **Play again** deals new categories.

Also: streaks (**on fire** after three right in a row), emoji reactions that float up the TV from phones, and
**captain controls** on the captain's phone: choose packs, start, skip a clue, flip the last ruling, continue, end the
round, fix any score, remove a player (before the game), play again. If the captain stays away, someone else takes over.

If a clue is judged wrongly, **Flip the ruling** reverses it, including the score.


## The host page

The host page (`/host`; for Jeopardy it is optional, since the TV and the captain can run the game) is laid out like an app: **Game**, **Players**, **Scores**, **Settings** and
**Questions** (the question editor) tabs (a bar along the bottom on a phone, a rail down the side on a tablet or
laptop). The one thing to do next is always a large button pinned at the bottom
(Start game, Open buzzers, Correct / Wrong, Back to the board...). Choices open as
slide-up sheets. Game rules and timers live under Settings, and ending the game
is tucked away at the bottom of Settings behind a confirmation.


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
   secure `https` page, which the online site is, but a plain-`http` server is not, so there it may say
   "Voice isn't allowed here"; the microphone on the phone's own keyboard always works and fills the box the same way.) The reveal then goes as on the show, one answer at a
   time: the host reads the question, taps **Reveal what they said** (the TV types the answer out on the
   board), says "survey says", then taps the points button (the TV shows the points). Each survey list is
   shown on the host screen with a tag where each player's answer landed, so the rank is visible without
   opening anything, and the points button already says what it will score (for example **#1 Apple ·
   +34**; the game also scores a repeat of player 1's answer as zero). An answer left blank is a zero
   that needs just one tap, and shows as NO ANSWER. Reach 200 points to win.
6. **Undo.** A mis-tap is easy on a phone, so **Undo** takes back the last reveal, strike or choice,
   including the points.

Question sets are written in the editor (see [QUESTION-SETS.md](QUESTION-SETS.md)). Each has 3 to 8
rounds of a question with 3 to 8 ranked answers (points are how many out of 100 said it), optional
"also accept" words for matching, and exactly five Fast Money questions. Five sample sets ship with the
repo; their survey numbers are made up, not real survey results.


## Players and teams

- **Jeopardy** is always individuals, up to eight players.
- **Family Feud** is always two teams, Red and Blue. Players are dealt onto them at random and the host can move anyone,
  rename a team, or **Shuffle teams** in the lobby. Rearranging only happens in the lobby; once a game starts nothing
  moves, and anyone who joins late is put on the smaller team.
- On a phone in Family Feud the **team colour lights up**: a frame round the screen and a banner with the team name and
  teammates.

**Timers (Jeopardy).** All of them are shown on the TV and on the phones.

| Timer | Default |
|---|---|
| Buzz in (after the clue is read) | 7 seconds, 6 after a wrong answer |
| Typed answer | 15 seconds; a Daily Double gets 20 after the clue is read |
| Spoken answer, with a host judging | the host's choice: 5, 10, 15, 20, 30 seconds or none (the host then still has 3 seconds to rule) |
| Final Jeopardy answer | 35 seconds |

**Early buzzes.** Pressing before the buzzers open locks that player out for 0.4 seconds.

**Reconnects.** A phone that sleeps or refreshes rejoins as the same player with
its score (an id is kept in the browser). The whole game, scores included, is
saved and survives a restart (inside the app on the Apple TV, or in `data/state.json` in server mode).


## Sound

The TV plays short sound effects: buzzers open, a buzz-in, correct, wrong, a Daily Double, Final
Jeopardy, time's up, and a tick for the last five seconds. (Jeopardy's sounds and music are the same ones the game has always used; your own files replace them.) They are built in, so nothing needs installing.
The host can turn sound off, change the volume, or press **Test on TV** at the bottom of the host page.
To use your own sound files, see the Apple TV app's [CUSTOM-FILES.md](../tv-app/docs/CUSTOM-FILES.md) (online mode) or [SERVER-MODE.md](SERVER-MODE.md).
