import Link from "next/link";
import { Globe, LineChart, Settings } from "lucide-react";
import { requireStaffPage } from "@/lib/auth";
import { workspacesForUser } from "@/lib/session";
import { WorkspaceList } from "@/components/shell";
import { Section } from "@/components/ui";

export const metadata = { title: "More" };

/** Mobile overflow menu: the remaining navigation plus the workspace switcher. */
export default async function More() {
  const ctx = await requireStaffPage();
  const ws = await workspacesForUser(ctx.userId);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">More</h1>
      <Section title="Go to">
        <ul className="divide-y divide-line">{[{ href: "/app/websites", label: "Websites", icon: Globe }, { href: "/app/reports", label: "Reports", icon: LineChart }, { href: "/app/settings", label: "Settings", icon: Settings }].map((n) => <li key={n.href}><Link href={n.href} className="flex min-h-[48px] items-center gap-3 px-4 hover:bg-canvas"><n.icon aria-hidden className="h-4 w-4 text-ink-2" />{n.label}</Link></li>)}</ul>
      </Section>
      <Section title="Switch workspace"><div className="p-2"><WorkspaceList ctx={ctx} workspaces={ws} /></div></Section>
    </div>
  );
}
