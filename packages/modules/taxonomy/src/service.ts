import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ROLES, subject, type AppAbility, type RoleKey } from '@orbita/authz';
import { recordAudit } from '@orbita/audit';
import { importStandardAttributes } from '@orbita/library';
import { getStandardCategory, referenceAttributesFor, referenceBranch, SOURCE_LABELS, type ReferenceSource } from '@orbita/standards';
import {
  attributes,
  categoryAliases,
  categoryAttributes,
  categoryNodes,
  categoryVersions,
  referenceCategories,
  profiles,
  roleGrants,
  workgroups,
  type CategoryNode,
  type Database,
  type DbOrTx,
} from '@orbita/db';
import { badRequest, conflict, forbidden, notFound, preconditionFailed, type Actor, type RequestMeta } from '@orbita/domain';

export interface Ctx {
  actor: Actor;
  ability: AppAbility;
  meta: RequestMeta;
}
export interface TaxonomyDeps {
  db: Database;
}

/** Variable depth (Shopify-style): groups organise, listing categories are the leaves products live in. */
export const MAX_DEPTH = 8;
export type CategoryKind = 'group' | 'listing';
export const KIND_LABELS: Record<CategoryKind, string> = { group: 'category group', listing: 'listing category' };

const isUnique = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code === '23505' || x?.cause?.code === '23505';
};

// ---------------------------------------------------------------------------
// Reading the tree

export interface TreeNode {
  id: string;
  parentId: string | null;
  level: number;
  kind: CategoryKind;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  source: 'custom' | 'shopify' | 'unspsc';
  externalId: string | null;
  unspscCode: string | null;
  /** attributes set on this node itself (children inherit them) */
  attributeCount: number;
  workgroupId: string | null;
  /** owner after inheritance from ancestors */
  effectiveWorkgroupId: string | null;
  aliases: { id: string; alias: string }[];
  draft: { id: string; version: number; state: string; assigneeId: string | null; assigneeName: string | null } | null;
}

