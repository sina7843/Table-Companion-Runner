/**
 * Runtime validation — the one schema strategy, shared by both sides of the wire.
 *
 * A TypeScript type is erased before a single byte arrives. `as T` is a claim, not a check,
 * and the whole point of this file is that the boundary stops taking the claim.
 *
 * It lives under `src/domain/data/` rather than in `server/` because both halves need the
 * same shapes: the server validates what it is sent, and the client validates what it is
 * given. Two schema modules would be two places to drift, which is the same argument that
 * made `types.ts` the wire format in the first place.
 *
 * Combinators rather than a dependency, for the reason everything else here is: the surface
 * is a few dozen fixed shapes, and this is two hundred lines with no transitive anything.
 * It is not a general-purpose validation library and should not grow into one — if a schema
 * needs something this cannot express, the shape is probably wrong.
 *
 * Two rules the callers rely on:
 *
 * 1. **A request object is strict.** An unrecognised key is an error, not something to
 *    ignore, because over-posting is how a field nobody meant to accept gets written.
 * 2. **A response object is lenient.** Unknown keys are dropped. A server that has grown a
 *    field must not break a client that has not learned about it yet.
 */

export interface Issue {
  /** Dotted path to the offending value: `participants.2.health.current`. */
  path: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface Schema<T> {
  /** Validates and returns a *new* value built from what was accepted. */
  check(value: unknown, path: string): Result<T>;
}

/** The type a schema produces, for keeping a declaration and a domain type in step. */
export type Infer<S> = S extends Schema<infer T> ? T : never;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = (path: string, message: string): Result<never> => ({
  ok: false,
  issues: [{ path, message }],
});

const join = (path: string, key: string | number): string => (path ? `${path}.${key}` : `${key}`);

/** Runs a schema and throws nothing; the caller decides what a failure means. */
export function validate<T>(schema: Schema<T>, value: unknown): Result<T> {
  return schema.check(value, '');
}

/** One line naming at most three problems — enough to fix, short enough to log. */
export function describe(issues: readonly Issue[]): string {
  const named = issues
    .slice(0, 3)
    .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message));
  const rest = issues.length - named.length;
  return rest > 0 ? `${named.join('; ')} (and ${rest} more)` : named.join('; ');
}

/* ── Primitives ─────────────────────────────────────────────────────────────── */

export interface StringOptions {
  /** Rejects the empty string, and any string that is only whitespace. */
  nonEmpty?: boolean;
  max?: number;
  pattern?: RegExp;
}

export function string(options: StringOptions = {}): Schema<string> {
  return {
    check(value, path) {
      if (typeof value !== 'string') return bad(path, 'must be a string');
      if (options.nonEmpty && value.trim() === '') return bad(path, 'must not be empty');
      if (options.max !== undefined && value.length > options.max) {
        return bad(path, `must be at most ${options.max} characters`);
      }
      if (options.pattern && !options.pattern.test(value))
        return bad(path, 'is not in the expected format');
      return ok(value);
    },
  };
}

export interface NumberOptions {
  int?: boolean;
  min?: number;
  max?: number;
}

export function number(options: NumberOptions = {}): Schema<number> {
  return {
    check(value, path) {
      // `Number.isFinite` rather than `typeof`: NaN and Infinity are numbers and neither
      // survives a round trip through JSON, so accepting one only defers the failure.
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return bad(path, 'must be a finite number');
      }
      if (options.int && !Number.isInteger(value)) return bad(path, 'must be a whole number');
      if (options.min !== undefined && value < options.min)
        return bad(path, `must be at least ${options.min}`);
      if (options.max !== undefined && value > options.max)
        return bad(path, `must be at most ${options.max}`);
      return ok(value);
    },
  };
}

export const boolean = (): Schema<boolean> => ({
  check: (value, path) =>
    typeof value === 'boolean' ? ok(value) : bad(path, 'must be true or false'),
});

/** ISO-8601, which is what every `Timestamp` in the domain is. */
export const timestamp = (): Schema<string> => ({
  check(value, path) {
    if (typeof value !== 'string') return bad(path, 'must be a timestamp');
    return Number.isNaN(Date.parse(value)) ? bad(path, 'must be an ISO-8601 timestamp') : ok(value);
  },
});

/**
 * A branded id. Validated as a bounded string; the brand is a compile-time fiction.
 *
 * Pass the branded type — `id<UserId>()` — so a schema declares which id it accepts even
 * though nothing at runtime can tell two ids apart.
 */
export function id<T extends string = string>(max = 128): Schema<T> {
  return {
    check(value, path) {
      const checked = string({ nonEmpty: true, max }).check(value, path);
      return checked.ok ? ok(checked.value as T) : checked;
    },
  };
}

