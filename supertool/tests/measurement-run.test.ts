import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Run lifecycle against a real database.
 *
 * These use a throwaway SQLite file rather than mocks, because the properties
 * under test — the uniqueness constraint that makes retries idempotent, and the
 * durability of observations written mid-run — are properties of the schema,
 * not of the code that calls it. A mock would happily agree with a broken
 * constraint.
 */

const dir = mkdtempSync(join(tmpdir(), 'supertool-measurement-'));
const dbPath = join(dir, 'test.db');
process.env.DATABASE_URL = `file:${dbPath}`;

// Imported after DATABASE_URL is set so the client binds to the throwaway file.
type Mod = typeof import('@/lib/measurement/run');
type ReportMod = typeof import('@/lib/measurement/report');
type DbMod = typeof import('@/lib/db');
type EngineMod = typeof import('@/lib/ai/engines');

let run: Mod;
let report: ReportMod;
let db: DbMod['db'];
let engines: EngineMod;

beforeAll(async () => {
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'pipe',
  });

  run = await import('@/lib/measurement/run');
  report = await import('@/lib/measurement/report');
  db = (await import('@/lib/db')).db;
  engines = await import('@/lib/ai/engines');
});

afterAll(async () => {
  await db?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Two real demo-capable surfaces, restricted for speed.
 *
 * Deliberately not synthetic stubs: `ask()` resolves an engine through the real
 * registry, so a fabricated id would be rejected as unsupported and these tests
 * would exercise the error path instead of the orchestrator.
 */
function twoEngines(): EngineMod['ENGINES'] {
  return engines.DEMO_ENGINES.slice(0, 2) as EngineMod['ENGINES'];
}

let orgId = '';
let projectId = '';
let promptIds: string[] = [];

async function seedProject(promptCount = 3) {
  const org = await db.organization.create({
    data: { name: `Org ${Math.random()}`, dataMode: 'demo' },
  });
  const project = await db.project.create({
    data: { orgId: org.id, name: 'Acme', domain: 'acme.example', dataMode: 'demo' },
  });
  const prompts = [];
  for (let i = 0; i < promptCount; i++) {
    prompts.push(
      await db.aiPrompt.create({
        data: { projectId: project.id, text: `Question number ${i} about SEO tools?` },
      }),
    );
  }
  orgId = org.id;
  projectId = project.id;
  promptIds = prompts.map((p) => p.id);
  return { org, project, prompts };
}

function runInput(over: Partial<Mod['startRun'] extends (i: infer I) => unknown ? I : never> = {}) {
  return {
    orgId,
    projectId,
    projectName: 'Acme',
    projectDomain: 'acme.example',
    prompts: promptIds.map((id, i) => ({ id, text: `Question number ${i} about SEO tools?` })),
    competitors: [{ name: 'Rival', domain: 'rival.example' }],
    dataMode: 'demo' as const,
    trigger: 'manual' as const,
    engines: twoEngines(),
    ...over,
  };
}

beforeEach(async () => {
  await seedProject();
});

describe('same-day run separation', () => {
  it('keeps two runs started on the same UTC date completely separate', async () => {
    const a = await run.startRun(runInput());
    const b = await run.startRun(runInput());

    expect(a.runId).not.toBe(b.runId);

    // Force both onto the same UTC calendar day, which is exactly the case the
    // old date-grouping implementation merged into one bucket.
    const day = new Date('2026-05-05T09:00:00.000Z');
    const later = new Date('2026-05-05T17:30:00.000Z');
    await db.measurementRun.update({ where: { id: a.runId }, data: { startedAt: day } });
    await db.measurementRun.update({ where: { id: b.runId }, data: { startedAt: later } });

    const reportA = await report.getRunReport(a.runId);
    const reportB = await report.getRunReport(b.runId);

    expect(reportA!.attempted).toBe(a.attempted);
    expect(reportB!.attempted).toBe(b.attempted);
    // Neither report may contain the other's observations.
    expect(reportA!.attempted + reportB!.attempted).toBe(a.attempted + b.attempted);

    const trend = await report.getRunTrend(projectId);
    expect(trend).toHaveLength(2);
    expect(new Set(trend.map((t) => t.runId)).size).toBe(2);
    // Both points fall on the same calendar day and still appear separately.
    expect(trend.every((t) => t.startedAt.toISOString().slice(0, 10) === '2026-05-05')).toBe(true);
  });

  it('never merges observations from different runs', async () => {
    const a = await run.startRun(runInput());
    const b = await run.startRun(runInput());

    const rowsA = await db.observation.findMany({ where: { runId: a.runId } });
    const rowsB = await db.observation.findMany({ where: { runId: b.runId } });

    expect(rowsA.every((r) => r.runId === a.runId)).toBe(true);
    expect(rowsB.every((r) => r.runId === b.runId)).toBe(true);
    expect(rowsA).not.toHaveLength(0);
  });
});

describe('repeated sampling', () => {
  it('records one observation per sample index per prompt-engine pair', async () => {
    const result = await run.startRun(runInput({ samplesPerPair: 3 }));

    // 3 prompts x 2 engines x 3 samples.
    expect(result.attempted).toBe(18);

    const rows = await db.observation.findMany({ where: { runId: result.runId } });
    expect(rows).toHaveLength(18);
    expect(new Set(rows.map((r) => r.sampleIndex))).toEqual(new Set([0, 1, 2]));

    // Every (prompt, engine, sample) combination is unique.
    const keys = rows.map((r) => `${r.promptId}|${r.engine}|${r.sampleIndex}`);
    expect(new Set(keys).size).toBe(18);
  });

  it('varies repeated demo samples instead of duplicating one answer', async () => {
    const result = await run.startRun(runInput({ samplesPerPair: 4 }));
    const rows = await db.observation.findMany({
      where: { runId: result.runId, engine: twoEngines()[0].id, promptId: promptIds[0] },
      orderBy: { sampleIndex: 'asc' },
    });
    expect(rows).toHaveLength(4);
    // Identical repeats would make the interval meaningless.
    expect(new Set(rows.map((r) => r.rawAnswerHash)).size).toBeGreaterThan(1);
  });

  it('records the expected observation count on the run before executing', async () => {
    const runId = await run.createRun(runInput({ samplesPerPair: 2 }));
    const row = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(row!.expectedObservations).toBe(12);
    expect(row!.status).toBe('queued');
    // The run exists before any observation does — that is what makes an
    // interruption recoverable.
    expect(await db.observation.count({ where: { runId } })).toBe(0);
  });
});

describe('retry idempotency', () => {
  it('does not duplicate observations when a run is executed twice', async () => {
    const input = runInput({ samplesPerPair: 2 });
    const runId = await run.createRun(input);

    const first = await run.executeRun(runId, input);
    expect(first.attempted).toBe(12);
    expect(first.skippedExisting).toBe(0);

    const second = await run.executeRun(runId, input);
    // Everything already existed, so nothing new was written.
    expect(second.skippedExisting).toBe(12);
    expect(await db.observation.count({ where: { runId } })).toBe(12);
    expect(second.attempted).toBe(12);
  });

  it('fills only the gaps when resuming a partially written run', async () => {
    const input = runInput({ samplesPerPair: 1 });
    const runId = await run.createRun(input);
    await run.executeRun(runId, input);

    // Simulate an interruption having lost two observations.
    const victims = await db.observation.findMany({ where: { runId }, take: 2 });
    await db.observation.deleteMany({ where: { id: { in: victims.map((v) => v.id) } } });
    expect(await db.observation.count({ where: { runId } })).toBe(4);

    const resumed = await run.executeRun(runId, input);
    expect(await db.observation.count({ where: { runId } })).toBe(6);
    // The four survivors were skipped, not re-asked.
    expect(resumed.skippedExisting).toBe(4);
  });

  it('enforces uniqueness at the database level, not just in code', async () => {
    const result = await run.startRun(runInput({ samplesPerPair: 1 }));
    const existing = await db.observation.findFirst({ where: { runId: result.runId } });

    await expect(
      db.observation.create({
        data: {
          runId: existing!.runId,
          promptId: existing!.promptId,
          engine: existing!.engine,
          sampleIndex: existing!.sampleIndex,
          status: 'live',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('partial interruption', () => {
  it('leaves durable observations behind when a run is cut short', async () => {
    const input = runInput({ samplesPerPair: 1 });
    const runId = await run.createRun(input);
    await run.executeRun(runId, input);

    // Delete some observations to represent a run that stopped part-way.
    const victims = await db.observation.findMany({ where: { runId }, take: 3 });
    await db.observation.deleteMany({ where: { id: { in: victims.map((v) => v.id) } } });

    const finished = await run.finalizeRun(runId);
    // Fewer observations than expected means partial, never completed.
    expect(finished.status).toBe('partial');
    expect(finished.attempted).toBe(3);
    expect(finished.observed).toBe(3);

    const row = await db.measurementRun.findUnique({ where: { id: runId } });
    expect(row!.status).toBe('partial');
    expect(row!.finishedAt).not.toBeNull();
  });

  it('flags a run stuck in running as interrupted rather than completing it', async () => {
    const stale = new Date(Date.now() - run.STALE_RUN_MS - 60_000);
    expect(run.isInterrupted('running', stale)).toBe(true);
    expect(run.isInterrupted('running', new Date())).toBe(false);
    // A finished run is never "interrupted", whatever its age.
    expect(run.isInterrupted('completed', stale)).toBe(false);
  });

  it('marks a run that observed nothing as failed, not completed with zero', async () => {
    const input = runInput({ samplesPerPair: 1 });
    const runId = await run.createRun(input);
    await run.executeRun(runId, input);
    await db.observation.updateMany({ where: { runId }, data: { status: 'failed' } });

    const finished = await run.finalizeRun(runId);
    expect(finished.status).toBe('failed');
    expect(finished.observed).toBe(0);

    const r = await report.getRunReport(runId);
    // No rate is reported at all — not a rate of zero.
    expect(r!.inclusion.rate).toBeNull();
    expect(r!.inclusion.insufficientEvidence).toBe(true);
  });
});

describe('mixed provenance', () => {
  it('reports coverage below 1 when a run mixes observed and unobserved', async () => {
    const input = runInput({ samplesPerPair: 2 });
    const result = await run.startRun(input);

    const half = await db.observation.findMany({ where: { runId: result.runId }, take: 6 });
    await db.observation.updateMany({
      where: { id: { in: half.map((h) => h.id) } },
      data: { status: 'failed', errorCategory: 'rate_limit' },
    });
    await run.finalizeRun(result.runId);

    const r = await report.getRunReport(result.runId);
    expect(r!.attempted).toBe(12);
    expect(r!.observed).toBe(6);
    expect(r!.failed).toBe(6);
    expect(r!.coverage).toBeCloseTo(0.5, 6);
    // Rates are computed over the 6 observed rows, never over all 12.
    expect(r!.inclusion.n).toBe(6);
  });

  it('never reports a live rate from an all-simulated run without saying so', async () => {
    const result = await run.startRun(runInput());
    const r = await report.getRunReport(result.runId);
    expect(r!.dataMode).toBe('demo');
    const rows = await db.observation.findMany({ where: { runId: result.runId } });
    expect(rows.every((o) => o.status === 'simulated')).toBe(true);
  });
});

describe('zero observations', () => {
  it('produces a run with no rate when there are no prompts', async () => {
    const result = await run.startRun(runInput({ prompts: [] }));
    expect(result.attempted).toBe(0);
    expect(result.status).toBe('failed');

    const r = await report.getRunReport(result.runId);
    expect(r!.inclusion.rate).toBeNull();
    expect(r!.coverage).toBe(0);
  });

  it('returns no report for a project that has never run', async () => {
    await seedProject();
    expect(await report.getLatestRun(projectId)).toBeNull();
    expect(await report.getRunTrend(projectId)).toEqual([]);
    expect(await report.getRunVariation(projectId)).toBeNull();
  });
});

describe('cost and token totals persist on the run', () => {
  it('aggregates usage from the observations that reported it', async () => {
    const input = runInput({ samplesPerPair: 1 });
    const result = await run.startRun(input);

    await db.observation.updateMany({
      where: { runId: result.runId },
      data: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001 },
    });
    await run.finalizeRun(result.runId);

    const row = await db.measurementRun.findUnique({ where: { id: result.runId } });
    expect(row!.totalInputTokens).toBe(600);
    expect(row!.totalOutputTokens).toBe(300);
    expect(row!.usageReportedCount).toBe(6);
    expect(row!.totalCostUsd).toBeCloseTo(0.01, 4);
  });
});

describe('immutable prompt snapshot', () => {
  it('keeps what was asked even after the prompt is edited', async () => {
    const result = await run.startRun(runInput({ samplesPerPair: 1 }));
    const before = await db.observation.findFirst({
      where: { runId: result.runId, promptId: promptIds[0] },
    });

    await db.aiPrompt.update({
      where: { id: promptIds[0] },
      data: { text: 'A completely different question now.' },
    });

    const after = await db.observation.findUnique({ where: { id: before!.id } });
    expect(after!.promptTextSnapshot).toBe(before!.promptTextSnapshot);
    expect(after!.promptTextSnapshot).not.toContain('completely different');
    expect(after!.promptVersion).toBe(before!.promptVersion);
  });

  it('changes the prompt-set version when the prompt set changes', () => {
    const a = run.promptSetVersion([{ id: '1', text: 'one' }, { id: '2', text: 'two' }]);
    const b = run.promptSetVersion([{ id: '2', text: 'two' }, { id: '1', text: 'one' }]);
    const c = run.promptSetVersion([{ id: '1', text: 'one' }, { id: '2', text: 'three' }]);
    // Order must not matter; content must.
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('legacy AiCheck data', () => {
  it('is reported separately and never counted as a measurement', async () => {
    const prompt = await db.aiPrompt.findFirst({ where: { projectId } });
    await db.aiCheck.createMany({
      data: [
        { promptId: prompt!.id, engine: 'chatgpt', status: 'unavailable', brandMentioned: false },
        { promptId: prompt!.id, engine: 'claude', status: 'live', brandMentioned: true },
      ],
    });

    const legacy = await report.getLegacySummary(projectId);
    expect(legacy.rows).toBe(2);
    expect(legacy.labelled).toBe(1);

    // A run over the same project sees none of it.
    const result = await run.startRun(runInput({ samplesPerPair: 1 }));
    const r = await report.getRunReport(result.runId);
    expect(r!.attempted).toBe(6);

    const trend = await report.getRunTrend(projectId);
    expect(trend.every((t) => t.attempted === 6)).toBe(true);
  });

  it('does not relabel an unlabelled legacy row as live', async () => {
    const prompt = await db.aiPrompt.findFirst({ where: { projectId } });
    // A row written before the status column existed takes the fail-closed
    // default rather than being assumed to be a measurement.
    await db.aiCheck.create({ data: { promptId: prompt!.id, engine: 'chatgpt' } });
    const row = await db.aiCheck.findFirst({ where: { promptId: prompt!.id } });
    expect(row!.status).toBe('unavailable');
  });
});

describe('engine selection by mode', () => {
  it('never lets a live run touch a surface with no compliant API', () => {
    const live = run.enginesForMode('live');
    expect(live.every((e) => e.availability === 'available')).toBe(true);
    expect(live.map((e) => e.id)).not.toContain('google-ai-mode');
  });

  it('never simulates a surface that has no public API, even in demo mode', () => {
    const demo = run.enginesForMode('demo');
    expect(demo.map((e) => e.id)).not.toContain('google-ai-mode');
    expect(demo.every((e) => e.accessMethod === 'official-api')).toBe(true);
    expect(engines.DEMO_ENGINE_IDS).not.toContain('google-ai-mode');
  });
});
