"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str } from "@/lib/actions";
import { disconnect, saveCredential } from "@/lib/integrations/store";
import { testContentStudio } from "@/lib/integrations/contentstudio";
import { verifySender, domainOf } from "@/lib/integrations/email";
import { importGscCsv } from "@/lib/integrations/gsc";
import { parseLocalInput } from "@/lib/time";

const actor = (c: { workspace: { id: string }; userId: string }) => ({ workspaceId: c.workspace.id, userId: c.userId });
const TO = "/app/settings/integrations";

export async function contentStudioAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction(TO, async () => {
    const key = str(f, "apiKey");
    if (!/^cs_[A-Za-z0-9_-]{8,}$/.test(key)) throw new Error("That doesn't look like a ContentStudio key (they start with cs_).");
    const csWorkspaceId = str(f, "csWorkspaceId");
    if (!csWorkspaceId) throw new Error("Add the ContentStudio workspace ID.");
    await saveCredential(actor(ctx), "contentstudio", key, { csWorkspaceId });
    const r = await testContentStudio(ctx.workspace.id);
    if (!r.ok) throw new Error(`Saved, but the test failed: ${r.message}`);
    return r.message;
  });
}

export async function testContentStudioAction() {
  const ctx = await requirePermission("settings.manage");
  await runAction(TO, async () => { const r = await testContentStudio(ctx.workspace.id); if (!r.ok) throw new Error(r.message); return r.message; });
}

export async function emailAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction(TO, async () => {
    const key = str(f, "apiKey");
    if (!/^re_[A-Za-z0-9_-]{8,}$/.test(key)) throw new Error("That doesn't look like a Resend key (they start with re_).");
    const from = str(f, "from");
    if (!domainOf(from)) throw new Error("Enter a From address like: Harbor Line <hello@harborline.com>");
    await saveCredential(actor(ctx), "email_sender", key, { from, replyTo: str(f, "replyTo") });
    const r = await verifySender(ctx.workspace.id);
    if (!r.ok) throw new Error(`Saved, but not ready to send: ${r.message}`);
    return r.message;
  });
}

export async function verifyEmailAction() {
  const ctx = await requirePermission("settings.manage");
  await runAction(TO, async () => { const r = await verifySender(ctx.workspace.id); if (!r.ok) throw new Error(r.message); return r.message; });
}

export async function disconnectAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction(TO, async () => { await disconnect(actor(ctx), str(f, "provider")); return "Disconnected and the stored key was deleted."; });
}

export async function gscImportAction(f: FormData) {
  const ctx = await requirePermission("seo.write");
  await runAction(TO, async () => {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose the CSV you exported from Search Console.");
    if (file.size > 5_000_000) throw new Error("That file is over 5 MB.");
    const tz = ctx.workspace.timezone;
    const r = await importGscCsv(actor(ctx), { property: str(f, "property"), periodStart: parseLocalInput(`${str(f, "start")}T00:00`, tz), periodEnd: parseLocalInput(`${str(f, "end")}T23:59`, tz), csv: await file.text() });
    return `Imported ${r.rows} ${r.kind} rows${r.skipped ? ` (${r.skipped} unreadable rows skipped)` : ""}. SEO findings now show impressions for matching pages.`;
  });
}
