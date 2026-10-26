import { describe, expect, it } from 'vitest';
import { AppError, forbidden, isAppError, isUuid, newRequestId } from '../src';

describe('AppError', () => {
  it('maps codes to HTTP statuses', () => {
    expect(forbidden().status).toBe(403);
    expect(new AppError('CONFLICT', 'x').status).toBe(409);
  });
  it('is detectable', () => {
    expect(isAppError(forbidden())).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });
});

describe('ids', () => {
  it('validates uuids', () => {
    expect(isUuid('6f1c1b3e-6a0a-4b7a-9d2e-1f2a3b4c5d6e')).toBe(true);
    expect(isUuid('nope')).toBe(false);
  });
  it('creates request ids', () => {
    expect(newRequestId()).toMatch(/^req_[0-9a-f]{20}$/);
  });
});
