# Singo Night

Bingo with songs: a short clip of each song plays from an Apple Music playlist, hints fade in, then the answer is revealed.

## How Apple Music works

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

