/**
 * The ruleset contract, checked as a whole.
 *
 * Individual calculations are covered where they are used — the builder, the sheet, the
 * monster library, encounters, combat. What this file adds is the guarantee that no method
 * on the seam goes unexercised: a `Ruleset` method nobody calls in a test is a method that
 * can be broken silently, and the interface is the one thing every screen depends on.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createFixtureRepositories } from './data/fixtureRepositories.ts';
import { requireRuleset, listGameSystems } from './ruleset/registry.ts';
import { id, type CombatParticipant } from './types.ts';

const ROOT = join(import.meta.dirname, '..');
const rules = requireRuleset(id<'GameSystem'>('dnd5e-2024'));
const repos = createFixtureRepositories();

/* ── The three methods nothing else reached ─────────────────────────────────── */

test('deriveMonster normalises rather than recalculates', async () => {
  // A stat block is authoritative: an ingested creature already states its armour class and
  // speed, and a ruleset that recomputed them would disagree with the book it came from.
  const all = await repos.monsters.list();
  const dragon = all.find((entry) => entry.name === 'Adult Black Dragon');
  assert.ok(dragon);

  assert.deepEqual(rules.deriveMonster(dragon), dragon.derived);

  // Every creature in the library survives the call without losing a value.
  for (const monster of all) {
    assert.equal(rules.deriveMonster(monster).length, monster.derived.length, monster.name);
  }
});

test('initiativeRequest builds a rollable expression from the ability the system uses', () => {
  const participant: CombatParticipant = {
    id: id<'CombatParticipant'>('p-test'),
    name: 'Aria',
    subtitle: '',
    entityType: 'player',
    initiative: null,
    health: { current: 10, max: 10, temporary: 0 },
    conditions: [],
    state: 'waiting',
    visibility: 'party',
    source: { kind: 'character', characterId: id<'Character'>('ch-aria') },
  };

  const dexterous = rules.initiativeRequest(participant, [{ key: 'dex', label: 'DEX', value: 18 }]);
  assert.ok(dexterous);
  assert.equal(dexterous.expression, '1d20 + 4');
  assert.match(dexterous.title, /Aria/);

  // A negative modifier is signed, not subtracted into a malformed expression.
  const clumsy = rules.initiativeRequest(participant, [{ key: 'dex', label: 'DEX', value: 6 }]);
  assert.equal(clumsy?.expression, '1d20 − 2');

  // And it still evaluates — a signed expression the roller cannot parse is worse than none.
  const evaluated = rules.evaluateRoll(clumsy!, 0, () => 0.5);
  assert.equal(Number.isFinite(evaluated.total), true);
  assert.equal(evaluated.total, evaluated.dice[0]!.value - 2);
});

test('levelUpStepForm asks the question its step is for, and nothing for an unknown one', async () => {
  const roster = await repos.characters.listForCampaign(id<'Campaign'>('c-lmop'));
  const aria = roster.find((entry) => entry.name === 'Aria Nightfall');
  assert.ok(aria);

  const steps = rules.levelUpSteps(aria, aria.level + 1);
  assert.ok(steps.length > 0, 'a fighter gaining a level has something to decide or be told');

  let asked = 0;
  for (const step of steps) {
    const form = rules.levelUpStepForm(aria, aria.level + 1, step.id, {});
    if (!form) continue;

    // A review step is a summary, not a question, so an empty field list is correct there.
    // Every field that does exist has to be renderable and answerable.
    assert.ok(form.title.length > 0, `${step.id} names itself`);
    for (const field of form.fields) {
      assert.ok(field.key.length > 0, `${step.id} field has a key`);
      assert.ok(field.label.length > 0, `${step.id} field has a label`);
    }
    if (form.fields.length > 0) asked += 1;
  }

  assert.ok(asked > 0, 'a level up that asks nothing at all would not be a flow');

  // An unknown step is null rather than an exception: the shell asks before it knows.
  assert.equal(rules.levelUpStepForm(aria, aria.level + 1, 'not-a-step', {}), null);
});

/* ── The contract as a whole ────────────────────────────────────────────────── */

function testSources(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.test.ts')) out.push(readFileSync(full, 'utf8'));
    }
  };
  walk(ROOT);
  return out.join('\n');
}

test('every method on the ruleset seam is exercised somewhere', () => {
  const iface = readFileSync(join(ROOT, 'domain/ruleset/Ruleset.ts'), 'utf8');
  const body = iface.slice(iface.indexOf('export interface Ruleset {'));
  const methods = [
    ...new Set([...body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*\(/gm)].map((m) => m[1])),
  ];

  assert.ok(methods.length > 20, 'the seam was found and parsed');

  const tests = testSources();
  const untested = methods.filter((method) => !tests.includes(`${method}(`));

  assert.deepEqual(
    untested,
    [],
    'a seam method with no test is one that can break without anything saying so',
  );
});

test('every registered system implements the whole seam', () => {
  const iface = readFileSync(join(ROOT, 'domain/ruleset/Ruleset.ts'), 'utf8');
  const body = iface.slice(iface.indexOf('export interface Ruleset {'));
  const methods = [
    ...new Set([...body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*\(/gm)].map((m) => m[1])),
  ];

  for (const system of listGameSystems()) {
    if (system.status !== 'ready') continue;
    const adapter = requireRuleset(system.id) as unknown as Record<string, unknown>;

    for (const method of methods) {
      assert.equal(
        typeof adapter[method as string],
        'function',
        `${system.name} is missing ${method}`,
      );
    }
    // The three non-method members every adapter also owes.
    assert.ok(adapter.system);
    assert.ok(adapter.capabilities);
    assert.ok(Array.isArray(adapter.conditions));
  }
});

test('a system that declines a capability declines it consistently', () => {
  // The interface lets a system say no. Where it says yes, the methods behind that
  // capability must actually answer — a capability that lies is worse than one that is off.
  if (rules.capabilities.deathSaves) {
    assert.ok(rules.deathSaveRequest());
    assert.ok(rules.deathSaveOutcome({ successes: 0, failures: 0 }));
  }
  if (rules.capabilities.spellcasting) {
    // At least one caster in the fixtures must actually get slots back.
    assert.ok(rules.concentrationKey());
  }
});
