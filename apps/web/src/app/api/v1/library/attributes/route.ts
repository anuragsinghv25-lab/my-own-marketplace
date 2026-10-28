import { getDb } from '@orbita/db';
import { listAttributes } from '@orbita/library';
import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';

export const GET = route(contracts.listAttributes, async ({ session, query }) => ({
  items: (await listAttributes(getDb(), session.ability, query)).map((r) => ({
    id: r.attribute.id,
    code: r.attribute.code,
    name: r.attribute.name,
    dataType: r.attribute.dataType,
    valueList: r.valueListName,
    unit: r.unitSymbol,
    status: r.attribute.status,
  })),
}));
