import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { PermissionError } from "./rbac";

/**
 * Run a mutation and come back to `to` with a plain-language flash message.
 * Unexpected errors are not shown verbatim (they may contain internals); known
 * domain errors are, because they are written for people.
 */
export async function runAction(to: string, fn: () => Promise<string | void | { ok?: string; to?: string }>): Promise<never> {
  let ok: string | void = undefined;
  let error: string | null = null;
  try {
    const r = await fn();
    if (r && typeof r === "object") { ok = r.ok; if (r.to) to = r.to; } else ok = r;
  } catch (e) {
    const named = e instanceof Error ? e.name : "";
    if (e instanceof PermissionError) error = e.message;
    else if (e instanceof ZodError) error = `Check these fields: ${e.issues.map((i) => i.path.join(".") || i.message).slice(0, 4).join(", ")}.`;
    // Allowlist: domain errors are written for people; anything else (Prisma, tenant guard, runtime) is not shown.
    else if (e instanceof Error && USER_FACING.has(named) && /^[A-Z“"].{4,600}$/s.test(e.message) && !/prisma|invocation|constraint|SELECT |workspaceId/i.test(e.message)) error = e.message;
    else {
      console.error("[action]", e instanceof Error ? e.message.slice(0, 300) : e);
      error = "Something went wrong saving that. Nothing was changed. Try again, and if it keeps happening, check Settings → System health.";
    }
  }
  revalidatePath(to.split("?")[0]!);
  const sep = to.includes("?") ? "&" : "?";
  redirect(error ? `${to}${sep}error=${encodeURIComponent(error)}` : ok ? `${to}${sep}ok=${encodeURIComponent(ok)}` : to);
}

const USER_FACING = new Set(["Error", "DomainError", "StaleVersionError", "PatchError", "FetchBlockedError", "ContentError"]);

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "yes" || f.get(k) === "true";
/** Only allow same-site relative return paths. */
export const back = (f: FormData, fallback: string) => {
  const r = str(f, "returnTo");
  return r.startsWith("/") && !r.startsWith("//") ? r.replace(/[?&](ok|error)=[^&]*/g, "") : fallback;
};
