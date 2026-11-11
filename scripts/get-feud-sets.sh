#!/usr/bin/env bash
# Downloads the ProtoQA survey data (Family Feud style questions with ranked answers) and builds
# question sets from it into data/feud/. Run it again for a different batch (change the seed).
#   ./scripts/get-feud-sets.sh [number of sets] [seed]
# The data stays on this machine: data/surveys/ and the protoqa-*.json sets are git-ignored.
# Source: https://github.com/iesl/protoqa-data (CC BY 4.0, Boratko et al. 2020). Its larger files were collected
# from Family Feud fan sites, so use them for your own family nights only; do not publish them.
set -euo pipefail
cd "$(dirname "$0")/.."
SETS="${1:-20}"; SEED="${2:-1}"
mkdir -p data/surveys
BASE=https://raw.githubusercontent.com/iesl/protoqa-data/master/data
for f in train/train.jsonl dev/dev.scraped.jsonl; do
  echo "Downloading $f ..."
  curl -fL --retry 3 -o "data/surveys/$(basename "$f").part" "$BASE/$f"
  mv "data/surveys/$(basename "$f").part" "data/surveys/$(basename "$f")"
done
node scripts/make-feud-sets.mjs data/surveys/train.jsonl data/surveys/dev.scraped.jsonl --sets "$SETS" --seed "$SEED" --out data/feud
echo "Done. Pick one of the new 'Survey Mix' sets in the host screen."
