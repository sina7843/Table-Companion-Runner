/**
 * Loads the demo world into a development database.
 *
 * The fixtures were the product's data source through Phase 1 and they are the design's own
 * world — a live fight, four characters, two campaigns, fifty creatures. They stay useful
 * as a development seed, and they stop being production storage the moment the store above
 * exists. That is the whole change in status: same data, no longer the source of truth.
 *
 * Every statement is insert-only with `on conflict do nothing`. Running this twice changes
 * nothing, and running it against a database you are working in cannot lose your work —
 * there is no delete, no truncate and no reset anywhere in this file.
 *
 * Library monsters are inserted here with `origin = 'library'` and no owner, which is the
 * one place reference content is written. The store cannot write a library row at all;
 * ingest is its own boundary and TC-P06 owns the real pipeline.
 */
import { readConfig } from './config.ts';
import { createDatabase, type Db } from './db.ts';
import { migrate } from './migrate.ts';
import { setPassword } from './auth.ts';
import {
  ACTIVITY,
  CAMPAIGNS,
  CHARACTERS,
  COMBATS,
  ENCOUNTERS,
  MONSTERS,
  RECENTS,
  ROLLS,
  USERS,
} from '../src/domain/data/fixtures.ts';

/**
 * The password every seeded account gets.
 *
 * Deliberately committed and deliberately weak-looking: it opens invented characters on a
 * localhost database and nothing else. `main.ts` refuses to seed when NODE_ENV=production.
 */
export const DEV_PASSWORD = 'table-companion-dev';

/** `u-marta` becomes `marta@example.test`. `.test` is reserved and can never route. */
export const devEmailFor = (userId: string): string => `${userId.replace(/^u-/, '')}@example.test`;

export interface SeedResult {
  users: number;
  campaigns: number;
  characters: number;
  monsters: number;
  encounters: number;
  combats: number;
  rolls: number;
}