export async function loadTree(db: DbOrTx, ability: AppAbility) {
  if (!ability.can('read', 'CategoryNode')) throw forbidden('You cannot view the category tree.');
  const nodes = await db.select().from(categoryNodes).orderBy(asc(categoryNodes.code));
  const aliases = await db.select().from(categoryAliases).orderBy(asc(categoryAliases.alias));
  const drafts = await db
    .select({ v: categoryVersions, assigneeName: profiles.fullName })
    .from(categoryVersions)
    .leftJoin(profiles, eq(profiles.id, categoryVersions.assigneeId))
    .where(inArray(categoryVersions.state, ['DRAFT', 'IN_REVIEW', 'SENT_BACK']));
  const wgs = await db.select().from(workgroups).orderBy(asc(workgroups.name));
  const attrCounts = await db
    .select({ nodeId: categoryAttributes.nodeId, n: sql<number>`count(*)::int` })
    .from(categoryAttributes)
    .groupBy(categoryAttributes.nodeId);
  const countOf = new Map(attrCounts.map((r) => [r.nodeId, r.n]));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const effective = (n: CategoryNode): string | null => {
    let cur: CategoryNode | undefined = n;
    for (let i = 0; cur && i < MAX_DEPTH + 1; i++) {
      if (cur.workgroupId) return cur.workgroupId;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return null;
  };
  const tree: TreeNode[] = nodes.map((n) => {
    const d = drafts.find((x) => x.v.nodeId === n.id);
    return {
      id: n.id,
      parentId: n.parentId,
      level: n.level,
      kind: n.kind,
      code: n.code,
      name: n.name,
      description: n.description,
      status: n.status,
      source: n.source,
      externalId: n.externalId,
      unspscCode: n.unspscCode,
      attributeCount: countOf.get(n.id) ?? 0,
      workgroupId: n.workgroupId,
      effectiveWorkgroupId: effective(n),
      aliases: aliases.filter((a) => a.nodeId === n.id).map((a) => ({ id: a.id, alias: a.alias })),
      draft: d ? { id: d.v.id, version: d.v.version, state: d.v.state, assigneeId: d.v.assigneeId, assigneeName: d.assigneeName } : null,
    };
  });
  return { nodes: tree, workgroups: wgs };
}

/** The node and its ancestors (root first), plus the effective workgroup. */
async function nodeChain(db: DbOrTx, id: string) {
  const rows = await db.execute<{ id: string; parent_id: string | null; level: number; kind: CategoryKind; code: string; name: string; workgroup_id: string | null; unspsc_code: string | null; status: string; depth: number }>(sql`
    with recursive chain as (
      select id, parent_id, level, kind, code, name, workgroup_id, unspsc_code, status, 0 as depth from category_nodes where id = ${id}
      union all
      select n.id, n.parent_id, n.level, n.kind, n.code, n.name, n.workgroup_id, n.unspsc_code, n.status, c.depth + 1
      from category_nodes n join chain c on n.id = c.parent_id
    )
    select * from chain order by depth desc`);
  if (!rows.length) throw notFound('Category');
  const chain = [...rows];
  const self = chain.at(-1)!;
  const effectiveWorkgroupId = [...chain].reverse().find((r) => r.workgroup_id)?.workgroup_id ?? null;
  return { chain, self, effectiveWorkgroupId, path: chain.map((r) => r.name).join(' › ') };
}

const asSubject = (workgroupId: string | null) => subject('CategoryNode', { workgroupId });

// ---------------------------------------------------------------------------
// Duplicate prevention

export interface CategoryMatch {
  id: string;
  name: string;
  level: number;
  code: string;
  path: string;
  matchedOn: 'name' | 'alias';
  matchedText: string;
  exact: boolean;
}

/** Live search while typing a new category: exact and similar names and aliases anywhere in the tree. */
export async function findSimilarCategories(db: DbOrTx, ability: AppAbility, text: string, limit = 8): Promise<CategoryMatch[]> {
  if (!ability.can('read', 'CategoryNode')) throw forbidden();
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await db.execute<{ id: string; name: string; level: number; code: string; matched_on: 'name' | 'alias'; matched_text: string; score: number }>(sql`
    select n.id, n.name, n.level, n.code, 'name' as matched_on, n.name as matched_text,
           extensions.similarity(lower(n.name), ${q}) as score
    from category_nodes n
    where lower(n.name) = ${q} or extensions.similarity(lower(n.name), ${q}) > 0.35 or lower(n.name) like ${'%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%'}
    union all
    select n.id, n.name, n.level, n.code, 'alias', a.alias, extensions.similarity(lower(a.alias), ${q})
    from category_aliases a join category_nodes n on n.id = a.node_id
    where lower(a.alias) = ${q} or extensions.similarity(lower(a.alias), ${q}) > 0.35
    order by score desc
    limit ${limit}`);
  const out: CategoryMatch[] = [];
  for (const r of rows) {
    const { path } = await nodeChain(db, r.id);
    out.push({
      id: r.id,
      name: r.name,
      level: r.level,
      code: r.code,
      path,
      matchedOn: r.matched_on,
      matchedText: r.matched_text,
      exact: r.matched_text.toLowerCase() === q,
    });
  }
  return out;
}

async function assertAliasesFree(db: DbOrTx, aliases: string[], ownNodeId: string | null) {
  const lower = aliases.map((a) => a.toLowerCase());
  if (new Set(lower).size !== lower.length) throw badRequest('The same alias is listed twice.');
  if (!lower.length) return;
  const taken = await db.execute<{ text: string; owner: string }>(sql`
    select a.alias as text, n.name as owner from category_aliases a join category_nodes n on n.id = a.node_id
    where lower(a.alias) in ${lower} ${ownNodeId ? sql`and a.node_id <> ${ownNodeId}` : sql``}
    union all
    select n.name, n.name from category_nodes n
    where lower(n.name) in ${lower} ${ownNodeId ? sql`and n.id <> ${ownNodeId}` : sql``}`);
  if (taken.length)
    throw conflict(`"${taken[0]!.text}" is already used by the category "${taken[0]!.owner}". Aliases must be unique.`);
}

// ---------------------------------------------------------------------------
// Codes
//
// Custom nodes: top level "C" + two characters (C01), below that the parent's code + "." + two
// characters (C01.03, C01.03.12). Adopted nodes keep the standard's own id (Shopify el-6-11-2,
// UNSPSC 43211503), so the three can never collide.

const SUFFIXES = [
  ...Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0')),
  ...Array.from('ABCDEFGHJKLMNPQRSTUVWXYZ').flatMap((c) => Array.from({ length: 9 }, (_, i) => `${c}${i + 1}`)),
];

export function customCodeCandidates(parentCode: string | null): string[] {
  return SUFFIXES.map((s) => (parentCode ? `${parentCode}.${s}` : `C${s}`));
}

async function nextCode(db: DbOrTx, parentCode: string | null): Promise<string> {
  const candidates = customCodeCandidates(parentCode);
  const taken = await db.select({ code: categoryNodes.code }).from(categoryNodes).where(inArray(categoryNodes.code, candidates));
  const used = new Set(taken.map((t) => t.code));
  const code = candidates.find((c) => !used.has(c));
  if (!code) throw preconditionFailed('No more codes are free here. Group these categories under a new parent.');
  return code;
}

// ---------------------------------------------------------------------------
// Commands

const nameSchema = z.string().trim().min(2, 'Name is too short').max(120);
const aliasSchema = z.string().trim().min(2).max(120);
const unspscSchema = z
  .string()
  .trim()
  .regex(/^\d{8}$/, 'A UNSPSC code is 8 digits, e.g. 43211503')
  .nullable();

export const createNodeInput = z.object({
  parentId: z.uuid().nullable().default(null),
  kind: z.enum(['group', 'listing']).default('group'),
  name: nameSchema,
  description: z.string().trim().max(1000).default(''),
  aliases: z.array(aliasSchema).max(10).default([]),
  unspscCode: unspscSchema.optional(),
});
export type CreateNodeInput = z.input<typeof createNodeInput>;

async function categoryManagersOf(db: DbOrTx, workgroupId: string) {
  return db
    .select({ id: profiles.id, name: profiles.fullName })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(
      and(
        eq(roleGrants.role, 'category_manager'),
        eq(roleGrants.scopeType, 'workgroup'),
        eq(roleGrants.scopeId, workgroupId),
        isNull(roleGrants.revokedAt),
        eq(profiles.status, 'active'),
      ),
    );
}

type Chain = Awaited<ReturnType<typeof nodeChain>>;

interface InsertSpec {
  parent: Chain | null;
  kind: CategoryKind;
  name: string;
  description: string;
  aliases: string[];
  unspscCode?: string | null;
  source?: 'custom' | ReferenceSource;
  externalId?: string | null;
}

/** Shared by "new category" and "adopt from standard": every rule about where a node may go lives here. */
async function insertNode(tx: DbOrTx, ctx: Ctx, spec: InsertSpec) {
  const parent = spec.parent?.self ?? null;
  if (parent && parent.status !== 'active') throw preconditionFailed('You cannot add a category under an inactive one.');
  if (parent && parent.kind === 'listing')
    throw badRequest(`"${parent.name}" is a listing category, so it cannot have children. Turn it into a group first or pick another parent.`);
  const level = parent ? parent.level + 1 : 1;
  if (level > MAX_DEPTH) throw badRequest(`The tree is at most ${MAX_DEPTH} levels deep.`);
  if (spec.kind === 'listing' && !parent) throw badRequest('A listing category needs a parent group.');
  const wg = spec.parent?.effectiveWorkgroupId ?? null;
  if (!ctx.ability.can('create', asSubject(wg)))
    throw forbidden(wg ? 'You can only add categories inside your workgroup.' : 'You cannot add a top-level category.');
  if (spec.kind === 'listing' && spec.aliases.length === 0) throw badRequest('A listing category needs at least one unique alias.');

  const dupe = await tx
    .select({ id: categoryNodes.id })
    .from(categoryNodes)
    .where(
      and(
        parent ? eq(categoryNodes.parentId, parent.id) : isNull(categoryNodes.parentId),
        sql`lower(${categoryNodes.name}) = ${spec.name.toLowerCase()}`,
      ),
    );
  if (dupe.length) throw conflict(`"${spec.name}" already exists at this place in the tree.`);
  await assertAliasesFree(tx, spec.aliases, null);

  const source = spec.source ?? 'custom';
  const code = source === 'custom' ? await nextCode(tx, parent?.code ?? null) : spec.externalId!;
  let node: CategoryNode;
  try {
    [node] = (await tx
      .insert(categoryNodes)
      .values({
        parentId: parent?.id ?? null,
        level,
        kind: spec.kind,
        code,
        name: spec.name,
        description: spec.description,
        source,
        externalId: source === 'custom' ? null : spec.externalId!,
        unspscCode: spec.unspscCode ?? null,
        createdBy: ctx.actor.id,
      })
      .returning()) as [CategoryNode];
  } catch (e) {
    if (isUnique(e)) throw conflict(`The code ${code} or the name "${spec.name}" is already taken here.`);
    throw e;
  }
  if (spec.aliases.length)
    await tx.insert(categoryAliases).values(spec.aliases.map((alias) => ({ nodeId: node.id, alias, createdBy: ctx.actor.id })));

  const path = spec.parent ? `${spec.parent.path} › ${node.name}` : node.name;
  await recordAudit(tx, ctx, {
    action: source === 'custom' ? 'taxonomy.node.created' : 'taxonomy.node.adopted',
    subjectType: 'category_node',
    subjectId: node.id,
    summary:
      source === 'custom'
        ? `${ctx.actor.email} created ${KIND_LABELS[spec.kind]} ${path} (${code})`
        : `${ctx.actor.email} adopted ${KIND_LABELS[spec.kind]} ${path} from ${SOURCE_LABELS[source]} (${code})`,
    after: { code, name: node.name, kind: spec.kind, level, parentId: node.parentId, aliases: spec.aliases, source, unspscCode: node.unspscCode },
  });

  // A listing category starts life with an empty draft version (configured in R2, approved in R3).
  let draft = null;
  if (spec.kind === 'listing') {
    const managers = wg ? await categoryManagersOf(tx, wg) : [];
    const assignee = managers.length === 1 ? managers[0]!.id : ctx.actor.id;
    [draft] = await tx
      .insert(categoryVersions)
      .values({ nodeId: node.id, version: 0, state: 'DRAFT', assigneeId: assignee, createdBy: ctx.actor.id })
      .returning();
    await recordAudit(tx, ctx, {
      action: 'taxonomy.version.created',
      subjectType: 'category_version',
      subjectId: draft!.id,
      summary: `Draft v0 of ${node.name} created and assigned${managers.length === 1 ? ` to ${managers[0]!.name || 'the workgroup category manager'}` : ` to ${ctx.actor.email}`}`,
      after: { nodeId: node.id, version: 0, state: 'DRAFT', assigneeId: assignee },
    });
  }
  return { node, draft, path };
}

export async function createNode(deps: TaxonomyDeps, ctx: Ctx, raw: CreateNodeInput) {
  const v = createNodeInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    const parent = v.parentId ? await nodeChain(tx, v.parentId) : null;
    const { node, draft } = await insertNode(tx, ctx, { ...v, parent });
    return { node, draft };
  });
}

