import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { auditDeals, comparePolicies } from './strategy/simulate.js';

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf('--' + name);
  return i < 0 ? fallback : args[i + 1];
}
const seeds = Number(option('seeds', 100));
const startSeed = Number(option('start-seed', 10001));
if (![seeds, startSeed].every((n) => Number.isSafeInteger(n) && n >= 1) || seeds > 10000)
  throw new RangeError('seeds must be 1..10000 and start-seed must be positive');
const mode = option('mode', 'full');
if (!['baseline', 'full'].includes(mode)) throw new RangeError('mode must be baseline or full');
const matchups =
  mode === 'baseline'
    ? [
        ['legacy', 'legacy'],
        ['legacy', 'passive'],
        ['legacy', 'aggressive'],
        ['legacy', 'random'],
      ]
    : [
        ['planning', 'legacy'],
        ['betting', 'legacy'],
        ['current', 'legacy'],
        ['current', 'passive'],
        ['current', 'aggressive'],
        ['current', 'current'],
      ];
const report = {
  method:
    'Real engine, separate deal/strategy PRNG streams, each seed swaps the same two hands; score = win + half tie. Intervals cluster each swapped pair. Limited deterministic bot benchmark, not human win rates.',
  mode,
  startSeed,
  seeds,
  slow: args.includes('--slow'),
  results: [],
};
report.sources = {};
for (const file of [
  'game/ai-planning.js',
  'game/ai-betting.js',
  'game/cards.js',
  'game/deal.js',
  'game/engine.js',
  'scripts/strategy/legacy.js',
  'scripts/strategy/simulate.js',
]) {
  report.sources[file] = createHash('sha256')
    .update(await readFile(new URL('../' + file, import.meta.url)))
    .digest('hex');
}
report.node = process.version;
for (const [player, opponent] of matchups) {
  const start = performance.now();
  const result = comparePolicies(player, opponent, {
    seeds,
    startSeed,
    slow: args.includes('--slow'),
  });
  result.elapsedMs = Math.round(performance.now() - start);
  report.results.push(result);
  console.log(JSON.stringify(result));
}
report.dealing = auditDeals(startSeed, 1000);
const path = fileURLToPath(
  new URL(
    '../output/harness/strategy-' + mode + '-' + startSeed + (report.slow ? '-slow' : '') + '.json',
    import.meta.url,
  ),
);
await mkdir(fileURLToPath(new URL('../output/harness/', import.meta.url)), { recursive: true });
await writeFile(path, JSON.stringify(report, null, 2) + '\n');
console.log(path);
