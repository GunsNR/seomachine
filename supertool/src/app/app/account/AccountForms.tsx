'use client';

import { useState } from 'react';
import { KeyRound, Loader2, Save } from 'lucide-react';
import { Field, FormError, FormSuccess, inputClass } from '@/components/app/Field';
import { useAction } from '@/components/app/use-action';

export function ProfileForm({ name, orgName }: { name: string; orgName: string }) {
  const [yourName, setYourName] = useState(name);
  const [workspace, setWorkspace] = useState(orgName);
  const { run, pending, error, success, setSuccess } = useAction();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await run(
          '/api/app/account',
          { method: 'PATCH', body: { name: yourName, orgName: workspace } },
          { onSuccess: () => setSuccess('Profile saved.') },
        );
      }}
      className="space-y-4 p-5"
    >
      <Field label="Your name" required>
        <input value={yourName} onChange={(e) => setYourName(e.target.value)} required maxLength={120} className={inputClass} />
      </Field>
      <Field label="Workspace name" required hint="Shown on white-label reports.">
        <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} required maxLength={160} className={inputClass} />
      </Field>

      <FormError message={error} />
      <FormSuccess message={success} />

      <button type="submit" disabled={pending} className="btn btn-md btn-primary">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        Save profile
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { run, pending, error, success, setError, setSuccess } = useAction();

  const mismatch = confirm.length > 0 && next !== confirm;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== confirm) {
          setError('The two new passwords do not match.');
          return;
        }
        const data = await run(
          '/api/app/account',
          { body: { currentPassword: current, newPassword: next } },
          { refresh: false, onSuccess: () => setSuccess('Password changed.') },
        );
        if (data) { setCurrent(''); setNext(''); setConfirm(''); }
      }}
      className="space-y-4 p-5"
    >
      <Field label="Current password" required>
        <input
          type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
          required maxLength={200} autoComplete="current-password" className={inputClass}
        />
      </Field>
      <Field label="New password" required hint="At least 10 characters.">
        <input
          type="password" value={next} onChange={(e) => setNext(e.target.value)}
          required minLength={10} maxLength={200} autoComplete="new-password" className={inputClass}
        />
      </Field>
      <Field label="Confirm new password" required>
        <input
          type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          required maxLength={200} autoComplete="new-password" className={inputClass}
          aria-invalid={mismatch}
        />
      </Field>

      {mismatch && (
        <p role="alert" className="text-[0.8rem] font-semibold text-bad">
          The two new passwords do not match.
        </p>
      )}

      <FormError message={error} />
      <FormSuccess message={success} />

      <button
        type="submit"
        disabled={pending || !current || next.length < 10 || mismatch}
        className="btn btn-md btn-primary"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
        Change password
      </button>
    </form>
  );
}
