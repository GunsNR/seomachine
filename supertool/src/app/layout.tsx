import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { brand } from '../../brand.config';
import './globals.css';

const body = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

const heading = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
  weight: ['600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: {
    default: `${brand.name} | AI Search Visibility & SEO Platform`,
    template: `%s | ${brand.shortName}`,
  },
  description: brand.description,
  applicationName: brand.name,
  authors: [{ name: brand.legalName }],
  creator: brand.legalName,
  publisher: brand.legalName,
  formatDetection: { telephone: false, address: false, email: false },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: brand.colors.navy,
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
