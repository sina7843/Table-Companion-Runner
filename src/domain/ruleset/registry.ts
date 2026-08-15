/**
 * Ruleset lookup.
 *
 * This is the ONLY module in the application that imports a concrete adapter. Everything
 * else asks the registry for a `Ruleset` and talks to the interface, which is what keeps
 * the product game-system agnostic in practice rather than only on paper.
 */
import type { GameSystem, GameSystemId } from '../types.ts';
import type { Ruleset } from './Ruleset.ts';
import { dnd5e2024 } from './dnd5e/index.ts';

const ADAPTERS: readonly Ruleset[] = [dnd5e2024];

/**
 * Systems the product knows about, including ones with no adapter yet. The design shows
 * these with a stated reason rather than hiding them, so a DM evaluating the product can
 * see that the architecture supports them.
 */
const ANNOUNCED_SYSTEMS: readonly GameSystem[] = [
  ...ADAPTERS.map((adapter) => adapter.system),
  {
    id: 'pathfinder-2e' as GameSystemId,
    name: 'Pathfinder 2e',
    summary: 'Rules layer in progress — no content imported yet',
    status: 'unavailable',
    unavailableReason: 'Rules layer in progress — no content imported yet',
  },
];

export function listGameSystems(): readonly GameSystem[] {
  return ANNOUNCED_SYSTEMS;
}

export function findRuleset(systemId: GameSystemId): Ruleset | null {
  return ADAPTERS.find((adapter) => adapter.system.id === systemId) ?? null;
}

/**
 * Resolves the adapter for a system, throwing when there is none.
 *
 * Throwing is deliberate: a campaign referencing a system with no adapter is a broken
 * invariant, not a state to render around. `findRuleset` is there for the one screen that
 * legitimately asks "is this supported?" — the game-system picker.
 */
export function requireRuleset(systemId: GameSystemId): Ruleset {
  const ruleset = findRuleset(systemId);
  if (!ruleset) throw new Error(`No ruleset adapter registered for game system "${systemId}"`);
  return ruleset;
}
