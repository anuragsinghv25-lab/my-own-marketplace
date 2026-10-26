import 'server-only';
import { headers } from 'next/headers';
import { newRequestId, type RequestMeta } from '@orbita/domain';

/** Request id (set by the proxy), IP and user agent for audit and logs. */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  return metaFromHeaders(h);
}

export function metaFromHeaders(h: Headers): RequestMeta {
  return {
    requestId: h.get('x-request-id') ?? newRequestId(),
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  };
}
