# Adding a game

The room handles everything games have in common: joining by QR code, names and
colours, teams, scores, reconnecting, the host's player controls, saving, and the
buzzer connection. A game supplies its rules and its screens.

1. **Rules.** Create `games/<id>/index.js` exporting `{ id, name, description,
   validateContent, create(room) }`. `create` returns an object with
   `inProgress()`, `act(action, args)` (host actions), `onPlayer(player, msg)`
   (a message from a phone or buzzer; may return a reply), `publicView()` and
   `hostView()` (what the TV and phones may see / what the host may see),
   `toJSON()` and `restore()`. Optional: `init()`, `contentChanged(setId)` and `tick()` (called a few times a second, for timers).
   A game's TV screen can also export `onChange(prev, view, sound)` to play sounds.
   A game that can only be played by a set number of teams adds `needs: { teams: 2 }` to
   its module (the room then always plays in teams, and the host cannot change that), and
   its `publicView()` can set `scoreFormat: 'points'` so scores show without a `$`.
   The full contract is the comment at the top of `room.js`. Score by changing
   `unit.score` on `room.units()`. Keep it free of sockets and files so it can be
   tested like `games/jeopardy/game.js`.
2. **Screens.** Add `public/games/<id>/` with `tv.js` (`render(view)` returns an
   element), `host.js` (`render(view, ctx)` returns `{ title, sub, body, dock, settings, danger }`:
   the Game tab's content, the action bar pinned under it, cards for the Settings tab and
   buttons for its danger zone; `ctx` gives `act`, `sets`, `setInfo`, `openSheet`, `confirm`, `go`...),
   `player.js` (`mount(container, ctx)` returns `{ update(view), onMessage(msg),
   destroy() }`) and `editor.js` (`mount(container, api)`). `public/games/jeopardy/`
   and `public/games/feud/` are the working examples.
3. **Register it** in `games/index.js`. The host page then offers it in the game
   picker, and `/editor?game=<id>` edits its content, stored under `data/<id>/`.

After adding a game, rebuild the engine for the Apple TV app (see [ONLINE.md](ONLINE.md)): `engine/jsc/entry.js` picks the game up from `games/index.js`.
