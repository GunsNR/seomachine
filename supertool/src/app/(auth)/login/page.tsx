import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { pageMetadata } from '@/lib/metadata';
import { AuthForm } from '../AuthForm';

export const metadata = pageMetadata({
  title: 'Log in',
  description: 'Sign in to your Rank Logic SuperTool workspace.',
  path: '/login',
  noindex: true,
});

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/app');
  return <AuthForm mode="login" />;
}
