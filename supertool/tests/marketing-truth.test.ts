import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { CAPABILITIES, CAPABILITY_IDS, isSellable } from '@/lib/capabilities';

/**
 * A standing guard against fabricated proof and withdrawn capabilities
 * creeping back into public copy.
 *
 * Everything banned here was present in the product before the Gate 0 truth
 * pass: invented testimonials, an invented review rating emitted as structured
 * data, partner and audit badges that were never earned, and feature claims
 * for capabilities that do not exist. Removing them once is not enough — the
 * copy is easy to regenerate, and the next person to write a hero section will
 * reach for exactly these phrases.
 */

const SRC = resolve(__dirname, '../src');

const SCANNED_DIRS = [
  join(SRC, 'content'),
  join(SRC, 'components/marketing'),
  join(SRC, 'components/site'),
  join(SRC, 'app/(marketing)'),
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Source comments are stripped before scanning. Several of the removals below
 * are documented in a comment right where the claim used to be — explaining
 * why a lie was removed must not itself trip the guard.
 */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

const FILES = SCANNED_DIRS.flatMap(walk).map((path) => ({
  path: relative(SRC, path),
  text: strip(readFileSync(path, 'utf8')),
}));

/** True when a file states plainly that the thing it names is not available. */
const DISCLOSES_UNAVAILABILITY =
  /not available|are not built|is not sold|no plan includes|not measured|cannot be measured|does not (include|track|write)/i;

/**
 * Each rule is a pattern plus the reason it is banned, so a future failure
 * explains itself without needing this file's history.
 */
const BANNED: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /aggregateRating:|ratingValue|reviewCount/, why: 'There are no reviews. Fabricated review markup violates Google structured-data policy.' },
  { pattern: /SOC ?2/i, why: 'No SOC 2 audit has taken place. The claim asserts a completed third-party audit.' },
  { pattern: /Premier Partner|Inc\. ?5000|G2 High Performer|Microsoft Advertising Select/i, why: 'No partnership, award or listing has been earned.' },
  { pattern: /Dana Whitfield|Marcus Aiyegbeni|Priya Raghunathan|Tom Beckerley/, why: 'Invented testimonial authors. There are no customers to quote.' },
  { pattern: /Northline Systems|Bellwether Group|Copperleaf Digital|Harbourfield Media/, why: 'Invented customer companies.' },
  { pattern: /\+312%|4\.2x/i, why: 'Invented case-study results. No engagement has been measured.' },
  { pattern: /all six (answer )?engines|all 6 (answer )?engines|six answer engines/i, why: 'Only five surfaces are measurable, and only those with a configured credential.' },
  { pattern: /5-minute (wordpress )?setup|five minutes, no code/i, why: 'The plugin has never been installed on a live WordPress site from this codebase.' },
  { pattern: /Half your buyers/i, why: 'Unsourced statistic presented as fact.' },
];

/**
 * Phrases that may appear only in a sentence that says the thing is *not*
 * available. Naming a withdrawn capability in a disclosure is required; naming
 * it anywhere else sells it.
 */
const CONDITIONAL: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /white.?label/i, why: 'White-label reporting is not implemented.' },
  { pattern: /bring your own (api |provider )?keys/i, why: 'There is no per-tenant credential store.' },
  { pattern: /multi-seat|team seats|unlimited (team )?seats/i, why: 'Membership roles are not enforced and there is no invitation flow.' },
  { pattern: /average citation lift/i, why: 'No citation lift has ever been measured.' },
];

describe('public marketing copy carries no fabricated proof', () => {
  for (const { pattern, why } of BANNED) {
    it(`never says ${pattern}`, () => {
      const offenders = FILES.filter((f) => pattern.test(f.text)).map((f) => f.path);
      expect(offenders, `${offenders.join(', ')} — ${why}`).toEqual([]);
    });
  }
});

describe('withdrawn capabilities appear only as disclosures', () => {
  for (const { pattern, why } of CONDITIONAL) {
    it(`mentions ${pattern} only alongside a statement that it is unavailable`, () => {
      const offenders = FILES
        .filter((f) => pattern.test(f.text) && !DISCLOSES_UNAVAILABILITY.test(f.text))
        .map((f) => f.path);
      expect(offenders, `${offenders.join(', ')} — ${why}`).toEqual([]);
    });
  }
});

describe('public marketing copy sells no withdrawn capability', () => {
  /**
   * The label of a non-sellable capability must not appear in marketing copy.
   * Mentioning the *subject* is fine and often necessary — the pricing
   * disclosure has to say that rank tracking is unavailable — so a file is
   * only an offender when it uses the registry's customer-facing label while
   * making no statement that it is unavailable.
   */
  const NOT_SELLABLE = CAPABILITY_IDS.filter((id) => !isSellable(id));

  for (const id of NOT_SELLABLE) {
    const label = CAPABILITIES[id].label;
    it(`does not present "${label}" as an included feature`, () => {
      const offenders = FILES.filter((f) => {
        // Editorial writing about the industry is not a product claim.
        if (f.path === 'content/blog.ts') return false;
        if (!f.text.includes(label)) return false;
        // Allowed when the same file states it is not available.
        return !DISCLOSES_UNAVAILABILITY.test(f.text) && !/unavailable/i.test(f.text);
      }).map((f) => f.path);
      expect(offenders).toEqual([]);
    });
  }
});

describe('the registry is reachable from the pricing surface', () => {
  it('renders plan features through planFeatureLabel rather than free text', () => {
    const pricingTable = FILES.find((f) => f.path.endsWith('PricingTable.tsx'));
    expect(pricingTable).toBeTruthy();
    expect(pricingTable!.text).toContain('planFeatureLabel');
  });
});
