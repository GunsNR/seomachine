import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { systemDb } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth";
import { Notice } from "@/components/ui";

export const metadata = { title: "Accept invitation" };

async function accept(f: FormData) {
  "use server";
  const token = String(f.get("token") ?? "");
  const t = await systemDb.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!t || t.kind !== "invite" || t.usedAt || t.expiresAt < new Date() || !t.workspaceId) redirect(`/invite/${encodeURIComponent(token)}?error=expired`);
  const name = String(f.get("name") ?? "").trim().slice(0, 80);
  const pw = String(f.get("password") ?? "");
  if (pw.length < 12 || !name) redirect(`/invite/${encodeURIComponent(token)}?error=weak`);
  // An invite for an email that already has an account never creates a session on its own:
  // the person must prove they own that account with its existing password.
  const existing = await systemDb.user.findUnique({ where: { email: t.email } });
  if (existing && !(await bcrypt.compare(pw, existing.passwordHash))) redirect(`/invite/${encodeURIComponent(token)}?error=existing`);
  const claimed = await systemDb.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) redirect(`/invite/${encodeURIComponent(token)}?error=expired`);
  const user = existing ?? (await systemDb.user.create({ data: { email: t.email, name, passwordHash: await bcrypt.hash(pw, 12) } }));
  await systemDb.membership.upsert({ where: { userId_workspaceId: { userId: user.id, workspaceId: t.workspaceId } }, create: { userId: user.id, workspaceId: t.workspaceId, role: t.role }, update: { role: t.role, revokedAt: null } });
  const s = await createSession(user.id, t.workspaceId);
  await setSessionCookie(s.token, s.expiresAt);
  redirect(t.role === "client" ? "/portal" : "/app");
}

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const t = await systemDb.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  const valid = t && t.kind === "invite" && !t.usedAt && t.expiresAt > new Date();
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <form action={accept} className="panel w-full max-w-sm p-5">
        <h1 className="mb-3 text-lg font-semibold">Join Growth OS</h1>
        {!valid || error === "expired" ? <Notice tone="bad" title="This invitation has expired or was already used">Ask the person who invited you for a new link.</Notice> : <>
          {error === "weak" ? <div className="mb-3"><Notice tone="bad" title="Add your name and a password of at least 12 characters" /></div> : null}
          {error === "existing" ? <div className="mb-3"><Notice tone="bad" title="This email already has an account">Enter that account’s current password to add this workspace to it.</Notice></div> : null}
          <p className="mb-3 text-sm text-ink-2">For {t.email}</p>
          <input type="hidden" name="token" value={token} />
          <label className="label" htmlFor="name">Your name</label><input id="name" name="name" required className="field mb-3" autoComplete="name" />
          <label className="label" htmlFor="password">Password (12+ characters — or your existing password if you already have an account)</label><input id="password" name="password" type="password" minLength={12} required className="field mb-4" autoComplete="new-password" />
          <button className="btn-primary w-full" type="submit">Join</button>
        </>}
      </form>
    </main>
  );
}