export async function renameNode(deps: TaxonomyDeps, ctx: Ctx, id: string, raw: { name: string; description?: string }) {
  const name = nameSchema.parse(raw.name);
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, id);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    const [before] = await tx.select().from(categoryNodes).where(eq(categoryNodes.id, id));
    const clash = await tx
      .select({ id: categoryNodes.id })
      .from(categoryNodes)
      .where(
        and(
          before!.parentId ? eq(categoryNodes.parentId, before!.parentId) : isNull(categoryNodes.parentId),
          sql`lower(${categoryNodes.name}) = ${name.toLowerCase()}`,
          ne(categoryNodes.id, id),
        ),
      );
    if (clash.length) throw conflict(`"${name}" already exists at this place in the tree.`);
    const [after] = await tx
      .update(categoryNodes)
      .set({ name, ...(raw.description !== undefined ? { description: raw.description.trim().slice(0, 1000) } : {}) })
      .where(eq(categoryNodes.id, id))
      .returning();
    await recordAudit(tx, ctx, {
      action: 'taxonomy.node.renamed',
      subjectType: 'category_node',
      subjectId: id,
      summary: `${ctx.actor.email} renamed "${before!.name}" to "${name}" (${before!.code})`,
      before: { name: before!.name, description: before!.description },
      after: { name: after!.name, description: after!.description },
    });
    return after!;
  });
}

