'use client';

import Link from 'next/link';
import { CheckCircle2, CircleDashed, FlaskConical, Trash2, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState } from '@orbita/ui';
import { compileAction, deleteTestCaseAction } from '@/app/(app)/workbench/versions/actions';
import { useRunner } from '@/components/common/use-runner';
import { timeAgo } from '@/lib/format';

interface TestRow {
  id: string;
  name: string;
  expectation: 'pass' | 'fail';
  sample: { values: Record<string, unknown>; brand?: string; model?: string; price?: number | null; mrp?: number | null };
  lastResult: string | null;
  lastMessage: string | null;
  lastRunAt: string | null;
}

export function TestsTab({ versionId, tests, lastCompile, editable, base }: { versionId: string; tests: TestRow[]; lastCompile: { createdAt: string; testsPassed: number; testsFailed: number } | null; editable: boolean; base: string }) {
  const { pending, run } = useRunner();
  return (
    <Card>
      <CardHeader
        title="Contract test cases"
        description="Sample products that must pass or must be rejected. They run on every compile, so a rule change that breaks a known case shows at once."
        actions={editable && tests.length ? <Button loading={pending} onClick={() => run(() => compileAction(versionId))}>Compile and run</Button> : null}
      />
      {!tests.length ? (
        <EmptyState
          icon={<FlaskConical size={22} />}
          title="No test cases yet"
          description="Fill the seller's form on the Preview tab, then “Save as a test case”."
          action={<Link href={`${base}?tab=preview`} className="text-sm text-accent hover:underline">Open the preview</Link>}
        />
      ) : (
        <>
          {lastCompile ? <p className="px-5 pb-3 text-sm text-mute">Last run {timeAgo(lastCompile.createdAt)}: {lastCompile.testsPassed} behaved as expected, {lastCompile.testsFailed} did not.</p> : null}
          <ul className="divide-y divide-line border-t border-line">
            {tests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                {t.lastResult === 'pass' ? <CheckCircle2 size={18} className="text-ok mt-0.5" /> : t.lastResult === 'fail' ? <XCircle size={18} className="text-bad mt-0.5" /> : <CircleDashed size={18} className="text-mute mt-0.5" />}
                <div className="flex-1 min-w-[240px]">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-mute">
                    {Object.entries(t.sample.values).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ') || 'No values'}
                    {t.sample.price != null ? ` · price ₹${t.sample.price}` : ''}
                  </div>
                  {t.lastMessage ? <div className="text-xs mt-1">{t.lastResult === 'pass' ? 'As expected: ' : 'Unexpected: '}{t.lastMessage}</div> : <div className="text-xs mt-1 text-mute">Not run yet.</div>}
                </div>
                <Badge tone={t.expectation === 'pass' ? 'ok' : 'bad'}>Must {t.expectation === 'pass' ? 'pass' : 'be rejected'}</Badge>
                {editable ? <Button size="icon" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => run(() => deleteTestCaseAction(versionId, t.id))}><Trash2 size={14} /></Button> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
