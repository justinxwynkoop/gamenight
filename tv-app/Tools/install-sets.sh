#!/bin/sh
# Copies question sets (your Pi's data folder, or any folder laid out the same) into the app, on your Mac. They are not
# committed to git: sets built from public survey data stay out of the repository.
#   Tools/install-sets.sh ~/Desktop/gamenight-pi-backup
# The folder holds jeopardy/ and feud/ with one .json file per set (the Pi's data/ folder is laid out like that).
# Sets that already ship with the app are skipped. Files end up in FamilyGameNight/GameNight/Sets/ as <game>__<id>.json.
set -eu
src="${1:?Give the folder with jeopardy/ and feud/ in it, for example ~/Desktop/gamenight-pi-backup}"
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="$here/FamilyGameNight/GameNight/Sets"
shipped="$here/FamilyGameNight/GameNight/Engine/sets.json"
[ -d "$src" ] || { echo "No such folder: $src"; exit 1; }
mkdir -p "$dest"
count=0
for game in jeopardy feud; do
  [ -d "$src/$game" ] || continue
  for f in "$src/$game"/*.json; do
    [ -f "$f" ] || continue
    id="$(basename "$f" .json)"
    case "$id" in *[!a-z0-9-]*|-*) echo "skipped (not a valid set name): $f"; continue ;; esac
    if grep -q "\"$id\":" "$shipped" 2>/dev/null; then continue; fi
    cp "$f" "$dest/${game}__${id}.json"
    count=$((count + 1))
  done
done
echo "Copied $count new question set(s) into $dest"
echo "Now run the app from Xcode (the files are packed into it)."
