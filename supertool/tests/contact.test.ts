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

vi.mock('@/lib/db', () => ({ db: { project, lead, organization, contactInquiry } }));

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
  // A fresh client key per call so the in-memory rate limiter does not leak
  // between tests.
  ip += 1;
  return new Request('https://example.test/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip}` },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
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
