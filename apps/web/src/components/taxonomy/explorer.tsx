'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileClock,
  Folder,
  FolderTree,
  Globe,
  Hash,
  MoveRight,
  Pencil,
  Plus,
  Power,
  Search,
  ShoppingBag,
  Shuffle,
  Users,
  X,
} from 'lucide-react';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Radio, Select, Textarea, cn } from '@orbita/ui';
import {
  addAliasAction,
  createNodeAction,
  findSimilarAction,
  moveNodeAction,
  removeAliasAction,
  renameNodeAction,
  setNodeKindAction,
  setNodeStatusAction,
  setUnspscCodeAction,
} from '@/app/(app)/workbench/taxonomy/actions';
import { splitList, useRunner } from '@/components/common/use-runner';
import { AttributeSetCard } from './attribute-set';
import { StandardPicker, type PlacementOption } from './standard-picker';

export type CategoryKind = 'group' | 'listing';
export type CategorySource = 'custom' | 'shopify' | 'unspsc';

export interface ExplorerNode {
  id: string;
  parentId: string | null;
  level: number;
  kind: CategoryKind;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  source: CategorySource;
  externalId: string | null;
  unspscCode: string | null;
  attributeCount: number;
  workgroupId: string | null;
  effectiveWorkgroupId: string | null;
  aliases: { id: string; alias: string }[];
  draft: { id: string; version: number; state: string; assigneeName: string | null } | null;
  canEdit: boolean;
  canCreateChild: boolean;
}

export const MAX_DEPTH = 8;
const KIND_LABEL: Record<CategoryKind, string> = { group: 'Category group', listing: 'Listing category' };
const SOURCE_LABEL: Record<CategorySource, string> = { custom: 'Custom', shopify: 'Shopify', unspsc: 'UNSPSC' };

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
    for (const list of m.values()) list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'group' ? -1 : 1));
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
  const label = (n: ExplorerNode) => pathOf(n).map((p) => p.name).join(' › ');
  const groups: PlacementOption[] = nodes
    .filter((n) => n.kind === 'group' && n.status === 'active' && n.canCreateChild)
    .map((n) => ({ id: n.id, label: label(n) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const selected = selectedId ? byId.get(selectedId) ?? null : null;

  const [open, setOpen] = useState<Set<string>>(() => new Set(nodes.filter((n) => n.level <= 1).map((n) => n.id)));
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState<PlacementOption | 'root' | null>(null);
  const query = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!query) return null;
    const hit = new Set<string>();
    for (const n of nodes) {
      if (
        n.name.toLowerCase().includes(query) ||
        n.code.toLowerCase().includes(query) ||
        (n.unspscCode ?? '').startsWith(query) ||
        n.aliases.some((a) => a.alias.toLowerCase().includes(query))
      ) {
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
              style={{ paddingLeft: 4 + depth * 14 }}
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
                {n.kind === 'listing' ? <ShoppingBag size={13} className="shrink-0 text-accent" aria-label="Listing category" /> : <Folder size={13} className="shrink-0 text-mute" aria-hidden />}
                <span className="truncate">{n.name}</span>
                {n.source !== 'custom' ? (
                  <span className="shrink-0 rounded px-1 text-[9.5px] font-semibold uppercase tracking-wide bg-soft text-mute" title={`From ${SOURCE_LABEL[n.source]}`}>
                    {n.source === 'shopify' ? 'S' : 'U'}
                  </span>
                ) : null}
                {n.draft ? <span className="h-1.5 w-1.5 rounded-full bg-warn shrink-0" title={`Draft v${n.draft.version}`} /> : null}
              </button>
            </div>
            {isOpen && kids.length ? <ul>{renderBranch(n.id, depth + 1)}</ul> : null}
          </li>
        );
      });

  return (
    <div className="grid lg:grid-cols-[minmax(280px,380px)_1fr] gap-4 items-start">
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
          <div className="mt-2 border-t border-line pt-2 flex flex-wrap gap-2">
            <CreateNodeButton parent={null} label="New top-level group" />
            <Button size="sm" variant="secondary" onClick={() => setPicker('root')}><Globe size={14} /> Add from standard</Button>
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
          label={label}
          pathOf={pathOf}
          canCreateRoot={canCreateRoot}
          onSelect={select}
          onAddFromStandard={() => setPicker({ id: selected.id, label: label(selected), source: selected.source, externalId: selected.externalId, name: selected.name })}
        />
      ) : (
        <Overview nodes={nodes} canCreateRoot={canCreateRoot} onAddFromStandard={() => setPicker('root')} />
      )}
      {picker ? <StandardPicker under={picker === 'root' ? null : picker} groups={groups} canMirror={canCreateRoot} onClose={() => setPicker(null)} /> : null}
    </div>
  );
}

