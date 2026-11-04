import dns from "dns/promises";
import { redact } from "../crypto";
import { loadCredential, setStatus, timedFetch } from "./store";

/**
 * Resend email sender.
 * Verified 2026-11-03 against resend.com/docs: `POST https://api.resend.com/emails`
 * with `Authorization: Bearer`, `Idempotency-Key` header supported;
 * `GET /domains` returns `{ data: [{ name, status }] }`.
 * The sender is "connected" only when Resend reports the From domain as
 * `verified` AND the domain publishes a DMARC record.
 */
export function resendBase() {
  return (process.env.RESEND_API_BASE || "https://api.resend.com").replace(/\/$/, "");
}

export function domainOf(from: string): string {
  const m = /<?([^<>\s@]+)@([^<>\s]+?)>?$/.exec(from.trim());
  return m ? m[2]!.toLowerCase() : "";
}

async function hasDmarc(domain: string): Promise<boolean> {
  if (process.env.EMAIL_SKIP_DNS_CHECK === "true") return true; // tests only
  try {
    const recs = await dns.resolveTxt(`_dmarc.${domain}`);
    return recs.some((r) => r.join("").toLowerCase().startsWith("v=dmarc1"));
  } catch {
    return false;
  }
}

export async function verifySender(workspaceId: string): Promise<{ ok: boolean; message: string }> {
  const cred = await loadCredential(workspaceId, "email_sender");
  if (!cred) return { ok: false, message: "Add an API key and From address first." };
  const from = String(cred.meta.from ?? "");
  const domain = domainOf(from);
  if (!domain) return { ok: false, message: "The From address doesn't look right (e.g. Harbor Line <hello@harborline.com>)." };
  const r = await timedFetch(`${resendBase()}/domains`, { headers: { authorization: `Bearer ${cred.secret}` }, timeoutMs: 10000 });
  if (r.kind !== "response" || !r.res.ok) {
    await setStatus(workspaceId, "email_sender", "error", "Couldn't reach Resend or key rejected.");
    return { ok: false, message: r.kind === "response" && (r.res.status === 401 || r.res.status === 403) ? "Resend rejected the key." : "Couldn't reach Resend. Try again." };
  }
  const body = (await r.res.json().catch(() => null)) as { data?: { name?: string; status?: string }[] } | null;
  const d = body?.data?.find((x) => x.name?.toLowerCase() === domain);
  const checks = { domainListed: !!d, providerVerified: d?.status === "verified", dmarc: await hasDmarc(domain) };
  const ok = checks.domainListed && checks.providerVerified && checks.dmarc;
  const why = !checks.domainListed ? `${domain} isn't added in Resend yet.` : !checks.providerVerified ? `Resend shows ${domain} as “${d?.status}”. Finish its DNS steps (SPF/DKIM).` : !checks.dmarc ? `${domain} has no DMARC record. Add a TXT record at _dmarc.${domain}.` : "";
  await setStatus(workspaceId, "email_sender", ok ? "connected" : "error", ok ? `Verified ${new Date().toISOString().slice(0, 10)}` : why, { ...cred.meta, checks, checkedAt: new Date().toISOString() });
  return { ok, message: ok ? `Sender verified for ${domain}. Live sending still needs LIVE_SENDING_ENABLED and your approval.` : why };
}

export type SendResult = { kind: "sent"; providerRef: string } | { kind: "rejected"; reason: string } | { kind: "unknown" };

export async function sendEmail(workspaceId: string, msg: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<SendResult> {
  const cred = await loadCredential(workspaceId, "email_sender");
  if (!cred || cred.integration.status !== "connected") return { kind: "rejected", reason: "No verified sender." };
  const text = `${msg.text}\n\n—\nIf you'd rather not get these emails, reply "stop" and we'll take you off the list.`;
  const r = await timedFetch(`${resendBase()}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${cred.secret}`, "content-type": "application/json", "idempotency-key": msg.idempotencyKey.slice(0, 256) },
    body: JSON.stringify({ from: String(cred.meta.from), to: [msg.to], subject: msg.subject || "Following up", text, reply_to: cred.meta.replyTo ? String(cred.meta.replyTo) : undefined }),
    timeoutMs: 15000,
  });
  if (r.kind !== "response") return { kind: "unknown" };
  const json = (await r.res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (r.res.ok && json?.id) return { kind: "sent", providerRef: json.id };
  if (r.res.status === 401 || r.res.status === 403) await setStatus(workspaceId, "email_sender", "expired", "Key rejected while sending.");
  if (r.res.status >= 500) return { kind: "unknown" };
  return { kind: "rejected", reason: redact(`Resend refused: ${json?.message ?? r.res.status}`) };
}
