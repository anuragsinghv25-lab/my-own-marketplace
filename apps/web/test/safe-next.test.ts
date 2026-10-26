import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it('keeps relative paths', () => {
    expect(safeNext('/admin/users?status=active')).toBe('/admin/users?status=active');
  });
  it('blocks open redirects', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'evil', null, undefined, 42]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
