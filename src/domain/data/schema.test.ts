/**
 * The validators, and the schemas built on them.
 *
 * The test that matters most is the last group: every fixture in the demo world is pushed
 * through the *strict* schema for its type. Those fixtures are the design's own data — a live
 * fight, four characters, fifty-one creatures, thirteen encounters — so a schema that rejects
 * one of them is wrong about the domain, and a schema that accepts a shape the domain does not
 * have would not be caught by types alone. This is what stops the schemas being a second,
 * quietly diverging description of `types.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrayOf,
  boolean,
  describe as describeIssues,
  number,
  object,
  oneOf,
  optional,
  nullable,
  recordOf,
  string,
  timestamp,
  validate,
} from './schema.ts';
import {
  campaignSchema,
  characterSchema,
  combatSchema,
  createCampaignSchema,
  emptyBodySchema,
  encounterSchema,
  monsterSchema,
  rollSchema,
  signInSchema,
  signUpSchema,
} from './contractSchemas.ts';
import { CAMPAIGNS, CHARACTERS, COMBATS, ENCOUNTERS, MONSTERS, ROLLS } from './fixtures.ts';

/* ── Primitives ─────────────────────────────────────────────────────────────── */

test('a string is a string, and its bounds are real', () => {
  assert.equal(validate(string(), 'ok').ok, true);
  assert.equal(validate(string(), 42).ok, false);
  assert.equal(validate(string(), null).ok, false);
  assert.equal(validate(string({ nonEmpty: true }), '   ').ok, false);
  assert.equal(validate(string({ max: 3 }), 'abcd').ok, false);
  assert.equal(validate(string({ max: 3 }), 'abc').ok, true);
});

test('a number must be finite, which NaN and Infinity are not', () => {
  assert.equal(validate(number(), 1.5).ok, true);
  assert.equal(validate(number(), Number.NaN).ok, false);
  assert.equal(validate(number(), Number.POSITIVE_INFINITY).ok, false);
  assert.equal(validate(number({ int: true }), 1.5).ok, false);
  assert.equal(validate(number({ min: 0 }), -1).ok, false);
  assert.equal(validate(number({ max: 10 }), 11).ok, false);
  // A numeric string is not a number. Coercing one here is how a boundary starts guessing.
  assert.equal(validate(number(), '7').ok, false);
});

test('a boolean is not the string "true", and a timestamp is not any string', () => {
  assert.equal(validate(boolean(), true).ok, true);
  assert.equal(validate(boolean(), 'true').ok, false);
  assert.equal(validate(timestamp(), new Date().toISOString()).ok, true);
  assert.equal(validate(timestamp(), 'sometime tuesday').ok, false);
});

test('optional accepts absent and null; nullable accepts null and means it', () => {
  const withOptional = object({ note: optional(string()) }, { strict: true });
  assert.deepEqual(validate(withOptional, {}), { ok: true, value: {} });
  assert.deepEqual(validate(withOptional, { note: null }), { ok: true, value: {} });
  assert.deepEqual(validate(withOptional, { note: 'hi' }), { ok: true, value: { note: 'hi' } });

  const withNullable = object({ initiative: nullable(number()) }, { strict: true });
  assert.deepEqual(validate(withNullable, { initiative: null }), {
    ok: true,
    value: { initiative: null },
  });
  assert.equal(validate(withNullable, {}).ok, false);
});

test('an issue names a path, so a failure says where', () => {
  const schema = object(
    { rows: arrayOf(object({ value: number() }, { strict: true })) },
    { strict: true },
  );
  const result = validate(schema, { rows: [{ value: 1 }, { value: 'no' }] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issues[0]?.path, 'rows.1.value');
  assert.match(describeIssues(result.issues), /rows\.1\.value/);
});

/* ── Strict versus lenient ──────────────────────────────────────────────────── */

test('a strict object refuses a key it does not know — that is what over-posting is', () => {
  const strict = object({ name: string() }, { strict: true });
  const result = validate(strict, { name: 'Quill', isAdmin: true });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issues[0]?.path, 'isAdmin');
  assert.match(result.issues[0]?.message ?? '', /not a known field/);
});

test('a lenient object drops what it does not know, rather than failing on it', () => {
  const lenient = object({ name: string() }, { strict: false });
  const result = validate(lenient, { name: 'Quill', addedInAFutureVersion: 42 });
  assert.deepEqual(result, { ok: true, value: { name: 'Quill' } });
});

