#!/usr/bin/env bash
# Downloads the public Jeopardy clue file used for "random boards" into data/clues/ (about 80 MB).
# It stays on this machine: data/clues/ is git-ignored, so it is never committed or published.
# Source: https://github.com/jwolle1/jeopardy_clue_dataset (read its README for what it is and where it came from).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/clues
FILE=data/clues/combined_season1-42.tsv
URL=https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/main/combined_season1-42.tsv
echo "Downloading the clue file (about 80 MB)..."
curl -fL --retry 3 -o "$FILE.part" "$URL"
head -1 "$FILE.part" | grep -q $'^round\tclue_value' || { echo "That did not look like the clue file; not installing it." >&2; rm -f "$FILE.part"; exit 1; }
mv "$FILE.part" "$FILE"
echo "Done: $(wc -l < "$FILE") lines. Random boards are now available on the host screen."
