import { z } from "zod";

export const StageSchema = z.object({ id: z.string(), name: z.string(), type: z.enum(["open", "won", "lost"]), order: z.number() });
export type Stage = z.infer<typeof StageSchema>;

export function parseStages(json: unknown): Stage[] {
  return z.array(StageSchema).parse(json).sort((a, b) => a.order - b.order);
}

/** Rank Logic's own acquisition pipeline (workflow A). */
export const AGENCY_STAGES: Stage[] = [
  { id: "prospect", name: "Prospect", type: "open", order: 1 },
  { id: "discovery", name: "Discovery booked", type: "open", order: 2 },
  { id: "qualified", name: "Qualified", type: "open", order: 3 },
  { id: "audit", name: "Audit delivered", type: "open", order: 4 },
  { id: "proposal", name: "Proposal sent", type: "open", order: 5 },
  { id: "won", name: "Won", type: "won", order: 6 },
  { id: "lost", name: "Lost", type: "lost", order: 7 },
];

/** A client's own sales pipeline (workflow B). */
export const CLIENT_STAGES: Stage[] = [
  { id: "new", name: "New lead", type: "open", order: 1 },
  { id: "contacted", name: "Contacted", type: "open", order: 2 },
  { id: "qualified", name: "Qualified", type: "open", order: 3 },
  { id: "estimate_booked", name: "Estimate booked", type: "open", order: 4 },
  { id: "estimate_sent", name: "Estimate sent", type: "open", order: 5 },
  { id: "won", name: "Won", type: "won", order: 6 },
  { id: "lost", name: "Lost", type: "lost", order: 7 },
];
