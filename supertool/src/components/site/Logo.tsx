import Link from 'next/link';
import { brand } from '../../../brand.config';

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" role="presentation">
      <defs>
        <linearGradient id="stmark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={brand.colors.primary} />
          <stop offset="100%" stopColor={brand.colors.navy} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#stmark)" />
      {/* Three ascending bars — the rank climb — with a citation spark. */}
      <rect x="9" y="22" width="5" height="9" rx="2" fill="#fff" opacity=".72" />
      <rect x="17.5" y="16" width="5" height="15" rx="2" fill="#fff" opacity=".88" />
      <rect x="26" y="9" width="5" height="22" rx="2" fill="#fff" />
      <circle cx="28.5" cy="9.5" r="4.6" fill={brand.colors.accent} stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label={`${brand.name} home`}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className={`font-heading text-[1.0625rem] font-extrabold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
          Rank Logic
        </span>
        <span className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-brand">
          SuperTool
        </span>
      </span>
    </Link>
  );
}
