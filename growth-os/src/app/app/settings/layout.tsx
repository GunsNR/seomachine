import { requireStaffPage } from "@/lib/auth";
import { SettingsNav } from "./nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaffPage();
  return <><SettingsNav agency={ctx.workspace.kind === "agency"} />{children}</>;
}
