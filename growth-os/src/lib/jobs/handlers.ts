import { z } from "zod";
import type { Handler } from "./queue";
import { PermanentJobError } from "./queue";
import { advanceRun } from "../workflows/engine";
import { dispatchPublication, reconcilePublication } from "../content/publish";
import { executeCrawl } from "../seo/crawl";

const StepPayload = z.object({ runId: z.string(), stepIndex: z.number().int() });
const IdPayload = z.object({ id: z.string() });

function parse<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new PermanentJobError("Malformed job payload");
  return r.data;
}

export const handlers: Record<string, Handler> = {
  "workflow.step": async (job) => {
    const p = parse(StepPayload, job.payload);
    await advanceRun(job.workspaceId, p.runId, p.stepIndex);
  },
  "publication.dispatch": async (job) => {
    await dispatchPublication(job.workspaceId, parse(IdPayload, job.payload).id);
  },
  "publication.reconcile": async (job) => {
    await reconcilePublication(job.workspaceId, parse(IdPayload, job.payload).id);
  },
  "seo.crawl": async (job) => {
    await executeCrawl(job.workspaceId, parse(IdPayload, job.payload).id);
  },
};
