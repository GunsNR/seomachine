import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, createSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
  }

  const user = await authenticate(input.email, input.password);
  // Deliberately identical message for unknown email and wrong password.
  if (!user) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });

  await createSession(user);
  return NextResponse.json({ ok: true });
}
