'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Plug, Unplug } from 'lucide-react';
import { Field, FormError, FormSuccess, inputClass } from '@/components/app/Field';
import { useAction } from '@/components/app/use-action';
import { Badge } from '@/components/app/ui';

interface Connection {
  siteUrl: string;
  username: string;
  status: string;
  lastSyncAt: string | null;
}

/** Connect a WordPress site with an application password. */
export function WordPressConnect({
  projectId, connection,
}: { projectId: string; connection: Connection | null }) {
  const [siteUrl, setSiteUrl] = useState(connection?.siteUrl ?? '');
  const [username, setUsername] = useState(connection?.username ?? '');
  const [appPassword, setAppPassword] = useState('');
  const [editing, setEditing] = useState(!connection);
  const { run, pending, error, success, setSuccess } = useAction();

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const data = await run(
      '/api/app/wordpress/connect',
      { body: { projectId, siteUrl, username, appPassword } },
      {
        onSuccess: (d) =>
          setSuccess(
            `Connected to ${d.siteName || siteUrl} as ${d.authenticatedAs || username}.`,
          ),
      },
    );
    if (data) { setAppPassword(''); setEditing(false); }
  }

  const connected = connection?.status === 'connected';

  return (
    <section className="rounded-xl bg-white ring-1 ring-line shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-heading text-[1rem] font-bold text-ink">WordPress</h2>
          <p className="mt-0.5 text-[0.8rem] text-body">
            Publish articles straight to your site. Works on any WordPress 6.0+ install.
          </p>
        </div>
        {connection && (
          <Badge tone={connected ? 'good' : 'warn'}>{connection.status}</Badge>
        )}
      </header>

      {connection && !editing ? (
        <div className="space-y-4 p-5">
          <dl className="space-y-2.5 text-[0.875rem]">
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-ink">Site</dt>
              <dd className="truncate text-body">{connection.siteUrl}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-ink">User</dt>
              <dd className="text-body">{connection.username}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-ink">Last sync</dt>
              <dd className="text-body">
                {connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString('en-US') : 'Never'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-ink">Password</dt>
              <dd className="text-body">Stored encrypted</dd>
            </div>
          </dl>

          {connected && (
            <p className="flex items-start gap-2 rounded-lg bg-ok/10 p-3 text-[0.82rem] text-ink ring-1 ring-ok/25">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
              Verified. You can publish from the Content page.
            </p>
          )}

          <FormError message={error} />
          <FormSuccess message={success} />

          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setEditing(true)} className="btn btn-sm btn-ghost">
              <Plug className="h-4 w-4" aria-hidden="true" />
              Update credentials
            </button>
            <button
              type="button" disabled={pending}
              onClick={() => run(`/api/app/wordpress/connect?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' })}
              className="btn btn-sm btn-ghost hover:!text-bad hover:!ring-bad"
            >
              <Unplug className="h-4 w-4" aria-hidden="true" />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-4 p-5">
          <Field label="Site URL" required hint="The WordPress address, including https://">
            <input
              value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}
              required maxLength={255} className={inputClass} placeholder="https://yourdomain.com"
            />
          </Field>
          <Field label="Username" required hint="A WordPress user with permission to publish.">
            <input
              value={username} onChange={(e) => setUsername(e.target.value)}
              required maxLength={120} className={inputClass} placeholder="editor"
              autoComplete="username"
            />
          </Field>
          <Field
            label="Application password" required
            hint="Create one in WordPress under Users → Profile → Application Passwords. Not your login password."
          >
            <input
              type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)}
              required maxLength={200} className={inputClass} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
              autoComplete="new-password"
            />
          </Field>

          <FormError message={error} />
          <FormSuccess message={success} />

          <div className="flex flex-wrap gap-2.5">
            <button type="submit" disabled={pending} className="btn btn-md btn-primary">
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying…
                </>
              ) : (
                <>
                  <Plug className="h-4 w-4" aria-hidden="true" />
                  Connect and verify
                </>
              )}
            </button>
            {connection && (
              <button type="button" onClick={() => setEditing(false)} className="btn btn-md btn-ghost">
                Cancel
              </button>
            )}
          </div>

          <p className="text-[0.78rem] leading-relaxed text-body">
            We verify the credentials before saving them, and store the application password
            encrypted. Revoke it in WordPress at any time to cut off access instantly.
          </p>
        </form>
      )}
    </section>
  );
}
