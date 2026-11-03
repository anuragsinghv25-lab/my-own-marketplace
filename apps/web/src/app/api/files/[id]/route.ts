import { NextResponse } from 'next/server';
import { getDb } from '@orbita/db';
import { isAppError } from '@orbita/domain';
import { readFile } from '@orbita/sellers';
import { requestMeta } from '@/server/request';
import { sessionOrThrow } from '@/server/session';
import { fileStorage } from '@/server/storage';

export const dynamic = 'force-dynamic';

/** Streams an evidence file to someone allowed to see it (its organisation, reviewers, approvers, auditors). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  try {
    const ctx = { ...(await sessionOrThrow()), meta: await requestMeta() };
    const { file, bytes } = await readFile({ db: getDb(), storage: fileStorage() }, ctx, id);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'content-type': file.contentType,
        'content-length': String(file.size),
        'content-disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
