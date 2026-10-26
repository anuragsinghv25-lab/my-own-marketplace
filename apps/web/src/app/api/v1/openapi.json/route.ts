import { route } from '@/server/api/handler';
import { contracts } from '@/server/api/contracts';
import { buildOpenApi } from '@/server/api/openapi';
import { env } from '@/server/env';

export const GET = route(contracts.openapi, async () => buildOpenApi(env.appUrl()));
