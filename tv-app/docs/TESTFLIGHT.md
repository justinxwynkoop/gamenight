# TestFlight

TestFlight installs the app on the family's Apple TVs without Xcode or a cable, and updates it by itself. This page covers
two ways to get a build there: **from Xcode on your Mac** (simplest; includes your own sounds and extra sets) or **from
GitHub** (a button in the Actions tab; no Mac needed, but no sounds or extra sets).

## What you need

- **An Apple Developer Program membership** ($99 a year). The app belongs to whichever team owns the bundle ID
  `family.singonight.app` (the team picked under Signing & Capabilities in Xcode). Steps that need the account owner or an
  Admin are marked. If the team is someone else's, they do those steps and give you the *App Manager* role.
- **The bundle ID registered with MusicKit** for Singo Night: developer.apple.com → Certificates, Identifiers & Profiles →
  Identifiers → `family.singonight.app` → App Services → **MusicKit** ticked.
- **Testers.** Anyone who should get the app is an *internal tester*: a person added to the team's App Store Connect
  users (up to 100 people, any role, no Apple review). Each needs an Apple ID, and a TestFlight app on their Apple TV.

## One-time: create the app in App Store Connect (Admin or App Manager)

1. appstoreconnect.apple.com → **Apps** → **+** → **New App**.
2. Platform **tvOS**. Name **Family Game Night** (names are unique across the App Store; if it is taken, use something
   like "Family Game Night TV": it is only the name shown in TestFlight, the app on the TV keeps its own display name).
3. Primary language, **Bundle ID** `family.singonight.app` (choose it from the list), and any SKU (for example
   `familygamenight`). Create.

## Way 1: from Xcode on your Mac

1. If you want your own sounds and extra sets in the build, copy them in first (see [CUSTOM-FILES.md](CUSTOM-FILES.md)).
2. In Xcode: choose the destination **Any tvOS Device (arm64)**, check Signing & Capabilities shows your team, then
   **Product → Archive**.
3. The Organizer opens. Select the archive → **Distribute App** → **App Store Connect** → **Distribute** (leave
   "Manage Version and Build Number" ticked: Xcode raises the build number for you). Wait for "Upload successful".
4. After Apple finishes processing (usually 5 to 15 minutes; you get an email) the build shows under the app's
   **TestFlight** tab in App Store Connect.

## Way 2: from GitHub (no Mac)

1. **Make an API key** (Admin): App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**
   → **Team Keys** → **+**, name it "GitHub", role **Admin** (the build is signed in the cloud, which needs it). Download
   the `.p8` file (you can only download it once) and note the **Key ID** and the **Issuer ID** shown at the top of the page.
2. In this repository on GitHub: **Settings → Secrets and variables → Actions → New repository secret**, and add three:
   `ASC_KEY_ID` (the Key ID), `ASC_ISSUER_ID` (the Issuer ID), and `ASC_KEY_P8` (open the `.p8` file in a text editor and
   paste all of it, including the BEGIN and END lines).
3. **Actions → Send to TestFlight → Run workflow.** It checks the app exists, makes a TestFlight group called **Family**
   if there is none, then builds, signs and uploads. A warning that the app does not exist yet means step "create the app"
   above is still to do.

The key is as powerful as an Admin login: never put it in a file in the repository, and delete the key in App Store Connect
if it ever leaks. The workflow does nothing without the secrets, so it is safe to leave in place. A cloud build does not
contain your own sound files or extra sets, because they are not in the repository.

## Add the family as testers

1. App Store Connect → **Users and Access** → **+**: add each person's name and Apple ID email. A role such as
   *Customer Support* or *Marketing* is enough. They accept the emailed invitation.
2. Open the app → **TestFlight** → **Internal Testing** → the **Family** group (create it with **+** if the GitHub workflow
   has not): add the people and the build.

## Install on an Apple TV

On the Apple TV: App Store → get **TestFlight** → open it and sign in with the Apple ID that was invited → **Install**
Family Game Night. New builds arrive on their own (and can be turned off in TestFlight).

## Good to know

- **A build lasts 90 days.** After that it stops opening; upload a new one (Way 1 or Way 2) before then.
- **Build numbers must go up.** Way 1 does it for you; Way 2 uses the GitHub run number. If you switch between the two and
  an upload is refused for a repeated number, raise `CURRENT_PROJECT_VERSION` in Xcode (General → Build).
- **Export compliance** is already answered in the app (it uses only Apple's own encryption), so TestFlight does not ask
  each time.
- Internal testers need no Apple review. A *public link* for people outside the team (an "external" group) does need a
  short Beta App Review for each new version; internal testing is simpler for a family.

## If something goes wrong

| What you see | What to try |
| --- | --- |
| Xcode: "No accounts with App Store Connect access" | Sign in under Xcode → Settings → Apple Accounts with the Apple ID that has the *App Manager* (or Admin) role. |
| Upload refused about the icon | The app already has the full tvOS icon set (including the 1280×768 App Store icon). Do not delete it from the asset catalog. |
| "Bundle ID not found" when creating the app | Register `family.singonight.app` first (developer.apple.com → Identifiers), with MusicKit ticked. |
| The build is missing from TestFlight | It is still processing (5 to 15 minutes); look for Apple's email about a problem. |
| The GitHub run says there is no app | Create the app in App Store Connect (above), then run it again. |
| GitHub run fails signing | The API key needs the **Admin** role. |
