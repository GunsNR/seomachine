'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3, FileText, LayoutDashboard, Link2, LogOut, Menu, Plug, Quote,
  CreditCard, Search, ShieldCheck, Sparkles, UserCircle, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LogoMark } from '@/components/site/Logo';

const NAV = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/app/ai-visibility', label: 'AI Visibility', icon: Sparkles },
  { href: '/app/citations', label: 'Citations', icon: Quote },
  { href: '/app/keywords', label: 'Keywords', icon: Search },
  { href: '/app/rankings', label: 'Rankings', icon: BarChart3 },
  { href: '/app/backlinks', label: 'Backlinks', icon: Link2 },
  { href: '/app/audit', label: 'Site Audit', icon: ShieldCheck },
  { href: '/app/content', label: 'Content', icon: FileText },
  { href: '/app/leads', label: 'Leads', icon: Users },
  { href: '/app/settings', label: 'Settings', icon: Plug },
  { href: '/app/account', label: 'Account', icon: UserCircle },
  { href: '/app/billing', label: 'Billing', icon: CreditCard },
];

export function Sidebar({ userName, projectName }: { userName: string; projectName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav className="flex-1 space-y-1 px-3" aria-label="Dashboard">
      {NAV.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9rem] font-semibold transition-colors',
              active ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/6 hover:text-white',
            )}
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-[0.8rem] font-semibold text-white">{userName}</p>
      <p className="mt-0.5 truncate text-[0.75rem] text-white/50">{projectName}</p>
      <form action="/api/auth/logout" method="post" className="mt-3">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[0.82rem] font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <Link href="/app" className="flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="font-heading text-[0.95rem] font-extrabold text-ink">SuperTool</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-line"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div id="app-sidebar" className="border-b border-white/10 bg-navy py-4 lg:hidden">
          {nav}
          {footer}
        </div>
      )}

      {/* Desktop rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-navy lg:sticky lg:top-0 lg:flex lg:h-screen">
        <Link href="/app" className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark className="h-9 w-9" />
          <span className="flex flex-col leading-none">
            <span className="font-heading text-[0.98rem] font-extrabold text-white">Rank Logic</span>
            <span className="text-[0.63rem] font-bold uppercase tracking-[0.2em] text-brand-300">SuperTool</span>
          </span>
        </Link>
        {nav}
        {footer}
      </aside>
    </>
  );
}
