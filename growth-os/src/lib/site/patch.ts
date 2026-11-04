import { z } from "zod";
import { MetaSchema, SectionsSchema, type PageMeta, type Section } from "./sections";

/**
 * A page patch is a small list of operations against a specific base version.
 * Paths are restricted to section fields and page meta — a patch can never
 * touch identity, ownership or another page.
 */
export const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.string().regex(/^(meta\.[a-zA-Z]+|sections\.[a-z0-9_-]+\.[a-zA-Z]+(\.\d+\.[a-zA-Z]+)?)$/), value: z.unknown() }),
  z.object({ op: z.literal("move"), sectionId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal("remove"), sectionId: z.string() }),
  z.object({ op: z.literal("insert"), index: z.number().int().min(0), section: z.unknown() }),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export type PageDoc = { sections: Section[]; meta: PageMeta };

export class PatchError extends Error {}

export function applyPatch(doc: PageDoc, ops: PatchOp[]): PageDoc {
  const sections: Record<string, unknown>[] = structuredClone(doc.sections) as unknown as Record<string, unknown>[];
  const meta: Record<string, unknown> = structuredClone(doc.meta) as unknown as Record<string, unknown>;
  for (const raw of ops) {
    const op = PatchOpSchema.parse(raw);
    if (op.op === "set") {
      const parts = op.path.split(".");
      if (parts[0] === "meta") {
        if (!(parts[1]! in MetaSchema.shape)) throw new PatchError(`Unknown page setting “${parts[1]}”.`);
        meta[parts[1]!] = op.value;
      } else {
        const s = sections.find((x) => x.id === parts[1]);
        if (!s) throw new PatchError(`Section “${parts[1]}” no longer exists.`);
        if (parts.length === 3) {
          if (parts[2] === "id" || parts[2] === "type") throw new PatchError("Section identity can't be changed by a patch.");
          s[parts[2]!] = op.value;
        } else {
          const arr = s[parts[2]!];
          const idx = Number(parts[3]);
          if (!Array.isArray(arr) || !arr[idx] || typeof arr[idx] !== "object") throw new PatchError(`Item ${idx + 1} not found.`);
          (arr[idx] as Record<string, unknown>)[parts[4]!] = op.value;
        }
      }
    } else if (op.op === "move") {
      const from = sections.findIndex((x) => x.id === op.sectionId);
      if (from < 0) throw new PatchError("Section not found.");
      const [s] = sections.splice(from, 1);
      sections.splice(Math.min(op.toIndex, sections.length), 0, s!);
    } else if (op.op === "remove") {
      const i = sections.findIndex((x) => x.id === op.sectionId);
      if (i < 0) throw new PatchError("Section not found.");
      sections.splice(i, 1);
    } else {
      const sec = op.section as Record<string, unknown>;
      if (sections.some((x) => x.id === sec?.id)) throw new PatchError("A section with that id already exists.");
      sections.splice(Math.min(op.index, sections.length), 0, sec);
    }
  }
  return { sections: SectionsSchema.parse(sections), meta: MetaSchema.parse(meta) };
}

/** Human-readable diff lines for review. */
export function describePatch(doc: PageDoc, ops: PatchOp[]): { label: string; before: string; after: string }[] {
  return ops.map((op) => {
    if (op.op === "set") {
      const parts = op.path.split(".");
      let before: unknown;
      if (parts[0] === "meta") before = (doc.meta as Record<string, unknown>)[parts[1]!];
      else {
        const s = doc.sections.find((x) => x.id === parts[1]) as Record<string, unknown> | undefined;
        before = parts.length === 3 ? s?.[parts[2]!] : ((s?.[parts[2]!] as Record<string, unknown>[] | undefined)?.[Number(parts[3])] ?? {})[parts[4]!];
      }
      const label = parts[0] === "meta" ? `Page ${parts[1]}` : `${parts[1]} → ${parts.slice(2).join(" ")}`;
      return { label, before: String(before ?? "—"), after: String(op.value ?? "—") };
    }
    if (op.op === "move") return { label: `Move ${op.sectionId}`, before: "", after: `to position ${op.toIndex + 1}` };
    if (op.op === "remove") return { label: `Remove ${op.sectionId}`, before: op.sectionId, after: "—" };
    return { label: "Add section", before: "—", after: String((op.section as { type?: string })?.type ?? "") };
  });
}
