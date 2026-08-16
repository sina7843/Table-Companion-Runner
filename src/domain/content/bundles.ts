/**
 * The content this build ships, and the only place a bundle file is read.
 *
 * The bundles under `content/` are the pipeline's input: the server imports them into
 * PostgreSQL, and a browser reads the same files so that developing against fixtures uses the
 * same catalogue a deployment does. One input, two consumers, no second copy to drift.
 *
 * Only approved sources are imported here. `content/quarantine/` exists so that a record which
 * cannot be shipped is visible and named rather than deleted and forgotten — nothing in this
 * file reads it, and `server/content/import.ts` refuses it in production.
 *
 * Validation happens once, at module load. A malformed bundle is a build-time problem, and
 * failing loudly the first time anything touches content is better than a screen that renders
 * half a class list.
 */
import characterBundle from '../../../content/srd-5.1/character.json' with { type: 'json' };
import monsterBundle from '../../../content/srd-5.1/monsters.json' with { type: 'json' };
import { createContentLibrary, type ContentLibrary, type ContentRecord } from './model.ts';
import { validateBundle } from './validate.ts';

/** Every bundle this build ships, in the order they are layered. */
const SHIPPED: readonly unknown[] = [characterBundle, monsterBundle];

function load(): ContentRecord[] {
  const records: ContentRecord[] = [];

  for (const bundle of SHIPPED) {
    const checked = validateBundle(bundle);
    if (checked.problems.length > 0) {
      // A shipped bundle that does not validate is a broken build, not a runtime condition to
      // recover from. The first problem is enough to find the file.
      throw new Error(
        `A shipped content bundle is invalid: ${checked.problems[0]?.where} — ${checked.problems[0]?.message}`,
      );
    }
    records.push(...checked.records);
  }

  return records;
}

let cached: ContentLibrary | null = null;

/**
 * The catalogue for every system this build knows about.
 *
 * Built once and shared. A ruleset adapter filters it by `systemId`; nothing here does, because
 * the core does not know which system a screen is looking at and does not need to.
 */
export function shippedContent(): ContentLibrary {
  cached ??= createContentLibrary(load());
  return cached;
}

/** The raw bundles, for the importer — which needs the source header, not the index. */
export const SHIPPED_BUNDLES = SHIPPED;
