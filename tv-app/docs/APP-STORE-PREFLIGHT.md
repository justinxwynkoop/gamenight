# App Store preflight (Apple TV app)

A check of the Apple TV app against Apple's review rules and upload requirements, done on 2026-11-27 with the
checklists from the App Store Preflight skill (all apps, plus games). The family installs the app through TestFlight
as **internal testers**, which Apple does not review; the last section lists what would matter only if the app ever
went to external testers or the public App Store.

## Fixed

- **Privacy manifest** (`FamilyGameNight/PrivacyInfo.xcprivacy`, new). Every upload must say why the app uses
  Apple's "required reason" APIs, or App Store Connect sends an ITMS-91053 warning and will refuse it in time. The
  app uses three:
  - `UserDefaults` (CA92.1): the room code, the server address and the Singo settings.
  - `ProcessInfo.systemUptime` (35F9.1): the buzzer clock in `EngineHost.swift`.
  - File attributes (C617.1): the family's own sound files, kept inside the app (`CustomSoundStore.swift`).

  It also declares no tracking and no data collected for the developer. The Xcode project picks the file up by itself
  (the `FamilyGameNight` folder is a synchronised group). If a new API from Apple's list is ever used, add its reason
  here.

## Passed

| Check | Where |
| --- | --- |
| Built with the tvOS 26 SDK (required for uploads since April 2026) | `testflight.yml` picks Xcode 26 |
| Export compliance answered once (`ITSAppUsesNonExemptEncryption` = NO; only Apple's https/wss) | `Config/Info.plist` |
| Usage strings for the permissions the app asks for: local network, Apple Music | `Info.plist`, project build settings |
| Layered app icon (400x240 @1x/@2x, 1280x768), Top Shelf and Top Shelf Wide at both scales, opaque back layers | `Assets.xcassets` |
| 2.4.3 Apple TV: everything works with the Siri Remote; no game controller is needed | all games |
| No in-app purchases, accounts, sign-in, ads, tracking, or AI services | whole app |
| 4.5.3 / 4.5.5 Game Center: not used, so nothing to misuse | |
| No copyrighted show audio (only CC0 sounds, credits beside them) | `Sounds/`, `CLAUDE.md` |

## Would matter only for external testers or the public App Store

Apple reviews builds sent to external TestFlight testers and to the App Store. These would need work first:

- **4.1(c) / 5.2.1, other companies' trademarks.** "Jeopardy" and "Family Feud" are TV show names owned by others,
  and the home screen uses them. A public build would need original names (as Pie Chase and Guys vs Gals already
  have).
- **5.2.2, third-party content.** The Jeopardy "real show" pack loads real clues from a fan archive.
- **5.1.1 / 1.5, privacy policy and support links** in App Store Connect (and the privacy policy inside the app).
- **2.3.6 age rating** questionnaire, and screenshots of the games being played.

## Game Center, on purpose not added

Game Center signs in the Apple ID on the TV, not the people playing: everyone else plays from a phone in a browser,
with no Apple account. Leaderboards and achievements would all go to whoever owns the Apple TV, and they need extra
App Store Connect setup for each one. The app already keeps a family hall of fame per TV (Jeopardy's "Tonight's
champion" line), which fits a shared living-room game better. GameKit matchmaking is for players on their own Apple
devices, so it does not fit either.
