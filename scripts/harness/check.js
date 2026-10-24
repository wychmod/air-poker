import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FORMAT_TARGETS, ROOT } from './config.js';

const steps = [
  ['syntax', ['scripts/harness/syntax.js']],
  ['architecture', ['scripts/harness/architecture.js']],
  ['tests', ['--test']],
  ['format', ['node_modules/prettier/bin/prettier.cjs', '--check', ...FORMAT_TARGETS]],
  ['build', ['scripts/stage-site.js']],
  ['http-smoke', ['scripts/harness/smoke.js']],
];
const report = {
  startedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  status: 'failed',
  steps: [],
};
for (const [name, args] of steps) {
  console.log(`\n[${name}]`);
  const started = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 120_000,
  });
  report.steps.push({
    name,
    args,
    status: result.status === 0 && !result.error ? 'passed' : 'failed',
    durationMs: Math.round(performance.now() - started),
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    process.exitCode = 1;
    break;
  }
}
if (
  report.steps.length === steps.length &&
  report.steps.every((step) => step.status === 'passed')
) {
  report.status = 'passed';
}
report.finishedAt = new Date().toISOString();
const output = resolve(ROOT, 'output/harness');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\nHarness ${report.status}. Report: output/harness/latest.json`);
