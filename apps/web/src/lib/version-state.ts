/** Category version states as people read them, with a badge tone. */
export const VERSION_STATE_TONE: Record<string, 'warn' | 'accent' | 'ok' | 'neutral' | 'bad'> = {
  DRAFT: 'warn',
  SENT_BACK: 'bad',
  IN_REVIEW: 'accent',
  APPROVED: 'ok',
  SCHEDULED: 'ok',
  PUBLISHED: 'ok',
  SUPERSEDED: 'neutral',
  DISCARDED: 'neutral',
};

export const versionStateLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ');
