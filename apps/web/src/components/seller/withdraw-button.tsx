'use client';

import { Undo2 } from 'lucide-react';
import { Button } from '@orbita/ui';
import { useRunner } from '@/components/common/use-runner';
import type { ActionState } from '@/lib/action-state';

export function WithdrawButton({ action, label = 'Withdraw' }: { action: () => Promise<ActionState>; label?: string }) {
  const { pending, run } = useRunner();
  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={() => run(action)}>
      <Undo2 size={14} /> {label}
    </Button>
  );
}
