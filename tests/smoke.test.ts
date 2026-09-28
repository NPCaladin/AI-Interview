import { describe, it, expect } from 'vitest';
import { isUuid } from '@/lib/sessionStore';

describe('vitest setup', () => {
  it('resolves @/ alias', () => {
    expect(isUuid('d3c4885b-a075-42dd-9160-13a8387d8757')).toBe(true);
    expect(isUuid('nope')).toBe(false);
  });
});
