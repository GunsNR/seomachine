import Link from "next/link";
import { LogOut } from "lucide-react";
import { requirePortalPage } from "@/lib/auth";
import { logoutAction } from "../session-actions";
import { PortalTabs } from "./tabs";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortalPage();
  return (
    <div className="min-h-dvh">
      <header className="on-dark bg-rail text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{ctx.workspace.name}</p><p className="text-2xs text-rail-muted">Results portal · prepared by Rank Logic{ctx.workspace.isFixture ? " · Demo data" : ""}</p></div>
          <div className="flex items-center gap-2">
            {ctx.role !== "client" ? <Link href="/app" className="text-2xs text-rail-ink underline">Back to app</Link> : null}
            <form action={logoutAction}><button className="flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-ctl px-2 text-2xs text-rail-ink hover:bg-rail-2" type="submit"><LogOut aria-hidden className="h-4 w-4" />Sign out</button></form>
          </div>
        </div>
        <PortalTabs />
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  );
}
