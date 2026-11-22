# How the games are played

This is what the host and players do in each game. Setup and running are in the [README](../README.md) and
[ONLINE.md](ONLINE.md).

## Jeopardy

**Becoming the host.** The TV's lobby has a small **Hosting? Scan to host** code. Scanning it opens the host page already
signed in (the PIN is built into the code and removed from the address bar at once), so there is nothing to type and no menu
to open. Anyone who scans it becomes a host, the same as typing the PIN. The PIN is also in the Play/Pause menu.

Jeopardy is played by **individuals, up to ten**, with every phone as a buzzer. It runs on the Apple TV, and the
Siri Remote can do everything the players can (pick a clue, start, continue), so a game can start with nobody
touching the host page. The first player to join is the **captain**, unless someone is hosting: with a host connected (or
**A host judges out loud** on) there is **no captain**, and the topics are the host's to choose on the host page. The TV lobby
then shows only who has joined.

1. **Lobby.** Players scan the QR code (or type the room code) and join. The TV (**Choose questions**), the captain's
   phone or the host page chooses what to play, on three shelves:
   - **Real show**: topics from a random season of the public clue archive, fetched for each room. Pick the era (any,
     classic 80s and 90s, 2000s, recent) and switch topics on or off.
   - **Family packs**: the packs that come with the game (Easy Breezy is the casual, family-friendly one).
   - **Your games**: whole boards written in the question editor (the host page's **Questions** tab), played **just
     as written** (your categories, your values, your Daily Doubles). Pick one, or add a second one as round 2.
     Making one: six categories of five clues and a Final, and it appears on this shelf.
   - Switch on as many topics and packs as you like; the game mixes twelve categories from them. **Preview and swap**
     shows the twelve and lets you swap any of them before you start.
   - **No repeats.** The TV remembers every clue it has shown (on the Apple TV and in the browser, kept between rooms).
     Each topic says how many of its categories are still new, and the game deals new categories first, so a clue only
     comes back once every clue in its pack has been played. Then that pack starts over. **Start fresh** forgets it all.
   - **A host judges out loud** switches typed answers off: players say their answer, and the host (on the host page
     or with the remote) taps Correct or Wrong.
2. **Board.** The player in control picks a clue on their phone (or on the TV with the remote). Round 2 is worth
   double and has two Daily Doubles; the lowest score picks first.
3. **Buzzers.** The clue is shown and read, then the buzzers open with a **7-second countdown** on the TV and the
   phone. Every phone turns gold at the same instant as the TV, and **the fastest thumb wins, not the fastest Wi-Fi**
   (see Fair buzzing below). A press before the buzzers open locks that player out for a quarter second. Everyone
   who pressed is timed, and the times are shown after the clue.
4. **Answer.** The winner has **15 seconds** to **type** the answer on their phone. The game checks it, forgiving case,
   articles ("the"), punctuation and small typos, and any "also accept" words on your own clues. **Right** scores and
   gives that player control. (With a host judging, Correct goes straight back to the board; the score count-up carries on in
   the podiums along the bottom.) **Wrong** (or no answer) deducts the value and opens the buzzers again, for 6 seconds,
   for everyone who has not tried.
5. **Daily Doubles.** The clue stays hidden until the player in control wagers on their phone. The wager is from **$0** up to their
   score or the round's top value, whichever is higher: quick buttons for $0, half and all in, and a box to type any amount.
6. **Final Jeopardy.** Players with a positive score wager. **The clue is never shown by the last wager coming in:** when
   everyone is locked in the host (or the captain, or the TV remote's **Show the clue** button) starts it. (If the 60-second
   wager clock runs out first, whoever has not bet bets nothing, and it still waits to be started.) Then everyone types an
   answer in 35 seconds. The answers are shown one at a time on the TV, lowest score first.
7. **Winner.** The champion, everyone's scores, and awards (Fastest Finger, Big Brain, On Fire, High Roller, Fearless).
   **Play again** deals new categories.

**Buzz times.** Everyone's buzz times, ranked and to the thousandth of a second, stay along the bottom of the TV for the whole
clue (also after a wrong answer, when the buzzers open again), and for ten seconds on the board after it ends.

Also: streaks (**on fire** after three right in a row), emoji reactions that float up the TV from phones, and
**captain controls** on the captain's phone: choose packs, start, skip a clue, flip the last ruling, continue, end the
round, fix any score, remove a player (before the game), play again, or hand the captain to someone else. If the
captain stays away, someone else takes over. **Changing the captain:** on the Apple TV, select a player's seat in the
lobby, or open the game menu (Play/Pause) at any time and pick **Change the captain**; on the website's TV, click a
seat in the lobby; on the host page, **Make captain** in the Players tab.

**What's going on:** a strip along the bottom of the TV says whose moment it is and what happens next (whose pick and
why, who buzzed, who has to press Continue). On the Apple TV the remote always lands on the one button that moves the
game along (Start game, Show the board, Next, Start round 2, Correct and Wrong for a host, Play again), or on a clue
on the board. Everything else (skip a clue, flip a ruling, the captain, end the round or the game, the host PIN) is
in the game menu: **Play/Pause**, or **Menu** at the end of the bar.