function Overview({ nodes, canCreateRoot, onAddFromStandard }: { nodes: ExplorerNode[]; canCreateRoot: boolean; onAddFromStandard: () => void }) {
  const active = nodes.filter((n) => n.status === 'active');
  const stats = [
    { label: 'Groups', value: active.filter((n) => n.kind === 'group').length },
    { label: 'Listing categories', value: active.filter((n) => n.kind === 'listing').length },
    { label: 'From Shopify', value: active.filter((n) => n.source === 'shopify').length },
    { label: 'From UNSPSC', value: active.filter((n) => n.source === 'unspsc').length },
    { label: 'Deepest level', value: active.reduce((m, n) => Math.max(m, n.level), 0) },
  ];
  return (
    <Card>
      <EmptyState
        icon={<FolderTree size={22} />}
        title={nodes.length ? 'Pick a category' : 'Start the tree'}
        description={
          nodes.length
            ? 'Select a category on the left to see its details, attributes and subcategories.'
            : `Groups organise the tree (up to ${MAX_DEPTH} levels); sellers list products in listing categories. Start from Shopify or UNSPSC instead of typing every level.`
        }
        action={
          !nodes.length && canCreateRoot ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={onAddFromStandard}><Globe size={15} /> Add from a standard</Button>
              <CreateNodeButton parent={null} label="New group" />
            </div>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-5 border-t border-line text-center">
        {stats.map((s) => (
          <div key={s.label} className="px-2 py-3 border-r last:border-r-0 border-line">
            <div className="text-xl font-semibold tracking-tight">{s.value}</div>
            <div className="text-[11px] text-mute">{s.label}</div>
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
  label,
  pathOf,
  canCreateRoot,
  onSelect,
  onAddFromStandard,
}: {
  node: ExplorerNode;
  path: ExplorerNode[];
  kids: ExplorerNode[];
  wgName: (id: string | null) => string | null;
  nodes: ExplorerNode[];
  label: (n: ExplorerNode) => string;
  pathOf: (n: ExplorerNode) => ExplorerNode[];
  canCreateRoot: boolean;
  onSelect: (id: string | null) => void;
  onAddFromStandard: () => void;
}) {
  const { pending, run } = useRunner();
  const [alias, setAlias] = useState('');
  const owner = wgName(node.effectiveWorkgroupId);
  const inheritedFrom = node.workgroupId ? null : path.slice(0, -1).reverse().find((p) => p.workgroupId);
  const unspscFrom = node.unspscCode ? null : path.slice(0, -1).reverse().find((p) => p.unspscCode);

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
              <Badge tone={node.kind === 'listing' ? 'accent' : 'neutral'}>
                {node.kind === 'listing' ? <ShoppingBag size={11} /> : <Folder size={11} />} {KIND_LABEL[node.kind]}
              </Badge>
              <Badge>Level {node.level}</Badge>
              <Badge><code>{node.code}</code></Badge>
              {node.source !== 'custom' ? <Badge tone="ai"><Globe size={11} /> {SOURCE_LABEL[node.source]}</Badge> : null}
              <Badge tone={node.status === 'active' ? 'ok' : 'neutral'}>{node.status === 'active' ? 'Active' : 'Inactive'}</Badge>
            </div>
          </div>
          {node.canEdit ? (
            <div className="flex flex-wrap gap-2">
              <RenameButton node={node} />
              <MoveButton node={node} nodes={nodes} label={label} pathOf={pathOf} canCreateRoot={canCreateRoot} />
              <KindButton node={node} hasChildren={kids.length > 0} />
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

        <div className="mt-4 grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-soft p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-mute"><Users size={13} /> Workgroup</div>
            <div className="mt-1 text-sm font-medium">{owner ?? 'None yet'}</div>
            <div className="text-xs text-mute mt-0.5">
              {node.workgroupId ? 'Assigned here' : inheritedFrom ? `Inherited from ${inheritedFrom.name}` : 'A platform admin assigns workgroups.'}
            </div>
          </div>
          <UnspscBox node={node} inheritedFrom={unspscFrom ?? null} />
          <div className="rounded-xl bg-soft p-3.5">
            <div className="text-xs text-mute">Aliases{node.kind === 'listing' ? ' (at least one)' : ''}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {node.aliases.length === 0 ? <span className="text-sm text-mute">None</span> : null}
              {node.aliases.map((a) => (
                <Badge key={a.id} tone="neutral" className="gap-1.5 bg-card">
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
              <div className="text-xs text-mute">Flags, specifications and rules start from the attributes below.</div>
            </div>
            <Link href={`/workbench/versions/${node.draft.id}`} className="text-sm font-medium text-accent hover:underline">Configure</Link>
          </div>
        ) : null}
      </Card>

      <AttributeSetCard nodeId={node.id} nodeName={node.name} canEdit={node.canEdit} version={node.attributeCount} />

      {node.kind === 'group' ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
            <div>
              <h3 className="font-semibold">Subcategories</h3>
              <p className="text-xs text-mute">{kids.length} under {node.name}</p>
            </div>
            {node.canCreateChild && node.status === 'active' ? (
              <div className="flex flex-wrap gap-2">
                <CreateNodeButton parent={node} label="New category" />
                <Button size="sm" variant="secondary" onClick={onAddFromStandard}><Globe size={14} /> Add from standard</Button>
              </div>
            ) : null}
          </div>
          {kids.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {kids.map((k) => (
                <li key={k.id}>
                  <button type="button" onClick={() => onSelect(k.id)} className={cn('flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-soft/60', k.status === 'inactive' && 'opacity-50')}>
                    {k.kind === 'listing' ? <ShoppingBag size={14} className="text-accent" /> : <Folder size={14} className="text-mute" />}
                    <span className="flex-1 truncate font-medium">{k.name}</span>
                    {k.source !== 'custom' ? <Badge>{SOURCE_LABEL[k.source]}</Badge> : null}
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

function UnspscBox({ node, inheritedFrom }: { node: ExplorerNode; inheritedFrom: ExplorerNode | null }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(node.unspscCode ?? '');
  const { pending, run } = useRunner();
  const shown = node.unspscCode ?? inheritedFrom?.unspscCode ?? null;
  return (
    <div className="rounded-xl bg-soft p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-mute"><Hash size={13} /> UNSPSC code</div>
      {editing ? (
        <form
          className="mt-1.5 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setUnspscCodeAction(node.id, code.trim() || null), () => setEditing(false));
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={8} placeholder="43211503" className="h-8 text-sm" aria-label="UNSPSC code" autoFocus />
          <Button type="submit" size="sm" loading={pending}>Save</Button>
        </form>
      ) : (
        <>
          <div className="mt-1 text-sm font-medium"><code>{shown ?? 'Not mapped'}</code></div>
          <div className="text-xs text-mute mt-0.5 flex items-center gap-2">
            {node.unspscCode ? 'Set here' : inheritedFrom ? `Inherited from ${inheritedFrom.name}` : 'For procurement reporting'}
            {node.canEdit && node.source !== 'unspsc' ? (
              <button type="button" className="text-accent hover:underline" onClick={() => setEditing(true)}>{node.unspscCode ? 'Change' : 'Map'}</button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- create */

function CreateNodeButton({ parent, label, primary }: { parent: ExplorerNode | null; label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={primary ? 'primary' : 'secondary'} onClick={() => setOpen(true)}>
        <Plus size={14} /> {label}
      </Button>
      {open ? <CreateNodeDialog parent={parent} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CreateNodeDialog({ parent, onClose }: { parent: ExplorerNode | null; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState({ name: '', kind: (parent ? 'listing' : 'group') as CategoryKind, aliases: '', description: '', unspscCode: '' });
  const [matches, setMatches] = useState<Match[]>([]);
  const { pending, run } = useRunner();
  const typed = [f.name, ...splitList(f.aliases)].filter((x) => x.trim().length >= 2).join('|');
  const listing = f.kind === 'listing';
  const atBottom = parent ? parent.level + 1 >= MAX_DEPTH : false;

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
      title={parent ? 'New category' : 'New top-level group'}
      description={parent ? `Under ${parent.name} (level ${parent.level + 1} of up to ${MAX_DEPTH})` : 'A new branch at the top of the tree.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={pending}
            disabled={!f.name.trim() || (listing && !splitList(f.aliases).length) || exactAlias || (atBottom && !listing)}
            onClick={() =>
              run(
                () =>
                  createNodeAction({
                    parentId: parent?.id ?? null,
                    kind: f.kind,
                    name: f.name,
                    aliases: splitList(f.aliases),
                    description: f.description,
                    unspscCode: f.unspscCode.trim() || undefined,
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
        {parent ? (
          <fieldset className="grid sm:grid-cols-2 gap-2">
            <legend className="sr-only">Kind</legend>
            {(['listing', 'group'] as const).map((k) => (
              <label key={k} className={cn('flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer', f.kind === k ? 'border-accent bg-accent/5' : 'border-line')}>
                <Radio name="new-kind" checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} />
                <span>
                  <span className="block text-sm font-medium">{KIND_LABEL[k]}</span>
                  <span className="block text-xs text-mute">{k === 'listing' ? 'Sellers list products here' : 'Holds more categories'}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <Field label="Name" htmlFor="n-name" required>
          <Input id="n-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder={listing ? 'Gaming laptops' : 'Computers'} />
        </Field>
        <Field
          label={listing ? 'Aliases' : 'Aliases (optional)'}
          htmlFor="n-aliases"
          hint={listing ? 'At least one, unique across the whole tree. Comma separated.' : 'Comma separated, unique across the tree.'}
          required={listing}
        >
          <Input id="n-aliases" value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} placeholder={listing ? 'High Performance Gaming Laptops' : ''} />
        </Field>
        <div className="grid sm:grid-cols-[1fr_160px] gap-4">
          <Field label="Description" htmlFor="n-desc">
            <Textarea id="n-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-16" />
          </Field>
          <Field label="UNSPSC code" htmlFor="n-unspsc" hint="Optional, 8 digits">
            <Input id="n-unspsc" value={f.unspscCode} onChange={(e) => setF({ ...f, unspscCode: e.target.value })} inputMode="numeric" maxLength={8} placeholder="43211503" />
          </Field>
        </div>
        <p className="text-xs text-mute">The code is generated: {parent ? `${parent.code}.01, .02…` : 'C01, C02…'}</p>
        {atBottom && !listing ? <p className="text-xs text-warn">This is the deepest level, so only a listing category fits here.</p> : null}
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

/* ---------------------------------------------------------------- edit / move / kind */

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
          description={node.source === 'custom' ? 'Renaming keeps the code; the change is recorded in the audit log.' : `Renaming keeps the link to ${SOURCE_LABEL[node.source]} (${node.externalId}).`}
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

function MoveButton({
  node,
  nodes,
  label,
  pathOf,
  canCreateRoot,
}: {
  node: ExplorerNode;
  nodes: ExplorerNode[];
  label: (n: ExplorerNode) => string;
  pathOf: (n: ExplorerNode) => ExplorerNode[];
  canCreateRoot: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const { pending, run } = useRunner();
  const options = nodes
    .filter((n) => n.kind === 'group' && n.status === 'active' && n.id !== node.parentId && n.canCreateChild && !pathOf(n).some((p) => p.id === node.id))
    .map((n) => ({ id: n.id, label: label(n) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const rootOk = canCreateRoot && node.kind === 'group' && node.parentId !== null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><MoveRight size={14} /> Move</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title={`Move ${node.name}`}
          description="Pick its new parent group. Everything under it moves too; codes stay the same."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={pending} disabled={!target} onClick={() => run(() => moveNodeAction(node.id, target === 'root' ? null : target), () => setOpen(false))}>Move</Button></>}
        >
          {options.length || rootOk ? (
            <Field label="New parent" htmlFor="m-target">
              <Select id="m-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose…</option>
                {rootOk ? <option value="root">Top level</option> : null}
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-mute">There is no other group you can move it to.</p>
          )}
        </Dialog>
      ) : null}
    </>
  );
}

function KindButton({ node, hasChildren }: { node: ExplorerNode; hasChildren: boolean }) {
  const [open, setOpen] = useState(false);
  const [aliases, setAliases] = useState('');
  const { pending, run } = useRunner();
  const toListing = node.kind === 'group';
  if (toListing && (hasChildren || !node.parentId)) return null;
  if (!toListing && node.draft && node.draft.state !== 'DRAFT') return null;
  const needAlias = toListing && node.aliases.length === 0;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Shuffle size={14} /> {toListing ? 'Make listing' : 'Make group'}</Button>
      {open ? (
        <Dialog
          open
          onOpenChange={setOpen}
          title={toListing ? `Make ${node.name} a listing category` : `Make ${node.name} a group`}
          description={toListing ? 'Sellers will list products here. An empty draft v0 is created.' : 'It can then hold subcategories. Its empty draft is discarded.'}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button loading={pending} disabled={needAlias && !splitList(aliases).length} onClick={() => run(() => setNodeKindAction(node.id, toListing ? 'listing' : 'group', splitList(aliases)), () => setOpen(false))}>
                Confirm
              </Button>
            </>
          }
        >
          {needAlias ? (
            <Field label="Aliases" htmlFor="k-aliases" required hint="A listing category needs at least one unique alias.">
              <Input id="k-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} autoFocus />
            </Field>
          ) : (
            <p className="text-sm text-mute">This is recorded in the audit log.</p>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
