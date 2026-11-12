# Hosting the game on the Apple TV (online mode)

**No server or computer is needed.** The game rules (the same JavaScript the Game Night server runs) are
inside the app, running in JavaScriptCore. Phones open a web page on Vercel and talk to the TV through a free Supabase
Realtime relay, so everyone just needs internet. How it works, and how to set up Supabase and Vercel from scratch, is
in the `gamenight` repo's **[docs/ONLINE.md](https://github.com/justinxwynkoop/gamenight/blob/main/docs/ONLINE.md)**.
This repo holds the Apple TV side.

**Using it**
1. Open **Jeopardy** or **Family Feud**. The game starts on the Apple TV by itself. Each tile starts its own game; opening a tile for a
   different game than the last one starts a fresh room.
2. The lobby shows a QR code, the join address and a **4-digit room code**. Players scan the code, or open the
   site and type the digits.
3. The host opens `<site>/host` on a phone (the QR in the Play/Pause menu or the lobby), types the room code and the
   **host PIN**. The PIN is never on the board: press **Play/Pause** on the TV and read it in the menu.
4. The host page's **Questions** tab opens the question editor (see below).

**The Play/Pause menu** shows the host PIN, the room code and whether phones are connected ("Phones: connected", or
"not connected" with the reason), and has **New room code** (a fresh empty room with a new random code),
**Change server** (use a [Game Night server](SERVER-MODE.md) instead) and **Back to games**. **Menu** goes back to the game picker.

**Where the settings live** (`FamilyGameNight/GameNight/`):

| File | What it holds |
| --- | --- |
| `RelayConfig.swift` | The Supabase project URL, its *publishable* key (public by design; never put a secret key here) and the Vercel site address. |
| `Engine/engine.js` | The game engine, **generated** from the `gamenight` repo (see below). |
| `Engine/sets.json` | The 16 question sets that ship with the app, generated the same way. |
| `Core/EngineHost.swift` | Loads `engine.js` into JavaScriptCore and passes JSON messages in and out. |
| `Core/RealtimeClient.swift` | A small Supabase Realtime (Phoenix channels) client, adapted from the one in the Buzzworthy Apple TV app. |
| `GameNightClient.swift` | Starts the engine (`startLocal`), links it to the relay and the display, keeps the room between launches. |

**Updating the game engine inside the app.** The rules live in the `gamenight` repo. After changing them there:

```bash
cd ../gamenight && node scripts/build-engine.mjs ../familygamenight/FamilyGameNight/GameNight/Engine/engine.js
node scripts/bundle-sets.mjs ../familygamenight/FamilyGameNight/GameNight/Engine/sets.json   # only if the shipped sets changed
```

Commit the changed files here. Nothing updates on its own: the app only changes when you rebuild and run it.

**The Apple TV remembers** the room between launches (players, scores, the game in progress) and the room code,
and any question sets you saved from the editor. Delete the app to forget them.

**Needs the internet** on the TV and phones. If the TV loses it, the menu and a banner say "Phones not connected",
and it reconnects by itself.


## Question sets

Sets are small JSON files. The Apple TV has the 16 that ship in the app, plus anything saved or imported from the editor. You can **drag a `.json` or `.txt` file onto the editor's Import card**, paste a GitHub link, or write a set in a plain-text format; this is all explained, with examples, in the `gamenight` repo's [QUESTION-SETS.md](https://github.com/justinxwynkoop/gamenight/blob/main/docs/QUESTION-SETS.md). Extra sets and your own sounds that must stay out of GitHub: [CUSTOM-FILES.md](CUSTOM-FILES.md).

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "A build only device cannot be used to run this target" in Xcode | The destination is "Any tvOS Device". Choose your Apple TV (paired under Window → Devices and Simulators). |
| Phones say "Waiting for the TV" | Check the room code against the lobby or the Play/Pause menu. The phone's status line says how far it got. |
| Menu says "Phones: not connected (…)" | The TV cannot reach Supabase; check its internet. The reason is in the brackets. |
| Menu jumps out to the Apple TV home screen | The display must hold the remote's focus; `JeopardyDisplayView` sets it when it opens and when the Play/Pause panel closes. |
| The other game's lobby shows | A game was in progress. Opening the tile for a different game starts a fresh room. |
| My sounds do not play | Run `Tools/install-sounds.sh` again, then run the app from Xcode (not a cloud build). `.ogg` files cannot be played. |

