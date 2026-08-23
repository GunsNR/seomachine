import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Panel } from '@/components/app/ui';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { getEntitlements } from '@/lib/plan';
import { AccountExport } from './AccountExport';
import { PasswordForm, ProfileForm } from './AccountForms';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [user, org, entitlements] = await Promise.all([
    db.user.findUnique({ where: { id: session.id } }),
    db.organization.findUnique({ where: { id: session.orgId } }),
    getEntitlements(session.orgId),
  ]);

  if (!user || !org) redirect('/login');

  return (
    <>
      <PageHeader title="Account" sub="Your profile, password and data." />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Profile" sub={user.email}>
          <ProfileForm name={user.name} orgName={org.name} />
        </Panel>

        <Panel title="Password" sub="Changing it reissues your session on this device.">
          <PasswordForm />
        </Panel>

        <Panel title="Plan" sub={`${entitlements.plan.label} · ${entitlements.plan.frequency} checks`}>
          <dl className="divide-y divide-line">
            <Row label="Projects" value={fmt(entitlements.usage.projects, entitlements.plan.projects)} />
            <Row label="Prompts" value={fmt(entitlements.usage.prompts, entitlements.plan.prompts)} />
            <Row label="Keywords" value={fmt(entitlements.usage.keywords, entitlements.plan.keywords)} />
            <div className="px-5 py-4">
              <Link href="/pricing" className="btn btn-sm btn-ghost">Compare plans</Link>
            </div>
          </dl>
        </Panel>

        <Panel
          title="Your data"
          sub="Export anything, at any time — including after cancellation."
        >
          <AccountExport />
        </Panel>
      </div>
    </>
  );
}

function fmt(used: number, limit: number): string {
  return `${used.toLocaleString()} / ${Number.isFinite(limit) ? limit.toLocaleString() : 'Unlimited'}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <dt className="text-[0.85rem] font-semibold text-ink">{label}</dt>
      <dd className="text-[0.875rem] tabular-nums text-body">{value}</dd>
    </div>
  );
}
