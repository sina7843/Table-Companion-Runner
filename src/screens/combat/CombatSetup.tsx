/**
 * A fight before it starts.
 *
 * This is a `CombatInstance`, not an `EncounterTemplate`, and the screen says so twice:
 * the eyebrow names the template it came from, and a banner states that nothing here
 * reaches it. Everything a DM can change on this screen is runtime state — who is
 * actually here, what they rolled, what the party can see — because everything else was
 * a decision the template already made.
 *
 * Minimal ceremony: one button rolls for everyone, one button starts round 1, and there
 * is no confirmation between them. A fight begun by accident is one click from being
 * left; a dialog in front of every fight is a tax on every session.
 */
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  NumberInput,
  SectionHeader,
  TextInput,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import {
  requireRuleset,
  type Attribute,
  type Campaign,
  type Character,
  type CombatInstance,
  type CombatParticipant,
  type EncounterTemplate,
  type GameSystemId,
  type Monster,
  type ParticipantId,
} from '../../domain';
import {
  beginCombat,
  groupParticipants,
  removeParticipants,
  renameParticipant,
  rollInitiative,
  setInitiative,
  setupIssues,
  setVisibility,
} from '../../domain/combat/setup';

export interface CombatSetupProps {
  combat: CombatInstance;
  /** Resolved by the route, so this screen never has to guess at a fallback. */
  systemId: GameSystemId;
  campaign: Campaign | null;
  template: EncounterTemplate | null;
  characters: Character[];
  monsters: Map<string, Monster>;
  onChange: (next: CombatInstance) => void;
  busy: boolean;
}

