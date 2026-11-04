"use server";
import { requirePermission } from "@/lib/auth";
import { runAction, str, bool } from "@/lib/actions";
import { addDestination, addFact, createClientWorkspace, removeDestination, reviewFact, saveBrandVersion, saveWorkflow, updateStages, SetupError } from "@/lib/setup";
import { StepSchema, STOP_RULES, type Step } from "@/lib/workflows/definition";
import { slugify } from "@/lib/normalize";
import { db } from "@/lib/db";
import { switchSessionWorkspace } from "@/lib/session";
import type { Stage } from "@/lib/crm/pipelines";

const actor = (c: { workspace: { id: string }; userId: string; role: string }) => ({ workspaceId: c.workspace.id, userId: c.userId, role: c.role });
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export async function createClientAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings/clients", async () => {
    const ws = await createClientWorkspace(actor(ctx), { name: str(f, "name"), businessName: str(f, "businessName") || str(f, "name"), industry: (str(f, "industry") || "other") as never, timezone: str(f, "timezone") || "America/New_York", currency: (str(f, "currency") || "USD").toUpperCase(), serviceAreas: str(f, "serviceAreas").split(",").map((x) => x.trim()).filter(Boolean) });
    if (bool(f, "switch")) {
      await switchSessionWorkspace(ctx.sessionId, ctx.userId, ws.id);
      return { to: "/app/settings/brand", ok: `${ws.name} created. Start with the brand profile — nothing is published or switched on yet.` };
    }
    return `${ws.name} created. Switch to it from the workspace menu to set it up.`;
  });
}

export async function brandBasicsAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings/brand", async () => {
    await saveBrandVersion(actor(ctx), str(f, "brandId"), (p) => ({
      ...p, businessName: str(f, "businessName") || p.businessName, industry: (str(f, "industry") || p.industry) as typeof p.industry,
      voice: str(f, "voice"), audience: str(f, "audience"), offers: lines(str(f, "offers")), serviceAreas: str(f, "serviceAreas").split(",").map((x) => x.trim()).filter(Boolean),
      prohibitedClaims: lines(str(f, "prohibitedClaims")), phone: str(f, "phone"),
      theme: { ...p.theme, primary: str(f, "primary") || p.theme.primary, primaryInk: str(f, "primaryInk") || p.theme.primaryInk, ink: str(f, "ink") || p.theme.ink, muted: str(f, "muted") || p.theme.muted, surface: str(f, "surface") || p.theme.surface },
    }), "Edited brand basics");
    return "Saved as a new brand version. New drafts use it from now on.";
  });
}

export async function addFactAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings/brand#facts", async () => {
    await addFact(actor(ctx), str(f, "brandId"), { kind: str(f, "kind") as never, text: str(f, "text"), source: str(f, "source"), provenance: str(f, "provenance") as never, attribution: str(f, "attribution") }, bool(f, "approveNow"));
    return "Fact added";
  });
}

export async function reviewFactAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings/brand#facts", async () => {
    const r = str(f, "review") === "approved" ? "approved" : "rejected";
    await reviewFact(actor(ctx), str(f, "brandId"), str(f, "factId"), r);
    return r === "approved" ? "Approved — templates and proof sections may now use it." : "Rejected — it will never be used.";
  });
}

export async function addDestinationAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings/destinations", async () => {
    await addDestination(actor(ctx), { brandId: str(f, "brandId"), platform: str(f, "platform"), label: str(f, "label"), adapter: (str(f, "adapter") || "manual") as never, providerAccountId: str(f, "providerAccountId") });
    return "Destination added";
  });
}

export async function removeDestinationAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings/destinations", async () => { await removeDestination(actor(ctx), str(f, "id")); return "Destination removed"; });
}

