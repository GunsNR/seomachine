import { systemDb } from "@/lib/db";
import { intakeLead } from "@/lib/crm/intake";
import { touchFromRequest } from "@/lib/attribution";
import { hit } from "@/lib/rate-limit";
import { sha256 } from "@/lib/crypto";
import { esc } from "@/lib/site/render";
import { ThemeSchema } from "@/lib/brand";
import { requestOrigin } from "@/app/lib-origin";

export const dynamic = "force-dynamic";

function page(theme: { primary: string; ink: string; surface: string }, title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:${theme.surface};color:${theme.ink};display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}main{max-width:520px}a{color:${theme.primary};font-weight:600}</style></head><body><main><h1>${esc(title)}</h1><p>${body}</p></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
}

/**
 * Public lead capture. Abuse controls: same-origin check, honeypot field,
 * per-IP and per-site rate limits, field validation, size cap. Idempotent on
 * the key the page generates, so double-submits and retries create one lead.
 */
export async function POST(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site: slug } = await params;
  const site = await systemDb.site.findUnique({ where: { slug } });
  if (!site) return new Response("Not found", { status: 404 });
  const theme = ThemeSchema.parse(site.theme);
  const back = `/s/${site.slug}`;
  const origin = req.headers.get("origin");
  if (origin && origin !== (await requestOrigin())) return page(theme, "Couldn't send that", "This form can only be sent from its own page.", 403);
  if (Number(req.headers.get("content-length") ?? 0) > 20_000) return page(theme, "Couldn't send that", "That message is too long.", 413);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await hit(`form:${site.id}:${sha256(ip)}`, 8, 10 * 60_000)) || !(await hit(`form:${site.id}`, 300, 60 * 60_000))) {
    return page(theme, "Please try again shortly", `We've had a lot of requests. Wait a few minutes, or call us. <a href="${esc(back)}">Back</a>`, 429);
  }
  const f = await req.formData();
  const s = (k: string) => String(f.get(k) ?? "").slice(0, 4000);
  // Honeypot: real people never see this field. Respond as if it worked, store nothing.
  if (s("company_website")) return page(theme, "Thanks — we got it", `We'll be in touch soon. <a href="${esc(back)}">Back to the site</a>`);
  const key = s("idempotencyKey");
  if (!/^[A-Za-z0-9._-]{8,80}$/.test(key)) return page(theme, "Couldn't send that", `Please reload the page and try again. <a href="${esc(back)}">Back</a>`, 400);
  const landing = s("landingPage");
  const r = await intakeLead({
    workspaceId: site.workspaceId, formKey: `site:${site.slug}`, idempotencyKey: `web:${key}`, channel: "form",
    input: { firstName: s("firstName"), lastName: s("lastName"), email: s("email"), phone: s("phone"), service: s("service"), message: s("message"), consentEmail: s("consentEmail") === "yes", consentWording: s("consentWording") },
    touch: touchFromRequest({ landingPage: landing.startsWith("http") ? landing : undefined, referrer: s("referrer") || undefined }),
  });
  if (r.outcome === "rejected") return page(theme, "Almost there", `${esc(r.reason ?? "Please check the form.")} <a href="${esc(back)}#request">Go back to the form</a>`, 422);
  return page(theme, "Thanks — we got it", `We'll be in touch soon. If it's urgent, call us. <a href="${esc(back)}">Back to the site</a>`);
}
