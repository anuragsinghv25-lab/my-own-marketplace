'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronRight, Copy, Hammer, Lock, UserRound, XCircle } from 'lucide-react';
import { Badge, Button, Checkbox, Dialog, Field, Select } from '@orbita/ui';
import { assignVersionAction, cloneFromAction, compileAction } from '@/app/(app)/workbench/versions/actions';
import { useRunner } from '@/components/common/use-runner';
import { timeAgo } from '@/lib/format';
import { VERSION_STATE_TONE, versionStateLabel } from '@/lib/version-state';

interface HeaderData {
  version: { id: string; number: number; state: string; assigneeId: string | null; assigneeName: string | null };
  node: { id: string; name: string; code: string; path: string[] };
  canAssign: boolean;
  lastCompile: { ok: boolean; hash: string | null; createdAt: string; testsPassed: number; testsFailed: number } | null;
  draftOk: boolean;
}

export function VersionHeader({
  ws,
  editable,
  canEdit,
  lockedOut,
  upToDate,
  errorCount,
  assignees,
  others,
}: {
  ws: HeaderData;
  editable: boolean;
  canEdit: boolean;
  lockedOut: string | null;
  upToDate: boolean;
  errorCount: number;
  assignees: { id: string; name: string; email: string }[];
  others: { id: string; label: string }[];
}) {
  const { pending, run } = useRunner();
  const v = ws.version;
  const lc = ws.lastCompile;
  return (
    <header className="mb-5">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-mute" aria-label="Path">
        <Link href="/workbench/versions" className="hover:text-ink hover:underline">Category versions</Link>
        {ws.node.path.slice(0, -1).map((p) => (
          <span key={p} className="inline-flex items-center gap-1"><ChevronRight size={12} />{p}</span>
        ))}
      </nav>
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{ws.node.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={VERSION_STATE_TONE[v.state] ?? 'neutral'}>v{v.number} · {versionStateLabel(v.state)}</Badge>
            <Badge><code>{ws.node.code}</code></Badge>
            <Badge className="gap-1"><UserRound size={11} /> {v.assigneeName ?? 'Unassigned'}</Badge>
            {lc ? (
              lc.ok ? (
                <Badge tone={upToDate ? 'ok' : 'warn'} className="gap-1">
                  <CheckCircle2 size={11} /> Contract <code>{lc.hash!.slice(0, 8)}</code> · {upToDate ? 'up to date' : 'draft changed since'}
                </Badge>
              ) : (
                <Badge tone="bad" className="gap-1"><XCircle size={11} /> Last compile {timeAgo(lc.createdAt)} had problems</Badge>
              )
            ) : (
              <Badge>Not compiled yet</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ws.canAssign ? <AssignButton versionId={v.id} current={v.assigneeId} people={assignees} /> : null}
          {editable && others.length ? <CloneButton versionId={v.id} others={others} /> : null}
          {editable ? (
            <Button loading={pending} onClick={() => run(() => compileAction(v.id))}>
              <Hammer size={15} /> Compile{errorCount ? ` (${errorCount} to fix)` : ''}
            </Button>
          ) : null}
        </div>
      </div>
      {lockedOut ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-warn/10 px-4 py-2.5 text-sm">
          <Lock size={15} className="text-warn" />
          <span><b>{lockedOut}</b> is editing this version. You can look around; editing opens when they finish or after 15 minutes without changes.</span>
        </div>
      ) : !canEdit ? (
        <p className="mt-3 text-sm text-mute">Read-only: {v.state === 'DRAFT' || v.state === 'SENT_BACK' ? 'only category managers of this part of the tree edit it.' : `the version is ${versionStateLabel(v.state).toLowerCase()}.`}</p>
      ) : null}
    </header>
  );
}

function AssignButton({ versionId, current, people }: { versionId: string; current: string | null; people: { id: string; name: string; email: string }[] }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(current ?? '');
  const { pending, run } = useRunner();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><UserRound size={15} /> Reassign</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Reassign this version"
          description="Category managers of this part of the tree."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={!who || who === current} onClick={() => run(() => assignVersionAction(versionId, who), () => setOpen(false))}>Reassign</Button></>}
        >
          <Field label="Assign to" htmlFor="as-who">
            <Select id="as-who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
            </Select>
          </Field>
        </Dialog>
      ) : null}
    </>
  );
}

const SECTIONS = [
  { key: 'specs', label: 'Specifications' },
  { key: 'rules', label: 'Rules' },
  { key: 'flags', label: 'Flags and profile' },
  { key: 'title', label: 'Title template' },
  { key: 'tests', label: 'Test cases' },
] as const;

function CloneButton({ versionId, others }: { versionId: string; others: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');
  const [pick, setPick] = useState<string[]>(['specs', 'rules', 'title']);
  const { pending, run } = useRunner();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Copy size={15} /> Copy from…</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title="Copy from another category"
          description="Replaces the chosen sections here with the other version's. The change is recorded and can be adjusted afterwards."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button loading={pending} disabled={!src || !pick.length} onClick={() => run(() => cloneFromAction(versionId, src, pick as never), () => setOpen(false))}>Copy</Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Copy from" htmlFor="cl-src">
              <Select id="cl-src" value={src} onChange={(e) => setSrc(e.target.value)}>
                <option value="">Choose a version…</option>
                {others.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-1">Sections</legend>
              {SECTIONS.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={pick.includes(s.key)} onChange={(e) => setPick(e.target.checked ? [...pick, s.key] : pick.filter((x) => x !== s.key))} />
                  {s.label}
                </label>
              ))}
            </fieldset>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
