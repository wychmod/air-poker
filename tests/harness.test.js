import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { checkModule, findCycles } from '../scripts/harness/architecture.js';
import { collectResources, referencesIn, resolveReference } from '../scripts/harness/assets.js';
import { ROOT } from '../scripts/harness/config.js';

const available = new Set([
  'app.js',
  'i18n.js',
  'game/data.js',
  'game/rules.js',
  'game/cards.js',
  'game/engine.js',
  'ui/render.js',
]);

test('architecture permits current layering and rejects reverse, missing and external dependencies', () => {
  assert.deepEqual(
    checkModule('game/cards.js', "import { rankHand } from './rules.js';", available).errors,
    [],
  );
  for (const source of [
    "import './engine.js';",
    "export * from '../ui/render.js';",
    "export { x } from './missing.js';",
    "import 'node:fs';",
    "import('https://example.com/game.js');",
    'import(modulePath);',
  ]) {
    assert.ok(checkModule('game/rules.js', source, available).errors.length, source);
  }
  assert.ok(
    checkModule('game/unregistered.js', 'export const value = 1;', available).errors.length,
  );
});

test('architecture checks lazy imports, platform calls and cycles without matching text or properties', () => {
  assert.ok(
    checkModule(
      'game/rules.js',
      "async function load() { await import('./engine.js'); }",
      available,
    ).errors.length,
  );
  for (const source of [
    'document.querySelector("div");',
    'setTimeout(() => {}, 1);',
    'process.env;',
  ]) {
    assert.ok(checkModule('game/rules.js', source, available).errors.length);
  }
  assert.deepEqual(
    checkModule(
      'game/rules.js',
      '// document.querySelector()\nconst copy = "window and localStorage"; const card = { document: 1 }; card.document;',
      available,
    ).errors,
    [],
  );
  assert.deepEqual(
    findCycles(
      new Map([
        ['a', ['b']],
        ['b', []],
      ]),
    ),
    [],
  );
  assert.deepEqual(
    findCycles(
      new Map([
        ['a', ['b']],
        ['b', ['a']],
      ]),
    ),
    ['a -> b -> a'],
  );
});

test('asset checks allow relative subpath-safe URLs and reject root-relative and escaping URLs', () => {
  assert.equal(
    resolveReference('styles/pages.css', '../assets/generated/example.png?v=1#x'),
    'assets/generated/example.png',
  );
  for (const reference of [
    'https://fonts.example.com/a.css',
    'data:,',
    '#section',
    '//example.com/a',
  ]) {
    assert.equal(resolveReference('index.html', reference), null);
  }
  for (const reference of ['/app.js', '%2Fapp.js', '../../secret', '..\\app.js']) {
    assert.throws(() => resolveReference('index.html', reference));
  }
  assert.deepEqual(
    referencesIn('styles.css', '@import "a.css"; .x { background: url(\'b.png\'); }'),
    ['b.png', 'a.css'],
  );
  assert.deepEqual(
    referencesIn('app.js', "export * from './game/rules.js'; import('./i18n.js');"),
    ['./game/rules.js', './i18n.js'],
  );
  assert.throws(() => referencesIn('app.js', 'import(path);'));
});

test('resource traversal fails for missing direct and transitive files', async (t) => {
  const parent = resolve(ROOT, 'output/harness');
  await mkdir(parent, { recursive: true });
  const fixture = await mkdtemp(join(parent, 'fixture-'));
  t.after(async () => {
    assert.equal(dirname(fixture), parent);
    await rm(fixture, { recursive: true, force: true });
  });
  await writeFile(join(fixture, 'index.html'), '<link rel="stylesheet" href="styles.css">');
  await assert.rejects(collectResources(fixture), /Missing staged resource: styles\.css/);
  await writeFile(join(fixture, 'styles.css'), '@import "missing.css";');
  await assert.rejects(collectResources(fixture), /Missing staged resource: missing\.css/);
  await writeFile(join(fixture, 'styles.css'), '');
  assert.deepEqual([...(await collectResources(fixture)).keys()], ['index.html', 'styles.css']);
});

test('full runner returns failure, stops immediately and records the failed step', async (t) => {
  const parent = resolve(ROOT, 'output/harness');
  await mkdir(parent, { recursive: true });
  const fixture = await mkdtemp(join(parent, 'runner-'));
  t.after(async () => {
    assert.equal(dirname(fixture), parent);
    await rm(fixture, { recursive: true, force: true });
  });
  for (const directory of ['scripts/harness', 'game', 'ui', 'tests']) {
    await mkdir(join(fixture, directory), { recursive: true });
  }
  for (const file of ['check.js', 'config.js', 'syntax.js', 'files.js']) {
    await cp(join(ROOT, 'scripts/harness', file), join(fixture, 'scripts/harness', file));
  }
  await writeFile(join(fixture, 'package.json'), '{"type":"module"}');
  await writeFile(join(fixture, 'app.js'), 'export const = 1;');
  await writeFile(join(fixture, 'i18n.js'), '');
  const run = spawnSync(process.execPath, ['scripts/harness/check.js'], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 1);
  const report = JSON.parse(await readFile(join(fixture, 'output/harness/latest.json'), 'utf8'));
  assert.equal(report.status, 'failed');
  assert.deepEqual(
    report.steps.map((step) => [step.name, step.status]),
    [['syntax', 'failed']],
  );
  assert.equal(report.steps[0].exitCode, 1);
});
