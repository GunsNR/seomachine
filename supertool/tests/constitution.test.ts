import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAPABILITIES, CAPABILITY_IDS, isSellable } from '@/lib/capabilities';
import {
  PHASE_IDS,
  ROADMAP,
  brokenDependencies,
  claimsAheadOfDelivery,
  getPhase,
  phaseFor,
  unassignedCapabilities,
} from '@/lib/roadmap';

/**
 * Documentation integrity for the Phase 0 constitution.
 *
 * These tests add no product behaviour. They exist because four things now
 * describe the same product — the capability registry, the roadmap, the
 * marketing wording and the evidence pointers — and four descriptions of one
 * thing drift apart unless something checks them against each other.
 *
 * The specific drift this guards against is directional. Nobody accidentally
 * makes the product sound worse than it is. The failure mode is a planning
 * document written in the present tense, an evidence field naming a test file
 * that was renamed a month ago, or a capability quietly flipped to `beta`
 * because it appears on a roadmap. Each of those is caught below.
 */

const REPO = resolve(__dirname, '../..');
const DOCS = resolve(REPO, 'docs');

/** The documents Section 15 of the constitution requires to exist. */
const REQUIRED_DOCS = [
  'product-constitution.md',
  'current-and-target-capability-map.md',
  'master-roadmap.md',
  'data-provider-strategy.md',
  'ux-and-design-system.md',
  'continuous-improvement-system.md',
  'competitive-scorecard.md',
  'architecture-decision-log.md',
] as const;

function doc(name: string): string {
  return readFileSync(resolve(DOCS, name), 'utf8');
}

