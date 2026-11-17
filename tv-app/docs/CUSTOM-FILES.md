# Your own sounds and question sets

Sound files and some question sets are not ours to publish, so they are **never committed to this repository**. They
are copied into the app on your Mac, where git ignores them, and Xcode packs them into the app the next time you run it.
A build made on GitHub's machines (the cloud build, including the GitHub route to TestFlight) will not contain them, so archive from your Mac when you want them ([TESTFLIGHT.md](TESTFLIGHT.md)).

## Your own sounds

```bash
Tools/install-sounds.sh <folder with your sounds>
```

The folder holds the sound files: files directly in it are used by every game; files in its `jeopardy/` and `feud/`
folders are used by that game only (and win over a shared file of the same name). The script copies `.mp3`, `.m4a` and
`.wav` files into `FamilyGameNight/GameNight/Sounds/` as `<game>__<name>.<ext>` (for example `feud__strike.mp3`,
`shared__think.mp3`) and skips anything the Apple TV cannot play, such as `.ogg`. The file names carry the game because
Xcode flattens resource folders into one.

A sound with no file falls back to the built-in tone. Names that are used:

- **Jeopardy:** `open`, `buzz`, `correct`, `wrong`, `timeup`, `tick`, `reveal`, `dd` (Daily Double), `final`, `fanfare`.
- **Family Feud:** `ding` (an answer flips), `strike`, `strikeout`, `faceoff`, `fastmoney`, `fmpoints`, `roundstart`,
  `winner`, `zero` (plus `open`, `tick`, `timeup`, `correct`). `strikeout` and `zero` use your `strike` file if they
  have none of their own.
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
