import { LegalPage } from '@/components/marketing/LegalPage';
import { TERMS, TERMS_UPDATED } from '@/content/legal';
import { pageMetadata } from '@/lib/metadata';
import { brand } from '../../../../brand.config';

export const metadata = pageMetadata({
  title: 'Terms of Service',
  description: `The terms governing use of ${brand.name} — what the service does, what we do not promise, billing, acceptable use and liability.`,
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={TERMS_UPDATED}
      intro="Plain-language terms covering what the service does, what we cannot guarantee about third-party answer engines, how billing works, and how to leave with your data."
      sections={TERMS}
    />
  );
}
