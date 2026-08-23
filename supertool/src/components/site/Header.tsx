'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, Phone, X } from 'lucide-react';
import { NAV } from '@/content/site';
import { cn } from '@/lib/utils';
import { brand } from '../../../brand.config';
import { Logo } from './Logo';

export function Header() {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Any navigation closes whatever is open.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenMenu(null); setMobileOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Prevent the page scrolling behind the mobile sheet.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  /** Small grace period so the pointer can travel into the panel. */
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur transition-shadow',
        scrolled ? 'border-line shadow-[0_2px_16px_-8px_rgba(7,24,46,.28)]' : 'border-transparent',
      )}
    >
      {/* Utility strip — the trust/contact bar SmartSites-style agency sites lead with. */}
      <div className="hidden bg-navy text-white lg:block">
        <div className="container-x flex h-9 items-center justify-between text-[0.78rem]">
          <p className="text-white/80">
            Track your brand across ChatGPT, Perplexity, Claude, Gemini, Grok and Google AI Mode.
          </p>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5 text-white/80">
              <span className="text-accent" aria-hidden="true">★★★★★</span>
              4.9/5 from 380+ reviews
            </span>
            <a href={`tel:${brand.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-1.5 font-semibold hover:text-brand-200">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {brand.phone}
            </a>
          </div>
        </div>
      </div>

      <div className="container-x flex h-[74px] items-center justify-between gap-4">
        <Logo />

        <nav className="hidden lg:flex lg:items-center lg:gap-1" aria-label="Main">
          {NAV.map((item) => {
            const hasMenu = 'columns' in item && !!item.columns;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => { cancelClose(); if (hasMenu) setOpenMenu(item.label); }}
                onMouseLeave={scheduleClose}
              >
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-3.5 py-2 text-[0.9375rem] font-semibold transition-colors',
                    active ? 'text-brand' : 'text-ink hover:text-brand',
                  )}
                  aria-expanded={hasMenu ? openMenu === item.label : undefined}
                  aria-haspopup={hasMenu || undefined}
                  onFocus={() => hasMenu && setOpenMenu(item.label)}
                >
                  {item.label}
                  {hasMenu && (
                    <ChevronDown
                      className={cn('h-3.5 w-3.5 transition-transform', openMenu === item.label && 'rotate-180')}
                      aria-hidden="true"
                    />
                  )}
                </Link>

                {hasMenu && openMenu === item.label && (
                  <div
                    className="absolute left-1/2 top-full z-50 w-[min(58rem,90vw)] -translate-x-1/2 pt-3"
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                  >
                    <div className="animate-fade-up overflow-hidden rounded-2xl bg-white p-2 shadow-lift ring-1 ring-line">
                      <div className="grid gap-1 p-4 sm:grid-cols-2 lg:grid-cols-3">
                        {item.columns!.map((col) => (
                          <div key={col.heading}>
                            <p className="px-3 pb-2 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-body/60">
                              {col.heading}
                            </p>
                            <ul>
                              {col.links.map((link) => (
                                <li key={link.href}>
                                  <Link
                                    href={link.href}
                                    className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-brand-50"
                                  >
                                    <span className="block text-[0.9rem] font-semibold text-ink">{link.label}</span>
                                    <span className="block text-[0.8rem] leading-snug text-body">{link.desc}</span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-alt px-5 py-3.5">
                        <p className="text-[0.85rem] text-body">
                          Not sure where you stand? Run a free visibility check in 60 seconds.
                        </p>
                        <Link href="/tools/ai-visibility-check" className="btn btn-sm btn-primary shrink-0">
                          Check my brand
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="text-[0.9375rem] font-semibold text-ink hover:text-brand">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-md btn-accent">
            Start free trial
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-line lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div id="mobile-nav" className="max-h-[calc(100vh-74px)] overflow-y-auto border-t border-line bg-white lg:hidden">
          <nav className="container-x py-4" aria-label="Mobile">
            {NAV.map((item) => (
              <div key={item.label} className="border-b border-line py-2 last:border-0">
                <Link href={item.href} className="block py-2 font-heading text-lg font-bold text-ink">
                  {item.label}
                </Link>
                {'columns' in item && item.columns && (
                  <div className="pb-2">
                    {item.columns.map((col) => (
                      <div key={col.heading} className="pt-2">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-body/60">{col.heading}</p>
                        <ul className="mt-1">
                          {col.links.map((l) => (
                            <li key={l.href}>
                              <Link href={l.href} className="block py-1.5 text-[0.95rem] text-body hover:text-brand">
                                {l.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-4 flex flex-col gap-2.5 pb-4">
              <Link href="/signup" className="btn btn-md btn-accent w-full">Start free trial</Link>
              <Link href="/login" className="btn btn-md btn-ghost w-full">Log in</Link>
              <a href={`tel:${brand.phone.replace(/[^+\d]/g, '')}`} className="mt-1 text-center text-sm font-semibold text-brand">
                {brand.phone}
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
