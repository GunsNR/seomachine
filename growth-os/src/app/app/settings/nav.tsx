"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

export function SettingsNav({ agency }: { agency: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/app/settings", label: "General" },
    { href: "/app/settings/brand", label: "Brand profile" },
    { href: "/app/settings/destinations", label: "Destinations" },
    { href: "/app/settings/pipeline", label: "Pipeline" },
    { href: "/app/settings/workflows", label: "Workflows" },
    { href: "/app/settings/integrations", label: "Integrations" },
    ...(agency ? [{ href: "/app/settings/clients", label: "Clients" }] : []),
  ];
  return (
    <nav aria-label="Settings sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((i) => {
        const on = i.href === "/app/settings" ? path === i.href : path.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={clsx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", on ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink")}>{i.label}</Link>;
      })}
    </nav>
  );
}
