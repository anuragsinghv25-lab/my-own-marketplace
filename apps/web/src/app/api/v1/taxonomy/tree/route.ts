import { getDb } from '@orbita/db';
import { loadTree } from '@orbita/taxonomy';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';

export const GET = route(contracts.categoryTree, async ({ session }) => ({
  nodes: (await loadTree(getDb(), session.ability)).nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    level: n.level,
    kind: n.kind,
    code: n.code,
    name: n.name,
    status: n.status,
    source: n.source,
    externalId: n.externalId,
    unspscCode: n.unspscCode,
    aliases: n.aliases.map((a) => a.alias),
    workgroupId: n.effectiveWorkgroupId,
  })),
}));
