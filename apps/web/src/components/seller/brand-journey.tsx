'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BadgeCheck, CheckCircle2, Circle, Search, Send, Sparkles } from 'lucide-react';
import { readiness } from '@orbita/brands/readiness';
import { Badge, Button, Card, Checkbox, Field, Input, Radio, Select, Textarea, cn } from '@orbita/ui';
import { categoriesForClassAction, checkBrandNameAction, requestAuthorisationAction, saveRequestAction } from '@/app/(app)/seller/actions';
import { useRunner } from '@/components/common/use-runner';
import { FilePicker, type PickedFile } from './file-picker';

type Relation = 'owner' | 'manufacturer_for_owner' | 'authorised_reseller' | 'unbranded';
type Kind = 'registered' | 'unregistered' | 'unbranded';

export interface JourneyDraft {
  id: string | null;
  brandName: string;
  relation: Relation;
  brandKind: Kind;
  trademark: { markType: 'word' | 'device' | 'both'; applicationNumber: string; niceClass: number | null; ownerName: string; validUntil: string; certificate: PickedFile[] } | null;
  categoryNodeIds: string[];
  ownerNameMatches: boolean | null;
  undertakingAccepted: boolean;
  files: PickedFile[];
  note: string;
}

const RELATIONS: { value: Relation; label: string; text: string }[] = [
  { value: 'owner', label: 'I own this brand', text: 'Your organisation owns the trademark or brand.' },
  { value: 'manufacturer_for_owner', label: 'I make it for the owner', text: 'You manufacture under the owner’s authorisation.' },
  { value: 'authorised_reseller', label: 'I resell it', text: 'The owner (not on Orbita) authorised you to sell it.' },
  { value: 'unbranded', label: 'Unbranded goods', text: 'You make products sold without a brand.' },
];

type NameCheck = Awaited<ReturnType<typeof checkBrandNameAction>>;

/**
 * Lookup first (no duplicate brands; owners on Orbita are asked directly), relationship first (the answer
 * picks the evidence), then categories, with one readiness score and the single next thing to do.
 */