/** Height of a subtree: 0 for a node without children. */
async function subtreeHeight(db: DbOrTx, id: string) {
  const [r] = await db.execute<{ h: number }>(sql`
    with recursive down as (
      select id, 0 as d from category_nodes where id = ${id}
      union all
      select n.id, down.d + 1 from category_nodes n join down on n.parent_id = down.id
    )
    select max(d)::int as h from down`);
  return r?.h ?? 0;
}

/** Moves a node (and everything under it) under any active group. Codes are kept; levels follow. */
export async function moveNode(deps: TaxonomyDeps, ctx: Ctx, id: string, newParentId: string | null) {
  return deps.db.transaction(async (tx) => {
    const from = await nodeChain(tx, id);
    if (!ctx.ability.can('update', asSubject(from.effectiveWorkgroupId))) throw forbidden('You cannot move this category.');
    const to = newParentId ? await nodeChain(tx, newParentId) : null;
    if (to?.chain.some((r) => r.id === id)) throw badRequest('A category cannot move inside itself.');
    if (to && to.self.kind === 'listing') throw badRequest(`"${to.self.name}" is a listing category, so nothing can sit under it.`);
    if (!to && from.self.kind === 'listing') throw badRequest('A listing category needs a parent group.');
    const targetLevel = to ? to.self.level + 1 : 1;
    if (targetLevel + (await subtreeHeight(tx, id)) > MAX_DEPTH) throw badRequest(`That would make the tree deeper than ${MAX_DEPTH} levels.`);
    if (to && to.self.status !== 'active') throw preconditionFailed('You cannot move a category under an inactive one.');
    if (!ctx.ability.can('create', asSubject(to?.effectiveWorkgroupId ?? null)))
      throw forbidden('You cannot move categories into that part of the tree.');
    if (from.self.parent_id === newParentId) return;
    const clash = await tx
      .select({ id: categoryNodes.id })
      .from(categoryNodes)
      .where(
        and(
          newParentId ? eq(categoryNodes.parentId, newParentId) : isNull(categoryNodes.parentId),
          sql`lower(${categoryNodes.name}) = ${from.self.name.toLowerCase()}`,
        ),
      );
    if (clash.length) throw conflict(`"${from.self.name}" already exists under the new parent.`);
    await tx.update(categoryNodes).set({ parentId: newParentId }).where(eq(categoryNodes.id, id));
    const delta = targetLevel - from.self.level;
    if (delta)
      await tx.execute(sql`
        with recursive down as (
          select id from category_nodes where id = ${id}
          union all
          select n.id from category_nodes n join down on n.parent_id = down.id
        )
        update category_nodes set level = level + ${delta} where id in (select id from down)`);
    await recordAudit(tx, ctx, {
      action: 'taxonomy.node.moved',
      subjectType: 'category_node',
      subjectId: id,
      summary: `${ctx.actor.email} moved ${from.self.name} from "${from.chain.slice(0, -1).map((r) => r.name).join(' › ') || 'top level'}" to "${to?.path ?? 'top level'}". Its code ${from.self.code} is kept.`,
      before: { parentId: from.self.parent_id, level: from.self.level },
      after: { parentId: newParentId, level: targetLevel },
    });
  });
}

/** Group ↔ listing. A group can become a listing only when it has no children; a listing becomes a group only before it is published. */
export async function setNodeKind(deps: TaxonomyDeps, ctx: Ctx, id: string, kind: CategoryKind, aliases: string[] = []) {
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, id);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    if (c.self.kind === kind) return;
    if (kind === 'listing') {
      if (!c.self.parent_id) throw badRequest('A listing category needs a parent group.');
      const [kid] = await tx.select({ id: categoryNodes.id }).from(categoryNodes).where(eq(categoryNodes.parentId, id)).limit(1);
      if (kid) throw preconditionFailed('Only a group without children can become a listing category.');
      const own = await tx.select().from(categoryAliases).where(eq(categoryAliases.nodeId, id));
      const add = aliases.map((a) => aliasSchema.parse(a)).filter((a) => !own.some((o) => o.alias.toLowerCase() === a.toLowerCase()));
      if (!own.length && !add.length) throw badRequest('A listing category needs at least one unique alias.');
      await assertAliasesFree(tx, add, id);
      if (add.length) await tx.insert(categoryAliases).values(add.map((alias) => ({ nodeId: id, alias, createdBy: ctx.actor.id })));
      const [open] = await tx
        .select({ id: categoryVersions.id })
        .from(categoryVersions)
        .where(eq(categoryVersions.nodeId, id))
        .limit(1);
      if (!open) {
        const managers = c.effectiveWorkgroupId ? await categoryManagersOf(tx, c.effectiveWorkgroupId) : [];
        await tx.insert(categoryVersions).values({
          nodeId: id,
          version: 0,
          state: 'DRAFT',
          assigneeId: managers.length === 1 ? managers[0]!.id : ctx.actor.id,
          createdBy: ctx.actor.id,
        });
      }
    } else {
      const versions = await tx.select().from(categoryVersions).where(eq(categoryVersions.nodeId, id));
      if (versions.some((v) => !['DRAFT', 'DISCARDED'].includes(v.state)))
        throw preconditionFailed('This listing category is already in review or published, so it stays a listing category.');
      await tx.delete(categoryVersions).where(eq(categoryVersions.nodeId, id));
    }
    await tx.update(categoryNodes).set({ kind }).where(eq(categoryNodes.id, id));
    await recordAudit(tx, ctx, {
      action: 'taxonomy.node.kind_changed',
      subjectType: 'category_node',
      subjectId: id,
      summary: `${ctx.actor.email} turned ${c.path} into a ${KIND_LABELS[kind]}`,
      before: { kind: c.self.kind },
      after: { kind },
    });
  });
}