**End game** (on the TV's buttons, the Apple TV's Play/Pause menu, the captain's phone and the host page) stops a game
part way: scores reset and the TV and every phone go back to the lobby, with the players still in. **New room code**
(in the lobby, and in the TV's menu) starts an empty room: nobody from the old room comes along.

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
3. **Play or pass.** The winners choose (anyone on that team can tap **Play** or **Pass** on their phone). Their team then names answers; the host taps each one and it
   flips on the TV. A **strike** puts a big boxed X in the middle of the TV, which then slides down into
   the next empty strike box. Three **strikes** and the other team gets one **steal** guess: a good steal takes the
   whole pot, a miss leaves it with the first team.
4. **Scoring.** Points on the board are banked when the round ends. Rounds 4 and 5 are worth double and
   triple (switch off under Settings). First team to the winning score, or the last round, ends the
   rounds.
**No host?** Switch on **No host: type answers on phones** (the first player to join, the captain, sees it on
their phone; it is also on the host page). Then the buzzers open by themselves, whoever's turn it is types the
guess, and the survey checks it (each answer's aliases count too). A guess that is already on the board is not a
strike. The captain's phone starts the game, picks the question set and moves on to the next round; Fast Money
moves on when time is up and reveals itself. Every phone shows the question and a small copy of the board.

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


## Spy Night

A game of secret roles for **five to ten players**, each on their own phone. It is the same kind of game as the
board game *The Resistance* and *Werewolf*, with its own name and look (base game only: no extra modules).

**Roles.** When the game starts every phone shows a secret card. Most players are the **Resistance**; the rest are
**Spies**: 2 Spies with 5 or 6 players, 3 with 7, 8 or 9, and 4 with 10. The Spies' phones list the other Spies; the
Resistance learn nothing. The role card stays hidden until you tap it, and a **My role** button lets you look again.
Neither the TV nor the host page ever shows a role while the game is running, so the host can play too.

**Five missions.** The Resistance win by completing three; the Spies win by failing three.
1. The **leader** (it passes clockwise after every vote) picks a team, which may include themselves. The mission
   sizes are 2/3/2/3/3 with 5 players, 2/3/4/3/4 with 6, 2/3/3/4/4 with 7, and 3/4/4/5/5 with 8, 9 or 10.
2. Everyone votes **Approve** or **Reject** on their phone. Votes show together when the last one is in. More than
   half approving sends the team; a tie rejects. Five rejected teams in a row and the Spies win.
3. The team members each play **Success** or **Fail** in secret. The Resistance can only play Success; a Spy may play
   either. One Fail card fails the mission (two are needed on the fourth mission with 7 or more players). Everyone
   sees how many Fail cards there were, never who played them.

**Who starts it.** With a host page open, the host presses **Deal the roles**. Without one, the first player to join
does, from their phone. Anyone who goes away does not hold things up: their vote counts as Reject, and their mission
card as Success. The host (or the first player) can also **Move on without waiting**. Past votes are public, so the
phones keep a "Who voted for what" list to argue over. When the game ends everyone's role is shown.

## Players and teams

- **Jeopardy** is always individuals, up to ten players.
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

**Early buzzes.** Pressing before the buzzers open locks that player out for 0.25 seconds, as on the show. The phone
shows it the instant you press (the button flashes red and buzzes in your hand), and the TV keeps the same lockout.

**Fair buzzing.** Each phone keeps its clock in step with the TV's: every few seconds it asks the TV the time, and
keeps the answer that came back quickest, the way network time works. The TV tells every phone ahead of time when the
buzzers will open, so all the buttons turn gold together, and each press is stamped with when it happened on the TV's
clock. The TV then waits a split second (at most 0.35 seconds, and only as long as the slowest phone's messages take)
for a press that happened earlier but is still on its way, and the earliest press wins. A phone resends its press
until the TV confirms it, so a Wi-Fi hiccup doesn't lose a buzz, and checks its connection the moment it comes back
from the lock screen. The whole middle of the screen is the buzzer, it fires the moment a finger lands, and it buzzes
in your hand (Android, and iPhones on iOS 18 or later).

**Reconnects.** A phone that sleeps or refreshes rejoins as the same player with
its score (an id is kept in the browser). The whole game, scores included, is
saved and survives a restart (inside the app on the Apple TV, or in `data/state.json` in server mode).


## Sound

The TV plays short sound effects: buzzers open, a buzz-in, correct, wrong, a Daily Double, Final
Jeopardy, time's up, and a tick for the last five seconds. Jeopardy uses recorded sounds that came over from the Buzzworthy game, with a theme song ("Happy Dance") looping on the main menu and in every game's lobby and thinking music during Final Jeopardy; they are free to use (CC0, credits in `public/builtin-sounds/jeopardy/CREDITS.txt`). Family Feud has its own original theme tune, right-answer ding and face-off buzzer (made for this project, CC0, credits in `public/builtin-sounds/feud/CREDITS.txt`), and its other sounds are synthesized. Spy Night has its own original sounds and a noir-style lobby tune (made for this project, CC0, credits in `public/builtin-sounds/spynight/CREDITS.txt`): the roles being dealt, a vote starting, a team approved or rejected, a mission succeeding or failing, and a win for each side. Your own files replace any of them. They are built in, so nothing needs installing.
The host can turn sound off, change the volume, or press **Test on TV** at the bottom of the host page.
To use your own sound files, see the Apple TV app's [CUSTOM-FILES.md](../tv-app/docs/CUSTOM-FILES.md) (online mode) or [SERVER-MODE.md](SERVER-MODE.md).
