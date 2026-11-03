import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { systemDb } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { revokeUserSessions } from "@/lib/session";
import { Notice } from "@/components/ui";

export const metadata = { title: "Reset password" };

async function reset(f: FormData) {
  "use server";
  const token = String(f.get("token") ?? "");
  const pw = String(f.get("password") ?? "");
  const t = await systemDb.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!t || t.kind !== "reset" || t.usedAt || t.expiresAt < new Date()) redirect(`/reset/${encodeURIComponent(token)}?error=expired`);
  if (pw.length < 12) redirect(`/reset/${encodeURIComponent(token)}?error=weak`);
  const claimed = await systemDb.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) redirect(`/reset/${encodeURIComponent(token)}?error=expired`);
  const user = await systemDb.user.update({ where: { email: t.email }, data: { passwordHash: await bcrypt.hash(pw, 12) } });
  await revokeUserSessions(user.id, "password-reset");
  redirect("/login?error=" + encodeURIComponent("Password changed. Sign in with your new password."));
}

export default async function Reset({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <form action={reset} className="panel w-full max-w-sm p-5">
        <h1 className="mb-3 text-lg font-semibold">Choose a new password</h1>
        {error === "expired" ? <div className="mb-3"><Notice tone="bad" title="This link has expired or was already used" /></div> : error === "weak" ? <div className="mb-3"><Notice tone="bad" title="Use at least 12 characters" /></div> : null}
        <input type="hidden" name="token" value={token} />
        <label className="label" htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={12} required className="field mb-4" autoComplete="new-password" />
        <button className="btn-primary w-full" type="submit">Save password</button>
        <p className="hint mt-2">Saving signs you out everywhere else.</p>
      </form>
    </main>
  );
}
