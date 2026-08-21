import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { FOOTER_COLUMNS, TRUST_BADGES } from '@/content/site';
import { brand } from '../../../brand.config';
import { LogoMark } from './Logo';

export function Footer() {
  const year = new Date().getFullYear();
  const tel = brand.phone.replace(/[^+\d]/g, '');

  return (
    <footer className="bg-navy text-white/75">
      {/* Conversion band sits inside the footer so every page ends on an ask. */}
      <div className="border-b border-white/10">
        <div className="container-x flex flex-col items-start gap-6 py-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-display-md text-white text-balance">
              See which answers name you — and which name your competitor
            </h2>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-white/70">
              Run your first full check across all six answer engines free. No card, no call, results in about a minute.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-lg btn-accent">Start free trial</Link>
            <Link href="/contact" className="btn btn-lg btn-onnavy">Book a demo</Link>
          </div>
        </div>
      </div>

      <div className="container-x grid gap-10 py-14 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-10 w-10" />
            <span className="flex flex-col leading-none">
              <span className="font-heading text-lg font-extrabold text-white">Rank Logic</span>
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-brand-300">SuperTool</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs text-[0.9rem] leading-relaxed">
            The AI search visibility platform. Get cited by answer engines, ranked by Google, and credited for the leads either one sends.
          </p>
          <address className="mt-5 space-y-2.5 not-italic text-[0.875rem]">
            <a href={`tel:${tel}`} className="flex items-center gap-2.5 hover:text-white">
              <Phone className="h-4 w-4 text-brand-300" aria-hidden="true" />
              {brand.phone}
            </a>
            <a href={`mailto:${brand.email}`} className="flex items-center gap-2.5 hover:text-white">
              <Mail className="h-4 w-4 text-brand-300" aria-hidden="true" />
              {brand.email}
            </a>
            <span className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" aria-hidden="true" />
              <span>
                {brand.address.street}
                <br />
                {brand.address.city}, {brand.address.region} {brand.address.postalCode}
              </span>
            </span>
          </address>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h3 className="font-heading text-[0.95rem] font-bold text-white">{col.heading}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[0.875rem] transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="container-x flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-5">
          {TRUST_BADGES.map((b) => (
            <span key={b} className="text-[0.7rem] font-bold uppercase tracking-[0.13em] text-white/45">
              {b}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-5 text-[0.8rem] sm:flex-row">
          <p>© {year} {brand.legalName}. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/sitemap.xml" className="hover:text-white">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
