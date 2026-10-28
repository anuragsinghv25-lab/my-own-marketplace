'use client';

import { useTransition } from 'react';
import { toast } from '@orbita/ui';
import type { ActionState } from '@/lib/action-state';

/** Runs a server action from an event handler and reports the result as a toast. */
export function useRunner() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>, onOk?: (s: ActionState & { status: 'ok' }) => void) =>
    start(async () => {
      const s = await fn();
      if (s.status === 'ok') {
        if (s.message) toast.success(s.message);
        onOk?.(s);
      } else if (s.status === 'error') toast.error(s.message);
    });
  return { pending, run };
}

/** "a, b , c" → ["a","b","c"] */
export const splitList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
