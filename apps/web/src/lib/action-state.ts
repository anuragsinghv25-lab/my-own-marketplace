/** Result shape every form server action returns (used with React's useActionState). */
export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; message?: string; data?: Record<string, unknown> }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[] | undefined> };

export const idle: ActionState = { status: 'idle' };
