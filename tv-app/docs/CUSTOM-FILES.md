# Your own sounds and question sets

Sound files and some question sets are not ours to publish, so they are **never committed to this repository**. They
are copied into the app on your Mac, where git ignores them, and Xcode packs them into the app the next time you run it.
A build made on GitHub's machines (which is how every TestFlight build is made) will not contain them. For sounds, use the host page below instead, which works with every build.

## Your own sounds, from the host page (the easy way)

Open the host page, then **Settings → Your own sounds**. Choose the game, which sound it is (the lobby music, a strike, the
Daily Double...), pick the file on your phone or computer and tap **Add to the TV**. The Apple TV keeps it in its Caches
folder (the one place an Apple TV app may write; the Apple TV only clears it when it is nearly out of space, and the list
then shows empty so you can add the sound again), so:

- it works in **every build**, including the ones GitHub makes by itself, and it stays through app updates;
- the file goes **only to your TV**, over the same link the phones use. It is not put on GitHub or any server;
- you do not need a Mac, Xcode or a new TestFlight build, and a new sound plays straight away;
- adding the same sound again replaces it, and **Remove** goes back to the built-in one.

Files can be `.mp3`, `.m4a` or `.wav` (about 7 MB at most). A file for one game beats an "Every game" file of the same name,
and a sound added here beats one packed into the app with the Mac script below. Needs the Apple TV app (the website's TV page
cannot keep files). Please only add sounds you have the right to use.

## Your own sounds, from your Mac (packed into the app)


```bash
Tools/install-sounds.sh <folder with your sounds>
```

The folder holds the sound files: files directly in it are used by every game; files in its `jeopardy/`, `feud/` and `spynight/`
folders are used by that game only (and win over a shared file of the same name). The script copies `.mp3`, `.m4a` and
`.wav` files into `FamilyGameNight/GameNight/Sounds/` as `<game>__<name>.<ext>` (for example `feud__strike.mp3`,
`shared__think.mp3`) and skips anything the Apple TV cannot play, such as `.ogg`. The file names carry the game because
Xcode flattens resource folders into one.

**Jeopardy's built-in recordings.** The one exception to "never committed": Jeopardy ships with recorded sounds and
music carried over from the Buzzworthy game (`Sounds/jeopardy__*.m4a`, and the theme `Sounds/shared__lobby.m4a`, free to use under CC0, see `Sounds/CREDITS.txt`),
including the lobby theme ("Happy Dance") and the Final Jeopardy thinking music. They are in every build, TestFlight
included. To replace one, install your own `jeopardy/<name>.m4a`: it overwrites the file of the same name on your Mac.
(Use `.m4a` for those names; an `.mp3` of the same name would sit beside ours and lose to it.)

A sound with no file falls back to the built-in tone. Names that are used:

- **Jeopardy:** `open`, `buzz`, `correct`, `wrong`, `timeup`, `tick`, `reveal`, `dd` (Daily Double), `final`, `fanfare`,
  `roundstart`, `board` (the board fills in), `pick` (a clue is picked), `bet` (a Daily Double bet), `lock` (a Final wager
  or answer locks in), `join` (a player joins), `applause` (the end of a round, and the winner).
- **Family Feud:** `ding` (an answer flips), `strike`, `strikeout`, `faceoff`, `fastmoney`, `fmpoints`, `roundstart`,
  `winner`, `zero` (plus `open`, `tick`, `timeup`, `correct`). `strikeout` and `zero` use your `strike` file if they
  have none of their own.
- **Spy Night:** it ships with its own sounds and lobby music (original, CC0: `Sounds/spynight__*.m4a`, made by
  `Tools/make_spynight_sounds.py`), so it works with nothing installed. They use these names, each meaning something of
  its own: `lobby` (music while players join), `roundstart` (the roles are dealt), `pick` (a leader starts picking a team),
  `open` (the vote begins), `correct` (a team is approved), `wrong` (rejected), `lock` (the mission begins), `ding` (a
  mission succeeds), `strike` (it fails), `fanfare` (the Resistance win), `winner` (the Spies win), `join`. Your own
  `spynight/<name>` file (or a shared one) replaces any of them; the host page's "Your own sounds" lists them as Spy Night.
- **Music, any game:** `lobby` loops while players join (`think` is used if there is no `lobby`), and `think` loops
  during the Final Jeopardy countdown. Music only plays if you provide a file.

## Extra question sets

The app ships with 16 sets. Sets that must stay out of GitHub, such as boards built from public survey data, are
copied in the same way:

```bash
Tools/install-sets.sh <folder with jeopardy/ and feud/ folders of .json files>
```

It copies the sets that do not already ship with the app into `FamilyGameNight/GameNight/Sets/` as
`<game>__<id>.json`. Anything you save or import in the online editor is kept on the Apple TV instead; how to write,
import and drag in sets is in the `gamenight` repo's
[QUESTION-SETS.md](https://github.com/justinxwynkoop/gamenight/blob/main/docs/QUESTION-SETS.md).
