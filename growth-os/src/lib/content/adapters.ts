/**
 * Publishing adapters. Only "manual" and "dry_run" exist in this build. No
 * real provider is wired or claimed: a destination is "connected" only after
 * an authorized live round trip is recorded (replica/feature-matrix.md).
 */

export type PublishRequest = { idempotencyKey: string; platform: string; caption: string; assetUrl?: string; scheduleAt?: Date | null };
export type PublishResponse =
  | { kind: "accepted"; providerRef: string; publishedUrl?: string }
  | { kind: "rejected"; reason: string; permanent: boolean }
  | { kind: "timeout" };

export interface PublishAdapter {
  name: string;
  /** May a not-found lookup after an ambiguous result be retried? Only when lookup is authoritative. */
  safeToRetryWhenNotFound: boolean;
  publish(req: PublishRequest): Promise<PublishResponse>;
  /** Look up whether a request with this idempotency key was already accepted. */
  lookup(idempotencyKey: string): Promise<{ found: boolean; providerRef?: string; publishedUrl?: string }>;
}

/**
 * Dry-run adapter: a deterministic in-database simulation used for tests and
 * the local walkthrough. Every row it touches is labelled "Dry run — nothing
 * was posted". Fault injection via caption markers lets the acceptance tests
 * exercise rejection and the timeout-after-acceptance case.
 */
const accepted = new Map<string, { providerRef: string; publishedUrl: string }>();

export const dryRunAdapter: PublishAdapter = {
  name: "dry_run",
  safeToRetryWhenNotFound: true,
  async publish(req) {
    if (req.caption.includes("[[fail]]")) return { kind: "rejected", reason: "Dry run: provider rejected the media format.", permanent: true };
    const providerRef = `dry_${req.idempotencyKey.slice(-12)}`;
    const rec = { providerRef, publishedUrl: `https://dry-run.invalid/${req.platform}/${providerRef}` };
    accepted.set(req.idempotencyKey, rec);
    // Simulates the provider accepting the post but the response being lost.
    if (req.caption.includes("[[timeout]]")) return { kind: "timeout" };
    return { kind: "accepted", ...rec };
  },
  async lookup(key) {
    const r = accepted.get(key);
    return r ? { found: true, ...r } : { found: false };
  },
};

/**
 * Resolve the adapter for a destination. Real providers also need the
 * LIVE_PUBLISHING_ENABLED switch; without it they fall back to manual hand-off.
 */
export async function adapterFor(dest: { adapter: string; providerAccountId?: string }, workspaceId: string): Promise<{ adapter: PublishAdapter | null; reason: string }> {
  if (dest.adapter === "dry_run") return { adapter: dryRunAdapter, reason: "" };
  if (dest.adapter === "contentstudio") {
    if (!livePublishingEnabled()) return { adapter: null, reason: "Live publishing is off (LIVE_PUBLISHING_ENABLED). Download the post package and publish by hand, or ask the owner to approve live publishing." };
    const { contentStudioAdapter } = await import("../integrations/contentstudio");
    const a = await contentStudioAdapter(workspaceId, dest.providerAccountId ?? "");
    return a ? { adapter: a, reason: "" } : { adapter: null, reason: "ContentStudio isn't connected. Reconnect it in Settings → Integrations, or publish by hand." };
  }
  return { adapter: null, reason: "No verified publishing connection. Download the post package and publish by hand." };
}

export function livePublishingEnabled(): boolean {
  return process.env.LIVE_PUBLISHING_ENABLED === "true";
}
