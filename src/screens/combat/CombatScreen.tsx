/**
 * The combat route.
 *
 * It owns loading a `CombatInstance` and writing runtime changes back, and hands the
 * fight to whichever surface matches its status. `preparing` is `CombatSetup`; `live` is
 * the combat runner, which is TC-11 — until then it states what is true of the fight
 * rather than pretending nothing is running.
 *
 * All state lives here rather than in the setup screen so there is exactly one writer,
 * and that writer only ever calls `combats.save`. There is no code path from this route
 * to `encounters.save`, which is what keeps a running fight off the template it came from.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ListRow,
  SectionHeader,
  Skeleton,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import {
  CURRENT_USER_ID,
  requireRuleset,
  useAsync,
  useRepositories,
  type CombatInstance,
  type CombatInstanceId,
  type Monster,
} from '../../domain';
import { CombatRunner } from './CombatRunner';
import { CombatSetup } from './CombatSetup';
import { groupParticipants } from './setup';

export function CombatScreen() {
  const { combatId } = useParams();
  const { campaigns, characters, combats, encounters, monsters } = useRepositories();

  const [combat, setCombat] = useState<CombatInstance | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const loaded = useAsync(async () => {
    const found = combatId
      ? await combats.byId(combatId as CombatInstanceId)
      : await combats.liveForUser(CURRENT_USER_ID);
    if (!found) return null;

    const [campaign, roster, creatures, template] = await Promise.all([
      campaigns.byId(found.campaignId),
      characters.listForCampaign(found.campaignId),
      monsters.list(),
      found.encounterTemplateId ? encounters.byId(found.encounterTemplateId) : null,
    ]);

    // A fight without a campaign has lost the thing that names its rules, so it is a
    // broken record rather than a screen to render.
    if (!campaign) return null;

    return {
      combat: found,
      campaign,
      systemId: campaign.systemId,
      characters: roster,
      monsters: new Map<string, Monster>(creatures.map((entry) => [entry.id, entry])),
      template,
    };
  }, ['combat', combatId ?? '']);

  useEffect(() => {
    if (loaded.status === 'ready' && loaded.data) setCombat(loaded.data.combat);
  }, [loaded.status, loaded.data]);

  // Runtime edits write straight through: initiative and who is present are not a draft,
  // and a debounce here would mean a fight that started before its roster was saved.
  const inFlight = useRef(0);
  const change = (next: CombatInstance) => {
    setCombat(next);
    setBusy(true);
    inFlight.current += 1;
    void combats.save(next).then(
      () => {
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
        setFailure(null);
      },
      (error: unknown) => {
        inFlight.current -= 1;
        if (inFlight.current === 0) setBusy(false);
        setFailure(error instanceof Error ? error.message : 'That change was not saved.');
      },
    );
  };

  if (loaded.status === 'loading') {
    return (
      <DMPage eyebrow="Session" title="Combat">
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Loading this fight
          </span>
          <Skeleton count={8} height={44} gap={8} />
        </div>
      </DMPage>
    );
  }

  if (loaded.status === 'error') {
    return (
      <DMPage eyebrow="Session" title="Combat">
        <div className="tc-page">
          <Alert
            tone="danger"
            title="Could not load this fight"
            actions={
              <Button size="sm" variant="secondary" onClick={loaded.reload}>
                Try again
              </Button>
            }
          >
            {loaded.error.message}
          </Alert>
        </div>
      </DMPage>
    );
  }

  if (!loaded.data || !combat) {
    return (
      <DMPage eyebrow="Session" title="Combat">
        <div className="tc-page">
          <EmptyState
            icon="sword"
            title="No combat is running"
            description="Start one from a prepared encounter, and it will pin itself to the top of the sidebar until it ends."
            actions={
              <Button variant="primary" icon="flag-banner" as={Link} to="/dm/encounters">
                Open encounters
              </Button>
            }
          />
        </div>
      </DMPage>
    );
  }

  if (combat.status === 'preparing') {
    return (
      <>
        {failure && (
          <div className="tc-page" style={{ paddingBottom: 0 }}>
            <Alert tone="danger" title="That change was not saved">
              {failure}
            </Alert>
          </div>
        )}
        <CombatSetup
          combat={combat}
          systemId={loaded.data.systemId}
          campaign={loaded.data.campaign}
          template={loaded.data.template}
          characters={loaded.data.characters}
          monsters={loaded.data.monsters}
          onChange={change}
          busy={busy}
        />
      </>
    );
  }

  if (combat.status === 'live') {
    return (
      <>
        {failure && (
          <div className="tc-page" style={{ paddingBottom: 0 }}>
            <Alert tone="danger" title="That change was not saved">
              {failure}
            </Alert>
          </div>
        )}
        <CombatRunner
          combat={combat}
          rules={requireRuleset(loaded.data.systemId)}
          campaign={loaded.data.campaign}
          characters={loaded.data.characters}
          monsters={loaded.data.monsters}
          onChange={change}
          busy={busy}
        />
      </>
    );
  }

  // Ended. The roll log and the after-action summary are TC-11b; what is true right now
  // is who was in it and in what order.
  const groups = groupParticipants(combat);

  return (
    <DMPage
      eyebrow={[loaded.data.campaign?.name, combat.location].filter(Boolean).join(' · ')}
      title={combat.name}
      actions={<Badge tone="neutral">Ended</Badge>}
    >
      <div className="tc-page">
        {loaded.data.template && (
          <Alert tone="info" icon="info">
            This fight came from <strong>{loaded.data.template.name}</strong>. Nothing that happened
            here changed that template.
          </Alert>
        )}

        <section>
          <SectionHeader
            title="Turn order"
            icon="sword"
            eyebrow={`${combat.participants.length} combatants · ${combat.round} rounds`}
          />
          {groups.map((group) => (
            <ListRow
              key={group.key}
              static
              title={group.name}
              meta={group.members[0]?.subtitle}
              trailing={<span className="tc-init__init">{group.initiative ?? '—'}</span>}
            />
          ))}
        </section>
      </div>
    </DMPage>
  );
}
