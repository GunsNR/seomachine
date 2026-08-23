import type { MetadataRoute } from 'next';
import { brand } from '../../brand.config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/app/', '/api/', '/login', '/signup'] },
      // Answer engines are the point of the product — let them in explicitly.
      { userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Claude-Web', 'Google-Extended', 'Applebot-Extended'], allow: '/' },
    ],
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
