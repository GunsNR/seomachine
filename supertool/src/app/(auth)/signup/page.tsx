import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { pageMetadata } from '@/lib/metadata';
import { signupIsOpen } from '@/lib/pilot';
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
  // One question — is signup open? — rather than reading the gate's internals.
  // A deployment whose configuration is broken refuses every signup, and the
  // page should say invitation-only rather than advertise a trial it will not
  // grant. It must not say *why*: the operator learns that from the
  // token-gated health view and the server log, never from a page anyone can
  // load.
  return <AuthForm mode="signup" invitationOnly={!signupIsOpen()} />;
}
