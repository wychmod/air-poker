import { createAppError } from '../domain/errors';
import type { Rng } from '../domain/cards/deck';
import { logDebugEvent } from './debug-log';

let fallbackCounter = 0;

function xfnv1a(seed: string): [number, number, number, number] {
  let hash = 2166136261 >>> 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }

  const next = () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507) ^ (hash >>> 13);
    return hash >>> 0;
  };

  return [next(), next(), next(), next()];
}

function numericSeedToState(seed: number): [number, number, number, number] {
  const normalized = seed >>> 0;

  return [
    normalized & 0xff,
    (normalized >>> 8) & 0xff,
    (normalized >>> 16) & 0xff,
    (normalized >>> 24) & 0xff,
  ];
}

function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;

    let value = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    value = (value + d) | 0;
    c = (c + value) | 0;

    return (value >>> 0) / 4294967296;
  };
}

export function createSeededRng(seed: string | number): Rng {
  if (seed === '') {
    logDebugEvent('rng:seeded-rejected', { code: 'empty-seed' }, { level: 'warn' });
    throw createAppError('empty-seed', 'Seed cannot be empty');
  }

  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    logDebugEvent(
      'rng:seeded-rejected',
      { code: 'invalid-seed', seed },
      { level: 'warn' },
    );
    throw createAppError('invalid-seed', 'Seed number must be finite', {
      details: { seed },
    });
  }

  const state = typeof seed === 'string' ? xfnv1a(seed) : numericSeedToState(seed);
  logDebugEvent('rng:seeded-created', {
    seed,
    seedType: typeof seed,
  });

  return sfc32(...state);
}

export function createRuntimeSeed(): string {
  const timestamp = new Date().toISOString();
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    const randomHex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');

    const seed = `${timestamp}-${randomHex}`;
    logDebugEvent('rng:runtime-seed-created', { seed, source: 'crypto' });

    return seed;
  }

  fallbackCounter = (fallbackCounter + 1) & 0xffff;

  const seed = `${timestamp}-${fallbackCounter.toString(16).padStart(4, '0')}`;
  logDebugEvent('rng:runtime-seed-created', { seed, source: 'fallback-counter' });

  return seed;
}

export function createRuntimeRng(): { seed: string; rng: Rng } {
  const seed = createRuntimeSeed();
  logDebugEvent('rng:runtime-created', { seed });

  return {
    seed,
    rng: createSeededRng(seed),
  };
}
