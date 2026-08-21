import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, type SessionUser } from './auth';
import { db } from './db';
import { PlanLimitError, SubscriptionRequiredError } from './plan';

/** Standard JSON error shape used by every dashboard route. */
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wraps a dashboard route handler with session checking, JSON body parsing,
 * schema validation and uniform error mapping.
 */
export function withSession<S extends z.ZodTypeAny>(
  schema: S | null,
  handler: (ctx: {
    session: SessionUser;
    body: S extends z.ZodTypeAny ? z.infer<S> : undefined;
    req: Request;
  }) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    const session = await getSession();
    if (!session) return fail('Not signed in.', 401);

    let body: unknown;
    if (schema) {
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return fail('Expected a JSON body.');
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Check the submitted values.');
      }
      body = parsed.data;
    }

    try {
      return await handler({ session, body: body as never, req });
    } catch (err) {
      if (err instanceof PlanLimitError) return fail(err.message, 402);
      if (err instanceof SubscriptionRequiredError) return fail(err.message, 402);
      console.error('route error:', err);
      return fail('Something went wrong on our side. Please try again.', 500);
    }
  };
}

/**
 * Loads a project, scoped to the caller's organisation.
 * Returns null when it does not exist or belongs to another tenant — the two
 * cases are deliberately indistinguishable to the caller.
 */
export async function loadProject(orgId: string, projectId: string) {
  return db.project.findFirst({ where: { id: projectId, orgId } });
}
