import type { Tone } from "@/components/ui";

export const PIECE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" }, in_review: { label: "Waiting for review", tone: "warn" }, approved: { label: "Approved — not queued", tone: "info" }, scheduled: { label: "Scheduled", tone: "info" },
  publishing: { label: "In progress — waiting on a provider or hand-off", tone: "info" }, published: { label: "Done", tone: "ok" }, partial: { label: "Partly done", tone: "warn" }, failed: { label: "Failed", tone: "bad" }, rejected: { label: "Sent back", tone: "bad" },
};

export const PUB_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "info" }, accepted: { label: "Accepted by provider — no public link yet", tone: "info" }, published: { label: "Published", tone: "ok" },
  failed: { label: "Failed", tone: "bad" }, ambiguous: { label: "Unconfirmed — checking before any retry", tone: "warn" }, refused: { label: "Refused by safety check", tone: "bad" },
  manual_handoff: { label: "Manual hand-off — publish it yourself", tone: "warn" }, cancelled: { label: "Cancelled (content changed)", tone: "neutral" },
};
