/**
 * What the identity module needs from the outside world. The web app implements these
 * with the Supabase Admin API and Resend; tests use in-memory fakes.
 */
export interface EmailLink {
  /** hashed token to verify with supabase.auth.verifyOtp on /auth/confirm */
  tokenHash: string;
  type: 'invite' | 'magiclink' | 'recovery' | 'signup' | 'email_change';
}

export interface AuthDirectory {
  /** Create an unconfirmed auth user and return a one-time invite link token. */
  invite(email: string, fullName: string): Promise<{ userId: string; link: EmailLink }>;
  /** One-time sign-in link for an existing user (used to resend invites). */
  magicLink(email: string): Promise<EmailLink>;
  /** Create a confirmed user with a password (first admin, demo users). */
  createWithPassword(email: string, password: string, fullName: string): Promise<{ userId: string }>;
  /** Set a user's password (used only for demo accounts). */
  setPassword(userId: string, password: string): Promise<void>;
  /** Block or unblock sign-in. */
  setBanned(userId: string, banned: boolean): Promise<void>;
  /** Compensation when a later step fails. */
  delete(userId: string): Promise<void>;
}

export interface InviteEmail {
  to: string;
  inviteeName: string;
  inviterName: string;
  roleLabels: string[];
  url: string;
}

export interface Mailer {
  /** Returns false when email is not configured, so the caller can show the link instead. */
  sendInvite(email: InviteEmail): Promise<{ delivered: boolean }>;
}
