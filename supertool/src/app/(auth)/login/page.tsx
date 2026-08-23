import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { pageMetadata } from '@/lib/metadata';
import { AuthForm } from '../AuthForm';
import { db } from '@/lib/db';

export const metadata = pageMetadata({
  title: 'Log in',
  description: 'Sign in to your Rank Logic SuperTool workspace.',
  path: '/login',
  noindex: true,
});

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/app');
  // The demo hint appears only when a demo workspace actually exists in this
  // deployment's database. On a production install it never renders.
  const demo = await db.organization.findFirst({ where: { dataMode: 'demo' }, select: { id: true } })
    .catch(() => null);

  return <AuthForm mode="login" showDemoCredentials={!!demo} />;
}