export function oneOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
  const allowed = new Set<string>(values);
  return {
    check: (value, path) =>
      typeof value === 'string' && allowed.has(value)
        ? ok(value as T[number])
        : bad(path, `must be one of: ${values.join(', ')}`),
  };
}

/** Anything JSON can hold. Used only where the ruleset owns the shape and the core must not. */
export const unknownValue = (): Schema<unknown> => ({ check: (value) => ok(value) });

/* ── Composites ─────────────────────────────────────────────────────────────── */

export interface ArrayOptions {
  max?: number;
}

export function arrayOf<T>(item: Schema<T>, options: ArrayOptions = {}): Schema<T[]> {
  return {
    check(value, path) {
      if (!Array.isArray(value)) return bad(path, 'must be an array');
      if (options.max !== undefined && value.length > options.max) {
        return bad(path, `must have at most ${options.max} entries`);
      }
      const out: T[] = [];
      const issues: Issue[] = [];
      for (const [index, entry] of value.entries()) {
        const checked = item.check(entry, join(path, index));
        if (checked.ok) out.push(checked.value);
        else issues.push(...checked.issues);
      }
      return issues.length > 0 ? { ok: false, issues } : ok(out);
    },
  };
}

/** An object whose keys are open but whose values are not — a facet map, a choices bag. */
export function recordOf<T>(item: Schema<T>): Schema<Record<string, T>> {
  return {
    check(value, path) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return bad(path, 'must be an object');
      }
      const out: Record<string, T> = {};
      const issues: Issue[] = [];
      for (const [key, entry] of Object.entries(value)) {
        const checked = item.check(entry, join(path, key));
        if (checked.ok) out[key] = checked.value;
        else issues.push(...checked.issues);
      }
      return issues.length > 0 ? { ok: false, issues } : ok(out);
    },
  };
}

/** Marks a field as absent-able. `null` is accepted and normalised to absent. */
export function optional<T>(inner: Schema<T>): Schema<T | undefined> {
  return {
    check: (value, path) =>
      value === undefined || value === null ? ok(undefined) : inner.check(value, path),
  };
}

/** A field that may hold `null` and means it — `initiative`, `activeParticipantId`. */
export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return {
    check: (value, path) => (value === null ? ok(null) : inner.check(value, path)),
  };
}

export type Shape = Record<string, Schema<unknown>>;

export interface ObjectOptions {
  /**
   * Reject keys the shape does not name.
   *
   * True for anything arriving from a client: an unrecognised key is an attempt to write a
   * field nobody meant to accept. False for anything arriving from the server, where an
   * unknown key means the deployment is newer than this build and is dropped rather than
   * turned into a failure the user cannot act on.
   */
  strict: boolean;
}

type Output<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

export function object<S extends Shape>(shape: S, options: ObjectOptions): Schema<Output<S>> {
  const known = new Set(Object.keys(shape));

  return {
    check(value, path) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return bad(path, 'must be an object');
      }
      const input = value as Record<string, unknown>;
      const issues: Issue[] = [];

      if (options.strict) {
        for (const key of Object.keys(input)) {
          if (!known.has(key))
            issues.push({ path: join(path, key), message: 'is not a known field' });
        }
      }

      // Built key by key from the shape, so the returned object holds only what was
      // declared — an unknown key cannot survive even when it was not an error.
      const out: Record<string, unknown> = {};
      for (const [key, member] of Object.entries(shape)) {
        const checked = member.check(input[key], join(path, key));
        if (!checked.ok) {
          issues.push(...checked.issues);
          continue;
        }
        if (checked.value !== undefined) out[key] = checked.value;
      }

      return issues.length > 0 ? { ok: false, issues } : ok(out as Output<S>);
    },
  };
}

/** A tagged union, chosen by one field. Anything else is guessing. */
export function taggedUnion<T>(tag: string, members: Record<string, Schema<T>>): Schema<T> {
  return {
    check(value, path) {
      if (typeof value !== 'object' || value === null) return bad(path, 'must be an object');
      const discriminant = (value as Record<string, unknown>)[tag];
      if (typeof discriminant !== 'string' || !(discriminant in members)) {
        return bad(join(path, tag), `must be one of: ${Object.keys(members).join(', ')}`);
      }
      return (members[discriminant] as Schema<T>).check(value, path);
    },
  };
}

/** Defers construction, so a schema can name itself. */
export function lazy<T>(build: () => Schema<T>): Schema<T> {
  let cached: Schema<T> | null = null;
  return {
    check: (value, path) => (cached ??= build()).check(value, path),
  };
}
