/**
 * The "who is asking" object passed into every module use case.
 * Built once per request by the web app; modules never read cookies or headers.
 */
export interface Actor {
  /** auth user id (uuid) */
  id: string;
  email: string;
  fullName: string;
}

export interface RequestMeta {
  requestId: string;
  ip?: string | null;
  userAgent?: string | null;
}
