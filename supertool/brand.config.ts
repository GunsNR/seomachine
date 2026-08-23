/**
 * Single source of truth for product identity.
 *
 * Everything user-facing — page titles, schema.org markup, the WordPress
 * plugin handshake, email copy, the Elementor kit — reads from here. Renaming
 * or rebranding the whole product is an edit to this one file.
 */
export const brand = {
  name: 'Rank Logic SuperTool',
  shortName: 'SuperTool',
  slug: 'rank-logic-supertool',
  legalName: 'Rank Logic LLC',
  tagline: 'Get cited by AI. Get ranked by Google. Get the lead either way.',
  description:
    'Rank Logic SuperTool measures how often ChatGPT, Perplexity, Claude, Gemini and Grok name or cite your brand, audits your site for the structure those answers reward, and publishes to WordPress. Every figure carries its source.',
  /**
   * Whether the legal identity below has been confirmed by the business owner.
   *
   * While this is false, the contact details are placeholders and must not be
   * emitted as structured data or presented as a verified business address:
   * publishing a fabricated postal address and phone number in schema.org
   * markup misrepresents a real-world entity. Set to true only once an owner
   * has confirmed each field, and have the legal pages reviewed by qualified
   * counsel at the same time.
   */
  identityVerified: false,
  domain: 'ranklogicsupertool.com',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://ranklogicsupertool.com',
  email: 'hello@ranklogicsupertool.com',
  /** Placeholder until `identityVerified` is true. */
  phone: '+1 (201) 720-2141',
  /** Placeholder until `identityVerified` is true. */
  address: {
    street: '45 Eisenhower Drive, Suite 520',
    city: 'Paramus',
    region: 'NJ',
    postalCode: '07652',
    country: 'US',
  },
  social: {
    twitter: 'https://twitter.com/ranklogic',
    linkedin: 'https://www.linkedin.com/company/ranklogic',
    youtube: 'https://www.youtube.com/@ranklogic',
    github: 'https://github.com/gunsnr/seomachine',
  },
  /** Drives the Tailwind theme, the OG image generator and the Elementor kit. */
  colors: {
    navy: '#07182E',
    navySoft: '#0F2A4A',
    primary: '#1466D8',
    primaryDark: '#0E4CA6',
    primaryLight: '#E8F1FE',
    accent: '#FF6B2C',
    accentDark: '#E0541A',
    ink: '#0B1220',
    body: '#4A5568',
    line: '#E3E8EF',
    surface: '#FFFFFF',
    surfaceAlt: '#F6F9FD',
    success: '#12A150',
    warning: '#F5A524',
    danger: '#E5484D',
  },
  fonts: {
    heading: 'Manrope',
    body: 'Inter',
  },
} as const;

export type Brand = typeof brand;
export default brand;
