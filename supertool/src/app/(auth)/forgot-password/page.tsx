import { pageMetadata } from '@/lib/metadata';
import { ForgotForm } from './ForgotForm';

export const metadata = pageMetadata({
  title: 'Reset your password',
  description: 'Request a password reset link for your Rank Logic SuperTool account.',
  path: '/forgot-password',
  noindex: true,
});

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}
