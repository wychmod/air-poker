import { describe, expect, it } from 'vitest';

// Sanity test — verifies the vitest config picks up in-domain tests.
// This file lives in src/tests/ (shared setup) and should be removed or
// moved once the first real domain test (src/domain/cards/*.test.ts) lands.

describe('vitest config sanity', () => {
  it('runs at least one test', () => {
    expect(1 + 1).toBe(2);
  });
});
