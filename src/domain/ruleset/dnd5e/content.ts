/**
 * Where this adapter's catalogue comes from.
 *
 * Until TC-P06 the species, backgrounds, classes, fighting styles, equipment packs and spell
 * lists were literals in `builder.ts` — a hand-maintained subset in a domain file, with no
 * source, no licence and no way to update it except editing TypeScript. They are now records in
 * a content bundle, imported by the pipeline into storage and read here through the generic
 * `ContentLibrary`.
 *
 * **This file is the only place the D&D shapes and the generic content model meet.** The core
 * stores a `ContentRecord` whose `data` is an opaque bag; this reads that bag back as the
 * `SpeciesDefinition` and `ClassDefinition` the rest of the adapter already expects. A
 * Pathfinder adapter would have a file exactly like it and share nothing with this one but the
 * import.
 *
 * The narrowing casts below are the whole reason the boundary works. The library cannot check
 * a species — it does not know what one is — so the adapter checks its own shapes and takes
 * responsibility for what it wrote into the bundle. `content.test.ts` is where that
 * responsibility is discharged.
 */
import { shippedContent } from '../../content/bundles.ts';
import type { ContentLibrary, ContentRecord } from '../../content/model.ts';
import { monstersFrom } from '../../content/monsters.ts';
import type { Monster } from '../../types.ts';
import type {
  BackgroundDefinition,
  BuilderOption,
  ClassDefinition,
  SpeciesDefinition,
} from './builderTypes.ts';

/** The system these records belong to. The one system id this adapter answers for. */
export const SYSTEM_ID = 'dnd5e-2024';

let library: ContentLibrary = shippedContent();

/**
 * Points the adapter at a different catalogue.
 *
 * The server calls this at startup with what it imported, so a deployment serves the content in
 * its database rather than whatever happened to be bundled. A test calls it to run against a
 * fixture catalogue. Nothing else should.
 */
export function useContentLibrary(next: ContentLibrary): void {
  library = next;
}

export const currentLibrary = (): ContentLibrary => library;

const mine = (kind: Parameters<ContentLibrary['list']>[0]): readonly ContentRecord[] =>
  library.list(kind).filter((record) => record.systemId === SYSTEM_ID);

/** Reads a record's bag back as the shape this adapter wrote into it. */
const dataOf = <T>(record: ContentRecord): T => record.data as T;

export const species = (): SpeciesDefinition[] => mine('species').map(dataOf<SpeciesDefinition>);

export const backgrounds = (): BackgroundDefinition[] =>
  mine('background').map(dataOf<BackgroundDefinition>);

export const classes = (): ClassDefinition[] => mine('class').map(dataOf<ClassDefinition>);

/**
 * Fighting styles live under `other`.
 *
 * Not a category every system has, and not one the core should learn: it is a class feature in
 * one game and nothing at all in the next. `data.category` is how this adapter tells its own
 * `other` records apart, and no generic code reads it.
 */
export const fightingStyles = (): BuilderOption[] =>
  mine('other')
    .filter((record) => record.data.category === 'fighting-style')
    .map(dataOf<BuilderOption>);

export const equipmentPacks = (): BuilderOption[] =>
  mine('equipment')
    .filter((record) => record.data.category === 'starting-pack')
    .map(dataOf<BuilderOption>);

interface SpellRecord extends BuilderOption {
  classId: string;
  tier: 'cantrips' | 'first';
}

/**
 * Spell lists, by class and tier.
 *
 * Rebuilt from flat records rather than stored as a nested map, because a spell belongs to a
 * source and a licence and a nested map has nowhere to put either. The shape the builder wants
 * is assembled here, once.
 */
export function spellsByClass(): Record<
  string,
  { cantrips: BuilderOption[]; first: BuilderOption[] }
> {
  const out: Record<string, { cantrips: BuilderOption[]; first: BuilderOption[] }> = {};

  for (const record of mine('spell')) {
    const spell = dataOf<SpellRecord>(record);
    const lists = (out[spell.classId] ??= { cantrips: [], first: [] });
    lists[spell.tier].push({
      value: spell.value,
      label: spell.label,
      ...(spell.description ? { description: spell.description } : {}),
    });
  }

  return out;
}

/**
 * The creature library.
 *
 * Delegated to the generic helper rather than reimplemented: `Monster` is a core shape, so
 * reading one out of a content record is not something the adapter has to be involved in. It is
 * re-exported here because the adapter is where a caller looks for this system's content.
 */
export const libraryMonsters = (): Monster[] => monstersFrom(library, SYSTEM_ID);
