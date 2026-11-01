'use client';

import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { evaluate, type Contract, type Sample } from '@orbita/contract';
import { Button } from '@orbita/ui';
import { ContractForm } from '@/components/contract/contract-form';

const empty: Sample = { values: {}, brand: '', model: '', price: null, mrp: null };

/** The submitted contract's seller form, for the approver to try the rules themselves. */
export function FormTry({ contract }: { contract: Contract }) {
  const [sample, setSample] = useState<Sample>(empty);
  const ev = useMemo(() => evaluate(contract, sample), [contract, sample]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-soft/60 px-4 py-2.5 text-sm">
        <span>
          <span className="text-mute">Title: </span>
          <span className="font-medium">{ev.title || '—'}</span>
          <span className="text-mute"> · {ev.errors.length ? `${ev.errors.length} problem${ev.errors.length === 1 ? '' : 's'}` : 'no problems'}</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setSample(empty)}>
          <RotateCcw size={14} /> Clear
        </Button>
      </div>
      <ContractForm contract={contract} sample={sample} onChange={setSample} />
    </div>
  );
}
