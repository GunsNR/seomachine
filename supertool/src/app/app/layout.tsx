import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/app/Sidebar';
import { getSession, resolveProject } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await resolveProject(session.orgId);

  return (
    <div className="flex min-h-screen flex-col bg-surface-alt lg:flex-row">
      <Sidebar userName={session.name} projectName={project?.name ?? 'No project'} />
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-5 py-7 sm:px-7 lg:px-9 lg:py-9">{children}</div>
      </main>
    </div>
  );
}
