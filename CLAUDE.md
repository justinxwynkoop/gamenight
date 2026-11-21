# House rules for working on Game Night

Family game night for two brothers (Jason and Justin) and their families: Jeopardy, Family Feud and Singo Night on
the TV, played from phones. Everything is in this one repository. Read `README.md` for the layout.

## How changes go in

- Work on a branch and open a pull request into `main`. Nearly every PR is written by Claude.
- **Merging is going live.** The project is still in development, so there are no preview or staging steps: when the
  checks pass, merge. Vercel deploys the website from `main`, and the TestFlight workflow uploads a new Apple TV build
  when the app, rules, engine or shipped question sets change.
- Merge only once **every** check on the PR has finished and passed, including the slow Mac ones ("Apple TV app" and
  "Build and sign for TestFlight (no upload)", about 10 minutes). A check still running is not a pass.
- If an issue labelled `main-broken` is open, something failed on `main` after a merge (alert.yml opens it): fix that
  first. It closes itself when the workflow passes again.
- Never skip or weaken a test to get a green check. Fix the cause.

## Before you push

- `npm test` must pass.
- After changing anything outside `tv-app/` (rules, engine, pages, question sets), run `npm run build` and commit what
  it writes: `web/` and `tv-app/FamilyGameNight/GameNight/Engine/{engine.js,sets.json}`. CI fails if they are stale.
  Never edit those generated files by hand.
- Page changes: `npm run e2e` drives the real phone, host, editor and browser TV pages in Chromium (Playwright is
  preinstalled in Claude's cloud sandbox). `SHOT_DIR=<folder> node scripts/e2e-tv.mjs` saves TV screenshots.
- Swift changes: `swift test` and the tvOS build need a Mac; the "Apple TV app" workflow runs them on every push, so
  read its result on the PR.

## Things that are easy to get wrong

- The engine runs in three places: the Apple TV app (JavaScriptCore, `engine/jsc/entry.js`), the website's TV page
  (`engine/browser/entry.js`, bundled to `web/tvhost.js`), and server mode (`server.js`). Keep the view a game sends
  (`publicView()`) in step with the Swift decoder (`tv-app/FamilyGameNight/GameNight/Core/ServerState.swift`) and the
  browser TV (`public/games/<game>/tv.js`); record new fixtures with `scripts/record-tv-fixtures.mjs` when it changes.
- The Supabase key in `relay.config.json` and `RelayConfig.swift` is the publishable one and is public by design. Never
  commit a secret key, and never write the App Store Connect secrets anywhere but GitHub's repository secrets.
- No copyrighted show audio or branding goes into the repository; families can add their own sound files, from the host page (kept on the TV, `engine/sounds.js`) or locally on a Mac
  (`tv-app/docs/CUSTOM-FILES.md`). The only audio committed is the CC0 set (`public/builtin-sounds/{jeopardy,shared}/`
  and `tv-app/.../Sounds/{jeopardy,shared}__*.m4a`, credits beside them); keep the two copies in step.
- TestFlight build numbers are `100 + run number` of the "Send to TestFlight" workflow; they only ever go up.
