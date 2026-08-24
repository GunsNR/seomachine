import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The public contact form used to write every enquiry into
 * `project.findFirst()` — whichever customer project happened to be oldest —
 * as a `Lead`. A stranger filling in a marketing form therefore wrote a row
 * into a real tenant's workspace and inflated their lead count.
 *
 * These tests assert the two properties that fix requires: the enquiry lands
 * in a tenant-neutral model, and no customer-scoped table is touched at all.
 * They are written against a mocked client so a regression fails here rather
 * than in someone's production database.
 */

const project = { findFirst: vi.fn(), findMany: vi.fn() };
const lead = { create: vi.fn(), createMany: vi.fn() };
const organization = { findFirst: vi.fn(), findMany: vi.fn() };
interface CreateArgs { data: Record<string, unknown> }
const contactInquiry = { create: vi.fn(async (_args: CreateArgs) => ({ id: 'inq_1' })) };

/**
 * An in-memory stand-in for the shared rate-limit table.
 *
 * Phase 2 moved this endpoint from the per-process limiter to the shared one,
 * which reads and writes `RateLimitCounter`. The shared limiter fails **open**
 * on a database error — a deliberate trade, since a limiter that fails closed
 * turns a database blip into a total sign-in outage. That means a mock missing
 * this model would silently disable rate limiting and the assertion below would
 * pass for the wrong reason, so the fake behaves like the real table.
 */
const counters = new Map<string, { count: number; resetAt: Date }>();
const rateLimitCounter = {
  findUnique: vi.fn(async ({ where }: { where: { key: string } }) => counters.get(where.key) ?? null),
  upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { key: string; count: number; resetAt: Date } }) => {
    counters.set(where.key, { count: create.count, resetAt: create.resetAt });
    return counters.get(where.key);
  }),
  update: vi.fn(async ({ where }: { where: { key: string } }) => {
    const row = counters.get(where.key);
    if (!row) throw new Error('missing counter');
    row.count += 1;
    return row;
  }),
  deleteMany: vi.fn(async () => ({ count: 0 })),
};

vi.mock('@/lib/db', () => ({
  db: { project, lead, organization, contactInquiry, rateLimitCounter },
}));

const { POST } = await import('@/app/api/contact/route');

const body = {
  name: 'Dana Example',
  email: 'dana@example.com',
  company: 'Example Co',
  website: 'https://example.com',
  message: 'I would like to know whether this measures Google AI Mode.',
};

let ip = 0;
function request(payload: unknown) {
  // A fresh client key per call so the limiter does not leak between tests.
  // X-Forwarded-For is only honoured because the trusted-proxy count is set
  // below; without it every caller shares one bucket by design.
  ip += 1;
  return new Request('https://example.test/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip}` },
    body: JSON.stringify(payload),
  });
}

// The endpoint's client identity now depends on how many proxies are trusted.
// Declaring one here is what makes the per-caller X-Forwarded-For values in
// these fixtures meaningful, and mirrors a normal single-load-balancer deploy.
process.env.TRUSTED_PROXY_COUNT = '1';

beforeEach(() => {
  counters.clear();
  for (const fn of [project.findFirst, project.findMany, lead.create, lead.createMany,
    organization.findFirst, organization.findMany, contactInquiry.create]) {
    fn.mockClear();
  }
  contactInquiry.create.mockResolvedValue({ id: 'inq_1' });
});

describe('POST /api/contact', () => {
  it('stores the enquiry in the tenant-neutral inquiry model', async () => {
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    expect(contactInquiry.create).toHaveBeenCalledTimes(1);

    const data = contactInquiry.create.mock.calls[0]![0].data;
    expect(data.email).toBe('dana@example.com');
    expect(data.message).toContain('Google AI Mode');
    expect(data.channel).toBe('contact-form');
    // No tenant foreign key of any kind.
    expect(Object.keys(data)).not.toContain('projectId');
    expect(Object.keys(data)).not.toContain('orgId');
  });

  it('never reads or writes any customer-scoped table', async () => {
    await POST(request(body));
    expect(project.findFirst).not.toHaveBeenCalled();
    expect(project.findMany).not.toHaveBeenCalled();
    expect(lead.create).not.toHaveBeenCalled();
    expect(lead.createMany).not.toHaveBeenCalled();
    expect(organization.findFirst).not.toHaveBeenCalled();
    expect(organization.findMany).not.toHaveBeenCalled();
  });

  it('discards a honeypot submission without storing anything', async () => {
    const res = await POST(request({ ...body, fax: 'x' }));
    // The honeypot field is length-capped, so this is rejected as malformed
    // rather than stored — either way nothing reaches the database.
    expect([200, 400]).toContain(res.status);
    expect(contactInquiry.create).not.toHaveBeenCalled();
    expect(lead.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed submission before touching the database', async () => {
    const res = await POST(request({ name: 'x', email: 'not-an-email', message: 'hi' }));
    expect(res.status).toBe(400);
    expect(contactInquiry.create).not.toHaveBeenCalled();
  });

  it('still acknowledges the sender when storage fails', async () => {
    contactInquiry.create.mockRejectedValueOnce(new Error('database down'));
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    expect(lead.create).not.toHaveBeenCalled();
  });

  it('rate-limits repeated submissions from one client', async () => {
    const from = (payload: unknown) =>
      new Request('https://example.test/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7' },
        body: JSON.stringify(payload),
      });

    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await POST(from(body))).status);

    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(5);
    expect(codes).toContain(429);
  });
});