/** Maps a category to a UNSPSC commodity for procurement reporting. Children inherit it unless they set their own. */
export async function setUnspscCode(deps: TaxonomyDeps, ctx: Ctx, id: string, raw: string | null) {
  const code = unspscSchema.parse(raw === '' ? null : raw);
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, id);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    let title: string | null = null;
    if (code) {
      const [loaded] = await tx.select({ n: sql<number>`count(*)::int` }).from(referenceCategories).where(eq(referenceCategories.source, 'unspsc'));
      if (loaded!.n > 0) {
        const [ref] = await tx
          .select({ name: referenceCategories.name })
          .from(referenceCategories)
          .where(and(eq(referenceCategories.source, 'unspsc'), eq(referenceCategories.externalId, code)));
        if (!ref) throw badRequest(`${code} is not in the loaded UNSPSC codeset.`);
        title = ref.name;
      }
    }
    await tx.update(categoryNodes).set({ unspscCode: code }).where(eq(categoryNodes.id, id));
    await recordAudit(tx, ctx, {
      action: 'taxonomy.node.unspsc_mapped',
      subjectType: 'category_node',
      subjectId: id,
      summary: code
        ? `${ctx.actor.email} mapped ${c.path} to UNSPSC ${code}${title ? ` (${title})` : ''}`
        : `${ctx.actor.email} removed the UNSPSC mapping from ${c.path}`,
      before: { unspscCode: c.self.unspsc_code },
      after: { unspscCode: code },
    });
  });
}

// ---------------------------------------------------------------------------
// Adopting from a standard taxonomy (R1.1)

export const adoptInput = z.object({
  source: z.enum(['shopify', 'unspsc']),
  externalId: z.string().trim().min(1).max(40),
  /** null: mirror the standard's path (missing ancestors are adopted as groups). A node id: put it under that group. */
  parentId: z.uuid().nullable().default(null),
  kind: z.enum(['group', 'listing']),
  aliases: z.array(aliasSchema).max(10).default([]),
  /** adopt everything under it too (groups stay groups, leaves become listing categories) */
  withChildren: z.boolean().default(false),
  /** bring the standard's attributes into the library and attach them (Shopify) */
  withAttributes: z.boolean().default(true),
});
export type AdoptInput = z.input<typeof adoptInput>;
export const MAX_BRANCH = 150;

async function chainByExternal(tx: DbOrTx, source: ReferenceSource, externalId: string) {
  const [n] = await tx
    .select({ id: categoryNodes.id })
    .from(categoryNodes)
    .where(and(eq(categoryNodes.source, source), eq(categoryNodes.externalId, externalId)));
  return n ? nodeChain(tx, n.id) : null;
}

/** Aliases for leaves adopted in bulk: the name if it is free, otherwise "Name (Parent)", otherwise "Name · id". */
async function autoAlias(tx: DbOrTx, name: string, parentName: string, externalId: string) {
  for (const candidate of [name, `${name} (${parentName})`, `${name} · ${externalId}`]) {
    const taken = await tx.execute(sql`
      select 1 from category_aliases where lower(alias) = ${candidate.toLowerCase()}
      union all select 1 from category_nodes where lower(name) = ${candidate.toLowerCase()}`);
    if (!taken.length) return candidate;
  }
  return `${name} · ${externalId}`;
}

async function attachStandardAttributes(tx: DbOrTx, ctx: Ctx, nodeId: string, source: ReferenceSource, handles: string[], inherited: Set<string>, ids: Map<string, string>) {
  const rows = handles
    .map((h) => ids.get(h))
    .filter((a): a is string => !!a && !inherited.has(a))
    .map((attributeId, i) => ({ nodeId, attributeId, sortOrder: i, origin: source, createdBy: ctx.actor.id }));
  if (rows.length) await tx.insert(categoryAttributes).values(rows).onConflictDoNothing();
  return rows.map((r) => r.attributeId);
}

async function inheritedAttributeIds(tx: DbOrTx, chain: Chain | null) {
  if (!chain) return new Set<string>();
  const ids = chain.chain.map((r) => r.id);
  const rows = await tx.select({ a: categoryAttributes.attributeId }).from(categoryAttributes).where(inArray(categoryAttributes.nodeId, ids));
  return new Set(rows.map((r) => r.a));
}

