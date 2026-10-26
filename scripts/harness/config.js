import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SITE_ROOT = fileURLToPath(new URL('../../dist/site/', import.meta.url));
export const SITE_FILES = [
  'index.html',
  'motion-demo.html',
  'styles.css',
  'app.js',
  'i18n.js',
  'styles/shell.css',
  'styles/narrative.css',
  'styles/battle.css',
  'styles/hand-builder.css',
  'styles/review.css',
  'styles/motion.css',
  'styles/motion-demo.css',
  'styles/share.css',
  'assets/runtime/scene.webp',
  'assets/runtime/scene-mobile.webp',
  'assets/runtime/tutorial.webp',
  'assets/runtime/victory.webp',
  'assets/runtime/defeat.webp',
  'assets/share/cover-zh.png',
  'assets/share/cover-en.png',
  'assets/share/favicon.svg',
];
export const SITE_DIRECTORIES = ['game', 'browser', 'ui'];
export const CODE_ROOTS = [
  'app.js',
  'i18n.js',
  'game',
  'browser',
  'ui',
  'scripts',
  'tests',
  'promo',
  'e2e',
];
export const BROWSER_ROOTS = ['app.js', 'i18n.js', 'game', 'browser', 'ui'];

export const FORMAT_TARGETS = [
  ...CODE_ROOTS,
  'styles',
  'styles.css',
  'index.html',
  'motion-demo.html',
  'README.md',
  'README.en.md',
  'README.ja.md',
  'AGENTS.md',
  'package.json',
  '.prettierrc.json',
  '.github/workflows',
  'doc/README.md',
  'doc/maintainability',
  'doc/optimization',
  'doc/harness',
  'doc/promo',
  'doc/rules',
];

// New runtime modules must be assigned a layer deliberately.
export const LAYERS = [
  { name: 'data', path: 'game/data.js', allows: [] },
  { name: 'rules', path: 'game/rules.js', allows: [] },
  { name: 'betting', path: 'game/betting.js', allows: [] },
  { name: 'breathing', path: 'game/breathing.js', allows: [] },
  { name: 'records', path: 'game/records.js', allows: [] },
  { name: 'cards', path: 'game/cards.js', allows: ['data', 'rules'] },
  { name: 'deal', path: 'game/deal.js', allows: ['cards'] },
  { name: 'ai-planning', path: 'game/ai-planning.js', allows: ['cards', 'deal'] },
  {
    name: 'ai-betting',
    path: 'game/ai-betting.js',
    allows: ['cards', 'deal', 'rules', 'ai-planning'],
  },
  { name: 'ai', path: 'game/ai.js', allows: ['ai-planning', 'ai-betting'] },
  {
    name: 'engine',
    path: 'game/engine.js',
    allows: ['rules', 'cards', 'deal', 'ai', 'betting', 'breathing', 'records'],
  },
  { name: 'archive', path: 'browser/record-store.js', allows: ['records'] },
  { name: 'browser', prefix: 'browser/', allows: [] },
  { name: 'i18n', path: 'i18n.js', allows: [] },
  { name: 'share-ui', path: 'ui/share.js', allows: ['records'] },
  {
    name: 'ui',
    prefix: 'ui/',
    allows: ['ui', 'data', 'rules', 'cards', 'engine', 'breathing', 'i18n'],
  },
  {
    name: 'app',
    path: 'app.js',
    allows: ['engine', 'browser', 'archive', 'ui', 'share-ui', 'i18n'],
  },
];

export const NODE_GLOBALS = new Set([
  'process',
  'Buffer',
  'require',
  'module',
  '__dirname',
  '__filename',
]);
export const GAME_SIDE_EFFECTS = new Set([
  'window',
  'document',
  'globalThis',
  'self',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]);

export const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
