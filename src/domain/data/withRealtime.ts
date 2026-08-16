/**
 * Announcing a write.
 *
 * Wraps any `Repositories` so that every mutation publishes the event that says it
 * happened. Doing it here rather than in each implementation means the fixture layer and
 * the HTTP layer both announce identically, and neither one has to remember to — which is
 * the failure mode this exists to remove.
 *
 * Events are notifications, not payloads: the receiver re-reads through the repository, so
 * there is exactly one source of truth even when two devices write at once.
 */
import type { RealtimeChannel } from './realtime.ts';
import type { Repositories } from './repositories.ts';

export function withRealtime(repositories: Repositories, channel: RealtimeChannel): Repositories {
  const { campaigns, characters, monsters, encounters, combats, rolls, drafts } = repositories;

  return {
    ...repositories,

    campaigns: {
      ...campaigns,
      create: async (input) => {
        const created = await campaigns.create(input);
        channel.publish({ kind: 'campaign.changed', campaignId: created.id });
        return created;
      },
    },

    characters: {
      ...characters,
      attachToCampaign: async (characterId, campaignId) => {
        const character = await characters.attachToCampaign(characterId, campaignId);
        channel.publish({ kind: 'character.changed', characterId });
        channel.publish({ kind: 'campaign.changed', campaignId });
        return character;
      },
    },

    monsters: {
      ...monsters,
      create: async (monster) => {
        const created = await monsters.create(monster);
        channel.publish({ kind: 'monster.changed', monsterId: created.id });
        return created;
      },
      save: async (monster) => {
        const saved = await monsters.save(monster);
        channel.publish({ kind: 'monster.changed', monsterId: saved.id });
        return saved;
      },
      remove: async (monsterId) => {
        await monsters.remove(monsterId);
        channel.publish({ kind: 'monster.changed', monsterId });
      },
      cloneFrom: async (sourceId, ownerUserId, ownerName) => {
        const clone = await monsters.cloneFrom(sourceId, ownerUserId, ownerName);
        channel.publish({ kind: 'monster.changed', monsterId: clone.id });
        return clone;
      },
    },

    encounters: {
      ...encounters,
      create: async (input) => {
        const created = await encounters.create(input);
        channel.publish({ kind: 'encounter.changed', encounterId: created.id });
        return created;
      },
      save: async (encounter) => {
        const saved = await encounters.save(encounter);
        channel.publish({ kind: 'encounter.changed', encounterId: saved.id });
        return saved;
      },
      remove: async (encounterId) => {
        await encounters.remove(encounterId);
        channel.publish({ kind: 'encounter.changed', encounterId });
      },
      duplicate: async (encounterId) => {
        const copy = await encounters.duplicate(encounterId);
        channel.publish({ kind: 'encounter.changed', encounterId: copy.id });
        return copy;
      },
    },

    combats: {
      ...combats,
      startFromTemplate: async (encounterId) => {
        const combat = await combats.startFromTemplate(encounterId);
        // Both: a fight began, and the template it came from now says it has been run.
        channel.publish({ kind: 'combat.changed', combatId: combat.id });
        channel.publish({ kind: 'encounter.changed', encounterId });
        return combat;
      },
      command: async (input) => {
        const outcome = await combats.command(input);
        // A replayed command changed nothing, so it announces nothing — otherwise a retry
        // would make every other device re-read for no reason.
        if (!outcome.replayed) {
          channel.publish({
            kind: outcome.combat.status === 'ended' ? 'combat.ended' : 'combat.changed',
            combatId: outcome.combat.id,
          });
        }
        return outcome;
      },
    },

    rolls: {
      ...rolls,
      record: async (roll) => {
        const recorded = await rolls.record(roll);
        // A secret roll still announces that *a* roll happened — the event carries no
        // total and no visibility, and the receiver re-reads through the repository,
        // which is where the DM-only rule is enforced.
        if (recorded.combatId) {
          channel.publish({
            kind: 'roll.recorded',
            combatId: recorded.combatId,
            rollId: recorded.id,
          });
        }
        return recorded;
      },
    },

    drafts: {
      ...drafts,
      finalise: async (draftId, character) => {
        const created = await drafts.finalise(draftId, character);
        channel.publish({ kind: 'character.changed', characterId: created.id });
        return created;
      },
    },
  };
}
