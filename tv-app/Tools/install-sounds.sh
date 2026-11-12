#!/bin/sh
# Copies your own sound files into the app, on your Mac. They are not committed to git (the audio is not ours to publish).
#   Tools/install-sounds.sh ~/Desktop/gamenight-pi-backup/sounds
# The folder is the Pi's data/sounds: files in it are used by every game; files in its jeopardy/ and feud/ folders by that game.
# Files end up in FamilyGameNight/GameNight/Sounds/ as <game>__<name>.<ext>, which Xcode then packs into the app.
set -eu
src="${1:?Give the folder with your sounds, for example ~/Desktop/gamenight-pi-backup/sounds}"
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="$here/FamilyGameNight/GameNight/Sounds"
[ -d "$src" ] || { echo "No such folder: $src"; exit 1; }
mkdir -p "$dest"
count=0
copy() { # file game
  f="$1"; game="$2"
  base="$(basename "$f")"; ext="${base##*.}"; name="${base%.*}"
  case "$(echo "$ext" | tr 'A-Z' 'a-z')" in mp3|m4a|wav) ;; *) echo "skipped (the Apple TV cannot play .$ext): $f"; return ;; esac
  cp "$f" "$dest/${game}__${name}.$(echo "$ext" | tr 'A-Z' 'a-z')"
  echo "  $game/$name"
  count=$((count + 1))
}
for f in "$src"/*; do [ -f "$f" ] && copy "$f" shared; done
for game in jeopardy feud; do
  [ -d "$src/$game" ] && for f in "$src/$game"/*; do [ -f "$f" ] && copy "$f" "$game"; done
done
echo "Copied $count sound file(s) into $dest"
echo "Now run the app from Xcode (the files are packed into it)."
