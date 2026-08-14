import { useState, type ReactNode } from 'react';
import {
  Alert,
  Badge,
  Button,
  Chip,
  ConditionChip,
  ConnectionStatus,
  DiceButton,
  Drawer,
  Field,
  HPBar,
  HPControl,
  HPDelta,
  Icon,
  IconButton,
  ListRow,
  Modal,
  RollResult,
  RoundCounter,
  SectionHeader,
  Skeleton,
  Stat,
  StatGrid,
  Table,
  TabPanel,
  Tabs,
  Tag,
  TextInput,
  Toast,
  ToastViewport,
  Tooltip,
  TurnIndicator,
  type Density,
  type TableColumn,
  type Theme,
} from '../design-system';

interface PartyMember extends Record<string, unknown> {
  id: string;
  name: string;
  player: string;
  klass: string;
  level: number;
  hp: number;
  max: number;
  ac: number;
  status: 'ok' | 'hurt' | 'down' | 'level';
}

const PARTY: PartyMember[] = [
  {
    id: 'p1',
    name: 'Aria Nightfall',
    player: 'Marta',
    klass: 'Fighter',
    level: 6,
    hp: 47,
    max: 58,
    ac: 18,
    status: 'ok',
  },
  {
    id: 'p2',
    name: 'Thessaly Vane',
    player: 'Priya',
    klass: 'Warlock',
    level: 6,
    hp: 12,
    max: 41,
    ac: 12,
    status: 'hurt',
  },
  {
    id: 'p3',
    name: 'Bram Ironfoot',
    player: 'Tomás',
    klass: 'Cleric',
    level: 6,
    hp: 0,
    max: 52,
    ac: 18,
    status: 'down',
  },
  {
    id: 'p4',
    name: 'Quill Featherwind',
    player: 'Devin',
    klass: 'Rogue',
    level: 7,
    hp: 38,
    max: 44,
    ac: 15,
    status: 'level',
  },
];

function statusBadge(row: PartyMember) {
  if (row.status === 'down')
    return (
      <Badge tone="danger" icon="heartbeat">
        Unconscious
      </Badge>
    );
  if (row.status === 'hurt')
    return (
      <Badge tone="warning" icon="drop">
        Bloodied
      </Badge>
    );
  if (row.status === 'level')
    return (
      <Badge tone="success" icon="arrow-up">
        Level up ready
      </Badge>
    );
  return (
    <Badge tone="neutral" icon="check">
      Ready
    </Badge>
  );
}

const PARTY_COLUMNS: TableColumn<PartyMember>[] = [
  { key: 'name', label: 'Character', primary: true },
  { key: 'player', label: 'Player', width: 84 },
  { key: 'klass', label: 'Class', width: 84 },
  { key: 'level', label: 'Level', numeric: true, width: 58 },
  {
    key: 'hp',
    label: 'Hit points',
    width: 132,
    render: (r) => <HPBar current={r.hp} max={r.max} showUnit />,
  },
  { key: 'ac', label: 'AC', numeric: true, width: 48 },
  { key: 'status', label: 'Status', width: 150, render: statusBadge },
];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'party', label: 'Party', count: 4 },
  { id: 'encounters', label: 'Encounters', count: 5 },
  { id: 'combats', label: 'Recent combats', count: 12 },
  { id: 'settings', label: 'Settings', disabled: true },
];

function Group({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
      <SectionHeader title={title} eyebrow={eyebrow} />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-12)',
          alignItems: 'flex-start',
        }}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Internal fidelity-checking surface. Every primitive rendered against the approved
 * design system, with the theme and density axes switchable so both can be eyeballed
 * without rebuilding. Not a product screen and not routed in production — TC-15's
 * design-fidelity audit is what this exists for.
 */
