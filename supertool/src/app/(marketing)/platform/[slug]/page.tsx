import { notFound } from 'next/navigation';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { JsonLd } from '@/components/JsonLd';
import { PLATFORM_PAGES } from '@/content/platform';
import { breadcrumbSchema, faqSchema, pageMetadata } from '@/lib/metadata';

export function generateStaticParams() {
  return PLATFORM_PAGES.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = PLATFORM_PAGES.find((p) => p.slug === slug);
  if (!data) return {};
  return pageMetadata({
    title: data.metaTitle,
    description: data.metaDescription,
    path: `/platform/${data.slug}`,
    keywords: data.keywords,
  });
}

export default async function PlatformDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = PLATFORM_PAGES.find((p) => p.slug === slug);
  if (!data) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Platform', path: '/platform' },
            { name: data.title, path: `/platform/${data.slug}` },
          ]),
          faqSchema(data.faqs),
        ]}
      />
      <FeaturePage data={data} basePath="/platform" />
    </>
  );
}
