import Link from "next/link";
import { ChevronsUpDown, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import type { Ctx } from "@/lib/session";
import { BottomTabs, RailNav } from "./nav";
import { switchWorkspaceAction, logoutAction } from "@/app/session-actions";

type WsItem = { id: string; name: string; kind: string; role: string; isFixture: boolean };

export function AppShell({ ctx, workspaces, children }: { ctx: Ctx; workspaces: WsItem[]; children: ReactNode }) {
  const kindLabel = ctx.workspace.kind === "agency" ? "Your agency" : "Client";
  return (
    <div className="min-h-dvh md:pl-16 lg:pl-56">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
      <aside className="on-dark fixed inset-y-0 left-0 z-20 hidden w-16 flex-col bg-rail px-2 py-3 md:flex lg:w-56 lg:px-3">
        <div className="mb-4 flex items-center gap-2 px-1.5 lg:px-2">
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-ctl bg-accent text-[13px] font-bold text-rail">RL</span>
          <span className="hidden text-sm font-semibold text-white lg:inline">Growth OS</span>
        </div>
        <WorkspaceSwitcher ctx={ctx} workspaces={workspaces} kindLabel={kindLabel} />
        <nav aria-label="Main" className="mt-3 flex-1"><RailNav /></nav>
        <form action={logoutAction} className="mt-2">
          <button className="flex min-h-[40px] w-full items-center gap-3 rounded-ctl px-3 text-sm text-rail-muted hover:bg-rail-2 hover:text-white" type="submit">
            <LogOut aria-hidden className="h-4 w-4" strokeWidth={1.75} /><span className="md:sr-only lg:not-sr-only">Sign out</span>
          </button>
        </form>
      </aside>

      <header className="on-dark sticky top-0 z-20 flex items-center justify-between gap-3 bg-rail px-4 py-2.5 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{ctx.workspace.name}</p>
          <p className="text-2xs text-rail-muted">{kindLabel}{ctx.workspace.isFixture ? " · Demo data" : ""}</p>
        </div>
        <Link href="/app/more" className="rounded-ctl border border-rail-2 px-2.5 py-1.5 text-2xs text-rail-ink">Switch</Link>
      </header>

      {ctx.workspace.pausedAt ? (
        <div role="status" className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-xs font-medium text-warn">
          Workspace paused — no follow-ups, messages or posts will go out. <Link className="link" href="/app/settings#pause">Resume in Settings</Link>
        </div>
      ) : null}

      <main id="main" className="mx-auto max-w-content px-4 pb-24 pt-5 sm:px-6 md:pb-10 lg:px-8 lg:pt-7">{children}</main>
      <BottomTabs />
    </div>
  );
}

function WorkspaceSwitcher({ ctx, workspaces, kindLabel }: { ctx: Ctx; workspaces: WsItem[]; kindLabel: string }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-ctl border border-rail-2 px-2 py-2 text-left hover:bg-rail-2 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-ctl bg-rail-2 text-2xs font-semibold text-rail-ink">{ctx.workspace.name.slice(0, 2).toUpperCase()}</span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-xs font-semibold text-white">{ctx.workspace.name}</span>
          <span className="block truncate text-2xs text-rail-muted">{kindLabel}{ctx.workspace.isFixture ? " · Demo data" : ""}</span>
        </span>
        <ChevronsUpDown aria-hidden className="hidden h-4 w-4 text-rail-muted lg:block" />
        <span className="sr-only">Switch workspace. Current: {ctx.workspace.name}</span>
      </summary>
      <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-panel border border-line bg-surface p-1.5 text-ink shadow-lg">
        <p className="px-2 py-1 text-2xs text-ink-2">Switch workspace</p>
        <WorkspaceList ctx={ctx} workspaces={workspaces} />
      </div>
    </details>
  );
}

export function WorkspaceList({ ctx, workspaces }: { ctx: Ctx; workspaces: WsItem[] }) {
  return (
    <ul>
      {workspaces.map((w) => (
        <li key={w.id}>
          <form action={switchWorkspaceAction}>
            <input type="hidden" name="workspaceId" value={w.id} />
            <button type="submit" aria-current={w.id === ctx.workspace.id ? "true" : undefined}
              className="flex w-full items-center justify-between gap-2 rounded-ctl px-2 py-2 text-left text-sm hover:bg-canvas aria-[current]:bg-canvas aria-[current]:font-medium">
              <span className="min-w-0 truncate">{w.name}</span>
              <span className="shrink-0 text-2xs text-ink-2">{w.kind === "agency" ? "Agency" : w.role === "client" ? "Portal" : "Client"}{w.isFixture ? " · demo" : ""}</span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