export function Showcase() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [density, setDensity] = useState<Density>('comfortable');
  const [tab, setTab] = useState('overview');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hp, setHp] = useState(47);
  const [name, setName] = useState('Aria Nightfall');

  return (
    <div
      className="tc-appsurface"
      data-theme={theme}
      data-density={density}
      style={{ minHeight: '100vh', padding: 'var(--space-24)' }}
    >
      <div
        style={{
          maxWidth: 'var(--layout-content-max)',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-32)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-12)',
            flexWrap: 'wrap',
          }}
        >
          <span className="tc-sidebar__mark" style={{ fontSize: 19 }}>
            Table<span>·</span>Companion
          </span>
          <span style={{ flex: 1 }} />
          <ConnectionStatus state="live" />
          <div className="tc-segmented" role="radiogroup" aria-label="Theme">
            {(['dark', 'light'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                className="tc-segmented__item"
                onClick={() => setTheme(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="tc-segmented" role="radiogroup" aria-label="Density">
            {(['comfortable', 'compact', 'touch'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={density === value}
                className="tc-segmented__item"
                onClick={() => setDensity(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </header>

        <Group title="Buttons" eyebrow="Actions">
          <Button variant="primary" icon="broadcast">
            Return to combat
          </Button>
          <Button variant="secondary" icon="arrow-left">
            Back
          </Button>
          <Button variant="tertiary">Save and finish later</Button>
          <Button variant="destructive" icon="trash">
            End combat
          </Button>
          <Button variant="destructive-quiet">Remove</Button>
          <Button variant="accent-quiet" icon="plus">
            New encounter
          </Button>
          <Button variant="primary" iconRight="arrow-right" disabled>
            Continue
          </Button>
          <Button variant="primary" loading>
            Rolling
          </Button>
          <Button variant="secondary" size="sm">
            Small
          </Button>
          <Button variant="secondary" size="lg">
            Large
          </Button>
          <IconButton icon="copy" label="Copy invite code" variant="outlined" />
          <IconButton icon="dots-three" label="More" />
          <IconButton icon="trash" label="Delete" variant="danger" />
        </Group>

        <Group title="Inputs" eyebrow="Forms">
          <div style={{ width: 260 }}>
            <Field label="Character name" help="Shown to the whole party." required>
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div style={{ width: 260 }}>
            <Field label="Invite code" error="That code has already been used.">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  invalid
                  defaultValue="CRAGMAW-7742"
                />
              )}
            </Field>
          </div>
          <div style={{ width: 260 }}>
            <Field label="Search" optional>
              {({ id }) => (
                <TextInput id={id} icon="magnifying-glass" placeholder="Monsters, spells…" />
              )}
            </Field>
          </div>
        </Group>

        <Group title="Tabs" eyebrow="Navigation">
          <div style={{ width: '100%' }}>
            <Tabs items={TABS} value={tab} onChange={setTab} label="Campaign sections" />
            <TabPanel tabId={tab}>
              <p
                style={{
                  padding: 'var(--space-12) 0',
                  color: 'var(--color-text-secondary)',
                  fontSize: 13,
                }}
              >
                Panel content for <b>{TABS.find((t) => t.id === tab)?.label}</b>. Arrow keys move
                between tabs; the disabled tab is skipped.
              </p>
            </TabPanel>
          </div>
        </Group>

        <Group title="Badges, tags and chips" eyebrow="Data">
          <Badge tone="success" icon="broadcast" solid>
            Live now
          </Badge>
          <Badge tone="neutral" icon="calculator">
            Calculated
          </Badge>
          <Badge tone="accent" icon="hand-pointing">
            Your decisions
          </Badge>
          <Badge tone="warning" icon="drop">
            Bloodied
          </Badge>
          <Badge tone="danger">Required</Badge>
          <Badge tone="info">Party visible</Badge>
          <Badge tone="neutral" count>
            12
          </Badge>
          <Tag icon="skull">Monster</Tag>
          <Chip icon="skull" onClick={() => undefined}>
            Adult Black Dragon
          </Chip>
          <Chip icon="flag-banner" pressed onClick={() => undefined}>
            Goblin Ambush
          </Chip>
          <Chip icon="magic-wand" onDismiss={() => undefined}>
            Fireball
          </Chip>
        </Group>

        <Group title="Overlays" eyebrow="Context preservation">
          <Button variant="secondary" icon="warning" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Button variant="secondary" icon="sidebar" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
          <Tooltip content="Search everything" shortcut="⌘K">
            <Button variant="secondary" icon="magnifying-glass">
              Hover or focus me
            </Button>
          </Tooltip>
        </Group>

        <Group title="Feedback" eyebrow="Inherited states">
          <div
            style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}
          >
            <Alert
              tone="danger"
              icon="cloud-slash"
              title="Could not save your change"
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Retry now
                  </Button>
                  <Button size="sm" variant="tertiary">
                    Copy the value
                  </Button>
                </>
              }
            >
              The last edit to Aria&rsquo;s hit points is held on this device and will be sent when
              the connection returns. Nothing has been lost.
            </Alert>
            <Alert tone="info" icon="calculator" title="Updated by this step">
              Hit points rose from 8 to 12 and armour class from 12 to 16.
            </Alert>
          </div>
          <div
            style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}
          >
            <Skeleton count={4} height={36} gap={8} />
            <div style={{ display: 'flex', gap: 'var(--space-12)', flexWrap: 'wrap' }}>
              <ConnectionStatus state="live" />
              <ConnectionStatus state="reconnecting" />
              <ConnectionStatus state="offline" />
            </div>
          </div>
        </Group>

        <Group title="Rows and tables" eyebrow="Data">
          <div style={{ width: 420 }}>
            <ListRow
              leading={<Icon name="flag-banner" />}
              title="Assault on Cragmaw Castle"
              meta="16 creatures · deadly · 9,600 adj. XP"
              trailing={
                <Button size="sm" variant="secondary" icon="sword">
                  Start combat
                </Button>
              }
              onClick={() => undefined}
            />
            <ListRow
              leading={<Icon name="flag-banner" />}
              title="Wave Echo Cave — first landing"
              meta="7 creatures · hard · 2,900 adj. XP"
              trailing={
                <Button size="sm" variant="tertiary" icon="sword">
                  Start combat
                </Button>
              }
              selected
              onClick={() => undefined}
            />
          </div>
          <div style={{ flex: 1, minWidth: 520 }}>
            <Table
              columns={PARTY_COLUMNS}
              rows={PARTY}
              rowKey={(r) => r.id}
              label="Party"
              selectedKey="p1"
            />
          </div>
        </Group>

        <Group title="Stats and hit points" eyebrow="Domain">
          <StatGrid columns={3} className="tc-statgrid">
            <Stat label="HP" value={12} />
            <Stat label="AC" value={16} />
            <Stat label="Init" value="+2" />
          </StatGrid>
          <StatGrid columns={6}>
            <Stat label="STR" value={17} modifier={3} />
            <Stat label="DEX" value={14} modifier={2} />
            <Stat label="CON" value={15} modifier={2} />
            <Stat label="INT" value={10} modifier={0} />
            <Stat label="WIS" value={12} modifier={1} />
            <Stat label="CHA" value={8} modifier={-1} />
          </StatGrid>
          <div
            style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}
          >
            <HPBar current={47} max={58} showUnit />
            <HPBar current={22} max={58} showUnit />
            <HPBar current={9} max={58} showUnit temp={5} />
            <HPBar current={0} max={58} showUnit />
            <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
              <HPDelta kind="damage" amount={9} />
              <HPDelta kind="healing" amount={12} />
              <HPDelta kind="temp" amount={5} />
            </div>
          </div>
          <div style={{ width: 300 }}>
            <HPControl
              current={hp}
              max={58}
              onApply={(delta) => setHp((value) => Math.max(0, Math.min(58, value + delta)))}
            />
          </div>
        </Group>

        <Group title="Combat" eyebrow="Domain">
          <ConditionChip label="Prone" icon="arrow-down" />
          <ConditionChip label="Blessed" tone="buff" icon="sparkle" duration="2r" />
          <ConditionChip
            label="Frightened"
            tone="debuff"
            icon="eye-slash"
            duration="1r"
            onRemove={() => undefined}
          />
          <ConditionChip label="Concentrating" tone="concentration" icon="brain" />
          <ConditionChip label="Poisoned" tone="danger" icon="flask" />
          <TurnIndicator />
          <TurnIndicator state="quiet">Up next</TurnIndicator>
          <TurnIndicator state="next">Later</TurnIndicator>
          <RoundCounter round={3} turn={3} of={10} />
          <DiceButton expression="1d20+7" label="Longsword" />
          <DiceButton expression="2d6+4" label="Damage" primary />
          <DiceButton expression="1d20+5" label="Stealth" advantage="advantage" />
          <DiceButton expression="1d20-1" label="Save" advantage="disadvantage" />
          <div
            style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}
          >
            <RollResult
              total={24}
              title="Aria Nightfall · Longsword attack"
              breakdown={
                <>
                  1d20 (<b>17</b>) + 7
                </>
              }
              totalLabel="Attack"
            />
            <RollResult
              total={31}
              outcome="critical"
              title="Critical hit — Bugbear Chief"
              breakdown={
                <>
                  1d20 (<b>20</b>), <s>1d20 (4)</s> + 11
                </>
              }
              flags={
                <Badge tone="success" icon="star">
                  Crit
                </Badge>
              }
            />
            <RollResult
              total={3}
              outcome="fumble"
              title="Thessaly Vane · Dexterity save"
              breakdown={
                <>
                  1d20 (<b>1</b>) + 2
                </>
              }
              flags={<Badge tone="danger">Fumble</Badge>}
            />
          </div>
        </Group>

        <ToastViewport>
          <Toast tone="success" icon="check-circle" title="Encounter saved">
            Assault on Cragmaw Castle is ready for tonight.
          </Toast>
        </ToastViewport>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="End this combat?"
          description="Goblin Ambush · round 3"
          footer={
            <>
              <Button variant="tertiary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" icon="check" onClick={() => setModalOpen(false)}>
                End combat
              </Button>
            </>
          }
        >
          The combat log is kept and the encounter stays in your library. Hit points and conditions
          on the party carry over to the next fight.
        </Modal>

        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Bugbear Chief"
          description="Medium humanoid (goblinoid) · CR 3"
          footer={
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Close
            </Button>
          }
        >
          <p style={{ marginBottom: 'var(--space-12)' }}>
            Below 1280px the docked context panel becomes this drawer. On the desktop the panel
            keeps its own column so a Phase 3 map can take the workspace instead.
          </p>
          <StatGrid columns={6}>
            <Stat label="STR" value={15} modifier={2} />
            <Stat label="DEX" value={14} modifier={2} />
            <Stat label="CON" value={13} modifier={1} />
            <Stat label="INT" value={11} modifier={0} />
            <Stat label="WIS" value={12} modifier={1} />
            <Stat label="CHA" value={9} modifier={-1} />
          </StatGrid>
        </Drawer>
      </div>
    </div>
  );
}
