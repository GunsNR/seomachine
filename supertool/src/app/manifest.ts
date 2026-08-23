import type { MetadataRoute } from 'next';
import { brand } from '../../brand.config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: brand.colors.navy,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
