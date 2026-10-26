import { describe, expect, it } from 'vitest';
import { likeEscape } from '../src';

describe('likeEscape', () => {
  it('escapes LIKE wildcards', () => {
    expect(likeEscape('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(likeEscape('plain')).toBe('plain');
  });
});
