import { z } from "zod";

export const TRIGGERS = ["form_submitted", "opportunity_assigned", "stage_changed", "booking_created"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const STOP_RULES = ["reply", "opt_out", "booking", "disqualified", "closed", "manual_takeover"] as const;
export type StopRule = (typeof STOP_RULES)[number];

export const StepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wait"), minutes: z.number().int().min(1).max(60 * 24 * 30) }),
  z.object({ type: z.literal("create_task"), title: z.string().min(1).max(200), dueInMinutes: z.number().int().min(0).max(60 * 24 * 30) }),
  z.object({ type: z.literal("draft_message"), channel: z.enum(["email", "sms"]), subject: z.string().max(200).default(""), body: z.string().min(1).max(4000) }),
  z.object({ type: z.literal("send_message"), channel: z.enum(["email", "sms"]), subject: z.string().max(200).default(""), body: z.string().min(1).max(4000) }),
  z.object({ type: z.literal("require_stage"), stageTypes: z.array(z.enum(["open", "won", "lost"])).min(1) }),
  z.object({ type: z.literal("assign_owner"), userId: z.string().min(1) }),
]);
export type Step = z.infer<typeof StepSchema>;

/** Bounded: at most 20 steps; no step can jump backwards, so a definition cannot loop. */
export const MAX_STEPS = 20;
/** Hard ceiling on executions per run, in case a future step type ever re-enters. */
export const MAX_EXECUTIONS_PER_RUN = 50;

export const DefinitionSchema = z.object({
  steps: z.array(StepSchema).min(1).max(MAX_STEPS),
  stopOn: z.array(z.enum(STOP_RULES)).default([...STOP_RULES]),
  filter: z.object({ stageIds: z.array(z.string()).optional() }).default({}),
});
export type Definition = z.infer<typeof DefinitionSchema>;

/** Merge {{first_name}} style fields. Unknown fields render empty, never the raw token. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}
