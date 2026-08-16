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
import { Alert, Button, EmptyState, Skeleton } from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { useConnection } from '../../app/useConnection';
import {
  useUserId,
  requireRuleset,
  useAsync,
  useRealtime,
  useRepositories,
  type CombatInstance,
  type CombatInstanceId,
  type Monster,
} from '../../domain';
import { CombatEnded } from './CombatEnded';
import { CombatRunner } from './CombatRunner';
import { CombatSetup } from './CombatSetup';
import type { CombatCommand } from '../../domain/combat/commands';

export function CombatScreen() {
  const { combatId } = useParams();
  const { campaigns, characters, combats, encounters, monsters } = useRepositories();

  const connection = useConnection();
  const userId = useUserId();
  const [combat, setCombat] = useState<CombatInstance | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const loaded = useAsync(async () => {
    const found = combatId
      ? await combats.byId(combatId as CombatInstanceId)
      : userId
        ? await combats.liveForUser(userId)
        : null;
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
  }, ['combat', combatId ?? '', userId ?? '']);

  useEffect(() => {
    if (loaded.status === 'ready' && loaded.data) setCombat(loaded.data.combat);
  }, [loaded.status, loaded.data]);

  // Another device changed this fight. The event is a notification, so this re-reads
  // rather than trusting a payload — one source of truth even when two people act at once.
  useRealtime(['combat.changed', 'combat.ended'], (event) => {
    if ('combatId' in event && event.combatId === combat?.id) loaded.reload();
  });

  // Runtime edits write straight through: initiative and who is present are not a draft,
  // and a debounce here would mean a fight that started before its roster was saved.
  const inFlight = useRef(0);
  /** The command a failed write was carrying, so Try again re-sends the same one. */
  const pending = useRef<CombatCommand | null>(null);

  /**
   * Every change to a fight, since TC-P04.
   *
   * The screen states an intent and the server answers with the authoritative fight. It no
   * longer computes the new state, because it is no longer the only device that might be
   * computing one. A `commandId` is minted per attempt-group, so a retry after a dropped
   * response is recognised rather than applied twice, and `version` is what the server checks
   * before it applies anything.
   */
  const send = (command: CombatCommand, commandId = crypto.randomUUID()) => {
    const current = combat;
    if (!current) return;

    setBusy(true);
    inFlight.current += 1;
    pending.current = command;

    void combats
      .command({
        combatId: current.id,
        commandId,
        expectedVersion: current.version ?? 0,
        command,
      })
      .then(
        (outcome) => {
          inFlight.current -= 1;
          if (inFlight.current === 0) setBusy(false);
          pending.current = null;
          setCombat(outcome.combat);
          setFailure(null);
          connection.reportSuccess();
        },
        (error: unknown) => {
          inFlight.current -= 1;
          if (inFlight.current === 0) setBusy(false);
          // Nothing local was changed optimistically, so nothing is lost — the fight on
          // screen is still the last one the server confirmed.
          setFailure(error instanceof Error ? error.message : 'That change was not saved.');
          connection.reportFailure();
        },
      );
  };

  const retry = () => {
    if (pending.current) send(pending.current);
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

  /**
   * What happened, what is still safe, what to do next — in that order, and never a word
   * about the transport. A failed write has not lost the fight: it is on screen, and Try
   * again re-sends exactly what did not land.
   */
  const status = (
    <>
      {failure && (
        <div className="tc-page" style={{ paddingBottom: 0 }}>
          <Alert
            tone="warning"
            icon="cloud-slash"
            title="That change is held on this device"
            actions={
              <Button size="sm" variant="secondary" icon="arrow-clockwise" onClick={retry}>
                Try again
              </Button>
            }
          >
            {failure} The fight on screen is correct and nothing has been lost.
          </Alert>
        </div>
      )}
      {!failure && connection.restored && (
        <div className="tc-page" style={{ paddingBottom: 0 }}>
          <Alert tone="success" icon="check">
            Back in sync. Everything you changed while it was down has been saved.
          </Alert>
        </div>
      )}
    </>
  );

  if (combat.status === 'preparing') {
    return (
      <>
        {status}
        <CombatSetup
          combat={combat}
          systemId={loaded.data.systemId}
          campaign={loaded.data.campaign}
          template={loaded.data.template}
          characters={loaded.data.characters}
          monsters={loaded.data.monsters}
          onCommand={send}
          busy={busy}
        />
      </>
    );
  }

  if (combat.status === 'live') {
    return (
      <>
        {status}
        <CombatRunner
          combat={combat}
          rules={requireRuleset(loaded.data.systemId)}
          campaign={loaded.data.campaign}
          characters={loaded.data.characters}
          monsters={loaded.data.monsters}
          onCommand={send}
          busy={busy}
        />
      </>
    );
  }

  return (
    <>
      {status}
      <CombatEnded
        combat={combat}
        campaign={loaded.data.campaign}
        template={loaded.data.template}
        systemId={loaded.data.systemId}
        onReopen={() => send({ kind: 'combat.reopen' })}
        busy={busy}
      />
    </>
  );
}
