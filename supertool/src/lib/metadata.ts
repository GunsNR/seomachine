import type { Metadata } from 'next';
import { brand } from '../../brand.config';

const BASE = brand.url.replace(/\/$/, '');

export interface PageSeo {
  title: string;
  description: string;
  path: string;
  /** Omit for pages that should not be indexed. */
  noindex?: boolean;
  keywords?: string[];
  type?: 'website' | 'article';
  publishedTime?: string;
  image?: string;
}

/**
 * Build a complete metadata object for a page: canonical URL, Open Graph,
 * Twitter card and robots directives, all derived from one description.
 */
export function pageMetadata(seo: PageSeo): Metadata {
  const url = `${BASE}${seo.path === '/' ? '' : seo.path}`;
  const image = seo.image ?? `${BASE}/opengraph-image`;
  const fullTitle = seo.path === '/' ? `${seo.title} | ${brand.name}` : `${seo.title} | ${brand.shortName}`;

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: url },
    robots: seo.noindex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
        },
    openGraph: {
      type: seo.type ?? 'website',
      url,
      siteName: brand.name,
      title: fullTitle,
      description: seo.description,
      images: [{ url: image, width: 1200, height: 630, alt: seo.title }],
      locale: 'en_US',
      ...(seo.publishedTime ? { publishedTime: seo.publishedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: seo.description,
      images: [image],
    },
  };
}

/* ---------------------------------------------------------------- */
/* JSON-LD builders                                                  */
/* ---------------------------------------------------------------- */

/**
 * Organization markup.
 *
 * Postal address, telephone and social profiles are emitted only once
 * `brand.identityVerified` is true. Until an owner has confirmed them they are
 * placeholders, and publishing placeholder contact details as structured data
 * asserts a real-world business location that does not exist.
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BASE}/#organization`,
    name: brand.name,
    legalName: brand.legalName,
    url: BASE,
    logo: { '@type': 'ImageObject', url: `${BASE}/icon.svg` },
    description: brand.description,
    email: brand.email,
    ...(brand.identityVerified
      ? {
          telephone: brand.phone,
          address: {
            '@type': 'PostalAddress',
            streetAddress: brand.address.street,
            addressLocality: brand.address.city,
            addressRegion: brand.address.region,
            postalCode: brand.address.postalCode,
            addressCountry: brand.address.country,
          },
          sameAs: Object.values(brand.social),
        }
      : {}),
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE}/#website`,
    url: BASE,
    name: brand.name,
    description: brand.description,
    publisher: { '@id': `${BASE}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${BASE}/blog?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Product structured data.
 *
 * Deliberately emits no `aggregateRating`. There are no reviews to aggregate,
 * and a fabricated rating in structured data is both a lie to the reader and a
 * violation of Google's structured-data policy. When real reviews exist, the
 * rating goes back in with a claim record behind it — not before.
 */
export function softwareApplicationSchema(opts: { lowPrice: number; highPrice: number }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brand.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'SEO Software',
    operatingSystem: 'Web',
    url: BASE,
    description: brand.description,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: opts.lowPrice,
      highPrice: opts.highPrice,
      offerCount: 3,
    },
  };
}

export function breadcrumbSchema(trail: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${BASE}${item.path === '/' ? '' : item.path}`,
    })),
  };
}

export function faqSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function articleSchema(a: {
  title: string; description: string; path: string;
  published: string; modified?: string; author: string; image?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    description: a.description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${BASE}${a.path}` },
    datePublished: a.published,
    dateModified: a.modified ?? a.published,
    author: { '@type': 'Person', name: a.author },
    publisher: { '@id': `${BASE}/#organization` },
    image: a.image ?? `${BASE}/opengraph-image`,
  };
}
