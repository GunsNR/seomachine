import { checkResetToken, reasonMessage } from '@/lib/password-reset';
import { pageMetadata } from '@/lib/metadata';
import { ResetForm } from './ResetForm';

export const metadata = pageMetadata({
  title: 'Choose a new password',
  description: 'Set a new password for your Rank Logic SuperTool account.',
  path: '/reset-password',
  noindex: true,
});

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  // Validate before rendering the form, so an expired link says so
  // immediately rather than after the user types a new password.
  const check = token ? await checkResetToken(token) : { valid: false, reason: 'not-found' as const };

  return (
    <ResetForm
      token={token ?? ''}
      invalidReason={check.valid ? undefined : reasonMessage(check.reason)}
    />
  );
}