export function CombatSetup({
  combat,
  systemId,
  campaign,
  template,
  characters,
  monsters,
  onChange,
  busy,
}: CombatSetupProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string[]>([]);

  const rules = requireRuleset(systemId);

  /** Where a participant's ability scores come from, whichever kind of thing it is. */
  const attributesFor = useCallback(
    (participant: CombatParticipant): Attribute[] => {
      const source = participant.source;
      if (source.kind === 'character') {
        return characters.find((entry) => entry.id === source.characterId)?.attributes ?? [];
      }
      return monsters.get(source.monsterId)?.attributes ?? [];
    },
    [characters, monsters],
  );

  const groups = useMemo(() => groupParticipants(combat), [combat]);
  const issues = setupIssues(combat);
  const blocked = issues.some((issue) => issue.severity === 'blocking');

  const roll = (onlyMissing: boolean) =>
    onCommand({ kind: 'initiative.roll', onlyMissing });

  const begin = () => {
    const started = beginCombat(combat, rules, new Date().toISOString());
    onChange(started);
    void navigate(`/dm/combat/${combat.id}`, { replace: true });
  };

  const toggleExpanded = (key: string) =>
    setExpanded((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );

  const players = combat.participants.filter((entry) => entry.entityType === 'player').length;
  const creatures = combat.participants.length - players;

  return (
    <DMPage
      eyebrow={[
        'Combat instance',
        template ? `from ${template.name}` : null,
        campaign?.name,
        combat.location,
      ]
        .filter(Boolean)
        .join(' · ')}
      title={combat.name}
      actions={
        <>
          <Badge tone="warning">Preparing</Badge>
          <Button
            size="sm"
            variant="primary"
            icon="caret-right"
            disabled={busy || blocked}
            onClick={begin}
          >
            Begin round 1
          </Button>
        </>
      }
    >
      <div className="tc-page">
        {/*
          The whole point of a template, said once where it matters. The link out is the
          honest answer to "I meant to change the encounter, not this fight".
        */}
        <Alert
          tone="info"
          icon="info"
          actions={
            template && (
              <Button
                size="sm"
                variant="secondary"
                icon="pencil"
                as={Link}
                to={`/dm/encounters/${template.id}/edit`}
              >
                Edit the template instead
              </Button>
            )
          }
        >
          This is a separate fight. Hit points, conditions and initiative change here, and{' '}
          {template ? <strong>{template.name}</strong> : 'the encounter it came from'} stays exactly
          as you prepared it.
        </Alert>

        {issues.map((issue) => (
          <Alert key={issue.message} tone={issue.severity === 'blocking' ? 'danger' : 'warning'}>
            {issue.message}
          </Alert>
        ))}

        <section>
          <SectionHeader
            title="Initiative"
            icon="sword"
            eyebrow={`${combat.participants.length} combatants · ${players} characters · ${creatures} creatures`}
            actions={
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="dice-six"
                  disabled={busy || combat.participants.length === 0}
                  onClick={() => roll(true)}
                >
                  Roll what is missing
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  icon="arrow-clockwise"
                  disabled={busy || combat.participants.length === 0}
                  onClick={() => roll(false)}
                >
                  Re-roll all
                </Button>
              </>
            }
          />

          {groups.length === 0 ? (
            <EmptyState
              icon="users-three"
              title="Nobody is in this fight"
              description="Every combatant was removed. Add them back from the encounter, or leave this fight and start another."
              actions={
                <Button variant="secondary" as={Link} to="/dm/encounters">
                  Back to encounters
                </Button>
              }
            />
          ) : (
            groups.map((group) => {
              const ids = group.members.map((member) => member.id) as ParticipantId[];
              const hidden = group.members.every((member) => member.visibility === 'private');
              const isOpen = expanded.includes(group.key);
              const first = group.members[0];

              return (
                <div key={group.key}>
                  <ListRow
                    static
                    leading={
                      <Avatar
                        name={first?.name ?? group.name}
                        entity={first?.entityType ?? 'monster'}
                        size="sm"
                      />
                    }
                    title={group.name}
                    meta={[
                      first?.subtitle,
                      group.members.length > 1 ? 'one group turn' : null,
                      hidden ? 'hidden from players' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
                      >
                        <NumberInput
                          value={group.initiative ?? 0}
                          min={-10}
                          max={50}
                          width={48}
                          ariaLabel={`${group.name} initiative`}
                          disabled={busy}
                          onChange={(value) => onCommand({ kind: 'initiative.set', participantIds: ids, value })}
                        />
                        <IconButton
                          icon={hidden ? 'eye-slash' : 'eye'}
                          size="sm"
                          active={hidden}
                          disabled={busy}
                          label={
                            hidden
                              ? `Reveal ${group.name} to the party`
                              : `Hide ${group.name} from the party`
                          }
                          onClick={() =>
                            onCommand({
                              kind: 'participant.visibility',
                              participantIds: ids,
                              visibility: hidden ? 'party' : 'private',
                            })
                          }
                        />
                        {group.members.length > 1 && (
                          <IconButton
                            icon={isOpen ? 'caret-down' : 'caret-right'}
                            size="sm"
                            disabled={busy}
                            label={
                              isOpen
                                ? `Collapse ${group.name}`
                                : `Give one of ${group.name} its own name or initiative`
                            }
                            onClick={() => toggleExpanded(group.key)}
                          />
                        )}
                        <IconButton
                          icon="trash"
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          label={`Remove ${group.name} from this fight`}
                          onClick={() => onCommand({ kind: 'participant.remove', participantIds: ids })}
                        />
                      </span>
                    }
                  />

                  {/*
                    Expanding is for the one goblin that is different. It exists because a
                    grouped row cannot express "this one is on the ridge and acts later".
                  */}
                  {isOpen &&
                    group.members.map((member) => (
                      <div
                        key={member.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-8)',
                          padding: 'var(--space-6) var(--space-12) var(--space-6) var(--space-32)',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <TextInput
                          value={member.name}
                          aria-label={`${member.name} name`}
                          disabled={busy}
                          onChange={(event) =>
                            onCommand({
                              kind: 'participant.rename',
                              participantId: member.id,
                              name: event.target.value,
                            })
                          }
                        />
                        <NumberInput
                          value={member.initiative ?? 0}
                          min={-10}
                          max={50}
                          width={48}
                          ariaLabel={`${member.name} initiative`}
                          disabled={busy}
                          onChange={(value) =>
                            onCommand({
                              kind: 'initiative.set',
                              participantIds: [member.id],
                              value,
                            })
                          }
                        />
                        <IconButton
                          icon="trash"
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          label={`Remove ${member.name} from this fight`}
                          onClick={() => onCommand({ kind: 'participant.remove', participantIds: [member.id] })}
                        />
                      </div>
                    ))}
                </div>
              );
            })
          )}
        </section>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-12)',
            flexWrap: 'wrap',
            paddingTop: 'var(--space-12)',
            borderTop: '1px solid var(--color-border-default)',
          }}
        >
          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--color-text-tertiary)' }}>
            <Icon name="info" size={12} /> Rolls, damage and conditions are recorded against this
            fight only.
          </span>
          <div style={{ flex: 1 }} />
          <Button variant="tertiary" as={Link} to="/dm/encounters">
            Leave for now
          </Button>
          <Button variant="primary" icon="caret-right" disabled={busy || blocked} onClick={begin}>
            Begin round 1
          </Button>
        </div>
      </div>
    </DMPage>
  );
}
