import type { IconName } from '../design-system';

/**
 * Navigation model, taken from the approved design's information architecture.
 *
 * The DM sidebar is grouped rather than flat for a stated reason: Phase 2 (Lore, NPCs,
 * Locations, Quests, Factions, Notes) lands inside Campaign and Phase 3 (Maps) inside
 * Session, without moving anything the DM has already learned. Nothing here renders a
 * disabled placeholder for those — they simply do not exist yet.
 */

export interface NavEntry {
  to: string;
  icon: IconName;
  label: string;
  /** Resolved from real data once TC-03 lands a store; undefined renders no count. */
  count?: number;
  /** Marks the route that owns this entry, including its children. */
  end?: boolean;
}

export interface NavGroupSpec {
  label: string;
  items: NavEntry[];
}

/**
 * Sidebar outside a campaign. Mirrors screen 27 (DM home), where the third group lists
 * the DM's campaigns rather than one campaign's sections.
 */
export function globalNavGroups(): NavGroupSpec[] {
  return [
    {
      label: 'Session',
      items: [
        { to: '/dm', icon: 'house', label: 'Home', end: true },
        { to: '/dm/combat', icon: 'sword', label: 'Combat' },
        { to: '/dm/encounters', icon: 'flag-banner', label: 'Encounters' },
      ],
    },
    {
      label: 'Library',
      items: [
        { to: '/dm/characters', icon: 'identification-card', label: 'Characters' },
        { to: '/dm/monsters', icon: 'skull', label: 'Monsters' },
        { to: '/dm/spells', icon: 'magic-wand', label: 'Spells' },
        { to: '/dm/items', icon: 'backpack', label: 'Items' },
      ],
    },
  ];
}

/**
 * Sidebar inside a campaign. Mirrors screen 01 (live combat), where the third group is
 * that campaign's own sections.
 */
export function campaignNavGroups(campaignId: string): NavGroupSpec[] {
  const base = `/dm/campaigns/${campaignId}`;
  return [
    {
      label: 'Session',
      items: [
        { to: '/dm/combat', icon: 'sword', label: 'Combat' },
        { to: '/dm/encounters', icon: 'flag-banner', label: 'Encounters' },
      ],
    },
    {
      label: 'Library',
      items: [
        { to: '/dm/characters', icon: 'identification-card', label: 'Characters' },
        { to: '/dm/monsters', icon: 'skull', label: 'Monsters' },
        { to: '/dm/spells', icon: 'magic-wand', label: 'Spells' },
        { to: '/dm/items', icon: 'backpack', label: 'Items' },
      ],
    },
    {
      label: 'Campaign',
      items: [
        { to: `${base}/party`, icon: 'users-three', label: 'Party' },
        { to: `${base}/combats`, icon: 'calendar-blank', label: 'Sessions' },
      ],
    },
  ];
}

/** Campaign sub-navigation. Phase 2 sections insert between Party and Encounters. */
export interface CampaignTabSpec {
  id: string;
  label: string;
  path: string;
}

export function campaignTabs(campaignId: string): CampaignTabSpec[] {
  const base = `/dm/campaigns/${campaignId}`;
  return [
    { id: 'overview', label: 'Overview', path: base },
    { id: 'party', label: 'Party', path: `${base}/party` },
    { id: 'encounters', label: 'Encounters', path: `${base}/encounters` },
    { id: 'combats', label: 'Recent combats', path: `${base}/combats` },
    { id: 'settings', label: 'Settings', path: `${base}/settings` },
  ];
}

/**
 * Player bottom navigation, ordered by frequency during a session rather than by product
 * hierarchy. Combat carries a badge when it is the player's turn.
 *
 * Taken from Part 2's `navItems`. Part 1's summary card lists these as
 * "Sheet · Combat · Dice · Party · Build"; the implemented component data is what is
 * followed here, and it has Home first and no Build entry — the builder is reached from
 * My characters, not from the bar.
 */
export interface BottomNavEntry {
  id: string;
  to: string;
  icon: IconName;
  label: string;
  badge?: number;
}

export const PLAYER_NAV: BottomNavEntry[] = [
  { id: 'home', to: '/play', icon: 'house', label: 'Home' },
  { id: 'sheet', to: '/play/sheet', icon: 'identification-card', label: 'Sheet' },
  { id: 'combat', to: '/play/combat', icon: 'sword', label: 'Combat' },
  { id: 'dice', to: '/play/dice', icon: 'dice-six', label: 'Dice' },
  { id: 'party', to: '/play/party', icon: 'users-three', label: 'Party' },
];
