/**
 * What a content record has to be before it is allowed into storage.
 *
 * Built on the same combinators as the API boundary, for the same reason: a TypeScript type is
 * erased before a byte arrives, and a bundle is a file somebody else produced. The importer
 * refuses a record rather than storing a half-shaped one, and says which field and which record.
 *
 * The `data` bag is checked as "an object" and no further. That is the boundary the whole
 * content model rests on — the core cannot know what a species is, so it must not pretend to
 * validate one. An adapter that needs its own shape checked does that in its own normaliser.
 */
import {
  arrayOf,
  boolean,
  describe,
  object,
  oneOf,
  optional,
  recordOf,
  string,
  unknownValue,
  validate,
  type Schema,
} from '../data/schema.ts';
import { CONTENT_KINDS, type ContentRecord, type SourceRef } from './model.ts';

const NAME = 200;
const TEXT = 4000;

const licenseSchema = object(
  {
    id: string({ nonEmpty: true, max: 64 }),
    name: string({ nonEmpty: true, max: NAME }),
    url: string({ max: NAME }),
    redistributable: boolean(),
    attribution: string({ max: TEXT }),
  },
  { strict: true },
);

const sourceSchema: Schema<SourceRef> = object(
  {
    id: string({ nonEmpty: true, max: 64 }),
    name: string({ nonEmpty: true, max: NAME }),
    publisher: string({ nonEmpty: true, max: NAME }),
    version: string({ nonEmpty: true, max: 64 }),
    license: licenseSchema,
    url: optional(string({ max: NAME })),
  },
  { strict: true },
);

const recordSchema: Schema<ContentRecord> = object(
  {
    key: string({ nonEmpty: true, max: 128, pattern: /^[a-z0-9][a-z0-9._:-]*$/ }),
    systemId: string({ nonEmpty: true, max: 64 }),
    kind: oneOf(CONTENT_KINDS),
    name: string({ nonEmpty: true, max: NAME }),
    source: sourceSchema,
    data: recordOf(unknownValue()),
  },
  { strict: true },
) as Schema<ContentRecord>;

/** A whole bundle as it sits on disk: one source, and the records it carries. */
export interface ContentBundle {
  source: SourceRef;
  records: Omit<ContentRecord, 'source'>[];
}

/**
 * The bundle's own shape: a source, and a list of things to look at one at a time.
 *
 * `records` is checked as an array and no further *here* on purpose. Running the list through a
 * strict schema would mean one malformed entry rejecting the whole file, and a source with a
 * typo in one creature is a source with a typo in one creature — the other four hundred are
 * still importable, and naming the one is more useful than refusing everything.
 */
const bundleSchema = object(
  { source: sourceSchema, records: arrayOf(unknownValue(), { max: 100_000 }) },
  { strict: true },
);

export interface ContentProblem {
  /** Which record, by key, or `bundle` for the file itself. */
  where: string;
  message: string;
}

export interface ValidatedBundle {
  records: ContentRecord[];
  problems: ContentProblem[];
  /** Records dropped because an earlier record already claimed the key. */
  duplicates: string[];
}

/**
 * Validates a bundle and flattens it into records that carry their source.
 *
 * Duplicates are dropped rather than rejected, and reported. A source that lists the same
 * creature twice is a source with a mistake in it, not a reason to import nothing — but a
 * silent overwrite would mean the last copy wins for reasons nobody can see, so the first is
 * kept and the rest are named.
 */
export function validateBundle(input: unknown): ValidatedBundle {
  const checked = validate(bundleSchema, input);
  if (!checked.ok) {
    return {
      records: [],
      problems: [{ where: 'bundle', message: describe(checked.issues) }],
      duplicates: [],
    };
  }

  const { source, records } = checked.value as { source: SourceRef; records: unknown[] };
  const problems: ContentProblem[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  const out: ContentRecord[] = [];

  for (const [index, entry] of records.entries()) {
    const shape = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    const identity =
      typeof shape.kind === 'string' && typeof shape.key === 'string'
        ? `${shape.kind}:${shape.key}`
        : `record ${index}`;

    if (seen.has(identity)) {
      duplicates.push(identity);
      continue;
    }

    const record = validate(recordSchema, { ...shape, source });
    if (!record.ok) {
      problems.push({ where: identity, message: describe(record.issues) });
      continue;
    }

    seen.add(identity);
    out.push(record.value);
  }

  return { records: out, problems, duplicates };
}

/** One record, for the caller that already has a source and is checking a single entry. */
export function validateContent(input: unknown): ContentRecord | ContentProblem {
  const checked = validate(recordSchema, input);
  return checked.ok ? checked.value : { where: 'record', message: describe(checked.issues) };
}
