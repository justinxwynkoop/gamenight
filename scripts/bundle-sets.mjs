// Collects the question sets we wrote ourselves (data/<game>/*.json) into one file for the Apple TV app:
//   node scripts/bundle-sets.mjs <outfile>
// Sets built from the clue and survey data (random-*, protoqa-*) are never included.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../games/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'dist/sets.json'));
const sets = {};
for (const [gameId, game] of Object.entries(GAMES)) {
  sets[gameId] = {};
  const dir = path.join(root, 'data', gameId);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !/^(random|protoqa)-/.test(x))) {
    const set = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    game.validateContent(set);
    sets[gameId][f.slice(0, -5)] = set;
  }
}
writeFileSync(out, JSON.stringify(sets));
console.log(`Wrote ${out}: ${Object.entries(sets).map(([g, s]) => `${Object.keys(s).length} ${g}`).join(', ')}`);