test('an unknown key cannot survive even when it is not an error', () => {
  // The returned object is built from the shape, key by key. This is the property the route
  // handlers depend on: `ctx.body` cannot carry a field the schema does not name.
  const lenient = object({ id: string() }, { strict: false });
  const result = validate(lenient, { id: 'x', role: 'dm' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal('role' in result.value, false);
});

test('an array is bounded, and a record checks its values but not its keys', () => {
  assert.equal(validate(arrayOf(number(), { max: 2 }), [1, 2, 3]).ok, false);
  assert.equal(validate(recordOf(oneOf(['a', 'b'])), { anything: 'a' }).ok, true);
  assert.equal(validate(recordOf(oneOf(['a', 'b'])), { anything: 'c' }).ok, false);
  // An array is not an object, whatever `typeof` says.
  assert.equal(validate(recordOf(number()), [1, 2]).ok, false);
});

/* ── Request bodies ─────────────────────────────────────────────────────────── */

test('credentials are bounded and never touched', () => {
  const result = validate(signInSchema, { email: '  Marta@Example.test ', password: '  spaces  ' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Neither is trimmed or lower-cased here: the only safe transformation of a secret is none,
  // and normalising the address is the account layer's decision, made once, further in.
  assert.equal(result.value.password, '  spaces  ');
  assert.equal(result.value.email, '  Marta@Example.test ');

  assert.equal(validate(signInSchema, { email: 'a@b.test' }).ok, false, 'password is required');
  assert.equal(validate(signInSchema, { email: '', password: 'x' }).ok, false);
  assert.equal(
    validate(signUpSchema, { email: 'a@b.test', password: 'x'.repeat(2000), displayName: 'A' }).ok,
    false,
    'an unbounded password is unbounded scrypt work',
  );
});

test('an empty body means empty, not "anything"', () => {
  assert.deepEqual(validate(emptyBodySchema, {}), { ok: true, value: {} });
  assert.equal(validate(emptyBodySchema, { role: 'dm' }).ok, false);
});

test('a create body cannot smuggle a field the shape does not name', () => {
  assert.equal(
    validate(createCampaignSchema, {
      name: 'Lost Mine',
      systemId: 'dnd5e',
      dmUserId: 'u-marta',
      inviteCode: 'FORGED-0001',
    }).ok,
    false,
  );
});

test('security-sensitive fields are checked as values, never coerced into one', () => {
  const base = ROLLS[0];
  assert.ok(base);
  // A visibility that is not one of the five is refused, rather than defaulted to something.
  assert.equal(validate(rollSchema(true), { ...base, visibility: 'everyone' }).ok, false);
  assert.equal(validate(rollSchema(true), { ...base, visibility: 'dm-only' }).ok, true);

  const monster = MONSTERS[0];
  assert.ok(monster);
  assert.equal(validate(monsterSchema(true), { ...monster, origin: 'official' }).ok, false);
});

/* ── The fixtures, through the strict schemas ───────────────────────────────── */

function everyOne<T>(label: string, records: readonly T[], schema: Parameters<typeof validate>[0]) {
  assert.ok(records.length > 0, `${label}: nothing to check`);
  for (const record of records) {
    const result = validate(schema as never, record);
    if (!result.ok) {
      assert.fail(`${label} failed validation: ${describeIssues(result.issues)}`);
    }
  }
}

test('every campaign, character and encounter in the demo world validates strictly', () => {
  everyOne('campaign', CAMPAIGNS, campaignSchema(true));
  everyOne('character', CHARACTERS, characterSchema(true));
  everyOne('encounter', ENCOUNTERS, encounterSchema(true));
});

test('every creature in the library validates strictly, action groups and all', () => {
  everyOne('monster', MONSTERS, monsterSchema(true));
});

test('every combat and every roll validates strictly', () => {
  everyOne('combat', COMBATS, combatSchema(true));
  everyOne('roll', ROLLS, rollSchema(true));
});

test('a fight that has been through the wire still validates on the way back', () => {
  // Lenient, as a response is. The round trip through JSON is where an undefined becomes an
  // absent key and a Date would become a string, so it is the shape worth checking.
  const fight = COMBATS[0];
  assert.ok(fight);
  const overTheWire: unknown = JSON.parse(JSON.stringify(fight));
  const result = validate(combatSchema(false), overTheWire);
  assert.equal(result.ok, true, result.ok ? '' : describeIssues(result.issues));
  if (!result.ok) return;
  assert.equal(result.value.participants.length, fight.participants.length);
  assert.deepEqual(
    result.value.participants.map((entry) => entry.visibility),
    fight.participants.map((entry) => entry.visibility),
  );
});
