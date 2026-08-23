import type { MetadataRoute } from 'next';
import { POSTS } from '@/content/blog';
import { PLATFORM_PAGES, SOLUTION_PAGES } from '@/content/platform';
import { brand } from '../../brand.config';

const BASE = brand.url.replace(/\/$/, '');

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/platform`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/solutions`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/tools/ai-visibility-check`, lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
    { url: `${BASE}/tools/site-audit`, lastModified: now, changeFrequency: 'monthly', priority: 0.85 },
    { url: `${BASE}/docs/wordpress`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const platform: MetadataRoute.Sitemap = PLATFORM_PAGES.map((p) => ({
    url: `${BASE}/platform/${p.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const solutions: MetadataRoute.Sitemap = SOLUTION_PAGES.map((p) => ({
    url: `${BASE}/solutions/${p.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.75,
  }));

  const posts: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(`${p.updated ?? p.published}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  return [...core, ...platform, ...solutions, ...posts];
}
