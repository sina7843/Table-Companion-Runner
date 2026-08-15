/**
 * The monster sheet as a full page.
 *
 * The design's primary path is the docked panel — preparation never leaves the library.
 * This exists for the two cases the panel cannot serve: a deep link someone was sent, and
 * a viewport too narrow for a 440px column beside a table. Same component, same content;
 * only the container differs.
 */
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, EmptyState, Skeleton } from '../../design-system';
import { DMPage } from '../../app/DMShell';
import { useAsync, useRepositories, type MonsterId } from '../../domain';
import { MonsterSheet } from './MonsterSheet';

export function MonsterPage() {
  const { monsterId } = useParams();
  const { monsters } = useRepositories();

  const state = useAsync(
    () => (monsterId ? monsters.byId(monsterId as MonsterId) : Promise.resolve(null)),
    ['monster', monsterId ?? ''],
  );

  const monster = state.status === 'ready' ? state.data : null;

  return (
    <DMPage
      eyebrow={monster ? `Monsters · ${monster.source}` : 'Monsters'}
      title={monster?.name ?? 'Monster'}
      actions={
        <Button variant="tertiary" size="sm" icon="arrow-left" as={Link} to="/dm/monsters">
          Library
        </Button>
      }
    >
      <div style={{ maxWidth: 'var(--layout-content-max)', margin: '0 auto', width: '100%' }}>
        {state.status === 'loading' && (
          <div className="tc-page" aria-busy="true">
            <span className="tc-visually-hidden" role="status">
              Loading the creature
            </span>
            <Skeleton count={8} height={40} gap={8} />
          </div>
        )}

        {state.status === 'error' && (
          <div className="tc-page">
            <Alert
              tone="danger"
              icon="cloud-slash"
              title="Could not load this creature"
              actions={
                <Button size="sm" variant="secondary" onClick={state.reload}>
                  Try again
                </Button>
              }
            >
              {state.error.message}
            </Alert>
          </div>
        )}

        {state.status === 'ready' && !monster && (
          <div className="tc-page">
            <EmptyState
              icon="compass"
              title="That creature does not exist"
              description="It may have been removed, or the link may be stale."
              actions={
                <Button variant="secondary" as={Link} to="/dm/monsters">
                  Back to the library
                </Button>
              }
            />
          </div>
        )}

        {monster && (
          <MonsterSheet
            monster={monster}
            wide
            actions={
              <>
                <Button variant="primary" size="sm" icon="plus">
                  Add to encounter
                </Button>
                {monster.origin === 'homebrew' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="pencil"
                    as={Link}
                    to={`/dm/monsters/${monster.id}/edit`}
                  >
                    Edit
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="copy"
                    as={Link}
                    to={`/dm/monsters/${monster.id}/clone`}
                  >
                    Clone
                  </Button>
                )}
              </>
            }
          />
        )}
      </div>
    </DMPage>
  );
}
