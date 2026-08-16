import { lazy, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { Alert, Button } from '../design-system';
import { useSession } from '../domain';
import { DMShell } from './DMShell';
import { PlayerShell } from './PlayerShell';

/**
 * Sends a signed-out visitor to the door, and remembers which door they were at.
 *
 * A convenience, not a control. Every route behind it reads through repositories the server
 * has already scoped to the caller, and a signed-out caller is answered 401 whatever this
 * component decides — so removing it would make the app unpleasant, not insecure. It exists
 * because a wall of "you do not have access" is a worse answer than a sign-in form.
 *
 * Since TC-P07 it carries `from`. A session ending mid-session is the common case now that
 * sessions expire, and coming back to the campaign you were reading rather than to the DM
 * home is the difference between an interruption and a detour. The sign-in screen refuses
 * anything that is not a same-origin path, so this cannot be aimed off-site.
 */
function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'signed-out') {
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/*
 * Route modules load on demand.
 *
 * Everything used to arrive in one chunk, which meant a player opening their phone at the
 * table downloaded the monster library, the encounter builder and the whole DM surface
 * before their own combat screen could render. Splitting at the route is the natural seam:
 * each shell's Outlet has a Suspense boundary and the fallback is the skeleton the design
 * already specifies for a loading route, so nothing new appears on screen.
 *
 * The shells themselves stay eager — they are the frame, and a frame that flashes is worse
 * than a frame that costs a few kilobytes.
 */
function named<T extends string>(
  load: () => Promise<Record<T, ComponentType>>,
  name: T,
): ComponentType {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const Showcase = named(() => import('../showcase/Showcase'), 'Showcase');
const BuilderScreen = named(() => import('../screens/builder/BuilderScreen'), 'BuilderScreen');
const CharacterSheet = named(() => import('../screens/character/CharacterSheet'), 'CharacterSheet');
const CharacterEdit = named(() => import('../screens/character/Privacy'), 'CharacterEdit');
const CharacterPrivacy = named(() => import('../screens/character/Privacy'), 'CharacterPrivacy');
const LevelUp = named(() => import('../screens/character/LevelUp'), 'LevelUp');
const MonsterLibrary = named(() => import('../screens/monsters/MonsterLibrary'), 'MonsterLibrary');
const MonsterPage = named(() => import('../screens/monsters/MonsterPage'), 'MonsterPage');
const MonsterEditor = lazy(async () => ({
  default: (await import('../screens/monsters/MonsterEditor')).MonsterEditor,
}));
const EncounterLibrary = named(() => import('../screens/encounters'), 'EncounterLibrary');
const EncounterDetail = named(() => import('../screens/encounters'), 'EncounterDetail');
const EncounterBuilder = lazy(async () => ({
  default: (await import('../screens/encounters')).EncounterBuilder,
}));
const CombatScreen = named(() => import('../screens/combat'), 'CombatScreen');
const PlayerCombat = named(() => import('../screens/player/PlayerCombat'), 'PlayerCombat');

const CampaignCombats = named(() => import('../screens'), 'CampaignCombats');
const CampaignEncounters = named(() => import('../screens'), 'CampaignEncounters');
const CampaignLayout = named(() => import('../screens'), 'CampaignLayout');
const CampaignList = named(() => import('../screens'), 'CampaignList');
const CampaignOverview = named(() => import('../screens'), 'CampaignOverview');
const CampaignParty = named(() => import('../screens'), 'CampaignParty');
const CampaignSettings = named(() => import('../screens'), 'CampaignSettings');
const DMCharacters = named(() => import('../screens'), 'DMCharacters');
const DMHome = named(() => import('../screens'), 'DMHome');
const JoinCampaign = named(() => import('../screens'), 'JoinCampaign');
const NewCampaign = named(() => import('../screens'), 'NewCampaign');
const NotFound = named(() => import('../screens'), 'NotFound');
const PlayerCharacters = named(() => import('../screens'), 'PlayerCharacters');
const PlayerDice = named(() => import('../screens'), 'PlayerDice');
const PlayerHome = named(() => import('../screens'), 'PlayerHome');
const PlayerParty = named(() => import('../screens'), 'PlayerParty');
const SignIn = named(() => import('../screens'), 'SignIn');
const SignUp = named(() => import('../screens'), 'SignUp');
const AccountSettings = named(() => import('../screens'), 'AccountSettings');

/**
 * What a route shows when loading it fails.
 *
 * Every route module is fetched on demand, so a dropped connection at the wrong moment is a
 * route that cannot render — and until TC-P08 that fell through to react-router's own
 * developer message, which tells a person at a table to add an `errorElement`. Nothing was
 * lost when it happened; the chunk simply never arrived, and the recovery is to ask again.
 *
 * Deliberately plain: this renders when the application's own code could not be loaded, so it
 * assumes nothing beyond the stylesheet.
 */
function RouteError() {
  return (
    <div className="tc-appsurface" data-density="comfortable">
      <main id="main" className="tc-page" style={{ maxWidth: 480, margin: '10vh auto' }}>
        <Alert
          tone="danger"
          icon="cloud-slash"
          title="This screen could not be loaded"
          actions={
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          }
        >
          The connection dropped while the page was loading. Nothing has been lost — everything you
          have saved is on the server.
        </Alert>
      </main>
    </div>
  );
}

/**
 * The Phase 1 route graph.
 *
 * Two shells, because the design specifies two compositions rather than one responsive
 * layout: the DM works at desktop and tablet with a sidebar, the player on a phone with
 * bottom navigation. Entry routes sit outside both — a player arriving from an invite
 * link should see their character, not a shell they have no use for yet.
 */
export const router = createBrowserRouter(
  [
    { path: '/', element: <SignIn /> },
    { path: '/signup', element: <SignUp /> },
    { path: '/join', element: <JoinCampaign /> },

    // The builder is a focused task rather than a destination, so it sits outside both
    // shells — the design gives it the whole viewport on desktop and on mobile alike.
    { path: '/builder', element: <BuilderScreen /> },
    { path: '/builder/:draftId', element: <BuilderScreen /> },

    // The sheet and its sub-flows take the whole viewport on both shapes, as the design
    // gives them: a player reading their sheet mid-fight wants no chrome around it.
    { path: '/play/sheet', element: <CharacterSheet /> },
    { path: '/play/sheet/:characterId', element: <CharacterSheet /> },
    { path: '/play/sheet/:characterId/privacy', element: <CharacterPrivacy /> },
    { path: '/play/sheet/:characterId/edit', element: <CharacterEdit /> },
    { path: '/play/sheet/:characterId/level-up', element: <LevelUp /> },
    { path: '/dm/characters/:characterId', element: <CharacterSheet /> },
    { path: '/campaigns/new', element: <NewCampaign /> },

    {
      path: '/dm',
      element: (
        <RequireSession>
          <DMShell />
        </RequireSession>
      ),
      children: [
        { index: true, element: <DMHome /> },
        { path: 'combat', element: <CombatScreen /> },
        { path: 'combat/:combatId', element: <CombatScreen /> },
        { path: 'encounters', element: <EncounterLibrary /> },
        { path: 'encounters/new', element: <EncounterBuilder mode="create" /> },
        { path: 'encounters/:encounterId', element: <EncounterDetail /> },
        { path: 'encounters/:encounterId/edit', element: <EncounterBuilder mode="edit" /> },
        { path: 'characters', element: <DMCharacters /> },
        { path: 'account', element: <AccountSettings /> },
        { path: 'monsters', element: <MonsterLibrary /> },
        { path: 'monsters/new', element: <MonsterEditor mode="create" /> },
        { path: 'monsters/:monsterId', element: <MonsterPage /> },
        { path: 'monsters/:monsterId/clone', element: <MonsterEditor mode="clone" /> },
        { path: 'monsters/:monsterId/edit', element: <MonsterEditor mode="edit" /> },
        { path: 'campaigns', element: <CampaignList /> },
        {
          path: 'campaigns/:campaignId',
          element: <CampaignLayout />,
          children: [
            { index: true, element: <CampaignOverview /> },
            { path: 'party', element: <CampaignParty /> },
            { path: 'encounters', element: <CampaignEncounters /> },
            { path: 'combats', element: <CampaignCombats /> },
            { path: 'settings', element: <CampaignSettings /> },
          ],
        },
      ],
    },

    {
      path: '/play',
      element: (
        <RequireSession>
          <PlayerShell />
        </RequireSession>
      ),
      children: [
        { index: true, element: <PlayerHome /> },
        { path: 'combat', element: <PlayerCombat /> },
        { path: 'dice', element: <PlayerDice /> },
        { path: 'party', element: <PlayerParty /> },
        { path: 'characters', element: <PlayerCharacters /> },
      ],
    },

    // Internal fidelity-checking surface. It exists in development only and is absent from
    // a production route graph, so a deployment does not carry a public diagnostics page.
    ...(import.meta.env.DEV ? [{ path: '/dev/showcase', element: <Showcase /> }] : []),

    { path: '/signin', element: <Navigate to="/" replace /> },
    { path: '*', element: <NotFound /> },
  ].map((route) => ({ errorElement: <RouteError />, ...route })),
);
