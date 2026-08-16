/**
 * The shapes this adapter writes into a content record, and reads back out of one.
 *
 * Separated from `builder.ts` at TC-P06 so `content.ts` can name them without a cycle:
 * the builder reads its catalogue from the content layer, and the content layer has to
 * know what shape the catalogue is in. Nothing generic imports this file — these are D&D
 * words and they stay behind the adapter.
 */
import type { BuilderOption } from '../Ruleset.ts';

export type { BuilderOption };

export interface SpeciesDefinition {
  key: string;
  label: string;
  description: string;
  speed: number;
  traits: string[];
}

export interface BackgroundDefinition {
  key: string;
  label: string;
  description: string;
  /** 2024 rules: a background grants +2/+1 across two abilities. */
  increases: { ability: string; amount: number }[];
  skills: string[];
  feature: string;
}

export interface ClassDefinition {
  key: string;
  label: string;
  description: string;
  hitDie: number;
  savingThrows: string[];
  /** Skills this class may choose from. */
  skillChoices: string[];
  skillCount: number;
  armour: string;
  weapons: string;
  /** Starting armour key, used to calculate armour class. */
  startingArmour: string;
  startingShield: boolean;
  levelOneFeatures: string[];
  subclassLevel: number;
}
