import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Circle, XCircle } from 'lucide-react';
import type { Workspace } from '@orbita/category-config';
import { Badge, Card, CardHeader } from '@orbita/ui';

const SECTION_TAB: Record<string, string> = { specs: 'specs', rules: 'rules', flags: 'flags', title: 'specs', general: 'overview' };
const SECTION_LABEL: Record<string, string> = { specs: 'Specifications', rules: 'Rules', flags: 'Flags', title: 'Title', general: 'General' };

export function OverviewTab({ ws, base, upToDate }: { ws: Workspace; base: string; upToDate: boolean }) {
  const errors = ws.draft.issues.filter((i) => i.severity === 'error');
  const warnings = ws.draft.issues.filter((i) => i.severity === 'warning');
  const keySpecs = ws.specs.filter((s) => s.importance === 'key').length;
  const tests = ws.tests;
  const testsGreen = tests.length > 0 && tests.every((t) => t.lastResult === 'pass');
  const steps: { done: boolean; label: string; detail: string; tab: string; optional?: boolean }[] = [
    { done: !!ws.profile, label: 'Apply a flag profile', detail: ws.profile ? `${ws.profile.name} v${ws.profile.version}${ws.profile.outdated ? ' (updated since applied)' : ''}` : 'Profiles set most flags in one step.', tab: 'flags', optional: true },
    { done: !ws.draft.issues.some((i) => i.section === 'flags' && i.severity === 'error'), label: 'Decide every flag', detail: `${ws.flags.filter((f) => f.source === 'version').length} set here; the rest come from the profile or defaults.`, tab: 'flags' },
    { done: ws.specs.length > 0 && keySpecs > 0, label: 'Choose specifications and key specs', detail: `${ws.specs.length} specifications, ${keySpecs} key.`, tab: 'specs' },
    { done: ws.rules.length > 0, label: 'Add rules', detail: ws.rules.length ? `${ws.rules.filter((r) => r.enabled).length} active rules.` : 'Rules connect specs, limit values and set price bands.', tab: 'rules', optional: true },
    { done: tests.length > 0, label: 'Add test cases', detail: tests.length ? `${tests.length} sample products.` : 'Save sample products from the preview that must pass or fail.', tab: 'tests' },
    { done: !!ws.lastCompile?.ok && upToDate && testsGreen, label: 'Compile with all tests behaving', detail: ws.lastCompile ? (ws.lastCompile.ok ? (upToDate ? `${ws.lastCompile.testsPassed} passed, ${ws.lastCompile.testsFailed} failed.` : 'The draft changed since the last compile.') : 'The last compile found problems.') : 'Not compiled yet.', tab: 'tests' },
  ];
  const c = ws.contract;

  return (
    <div className="grid xl:grid-cols-[1.1fr_1fr] gap-4 items-start">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Ready for review?" description="Submitting for approval arrives in R3; until then, aim for every step done." />
          <ol className="divide-y divide-line border-t border-line">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={`${base}?tab=${s.tab}`} className="flex items-start gap-3 px-5 py-3 hover:bg-soft/60">
                  {s.done ? <CheckCircle2 size={18} className="text-ok mt-0.5 shrink-0" /> : <Circle size={18} className="text-mute mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.label}{s.optional ? <span className="ml-1.5 text-xs font-normal text-mute">optional</span> : null}</div>
                    <div className="text-xs text-mute">{s.detail}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader title={errors.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix` : 'No problems'} description="Checked live on every change, the same way the compiler checks." />
          {ws.draft.issues.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {[...errors, ...warnings].map((i, n) => (
                <li key={n}>
                  <Link href={`${base}?tab=${SECTION_TAB[i.section]}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-soft/60">
                    {i.severity === 'error' ? <XCircle size={16} className="text-bad mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="text-warn mt-0.5 shrink-0" />}
                    <span className="flex-1 text-sm">{i.message}</span>
                    <Badge>{SECTION_LABEL[i.section]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-mute">The draft compiles cleanly.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="What sellers will get" description={c ? 'From the current draft.' : 'Appears once the draft compiles.'} />
        {c ? (
          <dl className="border-t border-line divide-y divide-line text-sm">
            {[
              ['Specifications', `${c.fields.length} in ${c.groups.length} group${c.groups.length === 1 ? '' : 's'}: ${c.groups.join(', ')}`],
              ['Key specs', c.fields.filter((f) => f.importance === 'key').map((f) => f.label).join(', ') || 'None'],
              ['Required from sellers', `${c.fields.filter((f) => f.required).length} always, more when rules apply`],
              ['Buyer filters', c.filters.map((f) => f.label).join(', ') || 'None'],
              ['Variant options', c.variantOptions.map((k) => c.fields.find((f) => f.key === k)?.label).join(', ') || 'None'],
              ['Rules', `${c.rules.length} active`],
              ['Price', c.offer.discountBand ? `${c.offer.discountBand.min}–${c.offer.discountBand.max}% off MRP${c.rules.some((r) => r.kind === 'price') ? ', plus price rules' : ''}` : c.rules.some((r) => r.kind === 'price') ? 'Price rules' : 'No band'],
              ['Selling units', c.offer.sellingUnits.join(', ')],
              ['Title', c.titleTemplate],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[150px_1fr] gap-3 px-5 py-2.5">
                <dt className="text-mute">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="border-t border-line px-5 py-4 text-sm text-mute">Fix the problems on the left to see the contract.</p>
        )}
      </Card>
    </div>
  );
}
