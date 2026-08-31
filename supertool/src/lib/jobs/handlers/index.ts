// Deliberately NOT `server-only`: loaded by the worker process.
import { MEASUREMENT_RUN_KIND, measurementRunHandler } from './measurement-run';
import type { JobHandler } from './types';

/**
 * The allowlist of job kinds this deployment will execute.
 *
 * An allowlist rather than a lookup that falls back to "try to run it anyway".
 * The `kind` column is a string, and a string column is reachable by anything
 * that can write a row — a future producer with a typo, a partially-rolled-back
 * deploy, a hand-edited row during an incident. A worker that executes whatever
 * it is handed turns any of those into arbitrary work; a worker that recognises
 * exactly two names turns them into a visible, permanent failure that a human
 * can read in the job table.
 *
 * Adding a kind is therefore deliberately a code change with a review, not a
 * configuration value.
 */
export const JOB_KINDS = [MEASUREMENT_RUN_KIND] as const;

export type JobKind = (typeof JOB_KINDS)[number];

const REGISTRY: Readonly<Record<JobKind, JobHandler>> = Object.freeze({
  [MEASUREMENT_RUN_KIND]: measurementRunHandler,
});

export function isJobKind(kind: string): kind is JobKind {
  return (JOB_KINDS as readonly string[]).includes(kind);
}

/** The handler for a kind, or null when the kind is not allowlisted. */
export function getHandler(kind: string): JobHandler | null {
  return isJobKind(kind) ? REGISTRY[kind] : null;
}

export { MEASUREMENT_RUN_KIND };
export type { JobContext, JobHandler, JobOutcome } from './types';
