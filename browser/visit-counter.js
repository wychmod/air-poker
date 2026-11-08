const mountedCounters = new WeakMap();

// Counter key is fixed on purpose: every deployment of this project (GitHub Pages, a
// mirror, a custom domain) must read and increment the same counter. It therefore
// cannot be derived from the current host or path. Hits requires the key to be a valid
// URI, so a bare word such as `air-poker` is rejected with "Not a valid URI";
// `air-poker.views` parses as host + TLD and is accepted.
const COUNTER_KEY = 'air-poker.views';

function counterUrl(siteUrl) {
  const site = new URL(siteUrl);
  const hostname = site.hostname;
  const local =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '[::1]' ||
    /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(hostname);
  if (site.protocol !== 'https:' || local) return null;
  const url = new URL(`https://hits.sh/${COUNTER_KEY}.svg`);
  url.search = new URLSearchParams({
    style: 'flat-square',
    label: 'PV',
    color: '171917',
    labelColor: 'f3f2ee',
  });
  return url.href;
}

// The persistent footer survives page and language renders. Mount only once per document.
export function createVisitCounter({
  root,
  siteUrl = new URL('../', import.meta.url),
  schedule = setTimeout,
  cancel = clearTimeout,
  timeoutMs = 8000,
} = {}) {
  if (!root) return { destroy() {} };
  if (mountedCounters.has(root)) return mountedCounters.get(root);
  const image = root.querySelector('#visitCountImage');
  const status = root.querySelector('#visitCountStatus');
  let pending = false;
  let timeout = null;

  function setStatus(next) {
    root.dataset.status = next;
    root.ariaBusy = next === 'loading' ? 'true' : 'false';
  }

  function cleanup() {
    if (timeout !== null) cancel(timeout);
    timeout = null;
    image?.removeEventListener('load', loaded);
    image?.removeEventListener('error', failed);
  }
  function settle(next) {
    if (!pending) return;
    pending = false;
    cleanup();
    setStatus(next);
    image.hidden = next !== 'ready';
    status.hidden = next === 'ready';
  }
  function loaded() {
    settle('ready');
  }
  function failed() {
    settle('unavailable');
  }

  const controller = {
    destroy() {
      failed();
      cleanup();
    },
  };
  mountedCounters.set(root, controller);

  let url;
  try {
    url = counterUrl(siteUrl);
  } catch {
    setStatus('unavailable');
    return controller;
  }
  if (!image || !status) {
    setStatus('unavailable');
    return controller;
  }
  image.hidden = true;
  status.hidden = false;
  if (!url) {
    setStatus('local');
    return controller;
  }

  setStatus('loading');
  pending = true;
  image.addEventListener('load', loaded);
  image.addEventListener('error', failed);
  timeout = schedule(failed, timeoutMs);
  try {
    image.referrerPolicy = 'no-referrer';
    image.src = url;
  } catch {
    failed();
  }
  return controller;
}
