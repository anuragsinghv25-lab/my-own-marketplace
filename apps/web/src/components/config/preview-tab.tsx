'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FlaskConical, RotateCcw, SlidersHorizontal, XCircle, Zap } from 'lucide-react';
import { evaluate, type Contract, type Issue, type Sample } from '@orbita/contract';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, EmptyState, Field, Input, Radio, cn } from '@orbita/ui';
import { saveTestCaseAction } from '@/app/(app)/workbench/versions/actions';
import { useRunner } from '@/components/common/use-runner';
import { ContractForm } from '@/components/contract/contract-form';

const empty: Sample = { values: {}, brand: '', model: '', price: null, mrp: null };

export function PreviewTab({ versionId, contract, issues, editable, base }: { versionId: string; contract: Contract | null; issues: Issue[]; editable: boolean; base: string }) {
  const [sample, setSample] = useState<Sample>(empty);
  const ev = useMemo(() => (contract ? evaluate(contract, sample) : null), [contract, sample]);

  if (!contract || !ev) {
    const errors = issues.filter((i) => i.severity === 'error');
    return (
      <Card>
        <EmptyState
          icon={<XCircle size={22} />}
          title="The preview needs a draft that compiles"
          description={`${errors.length} problem${errors.length === 1 ? '' : 's'} to fix first, starting with: ${errors[0]?.message ?? 'add specifications'}`}
          action={<Link href={`${base}?tab=overview`} className="text-sm text-accent hover:underline">See all problems</Link>}
        />
      </Card>
    );
  }
  const byRule = new Map(contract.rules.map((r) => [r.id, r]));
  return (
    <div className="grid xl:grid-cols-[1.35fr_1fr] gap-4 items-start">
      <Card>
        <CardHeader
          title="Seller's form"
          description="Generated from the contract with the same code sellers will use in R5. Fill it like a seller to try the rules."
          actions={<Button variant="ghost" size="sm" onClick={() => setSample(empty)}><RotateCcw size={14} /> Clear</Button>}
        />
        <div className="border-t border-line p-5">
          <ContractForm contract={contract} sample={sample} onChange={setSample} />
        </div>
      </Card>

      <div className="space-y-4 xl:sticky xl:top-[76px]">
        <Card className="p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-mute">Product title</div>
          <div className="mt-1 text-lg font-semibold tracking-tight min-h-7">{ev.title || <span className="text-mute font-normal text-sm">Appears as the seller fills in the form</span>}</div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-mute mb-1"><span>Listing quality</span><span>{ev.quality}%</span></div>
            <div className="h-2 rounded-full bg-soft overflow-hidden"><div className={cn('h-full transition-[width]', ev.quality >= 80 ? 'bg-ok' : ev.quality >= 50 ? 'bg-warn' : 'bg-bad')} style={{ width: `${ev.quality}%` }} /></div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            {ev.errors.length ? <XCircle size={16} className="text-bad" /> : <CheckCircle2 size={16} className="text-ok" />}
            {ev.errors.length ? `${ev.errors.length} thing${ev.errors.length === 1 ? '' : 's'} to fix before submitting` : 'Ready to submit'}
          </div>
          {ev.errors.length ? (
            <ul className="mt-2 space-y-1">
              {ev.errors.slice(0, 8).map((e) => <li key={e.message} className="text-xs text-bad">{e.message}</li>)}
            </ul>
          ) : null}
          {editable ? <SaveAsTest versionId={versionId} sample={sample} passes={ev.errors.length === 0} /> : null}
        </Card>

        <Card>
          <CardHeader title="Rules in play" description={ev.activeRules.length ? 'Applied to the values chosen.' : 'None apply to the values chosen yet.'} />
          {ev.activeRules.length ? (
            <ul className="border-t border-line divide-y divide-line">
              {ev.activeRules.map((id) => (
                <li key={id} className="flex items-start gap-2 px-5 py-2.5 text-sm"><Zap size={14} className="mt-0.5 text-ai shrink-0" /> {byRule.get(id)?.text}</li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Buyer filters" description="What buyers can narrow this category by." />
          {contract.filters.length ? (
            <div className="border-t border-line px-5 py-4 space-y-4">
              {contract.filters.map((f) => (
                <div key={f.key}>
                  <div className="flex items-center gap-1.5 text-sm font-medium mb-1.5"><SlidersHorizontal size={13} className="text-mute" /> {f.label}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {f.kind === 'options'
                      ? f.options!.slice(0, 8).map((o) => <label key={o} className="flex items-center gap-1.5 text-xs text-mute"><Checkbox disabled /> {o}</label>)
                      : f.kind === 'boolean'
                        ? <label className="flex items-center gap-1.5 text-xs text-mute"><Checkbox disabled /> Yes</label>
                        : (f.buckets ?? [{ min: 0, max: 0, label: `Slider${f.unit ? ` (${f.unit})` : ''}` }]).map((b) => <label key={b.label} className="flex items-center gap-1.5 text-xs text-mute"><Checkbox disabled /> {b.label}</label>)}
                    {f.kind === 'options' && f.options!.length > 8 ? <span className="text-xs text-mute">+{f.options!.length - 8} more</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-mute">No filters: mark specifications as filters on the Specifications tab.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function SaveAsTest({ versionId, sample, passes }: { versionId: string; sample: Sample; passes: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [expect, setExpect] = useState<'pass' | 'fail'>(passes ? 'pass' : 'fail');
  const { pending, run } = useRunner();
  const empty = !Object.keys(sample.values).length;
  return (
    <>
      <Button variant="secondary" className="mt-4 w-full" disabled={empty} onClick={() => { setExpect(passes ? 'pass' : 'fail'); setOpen(true); }}>
        <FlaskConical size={15} /> Save as a test case
      </Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Save as a test case"
          description="It runs on every compile. A test that stops behaving as expected tells you a change broke something."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={name.trim().length < 2} onClick={() => run(() => saveTestCaseAction(versionId, { name, expectation: expect, sample: { ...sample, brand: sample.brand || undefined, model: sample.model || undefined } }), () => setOpen(false))}>Save</Button></>}
        >
          <div className="space-y-4">
            <Field label="Name" htmlFor="tc-name"><Input id="tc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="RAM = 4 GB is rejected" autoFocus /></Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-1">This product must…</legend>
              <label className="flex items-center gap-2 text-sm"><Radio name="tc-exp" checked={expect === 'pass'} onChange={() => setExpect('pass')} /> pass (sellers can list it) {passes ? <Badge tone="ok">passes now</Badge> : null}</label>
              <label className="flex items-center gap-2 text-sm"><Radio name="tc-exp" checked={expect === 'fail'} onChange={() => setExpect('fail')} /> be rejected {!passes ? <Badge tone="bad">rejected now</Badge> : null}</label>
            </fieldset>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