export async function adoptStandardCategory(deps: TaxonomyDeps, ctx: Ctx, raw: AdoptInput) {
  const v = adoptInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    const ref = await getStandardCategory(tx, ctx.ability, v.source, v.externalId);
    if (ref.adoptedNodeId) throw conflict(`"${ref.name}" is already in your tree.`);
    if (v.withChildren && ref.isLeaf) v.withChildren = false;
    if (v.withChildren && v.kind === 'listing') throw badRequest('Adopt it as a group to bring its subcategories along.');
    if (!v.withChildren && v.kind === 'listing' && !v.aliases.length) throw badRequest('A listing category needs at least one unique alias.');

    // 1. Where it goes: under a chosen group, or along the standard's own path.
    let parent: Chain | null = null;
    const createdAncestors: string[] = [];
    if (v.parentId) parent = await nodeChain(tx, v.parentId);
    else {
      for (const a of ref.ancestors) {
        const existing = await chainByExternal(tx, v.source, a.externalId);
        if (existing) {
          parent = existing;
          continue;
        }
        const made = await insertNode(tx, ctx, { parent, kind: 'group', name: a.name, description: '', aliases: [], source: v.source, externalId: a.externalId, unspscCode: v.source === 'unspsc' ? a.externalId : null });
        createdAncestors.push(a.name);
        parent = await nodeChain(tx, made.node.id);
      }
    }

    // 2. The branch to adopt (just the one, or it and everything under it).
    const branch = v.withChildren
      ? await referenceBranch(tx, v.source, v.externalId, MAX_BRANCH)
      : [{ external_id: ref.externalId, parent_external_id: ref.parentExternalId, name: ref.name, level: ref.level, is_leaf: ref.isLeaf, attribute_handles: ref.attributes.map((a) => a.handle) }];
    if (branch.length > MAX_BRANCH)
      throw preconditionFailed(`That branch has more than ${MAX_BRANCH} categories. Adopt its subcategories one by one instead.`);
    const existing = await tx
      .select({ externalId: categoryNodes.externalId })
      .from(categoryNodes)
      .where(and(eq(categoryNodes.source, v.source), inArray(categoryNodes.externalId, branch.map((b) => b.external_id))));
    const skip = new Set(existing.map((e) => e.externalId));

    // 3. Attributes come into the library once for the whole branch.
    let ids = new Map<string, string>();
    if (v.withAttributes && v.source === 'shopify') {
      const handles = [...new Set(branch.flatMap((b) => b.attribute_handles))];
      ids = await importStandardAttributes(tx, ctx, v.source, await referenceAttributesFor(tx, v.source, handles), `adopting ${ref.fullPath}`);
    }

    const chains = new Map<string, Chain | null>();
    chains.set(ref.parentExternalId ?? '', parent);
    let root: CategoryNode | null = null;
    let attached = 0;
    let listings = 0;
    for (const b of branch) {
      if (skip.has(b.external_id)) {
        chains.set(b.external_id, await chainByExternal(tx, v.source, b.external_id));
        continue;
      }
      const isRoot = b.external_id === ref.externalId;
      const under = isRoot ? parent : chains.get(b.parent_external_id ?? '') ?? null;
      if (!isRoot && !under) continue; // its parent was skipped and could not be found
      const kind: CategoryKind = isRoot ? v.kind : b.is_leaf ? 'listing' : 'group';
      const aliases = isRoot ? v.aliases : kind === 'listing' ? [await autoAlias(tx, b.name, under!.self.name, b.external_id)] : [];
      const made = await insertNode(tx, ctx, {
        parent: under,
        kind,
        name: b.name,
        description: '',
        aliases,
        source: v.source,
        externalId: b.external_id,
        unspscCode: v.source === 'unspsc' ? b.external_id : null,
      });
      if (isRoot) root = made.node;
      if (kind === 'listing') listings++;
      const chain = await nodeChain(tx, made.node.id);
      chains.set(b.external_id, chain);
      if (ids.size) attached += (await attachStandardAttributes(tx, ctx, made.node.id, v.source, b.attribute_handles, await inheritedAttributeIds(tx, under), ids)).length;
    }
    return { node: root!, createdAncestors, adopted: branch.length - skip.size, listings, attributesAttached: attached };
  });
}

// ---------------------------------------------------------------------------
// Category attribute sets (R1.1): what describes the products in a category. Inherited downwards.

export interface CategoryAttributeView {
  id: string;
  attributeId: string;
  code: string;
  name: string;
  dataType: string;
  required: boolean;
  origin: 'manual' | 'shopify' | 'unspsc';
  /** set on an ancestor: its name; null when set on this category */
  inheritedFrom: string | null;
}

export async function categoryAttributeSet(db: DbOrTx, ability: AppAbility, nodeId: string): Promise<CategoryAttributeView[]> {
  if (!ability.can('read', 'CategoryNode')) throw forbidden();
  const c = await nodeChain(db, nodeId);
  const ids = c.chain.map((r) => r.id);
  const rows = await db
    .select({ ca: categoryAttributes, a: { code: attributes.code, name: attributes.name, dataType: attributes.dataType } })
    .from(categoryAttributes)
    .innerJoin(attributes, eq(attributes.id, categoryAttributes.attributeId))
    .where(inArray(categoryAttributes.nodeId, ids))
    .orderBy(asc(categoryAttributes.sortOrder), asc(attributes.name));
  const depth = new Map(c.chain.map((r, i) => [r.id, i]));
  const nameOf = new Map(c.chain.map((r) => [r.id, r.name]));
  const seen = new Set<string>();
  return rows
    .sort((x, y) => depth.get(x.ca.nodeId)! - depth.get(y.ca.nodeId)!)
    .filter((r) => (seen.has(r.ca.attributeId) ? false : (seen.add(r.ca.attributeId), true)))
    .map((r) => ({
      id: r.ca.id,
      attributeId: r.ca.attributeId,
      code: r.a.code,
      name: r.a.name,
      dataType: r.a.dataType,
      required: r.ca.required,
      origin: r.ca.origin,
      inheritedFrom: r.ca.nodeId === nodeId ? null : nameOf.get(r.ca.nodeId)!,
    }));
}

