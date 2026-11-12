#!/bin/sh
# Builds the app and uploads it to TestFlight from Terminal (what Product > Archive and Distribute do in Xcode).
#
#   Tools/upload-testflight.sh             next version: 1.0 -> 1.1 -> 1.2 ... (build number 1)
#   Tools/upload-testflight.sh --major     next major version: 1.4 -> 2.0
#   Tools/upload-testflight.sh --rebuild   the same version again, build number +1 (for example after a refused upload)
#   Tools/upload-testflight.sh --version 1.7   a version you choose (it must be higher than the last one uploaded)
#
# The last version and build uploaded are kept in Config/testflight-version.txt. Commit that file after an upload so the next
# one (from any Mac) carries on from it. Needs Xcode signed in (Xcode > Settings > Apple Accounts) with an Apple ID on the team
# that owns the app. If you want your own sounds and extra sets in the build, run Tools/install-sounds.sh and
# Tools/install-sets.sh first (see docs/CUSTOM-FILES.md). The team ID is not a secret; set TEAM_ID to use a different team.
set -eu
TEAM="${TEAM_ID:-8PHR5L3F6L}"
cd "$(dirname "$0")/.."
STATE="Config/testflight-version.txt"
read -r LAST_VERSION LAST_BUILD < "$STATE"
MAJOR="${LAST_VERSION%%.*}"
MINOR="${LAST_VERSION#*.}"

case "${1:-}" in
  "")        VERSION="${MAJOR}.$((MINOR + 1))"; BUILD=1 ;;
  --major)   VERSION="$((MAJOR + 1)).0"; BUILD=1 ;;
  --rebuild) VERSION="${LAST_VERSION}"; BUILD="$((LAST_BUILD + 1))" ;;
  --version) VERSION="${2:?Give the version, for example --version 1.7}"; BUILD=1 ;;
  *) echo "Unknown option: $1 (see the top of this script)"; exit 1 ;;
esac
case "$VERSION" in
  *[!0-9.]*|.*|*.|*..*|"") echo "The version must look like 1.2 (digits and one dot), not ${VERSION}"; exit 1 ;;
esac

OUT="build/testflight"
rm -rf "$OUT" && mkdir -p "$OUT"
echo "Archiving version ${VERSION} (build ${BUILD}), last upload was ${LAST_VERSION} (build ${LAST_BUILD}) ..."
xcodebuild -project FamilyGameNight.xcodeproj -scheme FamilyGameNight -configuration Release \
  -destination 'generic/platform=tvOS' -archivePath "$OUT/FamilyGameNight.xcarchive" \
  DEVELOPMENT_TEAM="${TEAM}" CODE_SIGN_STYLE=Automatic MARKETING_VERSION="${VERSION}" CURRENT_PROJECT_VERSION="${BUILD}" \
  -allowProvisioningUpdates archive | tail -n 5

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${TEAM}</string>
  <key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST

echo "Uploading to App Store Connect ..."
xcodebuild -exportArchive -archivePath "$OUT/FamilyGameNight.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" -allowProvisioningUpdates | tail -n 8

echo "${VERSION} ${BUILD}" > "$STATE"
echo
echo "Uploaded version ${VERSION} (build ${BUILD}). After Apple processes it (about 5 to 15 minutes) it reaches everyone in the TestFlight group."
echo "Now save the new version number so the next upload carries on from it:"
echo "  git add Config/testflight-version.txt && git commit -m \"TestFlight ${VERSION}\" && git push"
