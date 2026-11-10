import { spawnSync } from 'node:child_process';
import { CODE_ROOTS, ROOT } from './config.js';
import { listFiles } from './files.js';

const files = (await listFiles(CODE_ROOTS)).filter((file) => file.endsWith('.js'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? result.stderr);
    process.exit(1);
  }
}
console.log(`Syntax OK: ${files.length} JavaScript files.`);
