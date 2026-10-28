'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileClock,
  FolderTree,
  MoveRight,
  Pencil,
  Plus,
  Power,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, Textarea, cn } from '@orbita/ui';
import {
  addAliasAction,
  createNodeAction,
  findSimilarAction,
  moveNodeAction,
  removeAliasAction,
  renameNodeAction,
  setNodeStatusAction,
} from '@/app/(app)/workbench/taxonomy/actions';
import { splitList, useRunner } from '@/components/common/use-runner';

export interface ExplorerNode {
  id: string;
  parentId: string | null;
  level: number;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  workgroupId: string | null;
  effectiveWorkgroupId: string | null;
  aliases: { id: string; alias: string }[];
  draft: { id: string; version: number; state: string; assigneeName: string | null } | null;
  canEdit: boolean;
  canCreateChild: boolean;
}

export const LEVEL_NAMES = ['', 'Segment', 'Family', 'Class', 'Commodity', 'Listing category'];

interface Match {
  id: string;
  name: string;
  level: number;
  path: string;
  matchedOn: 'name' | 'alias';
  matchedText: string;
  exact: boolean;
}

export function TaxonomyExplorer({
  nodes,
  workgroups,
  canCreateRoot,
}: {
  nodes: ExplorerNode[];
  workgroups: { id: string; name: string }[];
  canCreateRoot: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get('node');
  const select = (id: string | null) => router.replace(id ? `${pathname}?node=${id}` : pathname, { scroll: false });

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const m = new Map<string | null, ExplorerNode[]>();
    for (const n of nodes) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n]);
    return m;
  }, [nodes]);
  const pathOf = (n: ExplorerNode) => {
    const parts: ExplorerNode[] = [];
    let cur: ExplorerNode | undefined = n;
    while (cur) {
      parts.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts;
  };
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const [open, setOpen] = useState<Set<string>>(() => new Set(nodes.filter((n) => n.level <= 1).map((n) => n.id)));
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return null;
    const hit = new Set<string>();
    for (const n of nodes) {
      if (n.name.toLowerCase().includes(query) || n.code.includes(query) || n.aliases.some((a) => a.alias.toLowerCase().includes(query))) {
        let cur: ExplorerNode | undefined = n;
        while (cur) {
          hit.add(cur.id);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
      }
    }
    return hit;
  }, [query, nodes, byId]);

  const effectiveOpen = (id: string) => (visible ? visible.has(id) : open.has(id) || (selected ? pathOf(selected).some((p) => p.id === id) : false));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const wgName = (id: string | null) => workgroups.find((w) => w.id === id)?.name ?? null;

  const renderBranch = (parent: string | null, depth: number): React.ReactNode =>
    (children.get(parent) ?? [])
      .filter((n) => !visible || visible.has(n.id))
      .map((n) => {
        const kids = children.get(n.id) ?? [];
        const isOpen = effectiveOpen(n.id);
        return (
          <li key={n.id}>
            <div
              className={cn(
                'group flex items-center gap-1 rounded-lg pr-2 text-sm',
                selectedId === n.id ? 'bg-accent/10 text-accent' : 'hover:bg-soft',
                n.status === 'inactive' && 'opacity-50',
              )}
              style={{ paddingLeft: 4 + depth * 16 }}
            >
              <button
                type="button"
                aria-label={isOpen ? `Collapse ${n.name}` : `Expand ${n.name}`}
                className={cn('h-7 w-6 grid place-items-center text-mute', !kids.length && 'invisible')}
                onClick={() => toggle(n.id)}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button type="button" className="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left" onClick={() => select(n.id)}>
                <span className="truncate">{n.name}</span>
                <code className="text-[10.5px] text-mute shrink-0">{n.code}</code>
                {n.draft ? <span className="h-1.5 w-1.5 rounded-full bg-warn shrink-0" title={`Draft v${n.draft.version}`} /> : null}
              </button>
            </div>
            {isOpen && kids.length ? <ul>{renderBranch(n.id, depth + 1)}</ul> : null}
          </li>
        );
      });

  return (
    <div className="grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-4 items-start">
      <Card className="p-3 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-100px)] flex flex-col">
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a category, code or alias" className="h-9 pl-8 text-sm" aria-label="Find a category" />
        </div>
        <div className="overflow-y-auto -mx-1 px-1">
          {nodes.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-mute">The tree is empty.</p>
          ) : (
            <ul aria-label="Category tree">{renderBranch(null, 0)}</ul>
          )}
        </div>
        {canCreateRoot ? (
          <div className="mt-2 border-t border-line pt-2">
            <CreateNodeButton parent={null} label="New segment (L1)" />
          </div>
        ) : null}
      </Card>

      {selected ? (
        <NodeDetail
          key={selected.id}
          node={selected}
          path={pathOf(selected)}
          kids={children.get(selected.id) ?? []}
          wgName={wgName}
          nodes={nodes}
          pathOf={pathOf}
          onSelect={select}
        />
      ) : (
        <Overview nodes={nodes} canCreateRoot={canCreateRoot} />
      )}
    </div>
  );
}

