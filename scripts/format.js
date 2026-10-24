import { spawnSync } from 'node:child_process';
import { FORMAT_TARGETS, ROOT } from './harness/config.js';

const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) throw new Error('Expected --write or --check');
const result = spawnSync(
  process.execPath,
  ['node_modules/prettier/bin/prettier.cjs', mode, ...FORMAT_TARGETS],
  { cwd: ROOT, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
