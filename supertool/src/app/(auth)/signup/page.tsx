import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { pageMetadata } from '@/lib/metadata';
import { pilotModeEnabled } from '@/lib/pilot';
import { AuthForm } from '../AuthForm';

export const metadata = pageMetadata({
  title: 'Start your free trial',
  description: 'Create a Rank Logic SuperTool workspace. Fourteen days free, no card required.',
  path: '/signup',
  noindex: true,
});

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await getSession()) redirect('/app');
  // Read the flag alone, not the whole gate. A deployment whose allowlist is
  // malformed still refuses every signup, and the page should say
  // invitation-only rather than advertise a trial it will not grant — the
  // operator learns about the misconfiguration from the health view and the
  // server log, not from a visitor-facing page.
  return <AuthForm mode="signup" invitationOnly={pilotModeEnabled()} />;
}
