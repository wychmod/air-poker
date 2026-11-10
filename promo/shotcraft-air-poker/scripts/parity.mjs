// Equivalent to the skill's parity.mjs, with an explicitly managed Chromium.
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const wb =
  process.env.SHOTCRAFT_WORKBENCH ||
  'C:/Users/Administrator.SY-202401060959/.codex/skills/video-shotcraft/workbench';
const out = resolve(root, 'out/parity');
const renderPublic = resolve(out, 'public');
await mkdir(out, { recursive: true });
await cp(resolve(wb, 'public'), renderPublic, {
  recursive: true,
  dereference: true,
  filter: (src) => !/[\\/]cardpreviews$/.test(src),
});
const require = createRequire(resolve(root, 'package.json'));
const browserExecutable =
  process.env.REMOTION_BROWSER_EXECUTABLE || require('playwright').chromium.executablePath();
const serveUrl = await bundle({
  entryPoint: resolve(wb, 'src/remotion/index.ts'),
  publicDir: renderPublic,
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      symlinks: false,
      alias: {
        ...(config.resolve?.alias ?? {}),
        '@proj': resolve(wb, 'proj'),
        '@demos': resolve(wb, 'demosrc'),
      },
    },
  }),
});
const browser = await openBrowser('chrome', {
  browserExecutable,
  chromiumOptions: { gl: 'angle' },
});
const frames = [12, 85, 158, 220, 342, 395, 486, 610, 660, 720, 750, 840, 899];
const results = [];
const compare = `
import sys,json
from PIL import Image,ImageChops
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
assert a.size==b.size
pixels=ImageChops.difference(a,b).getdata()
bad=sum(1 for p in pixels if max(p)>2)
print(json.dumps({'badPixels':bad,'totalPixels':a.width*a.height,'maxChannelDifference':max(max(p) for p in pixels)}))
`;
try {
  const comps = {};
  for (const id of ['ProjImported', 'ProjOriginal']) {
    comps[id] = await selectComposition({
      serveUrl,
      id,
      inputProps: {},
      puppeteerInstance: browser,
    });
  }
  for (const frame of frames) {
    const paths = [];
    for (const id of ['ProjImported', 'ProjOriginal']) {
      const output = resolve(out, `${id}-f${frame}.png`);
      await renderStill({
        serveUrl,
        composition: comps[id],
        frame,
        output,
        imageFormat: 'png',
        puppeteerInstance: browser,
      });
      paths.push(output);
    }
    const diff = spawnSync('python', ['-c', compare, ...paths], { encoding: 'utf8' });
    if (diff.status !== 0) throw new Error(diff.stderr || 'Pixel comparison failed');
    const metrics = JSON.parse(diff.stdout);
    const passed = metrics.badPixels / metrics.totalPixels < 0.001;
    results.push({ frame, passed, ...metrics });
    console.log(
      `Frame ${frame}: ${passed ? 'PASS' : 'FAIL'} (${metrics.badPixels} differing pixels)`,
    );
  }
} finally {
  await browser.close({ silent: true });
}
const report = {
  passed: results.every((r) => r.passed),
  tolerance: 2,
  maximumBadPixelRatio: 0.001,
  results,
};
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
