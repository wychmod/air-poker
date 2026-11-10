import { Config } from '@remotion/cli/config';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Reuse the repository's already-installed browser; environment override is
// useful on another machine with a separately managed Chromium installation.
const require = createRequire(resolve(process.cwd(), 'package.json'));
try {
  Config.setBrowserExecutable(
    process.env.REMOTION_BROWSER_EXECUTABLE || require('playwright').chromium.executablePath(),
  );
} catch {
  // A standalone checkout can use Remotion's browser download.
}

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');
Config.setConcurrency(4);
