"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { CalendarCheck2, FileText, Globe, LineChart, MoreHorizontal, Search, Settings, Sun, Users } from "lucide-react";

export const NAV = [
  { href: "/app", label: "Today", icon: Sun, exact: true },
  { href: "/app/crm", label: "CRM", icon: Users },
  { href: "/app/content", label: "Content", icon: CalendarCheck2 },
  { href: "/app/websites", label: "Websites", icon: Globe },
  { href: "/app/seo", label: "SEO", icon: Search },
  { href: "/app/reports", label: "Reports", icon: LineChart },
  { href: "/app/settings", label: "Settings", icon: Settings },
] as const;

function active(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

export function RailNav() {
  const path = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const on = active(path, n.href, "exact" in n ? n.exact : false);
        return (
          <li key={n.href}>
            <Link href={n.href} aria-current={on ? "page" : undefined}
              className={clsx("group relative flex min-h-[40px] items-center gap-3 rounded-ctl px-3 text-sm", on ? "bg-rail-2 font-medium text-white" : "text-rail-ink hover:bg-rail-2 hover:text-white")}>
              {on ? <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" /> : null}
              <n.icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="lg:inline md:sr-only lg:not-sr-only">{n.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const MOBILE = [NAV[0], NAV[1], NAV[2], NAV[4]];

export function BottomTabs() {
  const path = usePathname();
  const moreOn = ["/app/websites", "/app/reports", "/app/settings", "/app/more"].some((h) => path.startsWith(h));
  return (
    <nav aria-label="Main" className="on-dark fixed inset-x-0 bottom-0 z-30 border-t border-rail-2 bg-rail pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {MOBILE.map((n) => {
          const on = active(path, n.href, "exact" in n ? n.exact : false);
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={on ? "page" : undefined} className={clsx("flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-2xs", on ? "text-white" : "text-rail-muted")}>
                <n.icon aria-hidden className={clsx("h-5 w-5", on && "text-accent")} strokeWidth={1.75} />
                {n.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/app/more" aria-current={moreOn ? "page" : undefined} className={clsx("flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-2xs", moreOn ? "text-white" : "text-rail-muted")}>
            <MoreHorizontal aria-hidden className={clsx("h-5 w-5", moreOn && "text-accent")} strokeWidth={1.75} />
            More
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export { FileText };
