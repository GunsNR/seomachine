import { redirect } from 'next/navigation';
import { getSession, resolveProject } from '@/lib/auth';
import { db } from '@/lib/db';
import { OnboardingWizard } from './OnboardingWizard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Set up your workspace',
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await resolveProject(session.orgId);

  // Already set up? Nothing to do here.
  if (project) {
    const configured = await db.aiPrompt.count({ where: { projectId: project.id } });
    if (configured > 0) redirect('/app');
  }

  return (
    <div className="py-6">
      <OnboardingWizard
        projectId={project?.id}
        defaultName={project && project.domain !== 'example.com' ? project.name : ''}
      />
    </div>
  );
}
