import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { pageMetadata } from '@/lib/metadata';
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
  return <AuthForm mode="signup" />;
}