export async function addCategoryAttribute(deps: TaxonomyDeps, ctx: Ctx, nodeId: string, attributeId: string, required = false) {
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, nodeId);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    const [attr] = await tx.select().from(attributes).where(eq(attributes.id, attributeId));
    if (!attr) throw notFound('Attribute');
    if (attr.status !== 'active') throw preconditionFailed('That attribute is deprecated.');
    if ((await inheritedAttributeIds(tx, c)).has(attributeId)) throw conflict(`"${attr.name}" is already in this category's attribute set.`);
    const [{ n }] = (await tx
      .select({ n: sql<number>`coalesce(max(${categoryAttributes.sortOrder}), -1)::int + 1` })
      .from(categoryAttributes)
      .where(eq(categoryAttributes.nodeId, nodeId))) as [{ n: number }];
    await tx.insert(categoryAttributes).values({ nodeId, attributeId, required, sortOrder: n, origin: 'manual', createdBy: ctx.actor.id });
    await recordAudit(tx, ctx, {
      action: 'taxonomy.attribute.added',
      subjectType: 'category_node',
      subjectId: nodeId,
      summary: `${ctx.actor.email} added ${attr.name}${required ? ' (required)' : ''} to ${c.path}`,
      after: { attributeId, required },
    });
  });
}

export async function updateCategoryAttribute(deps: TaxonomyDeps, ctx: Ctx, nodeId: string, id: string, required: boolean) {
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, nodeId);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    const [row] = await tx
      .update(categoryAttributes)
      .set({ required })
      .where(and(eq(categoryAttributes.id, id), eq(categoryAttributes.nodeId, nodeId)))
      .returning();
    if (!row) throw notFound('Category attribute');
    await recordAudit(tx, ctx, {
      action: 'taxonomy.attribute.updated',
      subjectType: 'category_node',
      subjectId: nodeId,
      summary: `${ctx.actor.email} made an attribute of ${c.path} ${required ? 'required' : 'optional'}`,
      after: { attributeId: row.attributeId, required },
    });
  });
}

export async function removeCategoryAttribute(deps: TaxonomyDeps, ctx: Ctx, nodeId: string, id: string) {
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, nodeId);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    const [row] = await tx
      .delete(categoryAttributes)
      .where(and(eq(categoryAttributes.id, id), eq(categoryAttributes.nodeId, nodeId)))
      .returning();
    if (!row) throw notFound('Category attribute');
    await recordAudit(tx, ctx, {
      action: 'taxonomy.attribute.removed',
      subjectType: 'category_node',
      subjectId: nodeId,
      summary: `${ctx.actor.email} removed an attribute from ${c.path}`,
      before: { attributeId: row.attributeId },
    });
  });
}

export async function addAlias(deps: TaxonomyDeps, ctx: Ctx, nodeId: string, rawAlias: string) {
  const alias = aliasSchema.parse(rawAlias);
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, nodeId);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    await assertAliasesFree(tx, [alias], nodeId);
    const own = await tx.select().from(categoryAliases).where(eq(categoryAliases.nodeId, nodeId));
    if (own.some((a) => a.alias.toLowerCase() === alias.toLowerCase())) throw conflict('That alias is already on this category.');
    const [row] = await tx.insert(categoryAliases).values({ nodeId, alias, createdBy: ctx.actor.id }).returning();
    await recordAudit(tx, ctx, {
      action: 'taxonomy.alias.added',
      subjectType: 'category_node',
      subjectId: nodeId,
      summary: `${ctx.actor.email} added alias "${alias}" to ${c.self.name}`,
      after: { alias },
    });
    return row!;
  });
}

export async function removeAlias(deps: TaxonomyDeps, ctx: Ctx, nodeId: string, aliasId: string) {
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, nodeId);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    const own = await tx.select().from(categoryAliases).where(eq(categoryAliases.nodeId, nodeId));
    const target = own.find((a) => a.id === aliasId);
    if (!target) throw notFound('Alias');
    if (c.self.kind === 'listing' && own.length === 1) throw preconditionFailed('A listing category must keep at least one alias.');
    await tx.delete(categoryAliases).where(eq(categoryAliases.id, aliasId));
    await recordAudit(tx, ctx, {
      action: 'taxonomy.alias.removed',
      subjectType: 'category_node',
      subjectId: nodeId,
      summary: `${ctx.actor.email} removed alias "${target.alias}" from ${c.self.name}`,
      before: { alias: target.alias },
    });
  });
}

export async function setNodeStatus(deps: TaxonomyDeps, ctx: Ctx, id: string, status: 'active' | 'inactive') {
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, id);
    if (!ctx.ability.can('update', asSubject(c.effectiveWorkgroupId))) throw forbidden('You cannot edit this category.');
    if (status === 'inactive') {
      const kids = await tx
        .select({ id: categoryNodes.id })
        .from(categoryNodes)
        .where(and(eq(categoryNodes.parentId, id), eq(categoryNodes.status, 'active')));
      if (kids.length) throw preconditionFailed('Deactivate its child categories first.');
    } else if (c.chain.slice(0, -1).some((r) => r.status !== 'active')) {
      throw preconditionFailed('Reactivate the parent category first.');
    }
    if (c.self.status === status) return;
    await tx.update(categoryNodes).set({ status }).where(eq(categoryNodes.id, id));
    await recordAudit(tx, ctx, {
      action: status === 'inactive' ? 'taxonomy.node.deactivated' : 'taxonomy.node.reactivated',
      subjectType: 'category_node',
      subjectId: id,
      summary: `${ctx.actor.email} ${status === 'inactive' ? 'deactivated' : 'reactivated'} ${c.path}`,
      before: { status: c.self.status },
      after: { status },
    });
  });
}

// ---------------------------------------------------------------------------
// Workgroups

