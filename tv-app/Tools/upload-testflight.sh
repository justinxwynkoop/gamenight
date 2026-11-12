#!/bin/sh
# Builds the app and uploads it to TestFlight, from Terminal, in one go (what Product > Archive and Distribute do in Xcode).
#   Tools/upload-testflight.sh
# Needs Xcode signed in (Xcode > Settings > Apple Accounts) with an Apple ID on the team that owns the app.
# If you want your own sounds and extra sets in the build, run Tools/install-sounds.sh and Tools/install-sets.sh first
# (see docs/CUSTOM-FILES.md). The build number is the current date and time, so each upload is higher than the last.
# The team ID is not a secret; set TEAM_ID to use a different team.
set -eu
TEAM="${TEAM_ID:-8PHR5L3F6L}"
BUILD="$(date +%y%m%d%H%M)"
cd "$(dirname "$0")/.."
OUT="build/testflight"
rm -rf "$OUT" && mkdir -p "$OUT"

echo "Archiving build ${BUILD} for team ${TEAM} ..."
xcodebuild -project FamilyGameNight.xcodeproj -scheme FamilyGameNight -configuration Release \
  -destination 'generic/platform=tvOS' -archivePath "$OUT/FamilyGameNight.xcarchive" \
  DEVELOPMENT_TEAM="${TEAM}" CODE_SIGN_STYLE=Automatic CURRENT_PROJECT_VERSION="${BUILD}" \
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

echo
echo "Uploaded build ${BUILD}. After Apple processes it (about 5 to 15 minutes) it reaches everyone in the TestFlight group."
