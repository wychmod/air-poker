import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisitCounter } from '../browser/visit-counter.js';

function fixture(siteUrl = 'https://player.github.io/air-poker/') {
  const listeners = new Map();
  const tasks = new Map();
  const requests = [];
  const image = {
    hidden: true,
    set src(value) {
      requests.push(value);
    },
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    removeEventListener(name, callback) {
      if (listeners.get(name) === callback) listeners.delete(name);
    },
  };
  const status = { hidden: false };
  const root = {
    dataset: {},
    querySelector: (selector) => (selector === '#visitCountImage' ? image : status),
  };
  const options = {
    root,
    siteUrl,
    schedule(callback) {
      tasks.set(1, callback);
      return 1;
    },
    cancel: (id) => tasks.delete(id),
  };
  const counter = createVisitCounter(options);
  return { root, image, status, counter, options, listeners, tasks, requests };
}

test('counts one project URL regardless of query, fragment or repeated mounts', () => {
  const f = fixture('https://player.github.io/air-poker/?language=en#home');
  const url = new URL(f.requests[0]);
  assert.equal(url.origin, 'https://hits.sh');
  assert.equal(url.pathname, '/player.github.io/air-poker.svg');
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.has('language'), false);
  createVisitCounter(f.options);
  assert.equal(f.requests.length, 1);
  f.listeners.get('load')();
  assert.equal(f.root.dataset.status, 'ready');
  assert.equal(f.image.hidden, false);
  assert.equal(f.status.hidden, true);
  assert.equal(f.tasks.size, 0);
  f.counter.destroy();
  createVisitCounter(f.options);
  assert.equal(f.requests.length, 1);
  assert.equal(f.image.hidden, false);
  const other = fixture('https://player.github.io/another-project/');
  assert.notEqual(other.requests[0], f.requests[0]);
  other.counter.destroy();
});

test('local development and non-HTTPS previews never contact the counter service', () => {
  for (const siteUrl of [
    'file:///D:/idea/air-poker/',
    'http://127.0.0.1:4173/',
    'http://player.github.io/air-poker/',
    'https://localhost/air-poker/',
    'https://preview.localhost/air-poker/',
    'https://127.0.0.1/air-poker/',
    'https://192.168.1.5/air-poker/',
    'https://[::1]/air-poker/',
  ]) {
    const f = fixture(siteUrl);
    assert.equal(f.root.dataset.status, 'local', siteUrl);
    assert.deepEqual(f.requests, [], siteUrl);
    assert.equal(f.tasks.size, 0);
    assert.equal(f.image.hidden, true);
    assert.equal(f.status.hidden, false);
  }
});

test('unavailable or timed out service degrades without late callbacks or duplicate requests', () => {
  for (const completion of ['error', 'timeout', 'destroy']) {
    const f = fixture();
    const lateLoad = f.listeners.get('load');
    if (completion === 'error') f.listeners.get('error')();
    else if (completion === 'timeout') f.tasks.get(1)();
    else f.counter.destroy();
    assert.equal(f.root.dataset.status, 'unavailable');
    assert.equal(f.image.hidden, true);
    assert.equal(f.status.hidden, false);
    assert.equal(f.tasks.size, 0);
    assert.equal(f.listeners.size, 0);
    lateLoad();
    createVisitCounter(f.options);
    assert.equal(f.root.dataset.status, 'unavailable');
    assert.equal(f.requests.length, 1);
  }
});
