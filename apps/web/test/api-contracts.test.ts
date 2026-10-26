import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { contracts, type Contract } from '@/server/api/contracts';
import { buildOpenApi } from '@/server/api/openapi';

const apiRoot = path.resolve(import.meta.dirname, '../src/app/api/v1');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === 'route.ts' ? [p] : [];
  });
}

/** src/app/api/v1/admin/users/[id]/route.ts → /api/v1/admin/users/{id} */
const toPath = (file: string) =>
  '/api/v1' +
  path
    .dirname(path.relative(apiRoot, file))
    .split(path.sep)
    .filter((s) => s !== '.')
    .map((s) => s.replace(/^\[(.+)\]$/, '{$1}'))
    .map((s) => `/${s}`)
    .join('');

const files = routeFiles(apiRoot).map((file) => {
  const src = readFileSync(file, 'utf8');
  const exported = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*route\(contracts\.(\w+)/g)].map(
    (m) => ({ method: m[1]!, contract: m[2]! }),
  );
  const rawExports = [...src.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]!);
  return { file: path.relative(apiRoot, file), path: toPath(file), exported, rawExports };
});

describe('API contracts', () => {
  it('every handler in /api/v1 is wrapped with route(contracts.X)', () => {
    for (const f of files) {
      expect(f.exported.map((e) => e.method).sort(), `${f.file} exports a handler without a contract`).toEqual(
        [...f.rawExports].sort(),
      );
    }
  });

  it('each route uses the contract whose method and path match its file', () => {
    for (const f of files) {
      for (const e of f.exported) {
        const c = (contracts as Record<string, Contract>)[e.contract];
        expect(c, `${f.file}: contracts.${e.contract} does not exist`).toBeDefined();
        expect(c!.method).toBe(e.method);
        expect(c!.path).toBe(f.path);
      }
    }
  });

  it('every contract is implemented by exactly one route', () => {
    const implemented = files.flatMap((f) => f.exported.map((e) => e.contract));
    for (const name of Object.keys(contracts)) {
      expect(implemented.filter((n) => n === name), `contracts.${name}`).toHaveLength(1);
    }
  });

  it('path parameters are declared in the contract schema', () => {
    for (const c of Object.values(contracts) as Contract[]) {
      const names = [...c.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
      expect(Object.keys(c.params?.shape ?? {}).sort(), c.path).toEqual(names.sort());
    }
  });

  it('generates an OpenAPI document covering every contract', () => {
    const doc = buildOpenApi('https://example.com') as { paths: Record<string, Record<string, { operationId: string }>> };
    const ops = Object.values(doc.paths).flatMap((p) => Object.values(p).map((o) => o.operationId));
    expect(ops.sort()).toEqual(Object.keys(contracts).sort());
    expect(JSON.stringify(doc)).toContain('"/api/v1/admin/users/{id}/roles/{grantId}"');
  });
});
