/**
 * Rules content, as something the core can hold without understanding.
 *
 * The product is game-system agnostic, and that has to survive contact with the thing every
 * system has most of: reference data. Classes, species, spells, creatures — thousands of
 * records, all shaped by the system they belong to and none of them meaningful to the core.
 *
 * The model here is the same trick `types.ts` uses for a character. A `ContentRecord` states
 * what the core needs — which system, what kind of thing, what it is called, where it came
 * from, whether it may be redistributed — and puts everything else in a `data` bag the
 * adapter reads and nothing else touches. A Pathfinder adapter storing an ancestry and a D&D
 * adapter storing a species produce the same row; only the bag differs.
 *
 * Two rules this file exists to enforce:
 *
 * 1. **Nothing here names a game system.** Not a class, not a spell level, not a challenge
 *    rating. `kind` is a small closed vocabulary of *categories* every system in scope has,
 *    and even that is only there so a list screen can page one category at a time.
 * 2. **Every record knows where it came from.** A record without a source is a record nobody
 *    can answer a licensing question about, so `source` is not optional and the importer has
 *    nowhere to put a record that lacks one.
 */
import type { GameSystemId } from '../types.ts';

/**
 * The categories of rules content Phase 1 consumes.
 *
 * Deliberately categories rather than types: a "species" and an "ancestry" and a "lineage" are
 * the same slot in three systems, and the core cares only that they are the slot a character
 * picks one of. A system with a category nothing else has puts it in `other` and reads it back
 * through its own adapter.
 */
export const CONTENT_KINDS = [
  'class',
  'species',
  'background',
  'feat',
  'spell',
  'equipment',
  'monster',
  'other',
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

/**
 * A licence, and the only question the product asks of one.
 *
 * `redistributable` is the gate. Everything else on this record exists so the answer can be
 * shown, cited and audited — a licence the product relies on but cannot name is a licence
 * nobody can check.
 */
export interface LicenseRef {
  id: string;
  name: string;
  url: string;
  /**
   * May this content be shipped as part of the product?
   *
   * False is not a soft warning. The importer refuses a non-redistributable source outright in
   * production, and the development path that accepts one says so on every run.
   */
  redistributable: boolean;
  /**
   * The attribution the licence requires, verbatim.
   *
   * Kept with the content rather than in a footer somewhere, because the obligation travels
   * with the records and a screen that shows one has to be able to find it.
   */
  attribution: string;
}

/** Where a batch of content came from, and which revision of it this is. */
export interface SourceRef {
  id: string;
  name: string;
  publisher: string;
  /**
   * The source's own version, not ours — an SRD revision, a dataset release. What makes an
   * import reproducible and an upgrade a thing you can point at.
   */
  version: string;
  license: LicenseRef;
  url?: string;
}

/**
 * One piece of rules content, normalised.
 *
 * `data` is the adapter's. The core never reads it, validates only that it is an object, and
 * would store a Pathfinder ancestry and a D&D species in the same column without noticing.
 */
export interface ContentRecord {
  /** Stable within a system and a kind. `srd-5.1:monster:goblin`, not a database id. */
  key: string;
  systemId: GameSystemId;
  kind: ContentKind;
  /** What a person calls it. The one field the core displays without asking the adapter. */
  name: string;
  source: SourceRef;
  data: Readonly<Record<string, unknown>>;
}

/**
 * The content one system has, indexed for synchronous reads.
 *
 * Synchronous on purpose: `Ruleset` answers questions while a screen renders, and an adapter
 * that had to await its own catalogue would make every rules question asynchronous all the way
 * up. The library is built once — from storage on the server, from the shipped bundles in a
 * browser — and handed to the adapter whole.
 */
export interface ContentLibrary {
  /** Every record of a kind, in the order the source stated. */
  list(kind: ContentKind): readonly ContentRecord[];
  /** One record by key, or null. */
  get(kind: ContentKind, key: string): ContentRecord | null;
  /** The sources this library was built from, for an attribution screen or an audit. */
  sources(): readonly SourceRef[];
  size(): number;
}

/** A library with nothing in it. What an adapter gets before anything has been imported. */
export const EMPTY_LIBRARY: ContentLibrary = {
  list: () => [],
  get: () => null,
  sources: () => [],
  size: () => 0,
};

/**
 * Builds an index over normalised records.
 *
 * Deliberately does no validation: by the time records reach here they have been through the
 * importer, and re-checking them on every page load would be paying twice for the same answer.
 * `validateContent` is where a record is judged.
 */
export function createContentLibrary(records: readonly ContentRecord[]): ContentLibrary {
  const byKind = new Map<ContentKind, ContentRecord[]>();
  const byKey = new Map<string, ContentRecord>();
  const sources = new Map<string, SourceRef>();

  for (const record of records) {
    const kept = byKind.get(record.kind);
    if (kept) kept.push(record);
    else byKind.set(record.kind, [record]);

    byKey.set(`${record.kind}:${record.key}`, record);
    sources.set(record.source.id, record.source);
  }

  return {
    list: (kind) => byKind.get(kind) ?? [],
    get: (kind, key) => byKey.get(`${kind}:${key}`) ?? null,
    sources: () => [...sources.values()],
    size: () => records.length,
  };
}

/**
 * The attribution lines a library owes, one per source that requires one.
 *
 * Returned rather than rendered: where a product credits its sources is a design decision, and
 * this file has no opinion about it beyond insisting the text is available.
 */
export function attributionsFor(library: ContentLibrary): { source: string; text: string }[] {
  return library
    .sources()
    .filter((source) => source.license.attribution.trim() !== '')
    .map((source) => ({ source: source.name, text: source.license.attribution }));
}