export async function stagesAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  await runAction("/app/settings/pipeline", async () => {
    const pipelineId = str(f, "pipelineId");
    const p = await db.pipeline.findFirst({ where: { workspaceId: ctx.workspace.id, id: pipelineId } });
    if (!p) throw new SetupError("Unknown pipeline.");
    const ids = f.getAll("stageId").map(String);
    const stages: Stage[] = ids.map((id, i) => ({ id, name: String(f.getAll("stageName")[i] ?? ""), type: String(f.getAll("stageType")[i] ?? "open") as Stage["type"], order: i + 1 }))
      .filter((s, i) => !f.getAll("remove").map(String).includes(ids[i]!));
    const newName = str(f, "newStage");
    if (newName) {
      const wonAt = stages.findIndex((s) => s.type !== "open");
      stages.splice(wonAt < 0 ? stages.length : wonAt, 0, { id: slugify(newName).replace(/-/g, "_"), name: newName, type: "open", order: 0 });
    }
    const moveId = str(f, "moveUp");
    if (moveId) { const i = stages.findIndex((s) => s.id === moveId); if (i > 0) [stages[i - 1], stages[i]] = [stages[i]!, stages[i - 1]!]; }
    await updateStages(actor(ctx), pipelineId, stages);
    return "Pipeline saved";
  });
}

function stepsFromForm(f: FormData): Step[] {
  const steps: Step[] = [];
  for (let i = 0; i < 20; i++) {
    const type = str(f, `s${i}_type`);
    if (!type || f.get(`s${i}_remove`) === "on") continue;
    const raw: Record<string, unknown> = { type };
    if (type === "wait") raw.minutes = Math.round(Number(str(f, `s${i}_amount`) || 1) * (str(f, `s${i}_unit`) === "days" ? 1440 : str(f, `s${i}_unit`) === "hours" ? 60 : 1));
    if (type === "create_task") { raw.title = str(f, `s${i}_title`); raw.dueInMinutes = Math.round(Number(str(f, `s${i}_due`) || 0) * 60); }
    if (type === "draft_message" || type === "send_message") { raw.channel = str(f, `s${i}_channel`) || "email"; raw.subject = str(f, `s${i}_subject`); raw.body = str(f, `s${i}_body`); }
    if (type === "require_stage") raw.stageTypes = f.getAll(`s${i}_stageTypes`).map(String);
    if (type === "assign_owner") raw.userId = str(f, `s${i}_userId`);
    const r = StepSchema.safeParse(raw);
    if (!r.success) throw new SetupError(`Step ${i + 1} is incomplete: ${r.error.issues.map((x) => x.path.join(".") || x.message).join(", ")}.`);
    steps.push(r.data);
  }
  return steps;
}

export async function saveWorkflowAction(f: FormData) {
  const ctx = await requirePermission("settings.manage");
  const id = str(f, "workflowId");
  await runAction(id ? `/app/settings/workflows/${id}` : "/app/settings/workflows/new", async () => {
    const steps = stepsFromForm(f);
    const add = str(f, "addStep");
    if (add) {
      const blank: Record<string, Step> = {
        wait: { type: "wait", minutes: 1440 }, create_task: { type: "create_task", title: "Call {{first_name}}", dueInMinutes: 60 },
        draft_message: { type: "draft_message", channel: "email", subject: "", body: "Hi {{first_name}}," }, send_message: { type: "send_message", channel: "email", subject: "", body: "Hi {{first_name}}," },
        require_stage: { type: "require_stage", stageTypes: ["open"] }, assign_owner: { type: "assign_owner", userId: ctx.userId },
      };
      if (blank[add]) steps.push(blank[add]!);
    }
    if (!steps.length) throw new SetupError("Add at least one step.");
    const stopOn = f.getAll("stopOn").map(String).filter((x): x is (typeof STOP_RULES)[number] => (STOP_RULES as readonly string[]).includes(x));
    const w = await saveWorkflow(actor(ctx), { workflowId: id || undefined, name: str(f, "name"), trigger: str(f, "trigger"), definition: { steps, stopOn, filter: {} } });
    return { to: `/app/settings/workflows/${w.id}`, ok: id ? `Saved as version ${w.currentVersion}. Runs already going keep their old version.` : "Workflow created — it's off until you turn it on." };
  });
}