export function BrandJourney({ orgId, initial, categories, verified, hasApprovedVa }: { orgId: string; initial: JourneyDraft; categories: { id: string; path: string }[]; verified: boolean; hasApprovedVa: boolean }) {
  const [d, setD] = useState<JourneyDraft>(initial);
  const [check, setCheck] = useState<NameCheck | null>(null);
  const [checking, startCheck] = useTransition();
  const [suggested, setSuggested] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState('');
  const [message, setMessage] = useState('');
  const { pending, run } = useRunner();
  const router = useRouter();

  // live name check, as the seller types
  useEffect(() => {
    const name = d.brandName.trim();
    if (name.length < 2) return;
    const t = setTimeout(() => startCheck(async () => setCheck(await checkBrandNameAction(name))), 350);
    return () => clearTimeout(t);
  }, [d.brandName]);

  // categories that fit the trademark class
  const niceClass = d.trademark?.niceClass ?? null;
  useEffect(() => {
    if (!niceClass) return;
    let live = true;
    categoriesForClassAction(niceClass).then((r) => live && setSuggested(r));
    return () => {
      live = false;
    };
  }, [niceClass]);

  const ownerElsewhere = !!check?.existing?.ownerOrgId && check.existing.ownerOrgId !== orgId;
  const ready = useMemo(
    () =>
      readiness(
        {
          relation: d.relation,
          brandKind: d.brandKind,
          trademark: d.trademark ? { ...d.trademark, certificateFileId: d.trademark.certificate[0]?.id ?? null } : null,
          categoryNodeIds: d.categoryNodeIds,
          ownerNameMatches: d.ownerNameMatches,
          undertakingAccepted: d.undertakingAccepted,
          fileIds: d.files.map((f) => f.id),
        },
        { verified, hasApprovedVa },
      ),
    [d, verified, hasApprovedVa],
  );

  const setRelation = (relation: Relation) =>
    setD({ ...d, relation, brandKind: relation === 'unbranded' ? 'unbranded' : d.brandKind === 'unbranded' ? 'registered' : d.brandKind, trademark: relation === 'unbranded' ? null : d.trademark });
  const setKind = (brandKind: Kind) =>
    setD({ ...d, brandKind, trademark: brandKind === 'registered' ? (d.trademark ?? { markType: 'word', applicationNumber: '', niceClass: null, ownerName: '', validUntil: '', certificate: [] }) : null, ownerNameMatches: brandKind === 'registered' ? d.ownerNameMatches : null });
  const tm = d.trademark;
  const setTm = (patch: Partial<NonNullable<JourneyDraft['trademark']>>) => setD({ ...d, trademark: { ...tm!, ...patch } });
  const toggleCat = (id: string, on: boolean) => setD({ ...d, categoryNodeIds: on ? [...new Set([...d.categoryNodeIds, id])] : d.categoryNodeIds.filter((x) => x !== id) });

  const save = (submit: boolean) =>
    run(
      () =>
        saveRequestAction(
          orgId,
          d.id,
          {
            brandName: d.brandName,
            relation: d.relation,
            brandKind: d.brandKind,
            trademark: tm ? { markType: tm.markType, applicationNumber: tm.applicationNumber, niceClass: tm.niceClass ?? 0, ownerName: tm.ownerName, validUntil: tm.validUntil || null, certificateFileId: tm.certificate[0]?.id ?? null } : null,
            categoryNodeIds: d.categoryNodeIds,
            ownerNameMatches: d.ownerNameMatches,
            undertakingAccepted: d.undertakingAccepted,
            fileIds: d.files.map((f) => f.id),
            note: d.note,
          },
          submit,
        ),
      (s) => {
        const id = (s.data as { id: string }).id;
        if (submit) router.push(`/seller/brands/requests/${id}`);
        else if (!d.id) router.replace(`/seller/brands/requests/${id}`);
        setD({ ...d, id });
      },
    );

  const shown = categories.filter((c) => !q || c.path.toLowerCase().includes(q.toLowerCase())).slice(0, 60);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
      <div className="space-y-4 min-w-0">
        <Card className="p-5 space-y-3">
          <Step n={1} title="Which brand?" />
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <Input aria-label="Brand name" className="pl-9" value={d.brandName} onChange={(e) => setD({ ...d, brandName: e.target.value })} placeholder="Type the brand name" disabled={!!d.id} />
          </div>
          {d.brandName.trim().length >= 2 && check && !checking ? (
            check.problem ? (
              <p className="flex gap-2 text-sm text-bad"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {check.problem}</p>
            ) : check.existing ? (
              <p className="flex gap-2 text-sm"><BadgeCheck size={16} className="text-ok shrink-0 mt-0.5" /> {check.existing.name} is on Orbita{check.existing.ownerName ? `, owned by ${check.existing.ownerName}` : ', with no verified owner yet'}.</p>
            ) : (
              <p className="flex gap-2 text-sm text-mute"><Sparkles size={16} className="text-accent shrink-0 mt-0.5" /> New brand: it is created when your request is approved.{check.similar.length ? ` Similar: ${check.similar.map((s) => s.name).join(', ')}.` : ''}</p>
            )
          ) : null}
        </Card>

        {ownerElsewhere ? (
          <Card className="p-5 space-y-3 border-accent/40">
            <div className="font-medium">Ask {check!.existing!.ownerName} for permission</div>
            <p className="text-sm text-mute">The owner is on Orbita, so they decide who resells {check!.existing!.name}: no paperwork for a reviewer. Pick the categories and add a note.</p>
            <CategoryPicker categories={shown} q={q} setQ={setQ} picked={d.categoryNodeIds} toggle={toggleCat} suggested={[]} />
            <Textarea aria-label="Message to the owner" rows={2} placeholder="e.g. We run 40 stores in Delhi NCR." value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="flex justify-end">
              <Button loading={pending} disabled={!d.categoryNodeIds.length || !verified} onClick={() => run(() => requestAuthorisationAction(orgId, { brandId: check!.existing!.id, categoryIds: d.categoryNodeIds, message }), () => router.push('/seller/brands?tab=authorisations'))}>
                <Send size={15} /> Ask the owner
              </Button>
            </div>
            {!verified ? <p className="text-xs text-mute text-right">You can ask once your organisation is verified.</p> : null}
          </Card>
        ) : (
          <>
            <Card className="p-5 space-y-3">
              <Step n={2} title="Your relationship with the brand" />
              <div className="grid gap-2 sm:grid-cols-2">
                {RELATIONS.map((r) => (
                  <label key={r.value} className="flex gap-2 rounded-xl border border-line p-3 text-sm cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                    <Radio name="relation" checked={d.relation === r.value} onChange={() => setRelation(r.value)} className="mt-0.5" />
                    <span><span className="font-medium">{r.label}</span><span className="block text-xs text-mute mt-0.5">{r.text}</span></span>
                  </label>
                ))}
              </div>
              {d.relation !== 'unbranded' ? (
                <Field label="Is the brand a registered trademark?" htmlFor="bj-kind">
                  <Select id="bj-kind" value={d.brandKind} onChange={(e) => setKind(e.target.value as Kind)}>
                    <option value="registered">Yes, registered</option>
                    <option value="unregistered">No, not registered</option>
                  </Select>
                </Field>
              ) : null}
            </Card>

            <Card className="p-5 space-y-4">
              <Step n={3} title="Evidence" />
              {d.brandKind === 'registered' && tm ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mark type" htmlFor="tm-type">
                    <Select id="tm-type" value={tm.markType} onChange={(e) => setTm({ markType: e.target.value as never })}>
                      <option value="word">Word mark</option>
                      <option value="device">Device (logo) mark</option>
                      <option value="both">Both</option>
                    </Select>
                  </Field>
                  <Field label="Application number" htmlFor="tm-app"><Input id="tm-app" inputMode="numeric" value={tm.applicationNumber} onChange={(e) => setTm({ applicationNumber: e.target.value.replace(/\D/g, '') })} /></Field>
                  <Field label="Class (1–45)" htmlFor="tm-class" hint="Class 9 covers computers and electronics.">
                    <Input id="tm-class" type="number" min={1} max={45} value={tm.niceClass ?? ''} onChange={(e) => setTm({ niceClass: e.target.value ? Number(e.target.value) : null })} />
                  </Field>
                  <Field label="Valid until" htmlFor="tm-until"><Input id="tm-until" type="date" value={tm.validUntil} onChange={(e) => setTm({ validUntil: e.target.value })} /></Field>
                  <Field label="Owner name on the certificate" htmlFor="tm-owner" className="sm:col-span-2"><Input id="tm-owner" value={tm.ownerName} onChange={(e) => setTm({ ownerName: e.target.value })} /></Field>
                  <div className="sm:col-span-2"><FilePicker orgId={orgId} value={tm.certificate} onChange={(certificate) => setTm({ certificate })} label="Attach the trademark certificate" max={1} /></div>
                  <fieldset className="sm:col-span-2 space-y-1.5">
                    <legend className="text-sm font-medium mb-1">Is your organisation’s name on the certificate?</legend>
                    <label className="flex items-center gap-2 text-sm"><Radio name="match" checked={d.ownerNameMatches === true} onChange={() => setD({ ...d, ownerNameMatches: true })} /> Yes</label>
                    <label className="flex items-center gap-2 text-sm"><Radio name="match" checked={d.ownerNameMatches === false} onChange={() => setD({ ...d, ownerNameMatches: false })} /> No: we have an authorisation, assignment or merger document</label>
                  </fieldset>
                </div>
              ) : null}
              {d.brandKind === 'unregistered' ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={d.undertakingAccepted} onChange={(e) => setD({ ...d, undertakingAccepted: e.target.checked })} className="mt-0.5" />
                  <span>I undertake that this brand does not copy any registered trademark, and that we are responsible for any claim against it.</span>
                </label>
              ) : null}
              {d.brandKind === 'unbranded' ? <p className="text-sm text-mute">Unbranded goods need an approved vendor assessment: no trademark is asked for.</p> : null}
              {d.relation === 'authorised_reseller' || d.relation === 'manufacturer_for_owner' || d.ownerNameMatches === false ? (
                <Field label={d.ownerNameMatches === false ? 'Proof of your right to the mark' : 'The owner’s authorisation letter'} htmlFor="bj-files">
                  <FilePicker orgId={orgId} value={d.files} onChange={(files) => setD({ ...d, files })} label="Attach a document" />
                </Field>
              ) : null}
            </Card>

            <Card className="p-5 space-y-3">
              <Step n={4} title="Where you want to sell it" />
              <CategoryPicker categories={shown} q={q} setQ={setQ} picked={d.categoryNodeIds} toggle={toggleCat} suggested={suggested} />
              <Textarea aria-label="Note for the reviewer" rows={2} placeholder="Anything the reviewer should know (optional)" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
            </Card>
          </>
        )}
      </div>

      {!ownerElsewhere ? (
        <aside className="lg:sticky lg:top-[76px]">
          <Card className="p-5 space-y-4">
            <div>
              <div className="flex items-baseline justify-between"><span className="font-medium">Readiness</span><span className="text-2xl font-semibold tracking-tight">{ready.score}%</span></div>
              <div className="mt-2 h-2 rounded-full bg-soft overflow-hidden"><div className={cn('h-full transition-[width]', ready.score === 100 ? 'bg-ok' : ready.score >= 60 ? 'bg-warn' : 'bg-bad')} style={{ width: `${ready.score}%` }} /></div>
              <p className="mt-2 text-sm">{ready.next ? <><span className="text-mute">Next: </span>{ready.next}</> : <span className="text-ok">Ready to submit.</span>}</p>
            </div>
            <ul className="space-y-1.5">
              {ready.checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  {c.ok ? <CheckCircle2 size={15} className="text-ok" /> : <Circle size={15} className="text-mute" />} <span className={cn(!c.ok && 'text-mute')}>{c.label}</span>
                </li>
              ))}
            </ul>
            <div className="grid gap-2">
              <Button loading={pending} disabled={!!ready.next || !!check?.problem} onClick={() => save(true)}><Send size={15} /> Submit</Button>
              <Button variant="secondary" loading={pending} disabled={d.brandName.trim().length < 2 || !!check?.problem} onClick={() => save(false)}>Save draft</Button>
            </div>
          </Card>
        </aside>
      ) : null}
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-6 w-6 rounded-full bg-accent text-onaccent grid place-items-center text-xs font-semibold">{n}</span>
      <span className="font-semibold">{title}</span>
    </div>
  );
}

function CategoryPicker({ categories, q, setQ, picked, toggle, suggested }: { categories: { id: string; path: string }[]; q: string; setQ: (s: string) => void; picked: string[]; toggle: (id: string, on: boolean) => void; suggested: { id: string; name: string }[] }) {
  return (
    <div className="space-y-2">
      {suggested.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-mute">Fits the trademark class:</span>
          {suggested.map((s) => (
            <button key={s.id} type="button" onClick={() => toggle(s.id, !picked.includes(s.id))} aria-pressed={picked.includes(s.id)}>
              <Badge tone={picked.includes(s.id) ? 'accent' : 'neutral'}>{picked.includes(s.id) ? '✓ ' : '+ '}{s.name}</Badge>
            </button>
          ))}
        </div>
      ) : null}
      <Input aria-label="Search categories" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listing categories" />
      <div className="max-h-56 overflow-y-auto rounded-lg border border-line p-2 space-y-1">
        {categories.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <Checkbox checked={picked.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
            <span className="truncate">{c.path}</span>
          </label>
        ))}
        {!categories.length ? <p className="text-sm text-mute px-1">No listing categories match.</p> : null}
      </div>
      <p className="text-xs text-mute">{picked.length} selected</p>
    </div>
  );
}