export const workgroupInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().optional(),
  description: z.string().trim().max(500).default(''),
  status: z.enum(['active', 'inactive']).default('active'),
});
export type WorkgroupInput = z.input<typeof workgroupInput>;

export const WORKGROUP_ROLES = ['category_manager', 'approver'] as const satisfies readonly RoleKey[];

export async function listWorkgroups(db: DbOrTx, ability: AppAbility) {
  if (!ability.can('read', 'Workgroup')) throw forbidden('You cannot view workgroups.');
  const wgs = await db.select().from(workgroups).orderBy(asc(workgroups.name));
  const covered = await db
    .select({ id: categoryNodes.id, name: categoryNodes.name, code: categoryNodes.code, level: categoryNodes.level, workgroupId: categoryNodes.workgroupId })
    .from(categoryNodes)
    .where(sql`${categoryNodes.workgroupId} is not null`);
  const members = await db
    .select({
      grantId: roleGrants.id,
      workgroupId: roleGrants.scopeId,
      role: roleGrants.role,
      userId: profiles.id,
      fullName: profiles.fullName,
      email: profiles.email,
    })
    .from(roleGrants)
    .innerJoin(profiles, eq(profiles.id, roleGrants.userId))
    .where(and(eq(roleGrants.scopeType, 'workgroup'), isNull(roleGrants.revokedAt)));
  return wgs.map((w) => ({
    ...w,
    covers: covered.filter((c) => c.workgroupId === w.id),
    members: members
      .filter((m) => m.workgroupId === w.id)
      .map((m) => ({ ...m, roleLabel: ROLES[m.role as RoleKey]?.label ?? m.role })),
  }));
}

export async function saveWorkgroup(deps: TaxonomyDeps, ctx: Ctx, raw: WorkgroupInput) {
  if (!ctx.ability.can(raw.id ? 'update' : 'create', 'Workgroup')) throw forbidden('Only a platform admin can manage workgroups.');
  const v = workgroupInput.parse(raw);
  const code = (v.code && v.code.length ? v.code : v.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return deps.db.transaction(async (tx) => {
    const before = v.id ? (await tx.select().from(workgroups).where(eq(workgroups.id, v.id)))[0] : undefined;
    if (v.id && !before) throw notFound('Workgroup');
    try {
      const values = { code, name: v.name, description: v.description, status: v.status };
      const [row] = v.id
        ? await tx.update(workgroups).set(values).where(eq(workgroups.id, v.id)).returning()
        : await tx.insert(workgroups).values({ ...values, createdBy: ctx.actor.id }).returning();
      await recordAudit(tx, ctx, {
        action: v.id ? 'taxonomy.workgroup.updated' : 'taxonomy.workgroup.created',
        subjectType: 'workgroup',
        subjectId: row!.id,
        summary: `${ctx.actor.email} ${v.id ? 'updated' : 'created'} workgroup ${row!.name}`,
        before: before ? { name: before.name, description: before.description, status: before.status } : undefined,
        after: { name: row!.name, description: row!.description, status: row!.status },
      });
      return row!;
    } catch (e) {
      if (isUnique(e)) throw conflict('A workgroup with that name already exists.');
      throw e;
    }
  });
}

/** Makes a workgroup own a subtree (or clears it with null). Children inherit unless they set their own. */
export async function assignWorkgroup(deps: TaxonomyDeps, ctx: Ctx, nodeId: string, workgroupId: string | null) {
  if (!ctx.ability.can('update', 'Workgroup')) throw forbidden('Only a platform admin can assign workgroups.');
  return deps.db.transaction(async (tx) => {
    const c = await nodeChain(tx, nodeId);
    let wgName = 'none';
    if (workgroupId) {
      const [wg] = await tx.select().from(workgroups).where(eq(workgroups.id, workgroupId));
      if (!wg) throw notFound('Workgroup');
      if (wg.status !== 'active') throw preconditionFailed('That workgroup is inactive.');
      wgName = wg.name;
    }
    const [before] = await tx.select({ w: categoryNodes.workgroupId }).from(categoryNodes).where(eq(categoryNodes.id, nodeId));
    await tx.update(categoryNodes).set({ workgroupId }).where(eq(categoryNodes.id, nodeId));
    await recordAudit(tx, ctx, {
      action: 'taxonomy.workgroup.assigned',
      subjectType: 'category_node',
      subjectId: nodeId,
      summary: workgroupId
        ? `${ctx.actor.email} made workgroup ${wgName} responsible for ${c.path} and everything under it`
        : `${ctx.actor.email} removed the workgroup from ${c.path}`,
      before: { workgroupId: before?.w ?? null },
      after: { workgroupId },
    });
  });
}

// ---------------------------------------------------------------------------
// Work assigned to me

export async function myOpenDrafts(db: DbOrTx, ctx: Pick<Ctx, 'actor' | 'ability'>) {
  if (!ctx.ability.can('read', 'CategoryVersion')) return [];
  const rows = await db
    .select({ v: categoryVersions, node: categoryNodes })
    .from(categoryVersions)
    .innerJoin(categoryNodes, eq(categoryNodes.id, categoryVersions.nodeId))
    .where(and(eq(categoryVersions.assigneeId, ctx.actor.id), inArray(categoryVersions.state, ['DRAFT', 'SENT_BACK'])))
    .orderBy(asc(categoryVersions.createdAt));
  const out = [];
  for (const r of rows) {
    const { path } = await nodeChain(db, r.node.id);
    out.push({ id: r.v.id, version: r.v.version, state: r.v.state, createdAt: r.v.createdAt, nodeId: r.node.id, code: r.node.code, path });
  }
  return out;
}
