import { LegalPage } from '@/components/marketing/LegalPage';
import { PRIVACY, PRIVACY_UPDATED } from '@/content/legal';
import { pageMetadata } from '@/lib/metadata';
import { brand } from '../../../../brand.config';

export const metadata = pageMetadata({
  title: 'Privacy Policy',
  description: `How ${brand.name} collects, uses, stores and deletes your data — including what is sent to answer engine providers when a visibility check runs.`,
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={PRIVACY_UPDATED}
      intro={`We collect the minimum needed to run ${brand.shortName}, we do not sell it, and we do not train models on your content. This page explains the detail without hiding it in legalese.`}
      sections={PRIVACY}
    />
  );
}
