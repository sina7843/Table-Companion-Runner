/**
 * Creature content, read back as the core's own `Monster`.
 *
 * Generic on purpose, and it is worth being clear why this one is allowed to be. `Monster` is a
 * core type in `types.ts` — it names no D&D concept, carries its taxonomy in an opaque `facets`
 * bag and its rules in `systemData`. So reading a content record's `data` back as a `Monster` is
 * the core reading its own shape, not the core learning a system's.
 *
 * That is the difference between this and `ruleset/dnd5e/content.ts`: a species has no core
 * shape and never will, so it is read behind the adapter. A creature does.
 */
import type { Monster } from '../types.ts';
import { shippedContent } from './bundles.ts';
import type { ContentLibrary } from './model.ts';

/**
 * Every creature a library holds, for one system.
 *
 * `Monster.source` is set from the record's source name — the column a DM sees in the library
 * table. It answers "where did this come from", which is the question that column exists for,
 * and the licence behind it is on the record for anyone auditing.
 */
export function monstersFrom(library: ContentLibrary, systemId?: string): Monster[] {
  return library
    .list('monster')
    .filter((record) => !systemId || record.systemId === systemId)
    .map((record) => ({ ...(record.data as unknown as Monster), source: record.source.name }));
}

/** The creatures this build ships. What the fixture layer serves with no server behind it. */
export const libraryMonsters = (): Monster[] => monstersFrom(shippedContent());
