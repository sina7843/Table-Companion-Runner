/**
 * A fight that is over.
 *
 * Not an empty screen: the log is the thing a DM reads back at the end of a session, and
 * who survived is the thing they need before the next one. Ending a combat by mistake is a
 * common mistake, so reopening is offered here rather than forcing a restart from the
 * template — which would lose every hit point and condition the fight accumulated.
 */
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ListRow,
  SectionHeader,
  Stat,
  StatGrid,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { Link } from 'react-router-dom';
import type { Campaign, CombatInstance, EncounterTemplate, GameSystemId } from '../../domain';
import { useCombatLog } from './useCombatLog';
import { relativeTime } from '../campaign/shared';

export interface CombatEndedProps {
  combat: CombatInstance;
  campaign: Campaign | null;
  template: EncounterTemplate | null;
  systemId: GameSystemId;
  onReopen: () => void;
  busy: boolean;
}

function minutesBetween(from: string | undefined, to: string | undefined): string | null {
  if (!from || !to) return null;
  const span = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(span) || span <= 0) return null;
  return `${Math.max(1, Math.round(span / 60_000))} min`;
}

export function CombatEnded({
  combat,
  campaign,
  template,
  systemId,
  onReopen,
  busy,
}: CombatEndedProps) {
  // The log loads itself here rather than being threaded down: this component only exists
  // once a fight has ended, so the read is unconditional where it is written.
  const log = useCombatLog(combat.id, systemId);
  const standing = combat.participants.filter((entry) => entry.state !== 'defeated');
  const down = combat.participants.filter((entry) => entry.state === 'defeated');
  const duration = minutesBetween(combat.startedAt, combat.endedAt);

  return (
    <DMPage
      eyebrow={[campaign?.name, combat.location, relativeTime(combat.endedAt)]
        .filter(Boolean)
        .join(' · ')}
      title={combat.name}
      actions={
        <>
          <Badge tone="neutral" icon="check">
            Ended
          </Badge>
          {/*
            The mistake this recovers from is ending the fight one click early. Reopening
            keeps every hit point and condition; starting again from the template does not.
          */}
          <Button
            size="sm"
            variant="secondary"
            icon="arrow-counter-clockwise"
            disabled={busy}
            onClick={onReopen}
          >
            Reopen this combat
          </Button>
        </>
      }
    >
      <div className="tc-page">
        {template && (
          <Alert
            tone="info"
            icon="info"
            actions={
              <Button
                size="sm"
                variant="secondary"
                icon="flag-banner"
                as={Link}
                to={`/dm/encounters/${template.id}`}
              >
                Open the encounter
              </Button>
            }
          >
            This fight came from <strong>{template.name}</strong>, which is exactly as you prepared
            it. Run it again whenever you like.
          </Alert>
        )}

        <StatGrid>
          <Stat label="Rounds" value={combat.round} />
          <Stat label="Combatants" value={combat.participants.length} />
          <Stat label="Still standing" value={standing.length} />
          <Stat label="Defeated" value={down.length} />
          {duration && <Stat label="Took" value={duration} />}
          <Stat label="Rolls" value={log.party.length + log.secret.length} />
        </StatGrid>

        <section>
          <SectionHeader
            title="How it ended"
            icon="users-three"
            eyebrow={`${standing.length} of ${combat.participants.length} standing`}
          />
          {combat.participants.map((participant) => (
            <ListRow
              key={participant.id}
              static
              leading={<Avatar name={participant.name} entity={participant.entityType} size="sm" />}
              title={participant.name}
              meta={[
                participant.subtitle,
                `${participant.health.current} / ${participant.health.max} HP`,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={
                participant.state === 'defeated' ? (
                  <Badge tone="neutral" icon="skull">
                    Defeated
                  </Badge>
                ) : participant.state === 'unconscious' ? (
                  <Badge tone="danger" icon="heartbeat">
                    Down
                  </Badge>
                ) : (
                  <Badge tone="success" icon="check">
                    Standing
                  </Badge>
                )
              }
            />
          ))}
        </section>

        <section>
          <SectionHeader
            title="Roll log"
            icon="list-dashes"
            eyebrow={`${log.party.length} sent to the party · ${log.secret.length} DM only`}
          />
          {log.party.length + log.secret.length === 0 ? (
            <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-tertiary)' }}>
              Nothing was rolled in this fight.
            </span>
          ) : (
            [...log.party, ...log.secret]
              .toSorted((a, b) => b.at.localeCompare(a.at))
              .map((entry) => (
                <ListRow
                  key={entry.id}
                  static
                  title={`${entry.actor} — ${entry.title}`}
                  meta={entry.expression || undefined}
                  trailing={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
                      {entry.visibility === 'dm-only' && (
                        <span className="tc-privacy" data-level="dm-only">
                          DM only
                        </span>
                      )}
                      {entry.dice.length > 0 && (
                        <span className="tc-init__init">{entry.total}</span>
                      )}
                    </span>
                  }
                />
              ))
          )}
        </section>
      </div>
    </DMPage>
  );
}
