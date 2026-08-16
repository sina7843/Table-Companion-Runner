/**
 * The licences this product is allowed to ship content under, and the ones it is not.
 *
 * This is the legal boundary, written as a list rather than as a habit. A source that is not
 * in it cannot be imported into production — not "should not", cannot: the importer refuses,
 * and the refusal names the licence so whoever hits it knows what they are being told.
 *
 * The rule the list encodes: **mechanics are not the question, redistribution is.** Nobody
 * needs permission to write software that adds a modifier to a die roll. Shipping somebody
 * else's *text* — a class description, a stat block, a spell's wording — needs a licence that
 * says so. So an entry here is about whether the words may travel with the product.
 */

import type { LicenseRef } from './model.ts';

/**
 * Creative Commons Attribution 4.0.
 *
 * The System Reference Document is published under this, which is what makes it the one
 * D&D-shaped source this product can ship. Attribution is a condition, not a courtesy, so the
 * text travels with every record and `attributionsFor` is how a screen finds it.
 */
export const CC_BY_4_0: LicenseRef = {
  id: 'cc-by-4.0',
  name: 'Creative Commons Attribution 4.0 International',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  redistributable: true,
  attribution:
    'This work includes material from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
};

/**
 * Content the operator wrote themselves — a homebrew creature, a house rule.
 *
 * Redistributable because it is theirs, and it never leaves their account anyway: homebrew is
 * owned by a user and the database refuses to give a library row an owner.
 */
export const OPERATOR_OWNED: LicenseRef = {
  id: 'operator-owned',
  name: 'Created by the operator',
  url: '',
  redistributable: true,
  attribution: '',
};

/**
 * Everything else.
 *
 * Not a licence so much as the absence of one: a rulebook, a wiki, a community dataset that
 * aggregates published material. A source marked with this can be loaded by a developer on
 * their own machine and cannot be imported into production, which is the whole point of the
 * distinction.
 */
export const NOT_LICENSED: LicenseRef = {
  id: 'not-licensed',
  name: 'No redistribution licence',
  url: '',
  redistributable: false,
  attribution: '',
};

export const KNOWN_LICENSES: readonly LicenseRef[] = [CC_BY_4_0, OPERATOR_OWNED, NOT_LICENSED];

export const licenseById = (id: string): LicenseRef | null =>
  KNOWN_LICENSES.find((license) => license.id === id) ?? null;

/**
 * Sources the project has looked at, and what was concluded about each.
 *
 * Written down because "why is that not imported" is a question that gets asked once a year
 * and answered from memory badly. A blocked source stays on the list with its reason rather
 * than being quietly forgotten.
 */
export interface SourceVerdict {
  id: string;
  name: string;
  license: LicenseRef;
  /** Why, in a sentence. Shown by the importer when it refuses. */
  reason: string;
}

export const SOURCE_VERDICTS: readonly SourceVerdict[] = [
  {
    id: 'srd-5.1',
    name: 'System Reference Document 5.1',
    license: CC_BY_4_0,
    reason:
      'Published by Wizards of the Coast under CC BY 4.0, which permits redistribution with attribution. This is the approved source for the first ruleset.',
  },
  {
    id: 'operator',
    name: "The operator's own content",
    license: OPERATOR_OWNED,
    reason: 'Written by whoever runs the deployment. Theirs to ship.',
  },
  {
    id: '5etools',
    name: '5e.tools and equivalent community datasets',
    license: NOT_LICENSED,
    reason:
      'Aggregates published rulebook material well beyond the SRD, under no licence that permits redistribution. `Requirements.md` §6.35 names it as the expected data source; that expectation cannot be met in production and the requirement is met from the SRD instead. Usable as a development convenience on a machine that is not serving anybody.',
  },
  {
    id: 'rulebook',
    name: 'Published rulebooks (Player’s Handbook, Monster Manual, and the rest)',
    license: NOT_LICENSED,
    reason:
      'Copyrighted text, and much of it Product Identity that no licence covers. Never imported, in production or otherwise.',
  },
] as const;

export const verdictFor = (sourceId: string): SourceVerdict | null =>
  SOURCE_VERDICTS.find((verdict) => verdict.id === sourceId) ?? null;

/**
 * Whether a source may be shipped.
 *
 * One predicate, used by the importer and by the tests, so "approved" cannot come to mean two
 * different things in two places.
 */
export const mayRedistribute = (license: LicenseRef): boolean => license.redistributable;