describe('the constitution documents exist and are reachable', () => {
  for (const name of REQUIRED_DOCS) {
    it(`ships docs/${name}`, () => {
      expect(existsSync(resolve(DOCS, name)), name).toBe(true);
      // A stub file satisfies `existsSync` and nothing else. Require enough
      // content that an empty placeholder cannot pass as a governing document.
      expect(doc(name).length, name).toBeGreaterThan(1000);
    });
  }

  it('points contributors at the constitution from the repository instructions', () => {
    const claudeMd = readFileSync(resolve(REPO, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('docs/product-constitution.md');
  });

  it('names the capability registry as the source of present-tense truth', () => {
    const constitution = doc('product-constitution.md');
    expect(constitution).toContain('src/lib/capabilities.ts');
    expect(constitution).toContain('docs/release-truth-audit.md');
  });
});

describe('every capability has exactly one home on the roadmap', () => {
  it('leaves no capability unassigned', () => {
    // An unassigned capability is one nobody owns: it can change status
    // without any phase's acceptance criteria being met.
    expect(unassignedCapabilities()).toEqual([]);
  });

  it('never assigns a capability to two phases', () => {
    for (const id of CAPABILITY_IDS) {
      const owners = ROADMAP.filter((p) => p.delivers.includes(id));
      expect(owners.length, `${id} is claimed by ${owners.length} phases`).toBe(1);
    }
  });

  it('accounts for the whole registry', () => {
    const delivered = ROADMAP.flatMap((p) => [...p.delivers]);
    expect(delivered.slice().sort()).toEqual([...CAPABILITY_IDS].sort());
  });
});

describe('the roadmap cannot talk a capability into existence', () => {
  /**
   * The load-bearing test of Phase 0.
   *
   * Section 11 requires that no public claim changes merely because it appears
   * in the target roadmap. Enforced as: a sellable capability must belong to a
   * phase that is actually complete. Adding `rank_tracking` to Phase 4 does not
   * make it sellable — it documents that it is not.
   */
  it('refuses to sell anything whose delivering phase is incomplete', () => {
    expect(claimsAheadOfDelivery()).toEqual([]);
  });

  it('keeps every capability in a not-started phase out of the sellable set', () => {
    for (const phase of ROADMAP) {
      if (phase.state === 'complete') continue;
      for (const id of phase.delivers) {
        expect(
          isSellable(id),
          `${id} is sellable but ${phase.id} (${phase.state}) has not delivered it`,
        ).toBe(false);
      }
    }
  });

  it('holds the three capabilities Gate 1 withdrew to the phase that must earn them back', () => {
    // A regression guard with a specific history: these were sold before Gate 1
    // and withdrawn when the provider audit found no grounded adapter. They may
    // return only when Phase 1 completes, not when someone edits a doc.
    for (const id of ['ai_visibility_tracking', 'citation_monitoring', 'competitor_share_of_voice'] as const) {
      expect(phaseFor(id)?.id, id).toBe('phase-1');
      expect(isSellable(id), id).toBe(false);
    }
  });
});

describe('roadmap dependencies are coherent', () => {
  it('marks no phase complete while a dependency is outstanding', () => {
    expect(brokenDependencies()).toEqual([]);
  });

  it('references only phases that exist, and never itself', () => {
    for (const p of ROADMAP) {
      for (const dep of p.dependsOn) {
        expect(getPhase(dep), `${p.id} depends on unknown phase ${dep}`).toBeTruthy();
        expect(dep, `${p.id} depends on itself`).not.toBe(p.id);
      }
    }
  });

  it('gives every phase acceptance criteria to be judged against', () => {
    for (const p of ROADMAP) {
      expect(p.acceptanceCriteria.length, p.id).toBeGreaterThan(0);
      for (const c of p.acceptanceCriteria) expect(c.length, p.id).toBeGreaterThan(20);
    }
  });
});

describe('evidence points at something that actually exists', () => {
  /**
   * `evidence` was prose before this test. Prose survives a file rename; a
   * resolved path does not. Anything sold must cite at least one artefact that
   * is really in the repository.
   */
  const PATH_PATTERN = /(?:tests|src|docs|\.github|wordpress|prisma)\/[\w./-]+\.\w+/g;

  it('resolves at least one evidence artefact for every sellable capability', () => {
    for (const id of CAPABILITY_IDS) {
      if (!isSellable(id)) continue;
      const cited = CAPABILITIES[id].evidence.match(PATH_PATTERN) ?? [];
      expect(cited.length, `${id} cites no checkable artefact: "${CAPABILITIES[id].evidence}"`)
        .toBeGreaterThan(0);
      for (const p of cited) {
        const inApp = resolve(__dirname, '..', p);
        const inRepo = resolve(REPO, p);
        expect(
          existsSync(inApp) || existsSync(inRepo),
          `${id} cites "${p}", which does not exist`,
        ).toBe(true);
      }
    }
  });

  it('resolves every path any capability cites, sellable or not', () => {
    for (const id of CAPABILITY_IDS) {
      for (const p of CAPABILITIES[id].evidence.match(PATH_PATTERN) ?? []) {
        const inApp = resolve(__dirname, '..', p);
        const inRepo = resolve(REPO, p);
        expect(existsSync(inApp) || existsSync(inRepo), `${id} cites missing "${p}"`).toBe(true);
      }
    }
  });
});

describe('the roadmap document matches the roadmap code', () => {
  const roadmapDoc = doc('master-roadmap.md');

  it('lists every phase', () => {
    for (const id of PHASE_IDS) {
      expect(roadmapDoc, id).toContain(id);
    }
  });

  it('states the same state the code enforces', () => {
    for (const p of ROADMAP) {
      const row = roadmapDoc.split('\n').find((line) => line.includes(p.id) && line.includes('|'));
      expect(row, `no table row for ${p.id}`).toBeTruthy();
      expect(row, p.id).toContain(p.state);
    }
  });

  it('does not describe an incomplete phase in the present tense', () => {
    // "Rank Logic tracks rankings" in a not-started row is exactly the drift
    // Gate 0 removed from the marketing site. Catch the common forms.
    const banned = /\b(available now|shipping today|already delivers|is delivered)\b/i;
    for (const p of ROADMAP) {
      if (p.state === 'complete') continue;
      const row = roadmapDoc.split('\n').find((line) => line.includes(p.id) && line.includes('|'));
      expect(row ?? '', p.id).not.toMatch(banned);
    }
  });
});

describe('the capability map matches the registry', () => {
  const map = doc('current-and-target-capability-map.md');

  it('documents every capability', () => {
    for (const id of CAPABILITY_IDS) {
      expect(map, id).toContain(`\`${id}\``);
    }
  });

  it('records the same status the code enforces', () => {
    for (const id of CAPABILITY_IDS) {
      const row = map.split('\n').find((line) => line.includes(`\`${id}\``) && line.includes('|'));
      expect(row, `no row for ${id}`).toBeTruthy();
      expect(row, id).toContain(CAPABILITIES[id].status);
    }
  });

  it('names the owning phase for every capability', () => {
    for (const id of CAPABILITY_IDS) {
      const row = map.split('\n').find((line) => line.includes(`\`${id}\``) && line.includes('|'));
      expect(row, id).toContain(phaseFor(id)!.id);
    }
  });
});

describe('planning documents introduce no new public claim', () => {
  /**
   * Phase 0 is documentation only. If a phrase describing an unavailable
   * capability appeared in a planning document as a present-tense feature, the
   * document would become a marketing surface — and Gate 0's guarantees only
   * cover src/content and the marketing routes.
   */
  const PLANNING_DOCS = REQUIRED_DOCS.map((n) => [n, doc(n)] as const);

  it('never states that a non-sellable capability is available', () => {
    const nonSellable = CAPABILITY_IDS.filter((id) => !isSellable(id));
    for (const [name, text] of PLANNING_DOCS) {
      for (const id of nonSellable) {
        const label = CAPABILITIES[id].label;
        // Find any line presenting the label as something the product has now.
        const offending = text
          .split('\n')
          .filter((line) => line.includes(label))
          .filter((line) => /\b(we (?:now )?(?:offer|provide)|is available today|ships today)\b/i.test(line));
        expect(offending, `${name} presents "${label}" as available`).toEqual([]);
      }
    }
  });

  it('carries no fabricated proof', () => {
    // Same patterns Gate 0 banned from marketing, applied to planning docs so
    // an invented benchmark cannot enter through the back door.
    const banned = [
      /\b\d+,?\d*\s*(?:happy\s+)?customers\b/i,
      /\b\d+(?:\.\d+)?\s*(?:★|stars?)\b/i,
      /\btrusted by\s+\d+/i,
      /\bcase study:\s*\w+.*\b\d+%\s*increase/i,
    ];
    for (const [name, text] of PLANNING_DOCS) {
      for (const pattern of banned) {
        expect(text, `${name} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

describe('external blockers are declared rather than discovered late', () => {
  it('gives every phase that needs the owner an explicit blocker list', () => {
    // Phases 1-4 and 7-9 all require something only the product owner can
    // supply. A phase claiming otherwise is almost certainly under-specified.
    for (const id of ['phase-1', 'phase-2', 'phase-3', 'phase-4'] as const) {
      expect(getPhase(id)!.externallyBlocked.length, id).toBeGreaterThan(0);
    }
  });

  it('keeps Phase 0 free of external dependencies', () => {
    // Phase 0 is documentation and tests only. If it acquires a blocker,
    // something has been scoped into it that does not belong.
    expect(getPhase('phase-0')!.externallyBlocked).toEqual([]);
    expect(getPhase('phase-0')!.delivers).toEqual([]);
  });
});
