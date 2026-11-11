#!/usr/bin/env node
// Builds Family Feud question sets from a ProtoQA file (see games/feud/survey.js).
//   node scripts/make-feud-sets.mjs <train.jsonl> [more.jsonl ...] [--sets 20] [--seed 1] [--out data/feud] [--include-adult]
// Usually run for you by scripts/get-feud-sets.sh.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { makeSets } from '../games/feud/survey.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const flags = new Set(['--include-adult']);
const files = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1]?.startsWith('--') && !flags.has(args[i - 1])));
if (!files.length) { console.error('Usage: node scripts/make-feud-sets.mjs <protoqa .jsonl file> [...] [--sets 20] [--seed 1] [--out data/feud]'); process.exit(1); }

const out = path.resolve(opt('out', 'data/feud'));
const lines = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
const made = makeSets(lines, { sets: Number(opt('sets', 20)), seed: Number(opt('seed', 1)), family: !args.includes('--include-adult') });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/^protoqa-\d+\.json$/.test(f)) unlinkSync(path.join(out, f));   // replace the previous batch
for (const { id, set } of made) writeFileSync(path.join(out, `${id}.json`), JSON.stringify(set, null, 2) + '\n');
console.log(`Read ${lines.length} questions; wrote ${made.length} sets (${made.length * 10} questions) to ${out}.`);
