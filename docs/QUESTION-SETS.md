# Question sets

A question set is one board of questions for a game: a Jeopardy board, or a Family Feud game. Each set is a small
JSON document with a **title** and a **file name** (the id, lowercase letters, numbers and dashes, such as
`family-night`). The game checks every set before it is saved, so a bad set is refused with a message.

## Ways to get sets

| Way | Where |
| --- | --- |
| **Sets that come with the app** | `data/<game>/*.json` in this repo (11 Jeopardy and 5 Family Feud). They are packed into the Apple TV app. |
| **The editor** | `<site>/editor` (online) or `/editor` on the Pi. On the host page, the **Questions** tab opens it. |
| **Import** | In the editor, the **Import sets** card (see below). |
| **Extra sets copied into the app on your Mac** | `Tools/install-sets.sh` in the `familygamenight` repo (for sets that must stay out of GitHub). |
| **Write the JSON by hand** | Any text editor; see the formats below. |

Where they live: **online**, the Apple TV keeps sets you save or import (they survive restarts, but not deleting the app),
on top of the ones that shipped inside the app. In **server mode**, sets are files in the server's `data/<game>/` folder.

## Importing

Open the editor, then the **Import sets** card at the top. You can:

- **Drop a file** on the card (a `.json` or `.txt` file), or press **Choose a file…**. Several files at once work, and
  one bad file does not stop the rest.
- **Paste the text** of a set (JSON or the plain-text format below).
- **Paste a link**: a link to a `.json` file; a GitHub link to a file (`…/blob/main/x.json`); a GitHub folder
  (`…/tree/main/data/feud`); or a whole repository (it looks in `data/<game>` first, then the top folder).
  The files must already be in this project's set format. This does not read other formats (for example Jeopardy
  archives).

Each set is saved under a name made from its title. Reload the editor to see new sets in its list.

## The plain-text format

For writing a set in any text editor (or having an AI write it). Blank lines are ignored, and lines starting with `//`
are comments.

### Family Feud

```
title: Grandma's House

? Name something you find in a kitchen
Spoon - 30
Fork - 25 | forks, silverware
Plate - 20
Cup - 15
Knife - 10

? Name a fruit you can eat on the go
Apple - 34
Banana - 30
Grapes - 16

fast money
? First Fast Money question
Dog - 50
Cat - 30
Fish - 20
```

- `? text` starts a question. A game has 3 to 8 rounds.
- An answer is `text - points` (a hyphen, en dash, em dash or colon). Points are how many people out of 100 said it,
  1 to 100. Each question has 3 to 8 answers, most popular first.
- After `|`, list other words to accept, separated by commas.
- A line `fast money` starts the Fast Money questions: exactly five (or leave Fast Money out).

### Jeopardy

```
title: Holiday Trivia

# Christmas
200 | This tree is often decorated in December | What is a fir?
400 | Reindeer pull this | What is a sleigh?
600* | Gift-giver in a red suit | Who is Santa Claus?
800 | … | …
1000 | … | …

# Another category
200 | … | …

final | Category | The final clue | The answer
```

- `# name` starts a category. A board has six categories of five clues, with values 200 to 1000 in steps of 200.
- A clue is `value | the clue | the answer`. A `*` after the value makes it a Daily Double. If none are marked,
  the game places them at random each time.
- `final | category | clue | answer` is Final Jeopardy.
- The clue and answer cannot contain a `|`.

## The JSON formats

**Family Feud**

```json
{
  "title": "Grandma's House",
  "rounds": [
    { "question": "Name something in a kitchen",
      "answers": [ { "text": "Spoon", "points": 30, "aliases": ["spoons"] }, { "text": "Fork", "points": 25 }, { "text": "Plate", "points": 20 } ] }
  ],
  "fastMoney": [ /* exactly 5 questions in the same shape, or leave this out */ ]
}
```

3 to 8 `rounds`; each question has 3 to 8 answers. `aliases` are other words the host should treat as the same answer.

**Jeopardy**

```json
{
  "title": "Holiday Trivia",
  "categories": [
    { "name": "Christmas",
      "clues": [ { "value": 200, "clue": "…", "answer": "…" }, { "value": 600, "clue": "…", "answer": "…", "dailyDouble": true } ] }
  ],
  "final": { "category": "…", "clue": "…", "answer": "…" }
}
```

Six categories of five clues each. The exact rules are `validateSet` in `games/jeopardy/game.js` and
`games/feud/game.js`.

## Boards built from public data (kept out of GitHub)

`scripts/get-feud-sets.sh` and `scripts/make-feud-sets.mjs` build Family Feud sets from the public ProtoQA survey data,
and `scripts/get-clues.sh` fetches a Jeopardy clue file for the Pi's **Random board** button. These data files and the
sets built from them (`data/feud/protoqa-*.json`, `data/feud/random-*.json`, `data/jeopardy/random-*.json`,
`data/clues/`, `data/surveys/`) are listed in `.gitignore` and must never be committed. To use such sets on the Apple TV,
copy them into the app on your Mac with `Tools/install-sets.sh` (see the `familygamenight` README).
