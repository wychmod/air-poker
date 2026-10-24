const mountedCounters = new WeakMap();

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
  const key = site.host + site.pathname.replace(/\/+$/, '');
  const url = new URL(`https://hits.sh/${key}.svg`);
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
