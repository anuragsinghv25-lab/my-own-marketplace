import { and, eq, or, sql } from 'drizzle-orm';
import { recordAudit } from '@orbita/audit';
import { attributes, valueListItems, valueLists, type DbOrTx } from '@orbita/db';
import { slugify } from './schemas';
import type { Ctx } from './shared';

export interface StandardAttributeSpec {
  handle: string;
  name: string;
  description: string;
  /** extended attributes ("Lens color") share the base attribute's value list */
  baseHandle: string | null;
  values: string[];
}

/**
 * Brings standard (Shopify) attributes into the library so a category adopted from the standard
 * arrives with its attribute set. This is a system path: the caller has already checked that the
 * actor may create the category. Reuse beats duplication:
 *   1. an attribute already linked to the same handle is reused;
 *   2. otherwise an existing library attribute with the same code or name is linked and reused
 *      (the admin's own "Color" wins over Shopify's);
 *   3. otherwise it is created (multi-select over a value list shared by extended attributes).
 * Returns handle → attribute id.
 */
export async function importStandardAttributes(
  tx: DbOrTx,
  ctx: Ctx,
  source: 'shopify' | 'unspsc',
  specs: StandardAttributeSpec[],
  reason: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const created: string[] = [];
  const linked: string[] = [];
  const listFor = new Map<string, string>();

  async function valueListFor(spec: StandardAttributeSpec): Promise<string | null> {
    const key = spec.baseHandle ?? spec.handle;
    if (listFor.has(key)) return listFor.get(key)!;
    const values = [...new Map(spec.values.map((v) => [v.trim().toLowerCase(), v.trim()])).values()].filter(Boolean);
    if (!values.length) return null;
    const [existing] = await tx
      .select({ id: valueLists.id })
      .from(valueLists)
      .where(and(eq(valueLists.source, source), eq(valueLists.externalRef, key)));
    let id = existing?.id;
    if (!id) {
      const base = `${source}_${slugify(key)}`.slice(0, 63);
      const taken = await tx.select({ code: valueLists.code }).from(valueLists).where(sql`lower(${valueLists.code}) like ${base + '%'}`);
      const used = new Set(taken.map((t) => t.code.toLowerCase()));
      let code = base;
      for (let i = 2; used.has(code); i++) code = `${base.slice(0, 59)}_${i}`;
      const label = spec.baseHandle ? key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : spec.name;
      [{ id }] = (await tx
        .insert(valueLists)
        .values({ code, name: label, description: `Values from the ${source === 'shopify' ? 'Shopify' : 'UNSPSC'} standard taxonomy`, kind: 'plain', source, externalRef: key, createdBy: ctx.actor.id })
        .returning({ id: valueLists.id })) as [{ id: string }];
      await tx.insert(valueListItems).values(values.map((value, i) => ({ listId: id!, value, sortOrder: i })));
    }
    listFor.set(key, id!);
    return id!;
  }

  for (const spec of specs) {
    const [mine] = await tx
      .select({ id: attributes.id })
      .from(attributes)
      .where(and(eq(attributes.source, source), eq(attributes.externalRef, spec.handle)));
    if (mine) {
      out.set(spec.handle, mine.id);
      continue;
    }
    const code = slugify(spec.handle.replace(/-/g, ' '));
    const [same] = await tx
      .select({ id: attributes.id, externalRef: attributes.externalRef })
      .from(attributes)
      .where(or(sql`lower(${attributes.code}) = ${code}`, sql`lower(${attributes.name}) = ${spec.name.toLowerCase()}`));
    if (same) {
      if (!same.externalRef) await tx.update(attributes).set({ externalRef: spec.handle, source }).where(eq(attributes.id, same.id));
      out.set(spec.handle, same.id);
      linked.push(spec.name);
      continue;
    }
    const listId = await valueListFor(spec);
    const [row] = await tx
      .insert(attributes)
      .values({
        code,
        name: spec.name,
        description: spec.description,
        dataType: listId ? 'multi_enumerable' : 'text',
        valueListId: listId,
        validation: listId ? {} : { maxLength: 200 },
        source,
        externalRef: spec.handle,
        createdBy: ctx.actor.id,
      })
      .returning({ id: attributes.id });
    out.set(spec.handle, row!.id);
    created.push(spec.name);
  }

  if (created.length || linked.length)
    await recordAudit(tx, ctx, {
      action: 'library.attributes.imported',
      subjectType: 'attribute',
      subjectId: source,
      summary: `${created.length} attribute${created.length === 1 ? '' : 's'} added to the library from ${source === 'shopify' ? 'Shopify' : 'UNSPSC'}${linked.length ? `, ${linked.length} matched to existing ones` : ''} (${reason})`,
      after: { created, linked },
    });
  return out;
}
