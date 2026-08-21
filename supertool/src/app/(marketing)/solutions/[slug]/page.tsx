import { notFound } from 'next/navigation';
import { FeaturePage } from '@/components/marketing/FeaturePage';
import { JsonLd } from '@/components/JsonLd';
import { SOLUTION_PAGES } from '@/content/platform';
import { breadcrumbSchema, faqSchema, pageMetadata } from '@/lib/metadata';

export function generateStaticParams() {
  return SOLUTION_PAGES.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = SOLUTION_PAGES.find((p) => p.slug === slug);
  if (!data) return {};
  return pageMetadata({
    title: data.metaTitle,
    description: data.metaDescription,
    path: `/solutions/${data.slug}`,
    keywords: data.keywords,
  });
}

export default async function SolutionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = SOLUTION_PAGES.find((p) => p.slug === slug);
  if (!data) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Solutions', path: '/solutions' },
            { name: data.title, path: `/solutions/${data.slug}` },
          ]),
          faqSchema(data.faqs),
        ]}
      />
      <FeaturePage data={data} basePath="/solutions" />
    </>
  );
}
