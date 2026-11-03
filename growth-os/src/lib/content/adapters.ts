/**
 * Publishing adapters. Only "manual" and "dry_run" exist in this build. No
 * real provider is wired or claimed: a destination is "connected" only after
 * an authorized live round trip is recorded (replica/feature-matrix.md).
 */

export type PublishRequest = { idempotencyKey: string; platform: string; caption: string; assetUrl?: string };
export type PublishResponse =
  | { kind: "accepted"; providerRef: string; publishedUrl?: string }
  | { kind: "rejected"; reason: string; permanent: boolean }
  | { kind: "timeout" };

export interface PublishAdapter {
  name: string;
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

export function adapterFor(name: string): PublishAdapter | null {
  if (name === "dry_run") return dryRunAdapter;
  return null; // manual or unknown → manual handoff
}

export function livePublishingEnabled(): boolean {
  return process.env.LIVE_PUBLISHING_ENABLED === "true";
}
