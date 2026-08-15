import { createBrowserRouter, Navigate } from 'react-router-dom';
import { DMShell } from './DMShell';
import { PlayerShell } from './PlayerShell';
import { Showcase } from '../showcase/Showcase';
import { BuilderScreen } from '../screens/builder/BuilderScreen';
import { CharacterSheet } from '../screens/character/CharacterSheet';
import { CharacterEdit, CharacterPrivacy } from '../screens/character/Privacy';
import { LevelUp } from '../screens/character/LevelUp';
import { MonsterLibrary } from '../screens/monsters/MonsterLibrary';
import { MonsterPage } from '../screens/monsters/MonsterPage';
import { MonsterEditor } from '../screens/monsters/MonsterEditor';
import { EncounterBuilder, EncounterDetail, EncounterLibrary } from '../screens/encounters';
import {
  CampaignCombats,
  CampaignEncounters,
  CampaignLayout,
  CampaignList,
  CampaignOverview,
  CampaignParty,
  CampaignSettings,
  DMCharacters,
  DMCombat,
  DMHome,
  DMItems,
  DMSpells,
  JoinCampaign,
  NewCampaign,
  NotFound,
  PlayerCharacters,
  PlayerCombat,
  PlayerDice,
  PlayerHome,
  PlayerParty,
  SignIn,
} from '../screens';

/**
 * The Phase 1 route graph.
 *
 * Two shells, because the design specifies two compositions rather than one responsive
 * layout: the DM works at desktop and tablet with a sidebar, the player on a phone with
 * bottom navigation. Entry routes sit outside both — a player arriving from an invite
 * link should see their character, not a shell they have no use for yet.
 */
export const router = createBrowserRouter([
  { path: '/', element: <SignIn /> },
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
    element: <DMShell />,
    children: [
      { index: true, element: <DMHome /> },
      { path: 'combat', element: <DMCombat /> },
      { path: 'combat/:combatId', element: <DMCombat /> },
      { path: 'encounters', element: <EncounterLibrary /> },
      { path: 'encounters/new', element: <EncounterBuilder mode="create" /> },
      { path: 'encounters/:encounterId', element: <EncounterDetail /> },
      { path: 'encounters/:encounterId/edit', element: <EncounterBuilder mode="edit" /> },
      { path: 'characters', element: <DMCharacters /> },

      { path: 'monsters', element: <MonsterLibrary /> },
      { path: 'monsters/new', element: <MonsterEditor mode="create" /> },
      { path: 'monsters/:monsterId', element: <MonsterPage /> },
      { path: 'monsters/:monsterId/clone', element: <MonsterEditor mode="clone" /> },
      { path: 'monsters/:monsterId/edit', element: <MonsterEditor mode="edit" /> },
      { path: 'spells', element: <DMSpells /> },
      { path: 'items', element: <DMItems /> },
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
    element: <PlayerShell />,
    children: [
      { index: true, element: <PlayerHome /> },

      { path: 'combat', element: <PlayerCombat /> },
      { path: 'dice', element: <PlayerDice /> },
      { path: 'party', element: <PlayerParty /> },
      { path: 'characters', element: <PlayerCharacters /> },
    ],
  },

  // Internal fidelity-checking surface. Not linked from the product.
  { path: '/dev/showcase', element: <Showcase /> },

  { path: '/signin', element: <Navigate to="/" replace /> },
  { path: '*', element: <NotFound /> },
]);
