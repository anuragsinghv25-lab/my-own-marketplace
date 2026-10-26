import { redirect } from 'next/navigation';
import { getSessionState } from '@/server/session';

/** Entry point: send everyone to the right place. */
export default async function Index() {
  const s = await getSessionState();
  if (s.state === 'unconfigured') redirect('/setup');
  if (s.state !== 'ok') redirect('/login');
  if (s.session.profile.status === 'invited') redirect('/welcome');
  redirect(s.session.homePath);
}