export async function seed(db: Db): Promise<SeedResult> {
  return db.tx(async (tx) => {
    for (const user of USERS) {
      await tx.query(
        'insert into users (id, display_name) values ($1,$2) on conflict (id) do nothing',
        [user.id, user.displayName],
      );
      // A development password so the demo world can be signed into. `setPassword` only
      // writes where there is none, so changing one and re-seeding does not undo the change.
      // These accounts exist on a localhost database holding invented data; the password is
      // in `.env.example` because it guards nothing.
      await setPassword(tx, user.id, devEmailFor(user.id), DEV_PASSWORD);
    }

    for (const campaign of CAMPAIGNS) {
      await tx.query(
        `insert into campaigns (id, name, system_id, dm_user_id, invite_code, created_at)
         values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing`,
        [
          campaign.id,
          campaign.name,
          campaign.systemId,
          campaign.dmUserId,
          campaign.inviteCode,
          campaign.createdAt,
        ],
      );
      await tx.query(
        `insert into invites (code, campaign_id, created_by) values ($1,$2,$3)
         on conflict (code) do nothing`,
        [campaign.inviteCode, campaign.id, campaign.dmUserId],
      );
    }

    // Characters before members: a member row may point at the character it plays.
    for (const character of CHARACTERS) {
      await tx.query(
        `insert into characters (id, system_id, campaign_id, owner_user_id, name, subtitle,
           archetype, level, health, attributes, resources, conditions, section_visibility,
           draft, pending_level_up, system_data)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (id) do nothing`,
        [
          character.id,
          character.systemId,
          character.campaignId ?? null,
          character.ownerUserId,
          character.name,
          character.subtitle,
          character.archetype ?? null,
          character.level,
          JSON.stringify(character.health),
          JSON.stringify(character.attributes),
          JSON.stringify(character.resources),
          JSON.stringify(character.conditions),
          JSON.stringify(character.sectionVisibility),
          character.draft ? JSON.stringify(character.draft) : null,
          character.pendingLevelUp ?? false,
          JSON.stringify(character.systemData),
        ],
      );
    }

    for (const campaign of CAMPAIGNS) {
      for (const member of campaign.members) {
        await tx.query(
          `insert into campaign_members (campaign_id, user_id, role, character_id)
           values ($1,$2,$3,$4) on conflict (campaign_id, user_id) do nothing`,
          [campaign.id, member.userId, member.role, member.characterId ?? null],
        );
      }
    }

    for (const monster of MONSTERS) {
      await tx.query(
        `insert into monsters (id, system_id, name, subtitle, origin, owner_user_id, cloned_from,
           challenge_label, challenge_rank, source, facets, attributes, health, derived, traits,
           action_groups, system_data)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (id) do nothing`,
        [
          monster.id,
          monster.systemId,
          monster.name,
          monster.subtitle,
          monster.origin,
          monster.ownerUserId ?? null,
          monster.clonedFrom ?? null,
          monster.challengeLabel,
          monster.challengeRank,
          monster.source,
          JSON.stringify(monster.facets),
          JSON.stringify(monster.attributes),
          JSON.stringify(monster.health),
          JSON.stringify(monster.derived),
          JSON.stringify(monster.traits),
          JSON.stringify(monster.actionGroups),
          JSON.stringify(monster.systemData),
        ],
      );
    }

    for (const encounter of ENCOUNTERS) {
      await tx.query(
        `insert into encounters (id, campaign_id, name, location, entries,
           absent_character_ids, notes, updated_at, last_run_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (id) do nothing`,
        [
          encounter.id,
          encounter.campaignId,
          encounter.name,
          encounter.location ?? null,
          JSON.stringify(encounter.entries),
          encounter.absentCharacterIds ? JSON.stringify(encounter.absentCharacterIds) : null,
          encounter.notes ?? null,
          encounter.updatedAt ?? null,
          encounter.lastRunAt ?? null,
        ],
      );
    }

    for (const combat of COMBATS) {
      await tx.query(
        `insert into combats (id, campaign_id, encounter_template_id, name, location, status,
           round, active_participant_id, started_at, ended_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing`,
        [
          combat.id,
          combat.campaignId,
          combat.encounterTemplateId ?? null,
          combat.name,
          combat.location ?? null,
          combat.status,
          combat.round,
          combat.activeParticipantId,
          combat.startedAt ?? null,
          combat.endedAt ?? null,
        ],
      );

      for (const [ordinal, participant] of combat.participants.entries()) {
        await tx.query(
          `insert into combat_participants (id, combat_id, ordinal, name, subtitle, entity_type,
             initiative, health, conditions, state, death_saves, visibility, targeted, group_key,
             source_kind, source_character_id, source_monster_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           on conflict (id) do nothing`,
          [
            participant.id,
            combat.id,
            ordinal,
            participant.name,
            participant.subtitle,
            participant.entityType,
            participant.initiative,
            JSON.stringify(participant.health),
            JSON.stringify(participant.conditions),
            participant.state,
            participant.deathSaves ? JSON.stringify(participant.deathSaves) : null,
            participant.visibility,
            participant.targeted ?? false,
            participant.groupKey ?? null,
            participant.source.kind,
            participant.source.kind === 'character' ? participant.source.characterId : null,
            participant.source.kind === 'monster' ? participant.source.monsterId : null,
          ],
        );
      }
    }

    for (const roll of ROLLS) {
      await tx.query(
        `insert into rolls (id, combat_id, actor, title, expression, mode, dice, modifier,
           total, outcome, visibility, at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (id) do nothing`,
        [
          roll.id,
          roll.combatId ?? null,
          roll.actor,
          roll.title,
          roll.expression,
          roll.mode,
          JSON.stringify(roll.dice),
          roll.modifier,
          roll.total,
          roll.outcome,
          roll.visibility,
          roll.at,
        ],
      );
    }

    // Recall and the activity feed belong to whoever the demo world's DM is.
    const dmUserId = CAMPAIGNS[0]?.dmUserId ?? USERS[0]?.id;
    if (dmUserId) {
      for (const item of RECENTS) {
        await tx.query(
          `insert into recents (user_id, kind, entity_id, label, href, at)
           values ($1,$2,$3,$4,$5,$6) on conflict (user_id, kind, entity_id) do nothing`,
          [dmUserId, item.kind, item.id, item.label, item.href, item.at],
        );
      }
    }

    for (const entry of ACTIVITY) {
      await tx.query(
        `insert into campaign_activity (id, campaign_id, kind, summary, detail, character_id, at)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
        [
          entry.id,
          entry.campaignId,
          entry.kind,
          entry.summary,
          entry.detail,
          entry.characterId ?? null,
          entry.at,
        ],
      );
    }

    return {
      users: USERS.length,
      campaigns: CAMPAIGNS.length,
      characters: CHARACTERS.length,
      monsters: MONSTERS.length,
      encounters: ENCOUNTERS.length,
      combats: COMBATS.length,
      rolls: ROLLS.length,
    };
  });
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const config = readConfig();
  if (config.isProduction) {
    process.stderr.write('Refusing to seed demo data into a production database.\n');
    process.exit(1);
  }

  const db = createDatabase(config.databaseUrl);
  try {
    await migrate(db);
    const counts = await seed(db);
    process.stdout.write(
      `Seeded (insert-only): ${counts.users} users, ${counts.campaigns} campaigns, ` +
        `${counts.characters} characters, ${counts.monsters} creatures, ` +
        `${counts.encounters} encounters, ${counts.combats} combats, ${counts.rolls} rolls.\n`,
    );
  } finally {
    await db.close();
  }
}
