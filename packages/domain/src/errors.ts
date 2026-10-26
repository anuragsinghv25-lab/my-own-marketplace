/**
 * Errors every module throws. The API layer maps `code` to an HTTP status and a
 * stable JSON shape, so modules never need to know about HTTP.
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'INTERNAL';

export const httpStatusFor: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return httpStatusFor[this.code];
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError('BAD_REQUEST', message, details);
export const unauthenticated = (message = 'Please sign in.') =>
  new AppError('UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError('FORBIDDEN', message);
export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found.`);
export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', message, details);
export const preconditionFailed = (message: string, details?: unknown) =>
  new AppError('PRECONDITION_FAILED', message, details);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
