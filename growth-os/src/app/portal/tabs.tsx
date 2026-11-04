"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [{ href: "/portal", label: "Leads to confirm" }, { href: "/portal/approvals", label: "Approvals" }, { href: "/portal/report", label: "Report" }];

export function PortalTabs() {
  const p = usePathname();
  return (
    <nav aria-label="Portal" className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2">
      {TABS.map((t) => { const on = p === t.href; return <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={clsx("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm", on ? "border-accent font-medium text-white" : "border-transparent text-rail-muted hover:text-white")}>{t.label}</Link>; })}
    </nav>
  );
}