function Overview({ nodes, canCreateRoot }: { nodes: ExplorerNode[]; canCreateRoot: boolean }) {
  const counts = [1, 2, 3, 4, 5].map((l) => nodes.filter((n) => n.level === l && n.status === 'active').length);
  return (
    <Card>
      <EmptyState
        icon={<FolderTree size={22} />}
        title={nodes.length ? 'Pick a category' : 'Start the tree'}
        description={
          nodes.length
            ? 'Select a category on the left to see its details, aliases and children.'
            : 'Categories go from segment (L1) to family, class, commodity and finally the listing category (L5) sellers list in.'
        }
        action={!nodes.length && canCreateRoot ? <CreateNodeButton parent={null} label="New segment (L1)" primary /> : undefined}
      />
      <div className="grid grid-cols-5 border-t border-line text-center">
        {counts.map((c, i) => (
          <div key={i} className="px-2 py-3 border-r last:border-r-0 border-line">
            <div className="text-xl font-semibold tracking-tight">{c}</div>
            <div className="text-[11px] text-mute">L{i + 1} · {LEVEL_NAMES[i + 1]}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NodeDetail({
  node,
  path,
  kids,
  wgName,
  nodes,
  pathOf,
  onSelect,
}: {
  node: ExplorerNode;
  path: ExplorerNode[];
  kids: ExplorerNode[];
  wgName: (id: string | null) => string | null;
  nodes: ExplorerNode[];
  pathOf: (n: ExplorerNode) => ExplorerNode[];
  onSelect: (id: string | null) => void;
}) {
  const { pending, run } = useRunner();
  const [alias, setAlias] = useState('');
  const owner = wgName(node.effectiveWorkgroupId);
  const inheritedFrom = node.workgroupId ? null : path.slice(0, -1).reverse().find((p) => p.workgroupId);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-mute" aria-label="Path">
          {path.slice(0, -1).map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <button type="button" className="hover:text-ink hover:underline" onClick={() => onSelect(p.id)}>{p.name}</button>
              <ChevronRight size={12} />
            </span>
          ))}
        </nav>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight">{node.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">L{node.level} · {LEVEL_NAMES[node.level]}</Badge>
              <Badge>
                <code>{node.code}</code>
              </Badge>
              <Badge tone={node.status === 'active' ? 'ok' : 'neutral'}>{node.status === 'active' ? 'Active' : 'Inactive'}</Badge>
            </div>
          </div>
          {node.canEdit ? (
            <div className="flex flex-wrap gap-2">
              <RenameButton node={node} />
              {node.level > 1 ? <MoveButton node={node} nodes={nodes} pathOf={pathOf} /> : null}
              <Button
                variant={node.status === 'active' ? 'danger' : 'secondary'}
                size="sm"
                loading={pending}
                onClick={() => run(() => setNodeStatusAction(node.id, node.status === 'active' ? 'inactive' : 'active'))}
              >
                <Power size={14} /> {node.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </div>
          ) : null}
        </div>
        {node.description ? <p className="mt-3 text-sm text-mute">{node.description}</p> : null}

        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-soft p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-mute"><Users size={13} /> Workgroup</div>
            <div className="mt-1 text-sm font-medium">{owner ?? 'None yet'}</div>
            <div className="text-xs text-mute mt-0.5">
              {node.workgroupId ? 'Assigned here' : inheritedFrom ? `Inherited from ${inheritedFrom.name}` : 'A platform admin assigns workgroups.'}
            </div>
          </div>
          <div className="rounded-xl bg-soft p-3.5">
            <div className="text-xs text-mute">Aliases{node.level === 5 ? ' (at least one required)' : ''}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {node.aliases.length === 0 ? <span className="text-sm text-mute">None</span> : null}
              {node.aliases.map((a) => (
                <Badge key={a.id} tone="neutral" className="gap-1.5">
                  {a.alias}
                  {node.canEdit ? (
                    <button type="button" aria-label={`Remove alias ${a.alias}`} onClick={() => run(() => removeAliasAction(node.id, a.id))}>
                      <X size={12} />
                    </button>
                  ) : null}
                </Badge>
              ))}
            </div>
            {node.canEdit ? (
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (alias.trim()) run(() => addAliasAction(node.id, alias.trim()), () => setAlias(''));
                }}
              >
                <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Add alias" className="h-8 text-sm" aria-label="New alias" />
                <Button type="submit" size="sm" variant="secondary" disabled={!alias.trim()}>Add</Button>
              </form>
            ) : null}
          </div>
        </div>

        {node.draft ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-warn/10 px-4 py-3 text-sm">
            <FileClock size={18} className="text-warn shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <span className="font-medium">Draft v{node.draft.version}</span> · {node.draft.state.toLowerCase()} · assigned to{' '}
              {node.draft.assigneeName || 'a category manager'}
              <div className="text-xs text-mute">Configuring flags and specifications arrives in R2.</div>
            </div>
          </div>
        ) : null}
      </Card>

      {node.level < 5 ? (
        <Card>
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <div>
              <h3 className="font-semibold">{LEVEL_NAMES[node.level + 1]} categories</h3>
              <p className="text-xs text-mute">{kids.length} under {node.name}</p>
            </div>
            {node.canCreateChild && node.status === 'active' ? <CreateNodeButton parent={node} label={`New ${LEVEL_NAMES[node.level + 1]!.toLowerCase()}`} /> : null}
          </div>
          {kids.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {kids.map((k) => (
                <li key={k.id}>
                  <button type="button" onClick={() => onSelect(k.id)} className={cn('flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-soft/60', k.status === 'inactive' && 'opacity-50')}>
                    <span className="flex-1 truncate font-medium">{k.name}</span>
                    {k.draft ? <Badge tone="warn">Draft v{k.draft.version}</Badge> : null}
                    <code className="text-[11px] text-mute">{k.code}</code>
                    <ChevronRight size={14} className="text-mute" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- create */

function CreateNodeButton({ parent, label, primary }: { parent: ExplorerNode | null; label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const level = parent ? parent.level + 1 : 1;
  return (
    <>
      <Button size="sm" variant={primary ? 'primary' : 'secondary'} onClick={() => setOpen(true)} className={primary ? '' : 'w-full sm:w-auto'}>
        <Plus size={14} /> {label}
      </Button>
      {open ? <CreateNodeDialog parent={parent} level={level} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CreateNodeDialog({ parent, level, onClose }: { parent: ExplorerNode | null; level: number; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState({ name: '', code: '', aliases: '', description: '' });
  const [matches, setMatches] = useState<Match[]>([]);
  const { pending, run } = useRunner();
  const typed = [f.name, ...splitList(f.aliases)].filter((x) => x.trim().length >= 2).join('|');

  useEffect(() => {
    if (!typed) return;
    let live = true;
    const t = setTimeout(async () => {
      const results = await Promise.all(typed.split('|').map((x) => findSimilarAction(x)));
      if (!live) return;
      const seen = new Set<string>();
      setMatches(results.flat().filter((m) => (seen.has(m.id + m.matchedText) ? false : (seen.add(m.id + m.matchedText), true))).slice(0, 6));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [typed]);
  const shown = typed ? matches : [];
  const exactAlias = shown.some((m) => m.exact && splitList(f.aliases).some((a) => a.toLowerCase() === m.matchedText.toLowerCase()));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`New ${LEVEL_NAMES[level]!.toLowerCase()} (L${level})`}
      description={parent ? `Under ${parent.name} (${parent.code})` : 'A new top-level segment.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={pending}
            disabled={!f.name.trim() || (level === 5 && !splitList(f.aliases).length) || exactAlias}
            onClick={() =>
              run(
                () =>
                  createNodeAction({
                    parentId: parent?.id ?? null,
                    name: f.name,
                    code: f.code || undefined,
                    aliases: splitList(f.aliases),
                    description: f.description,
                  }),
                (s) => {
                  onClose();
                  const id = s.data?.id as string | undefined;
                  if (id) router.replace(`${pathname}?node=${id}`, { scroll: false });
                },
              )
            }
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="n-name" required>
          <Input id="n-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder={level === 5 ? 'Gaming laptops' : ''} />
        </Field>
        <Field
          label={level === 5 ? 'Aliases' : 'Aliases (optional)'}
          htmlFor="n-aliases"
          hint={level === 5 ? 'At least one, unique across the whole tree. Comma separated.' : 'Comma separated, unique across the tree.'}
          required={level === 5}
        >
          <Input id="n-aliases" value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} placeholder={level === 5 ? 'High Performance Gaming Laptops' : ''} />
        </Field>
        {level < 5 ? (
          <Field label="Code (optional)" htmlFor="n-code" hint={parent ? `Leave empty for the next free code, or type ${parent.code} + two digits (UNSPSC).` : 'Two digits, or leave empty for the next free one.'}>
            <Input id="n-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} inputMode="numeric" placeholder={parent ? `${parent.code}10` : '43'} />
          </Field>
        ) : (
          <p className="text-xs text-mute">The code is generated from the commodity: {parent?.code}-01, -02… then A1…</p>
        )}
        <Field label="Description" htmlFor="n-desc">
          <Textarea id="n-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-16" />
        </Field>
        {shown.length ? (
          <div className={cn('rounded-xl px-4 py-3 text-sm', exactAlias ? 'bg-bad/10' : 'bg-warn/10')}>
            <div className={cn('flex items-center gap-1.5 font-medium', exactAlias ? 'text-bad' : 'text-warn')}>
              <AlertTriangle size={15} /> {exactAlias ? 'That alias is already taken' : 'Similar categories already exist'}
            </div>
            <ul className="mt-1.5 space-y-1 text-xs">
              {shown.map((m) => (
                <li key={m.id + m.matchedText}>
                  <span className="font-medium text-ink">{m.matchedOn === 'alias' ? `"${m.matchedText}" (alias of ${m.name})` : m.name}</span>
                  <span className="text-mute"> · {m.path}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- rename / move */

function RenameButton({ node }: { node: ExplorerNode }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: node.name, description: node.description });
  const { pending, run } = useRunner();
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Pencil size={14} /> Edit</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title={`Edit ${node.name}`}
          description="Renaming keeps the code; the change is recorded in the audit log."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} onClick={() => run(() => renameNodeAction(node.id, f.name, f.description), () => setOpen(false))}>Save</Button></>}
        >
          <div className="space-y-4">
            <Field label="Name" htmlFor="r-name"><Input id="r-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Description" htmlFor="r-desc"><Textarea id="r-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function MoveButton({ node, nodes, pathOf }: { node: ExplorerNode; nodes: ExplorerNode[]; pathOf: (n: ExplorerNode) => ExplorerNode[] }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const { pending, run } = useRunner();
  const options = nodes
    .filter((n) => n.level === node.level - 1 && n.status === 'active' && n.id !== node.parentId && n.canCreateChild)
    .map((n) => ({ id: n.id, label: pathOf(n).map((p) => p.name).join(' › ') }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><MoveRight size={14} /> Move</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title={`Move ${node.name}`}
          description={`Pick a new ${LEVEL_NAMES[node.level - 1]!.toLowerCase()}. Everything under it moves too, and codes stay the same.`}
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={!target} onClick={() => run(() => moveNodeAction(node.id, target), () => setOpen(false))}>Move</Button></>}
        >
          {options.length ? (
            <Field label={`New ${LEVEL_NAMES[node.level - 1]!.toLowerCase()}`} htmlFor="m-target">
              <Select id="m-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-mute">There is no other {LEVEL_NAMES[node.level - 1]!.toLowerCase()} you can move it to.</p>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
