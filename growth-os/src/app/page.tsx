import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { isStaff } from "@/lib/rbac";

export default async function Home() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  redirect(isStaff(ctx.role) ? "/app" : "/portal");
}
