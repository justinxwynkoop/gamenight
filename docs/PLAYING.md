# How the games are played

This is what the host and players do in each game. Setup and running are in the [README](../README.md) and
[ONLINE.md](ONLINE.md).

## Jeopardy

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


## The host page

The host page (`/host`) is laid out like an app: **Game**, **Players**, **Scores**, **Settings** and
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
saved and survives a restart (inside the app on the Apple TV, or in `data/state.json` in server mode).


## Sound

The TV plays short sound effects: buzzers open, a buzz-in, correct, wrong, a Daily Double, Final
Jeopardy, time's up, and a tick for the last five seconds. They are built in, so nothing needs installing.
The host can turn sound off, change the volume, or press **Test on TV** at the bottom of the host page.
To use your own sound files, see the Apple TV app's README (online mode) or [SERVER-MODE.md](SERVER-MODE.md).
