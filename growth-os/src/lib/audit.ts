import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export async function audit(
  workspaceId: string,
  actorId: string | null,
  action: string,
  subjectType: string,
  subjectId: string,
  meta?: Prisma.InputJsonValue,
  tx?: Tx,
): Promise<void> {
  await (tx ?? db).auditEvent.create({ data: { workspaceId, actorId, action, subjectType, subjectId, meta } });
}
