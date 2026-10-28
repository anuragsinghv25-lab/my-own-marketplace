import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ROLES, subject, type AppAbility, type RoleKey } from '@orbita/authz';
import { recordAudit } from '@orbita/audit';
import {
  categoryAliases,
  categoryNodes,
  categoryVersions,
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

export const LEVEL_NAMES = ['', 'Segment', 'Family', 'Class', 'Commodity', 'Listing category'] as const;
export const MAX_LEVEL = 5;

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
  code: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
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

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const effective = (n: CategoryNode): string | null => {
    let cur: CategoryNode | undefined = n;
    for (let i = 0; cur && i < MAX_LEVEL + 1; i++) {
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
      code: n.code,
      name: n.name,
      description: n.description,
      status: n.status,
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
  const rows = await db.execute<{ id: string; parent_id: string | null; level: number; code: string; name: string; workgroup_id: string | null; status: string; depth: number }>(sql`
    with recursive chain as (
      select id, parent_id, level, code, name, workgroup_id, status, 0 as depth from category_nodes where id = ${id}
      union all
      select n.id, n.parent_id, n.level, n.code, n.name, n.workgroup_id, n.status, c.depth + 1
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

const L5_SUFFIXES = [
  ...Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0')),
  ...Array.from('ABCDEFGHJKLMNPQRSTUVWXYZ').flatMap((c) => Array.from({ length: 9 }, (_, i) => `${c}${i + 1}`)),
];

async function nextCode(db: DbOrTx, parent: { id: string; code: string; level: number } | null): Promise<string> {
  const siblings = await db
    .select({ code: categoryNodes.code })
    .from(categoryNodes)
    .where(parent ? eq(categoryNodes.parentId, parent.id) : isNull(categoryNodes.parentId));
  const used = new Set(siblings.map((s) => s.code));
  if (parent && parent.level === 4) {
    const s = L5_SUFFIXES.find((x) => !used.has(`${parent.code}-${x}`));
    if (!s) throw preconditionFailed('No more listing-category codes are free under this commodity.');
    return `${parent.code}-${s}`;
  }
  for (let n = 10; n <= 99; n++) {
    const c = `${parent?.code ?? ''}${n}`;
    if (!used.has(c)) return c;
  }
  throw preconditionFailed('No more codes are free at this level.');
}

function checkManualCode(code: string, parent: { code: string; level: number } | null) {
  if (parent?.level === 4) throw badRequest('Listing-category (L5) codes are generated automatically.');
  const expected = parent ? new RegExp(`^${parent.code}\\d{2}$`) : /^\d{2}$/;
  if (!expected.test(code))
    throw badRequest(parent ? `The code must be ${parent.code} followed by two digits.` : 'A segment (L1) code is two digits.');
}

// ---------------------------------------------------------------------------
// Commands

const nameSchema = z.string().trim().min(2, 'Name is too short').max(120);
const aliasSchema = z.string().trim().min(2).max(120);

export const createNodeInput = z.object({
  parentId: z.uuid().nullable().default(null),
  name: nameSchema,
  code: z.string().trim().optional(),
  description: z.string().trim().max(1000).default(''),
  aliases: z.array(aliasSchema).max(10).default([]),
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

export async function createNode(deps: TaxonomyDeps, ctx: Ctx, raw: CreateNodeInput) {
  const v = createNodeInput.parse(raw);
  return deps.db.transaction(async (tx) => {
    const parentCtx = v.parentId ? await nodeChain(tx, v.parentId) : null;
    const parent = parentCtx?.self ?? null;
    if (parent && parent.status !== 'active') throw preconditionFailed('You cannot add a category under an inactive one.');
    const level = parent ? parent.level + 1 : 1;
    if (level > MAX_LEVEL) throw badRequest('Listing categories (L5) cannot have children.');
    const wg = parentCtx?.effectiveWorkgroupId ?? null;
    if (!ctx.ability.can('create', asSubject(wg)))
      throw forbidden(wg ? 'You can only add categories inside your workgroup.' : 'You cannot add a top-level segment.');
    if (level === MAX_LEVEL && v.aliases.length === 0)
      throw badRequest('A listing category (L5) needs at least one unique alias.');

    const dupe = await tx
      .select({ id: categoryNodes.id })
      .from(categoryNodes)
      .where(
        and(
          parent ? eq(categoryNodes.parentId, parent.id) : isNull(categoryNodes.parentId),
          sql`lower(${categoryNodes.name}) = ${v.name.toLowerCase()}`,
        ),
      );
    if (dupe.length) throw conflict(`"${v.name}" already exists at this place in the tree.`);
    await assertAliasesFree(tx, v.aliases, null);

    let code: string;
    if (v.code) {
      checkManualCode(v.code, parent);
      code = v.code;
    } else code = await nextCode(tx, parent);

    let node: CategoryNode;
    try {
      [node] = (await tx
        .insert(categoryNodes)
        .values({ parentId: parent?.id ?? null, level, code, name: v.name, description: v.description, createdBy: ctx.actor.id })
        .returning()) as [CategoryNode];
    } catch (e) {
      if (isUnique(e)) throw conflict(`The code ${code} or the name "${v.name}" is already taken here.`);
      throw e;
    }
    if (v.aliases.length)
      await tx.insert(categoryAliases).values(v.aliases.map((alias) => ({ nodeId: node.id, alias, createdBy: ctx.actor.id })));

    const path = parentCtx ? `${parentCtx.path} › ${node.name}` : node.name;
    await recordAudit(tx, ctx, {
      action: 'taxonomy.node.created',
      subjectType: 'category_node',
      subjectId: node.id,
      summary: `${ctx.actor.email} created ${LEVEL_NAMES[level]} ${path} (${code})`,
      after: { code, name: node.name, level, parentId: node.parentId, aliases: v.aliases },
    });

    // An L5 starts life with an empty draft version (configured in R2, approved in R3).
    let draft = null;
    if (level === MAX_LEVEL) {
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

export async function moveNode(deps: TaxonomyDeps, ctx: Ctx, id: string, newParentId: string | null) {
  return deps.db.transaction(async (tx) => {
    const from = await nodeChain(tx, id);
    if (!ctx.ability.can('update', asSubject(from.effectiveWorkgroupId))) throw forbidden('You cannot move this category.');
    const to = newParentId ? await nodeChain(tx, newParentId) : null;
    if (to?.chain.some((r) => r.id === id)) throw badRequest('A category cannot move inside itself.');
    const targetLevel = to ? to.self.level + 1 : 1;
    if (targetLevel !== from.self.level)
      throw badRequest(
        `A ${LEVEL_NAMES[from.self.level]} (L${from.self.level}) must sit under a ${LEVEL_NAMES[from.self.level - 1] || 'nothing (top level)'}.`,
      );
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
    await recordAudit(tx, ctx, {
      action: 'taxonomy.node.moved',
      subjectType: 'category_node',
      subjectId: id,
      summary: `${ctx.actor.email} moved ${from.self.name} from "${from.chain.slice(0, -1).map((r) => r.name).join(' › ') || 'top level'}" to "${to?.path ?? 'top level'}". Its code ${from.self.code} is kept.`,
      before: { parentId: from.self.parent_id },
      after: { parentId: newParentId },
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
    if (c.self.level === MAX_LEVEL && own.length === 1) throw preconditionFailed('A listing category must keep at least one alias.');
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
