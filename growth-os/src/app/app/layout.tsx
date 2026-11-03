import { requireStaffPage } from "@/lib/auth";
import { workspacesForUser } from "@/lib/session";
import { AppShell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaffPage();
  const workspaces = await workspacesForUser(ctx.userId);
  return <AppShell ctx={ctx} workspaces={workspaces}>{children}</AppShell>;
}
