/**
 * The homebrew creature editor.
 *
 * One screen in three states, which is how the design specifies it: create from scratch,
 * clone with a source banner, and edit an existing clone. Nothing about the form changes
 * between them — only the banner and what it was seeded with.
 *
 * Not one giant form. Five groups are always present because every creature needs them —
 * identity, defences, ability scores, actions — and five more are collapsed until asked
 * for, because a goblin variant needs none of them and a homebrew dragon needs all five.
 *
 * The preview is the real `MonsterSheet`, recomputed on every keystroke through
 * `normaliseMonster`, so what a DM sees while editing is what they get at the table.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  IconButton,
  ListRow,
  Modal,
  SectionHeader,
  Skeleton,
  TextInput,
  Textarea,
  type IconName,
} from '../../design-system';
import { DMPage } from '../../app/DMShell';
import {
  useUserId,
  id,
  requireRuleset,
  useAsync,
  useRepositories,
  type Monster,
  type MonsterAction,
  type MonsterId,
  type UserId,
} from '../../domain';
import { MonsterSheet } from './MonsterSheet';

const SYSTEM = id<'GameSystem'>('dnd5e-2024');

/** A creature with nothing filled in but the shape the rules expect. */
function blankMonster(ownerUserId: UserId): Monster {
  return {
    id: id<'Monster'>(`m-draft-${Date.now()}`),
    systemId: SYSTEM,
    name: '',
    subtitle: '',
    origin: 'homebrew',
    ownerUserId,
    source: 'You',
    challengeLabel: '',
    challengeRank: 0,
    facets: { type: ['Humanoid'], size: ['Medium'], environment: [] },
    attributes: [
      { key: 'str', label: 'STR', value: 10 },
      { key: 'dex', label: 'DEX', value: 10 },
      { key: 'con', label: 'CON', value: 10 },
      { key: 'int', label: 'INT', value: 10 },
      { key: 'wis', label: 'WIS', value: 10 },
      { key: 'cha', label: 'CHA', value: 10 },
    ],
    health: { current: 0, max: 0, temporary: 0 },
    derived: [
      { key: 'ac', label: 'Armour class', value: 10 },
      { key: 'speed', label: 'Speed', value: '30 ft' },
      { key: 'senses', label: 'Senses', value: 'Passive Perception 10' },
    ],
    traits: [],
    actionGroups: [{ key: 'actions', label: 'Actions', entries: [] }],
    systemData: { alignment: 'unaligned' },
  };
}

/** The optional groups, collapsed until a creature actually needs them. */
const OPTIONAL_GROUPS: { key: string; label: string; icon: IconName }[] = [
  { key: 'traits', label: 'Traits', icon: 'scroll' },
  { key: 'senses', label: 'Senses', icon: 'eye' },
  { key: 'languages', label: 'Languages', icon: 'chat-circle' },
  { key: 'resistances', label: 'Resistances and immunities', icon: 'shield' },
  { key: 'legendary', label: 'Legendary actions', icon: 'star' },
];

const armourOf = (monster: Monster) => monster.derived.find((value) => value.key === 'ac')?.value;

const actionCount = (monster: Monster) =>
  monster.actionGroups.reduce((sum, group) => sum + group.entries.length, 0);

/** Which core fields differ from the creature this was cloned from. */
function diffFields(current: Monster, source: Monster): string[] {
  const changed: string[] = [];
  if (current.name !== source.name) changed.push('Name');
  if (current.health.max !== source.health.max) changed.push('Hit points');
  if (armourOf(current) !== armourOf(source)) changed.push('Armour class');

  for (const attribute of current.attributes) {
    const before = source.attributes.find((entry) => entry.key === attribute.key);
    if (before && before.value !== attribute.value) changed.push(attribute.label);
  }

  if (actionCount(current) !== actionCount(source)) changed.push('Actions');
  if (current.facets.size?.[0] !== source.facets.size?.[0]) changed.push('Size');
  if (current.facets.type?.[0] !== source.facets.type?.[0]) changed.push('Type');

  return changed;
}

export function MonsterEditor({ mode }: { mode: 'create' | 'clone' | 'edit' }) {
  const { monsterId } = useParams();
  const navigate = useNavigate();
  const { monsters, users } = useRepositories();
  const userId = useUserId();
  const ruleset = requireRuleset(SYSTEM);

  const [monster, setMonster] = useState<Monster | null>(null);
  const [source, setSource] = useState<Monster | null>(null);
  const [open, setOpen] = useState<string[]>([]);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<{
    index: number;
    draft: MonsterAction;
  } | null>(null);

  // The clone is held as a promise rather than fired per load: React runs this effect
  // twice in development, and a second call would leave a stray copy in the library every
  // time the editor opened.
  const cloning = useRef<Promise<Monster> | null>(null);

  const loaded = useAsync(async () => {
    if (mode === 'create') {
      // A creature has an owner, so a signed-out editor has nothing to make.
      return { monster: userId ? blankMonster(userId) : null, source: null };
    }

    const existing = monsterId ? await monsters.byId(monsterId as MonsterId) : null;
    if (!existing) return { monster: null, source: null };

    if (mode === 'edit') {
      const origin = existing.clonedFrom ? await monsters.byId(existing.clonedFrom) : null;
      return { monster: existing, source: origin };
    }

    // Cloning writes immediately, so the copy exists before the DM types anything and a
    // half-finished variant is never lost by navigating away.
    cloning.current ??= users
      .current()
      .then((me) => monsters.cloneFrom(existing.id, me.id, me.displayName));
    return { monster: await cloning.current, source: existing };
  }, ['monster-editor', mode, monsterId ?? '', userId ?? '']);

  useEffect(() => {
    if (loaded.status !== 'ready' || !loaded.data.monster) return;
    setMonster(ruleset.normaliseMonster(loaded.data.monster));
    setSource(loaded.data.source);
    // Opening straight onto a clone should show whichever optional groups it already uses.
    const used = OPTIONAL_GROUPS.filter((group) =>
      group.key === 'traits'
        ? loaded.data.monster!.traits.length > 0
        : group.key === 'legendary'
          ? loaded.data.monster!.actionGroups.some((entry) => entry.key === 'legendary')
          : loaded.data.monster!.derived.some((value) => value.key === group.key),
    ).map((group) => group.key);
    setOpen(used);
  }, [loaded.status, loaded.data, ruleset]);

  // Autosave, debounced. A homebrew creature is a document, not a form to submit.
  //
  // A new creature is inserted once and updated from then on — calling create on every
  // save would push a fresh copy into the library each time.
  const created = useRef(mode !== 'create');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (next: Monster) => {
      const normalised = ruleset.normaliseMonster(next);
      setMonster(normalised);
      setSaving('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const write = created.current ? monsters.save(normalised) : monsters.create(normalised);
        void write.then(
          () => {
            created.current = true;
            setSaving('saved');
          },
          (error: unknown) => {
            setSaving('idle');
            setFailure(error instanceof Error ? error.message : 'That change was not saved.');
          },
        );
      }, 500);
    },
    [monsters, ruleset],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (loaded.status === 'loading' || !monster) {
    return (
      <DMPage eyebrow="Monsters · homebrew" title="New creature">
        <div className="tc-page" aria-busy="true">
          <span className="tc-visually-hidden" role="status">
            Opening the editor
          </span>
          <Skeleton count={8} height={40} gap={8} />
        </div>
      </DMPage>
    );
  }

  if (loaded.status === 'error' || (mode !== 'create' && !loaded.data.monster)) {
    return (
      <DMPage eyebrow="Monsters · homebrew" title="Creature">
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
      </DMPage>
    );
  }

  const issues = ruleset.validateMonster(monster);
  const issueFor = (field: string) => issues.find((issue) => issue.fieldKey === field)?.message;
  const estimate = ruleset.estimateChallenge(monster);
  const changed = source ? diffFields(monster, source) : [];

  const armourClass = Number(monster.derived.find((value) => value.key === 'ac')?.value) || 0;
  const hitDice = String(monster.systemData.hitDice ?? '');
  const averageHp = hitDice ? ruleset.hitPointsFromDice(hitDice) : null;

  function setDerived(fieldKey: string, label: string, value: string | number) {
    if (!monster) return;
    const rest = monster.derived.filter((entry) => entry.key !== fieldKey);
    persist({ ...monster, derived: [...rest, { key: fieldKey, label, value }] });
  }

  function setFacet(facet: string, value: string) {
    if (!monster) return;
    persist({ ...monster, facets: { ...monster.facets, [facet]: [value] } });
  }

  function saveAction(entry: MonsterAction, index: number) {
    if (!monster) return;
    const groups = monster.actionGroups.map((group) => {
      if (group.key !== 'actions') return group;
      const entries = [...group.entries];
      if (index < 0) entries.push(entry);
      else entries[index] = entry;
      return { ...group, entries };
    });
    persist({ ...monster, actionGroups: groups });
    setEditingAction(null);
  }

  function removeAction(index: number) {
    if (!monster) return;
    persist({
      ...monster,
      actionGroups: monster.actionGroups.map((group) =>
        group.key === 'actions'
          ? { ...group, entries: group.entries.filter((_, position) => position !== index) }
          : group,
      ),
    });
  }

  const actions = monster.actionGroups.find((group) => group.key === 'actions')?.entries ?? [];

  return (
    <DMPage
      eyebrow="Monsters · homebrew"
      title={monster.name || 'New creature'}
      actions={
        <>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-11)',
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
            }}
            aria-live="polite"
          >
            {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : 'Not saved yet'}
          </span>
          <Button
            variant="tertiary"
            size="sm"
            icon="trash"
            onClick={() => {
              void monsters.remove(monster.id).then(() => navigate('/dm/monsters'));
            }}
          >
            Delete
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="eye"
            as={Link}
            to={`/dm/monsters/${monster.id}`}
          >
            Preview sheet
          </Button>
          <Button variant="primary" size="sm" icon="plus" disabled={issues.length > 0}>
            Add to encounter
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: 'auto',
            padding: 'var(--space-20) var(--space-24)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-24)',
          }}
        >
          {failure && (
            <Alert tone="danger" title="That change was not saved">
              {failure} Your edits are still on screen.
            </Alert>
          )}

          {/* The clone banner: says what it came from and how far it has drifted. */}
          {source && (
            <div className="tc-banner tc-banner--info">
              <Icon name="copy" />
              <span>
                Cloned from <strong>{source.name}</strong> ({source.source}). The original is
                unchanged, and {changed.length} field{changed.length === 1 ? '' : 's'} differ
                {changed.length === 1 ? 's' : ''} so far.
              </span>
              <span className="tc-banner__spacer" />
              <Button size="sm" variant="tertiary" as={Link} to={`/dm/monsters/${source.id}`}>
                View original
              </Button>
            </div>
          )}

          <section>
            <SectionHeader title="Identity" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                gap: 'var(--space-16)',
                marginTop: 'var(--space-12)',
              }}
            >
              <Field label="Name" required error={issueFor('name')}>
                {({ id: fieldId, describedBy }) => (
                  <TextInput
                    id={fieldId}
                    aria-describedby={describedBy}
                    invalid={issueFor('name') !== undefined}
                    value={monster.name}
                    onChange={(event) => persist({ ...monster, name: event.target.value })}
                  />
                )}
              </Field>

              {/* Size and type options come from the ruleset's own facet declarations, so
                  the editor and the library filters can never disagree. */}
              {ruleset
                .monsterFacets()
                .filter((facet) => facet.key === 'size' || facet.key === 'type')
                .map((facet) => (
                  <Field key={facet.key} label={facet.label}>
                    {({ id: fieldId }) => (
                      <select
                        id={fieldId}
                        className="tc-input tc-select"
                        value={monster.facets[facet.key]?.[0] ?? ''}
                        onChange={(event) => setFacet(facet.key, event.target.value)}
                      >
                        {facet.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ))}
            </div>
          </section>

          <section>
            <SectionHeader
              title="Defences"
              actions={
                <Badge tone="neutral" icon="calculator">
                  Challenge estimated
                </Badge>
              }
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 'var(--space-16)',
                marginTop: 'var(--space-12)',
              }}
            >
              <Field label="Armour class" error={issueFor('ac')}>
                {({ id: fieldId, describedBy }) => (
                  <TextInput
                    id={fieldId}
                    aria-describedby={describedBy}
                    inputMode="numeric"
                    numeric
                    invalid={issueFor('ac') !== undefined}
                    value={String(armourClass)}
                    onChange={(event) =>
                      setDerived('ac', 'Armour class', Number(event.target.value) || 0)
                    }
                  />
                )}
              </Field>

              <Field
                label="Hit dice"
                help={averageHp === null ? 'e.g. 2d6 + 2' : `Average ${averageHp} hit points`}
              >
                {({ id: fieldId }) => (
                  <TextInput
                    id={fieldId}
                    mono
                    placeholder="2d6 + 2"
                    value={hitDice}
                    onChange={(event) => {
                      const expression = event.target.value;
                      const average = ruleset.hitPointsFromDice(expression);
                      persist({
                        ...monster,
                        systemData: { ...monster.systemData, hitDice: expression },
                        // Typing dice fills hit points, which is the whole point of the
                        // field — but a DM who then types a number keeps it.
                        ...(average === null
                          ? {}
                          : { health: { ...monster.health, max: average, current: average } }),
                      });
                    }}
                  />
                )}
              </Field>

              <Field label="Hit points" required error={issueFor('hp')}>
                {({ id: fieldId, describedBy }) => (
                  <TextInput
                    id={fieldId}
                    aria-describedby={describedBy}
                    inputMode="numeric"
                    mono
                    invalid={issueFor('hp') !== undefined}
                    value={String(monster.health.max)}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 0;
                      persist({
                        ...monster,
                        health: { ...monster.health, max: value, current: value },
                      });
                    }}
                  />
                )}
              </Field>

              <Field label="Speed">
                {({ id: fieldId }) => (
                  <TextInput
                    id={fieldId}
                    value={String(
                      monster.derived.find((value) => value.key === 'speed')?.value ?? '',
                    )}
                    onChange={(event) => setDerived('speed', 'Speed', event.target.value)}
                  />
                )}
              </Field>
            </div>
          </section>

          <section>
            <SectionHeader
              title="Ability scores"
              actions={<Badge tone="neutral">Modifiers calculated</Badge>}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: 'var(--space-12)',
                marginTop: 'var(--space-12)',
              }}
            >
              {monster.attributes.map((attribute) => (
                <Field
                  key={attribute.key}
                  label={attribute.label}
                  help={
                    attribute.modifier === undefined
                      ? undefined
                      : `${attribute.modifier >= 0 ? '+' : ''}${attribute.modifier}`
                  }
                  error={issueFor(`ability-${attribute.key}`)}
                >
                  {({ id: fieldId }) => (
                    <TextInput
                      id={fieldId}
                      inputMode="numeric"
                      numeric
                      invalid={issueFor(`ability-${attribute.key}`) !== undefined}
                      value={String(attribute.value)}
                      onChange={(event) =>
                        persist({
                          ...monster,
                          attributes: monster.attributes.map((entry) =>
                            entry.key === attribute.key
                              ? { ...entry, value: Number(event.target.value) || 0 }
                              : entry,
                          ),
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>

          <section>
            <SectionHeader
              title="Actions"
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  icon="plus"
                  onClick={() =>
                    setEditingAction({ index: -1, draft: { name: '', description: '' } })
                  }
                >
                  Add action
                </Button>
              }
            />
            {issueFor('actions') && (
              <Alert tone="warning" title={issueFor('actions')}>
                A creature with nothing it can do cannot be run in a fight.
              </Alert>
            )}
            {actions.map((entry, index) => (
              <ListRow
                key={`${entry.name}-${index}`}
                title={entry.name || 'Untitled action'}
                meta={[entry.attackBonus, entry.damage].filter(Boolean).join(' · ')}
                trailing={
                  <>
                    <IconButton
                      icon="pencil-simple"
                      label={`Edit ${entry.name}`}
                      size="sm"
                      onClick={() => setEditingAction({ index, draft: { ...entry } })}
                    />
                    <IconButton
                      icon="trash"
                      label={`Remove ${entry.name}`}
                      size="sm"
                      variant="danger"
                      onClick={() => removeAction(index)}
                    />
                  </>
                }
              />
            ))}
          </section>

          {/* Progressive disclosure: collapsed until a creature actually needs them. */}
          <section>
            <SectionHeader
              title="Traits, senses and languages"
              actions={<Badge tone="neutral">Optional</Badge>}
            />
            <p
              className="tc-note"
              style={{
                marginTop: 'var(--space-8)',
                maxWidth: '68ch',
                color: 'var(--color-text-secondary)',
              }}
            >
              These stay collapsed until they are needed. A goblin variant needs none of them, and a
              homebrew dragon needs all five.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 'var(--space-6)',
                flexWrap: 'wrap',
                marginTop: 'var(--space-12)',
              }}
            >
              {OPTIONAL_GROUPS.filter((group) => !open.includes(group.key)).map((group) => (
                <Button
                  key={group.key}
                  variant="tertiary"
                  size="sm"
                  icon="plus"
                  onClick={() => setOpen((current) => [...current, group.key])}
                >
                  {group.label}
                </Button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-16)',
                marginTop: 'var(--space-16)',
              }}
            >
              {OPTIONAL_GROUPS.filter((group) => open.includes(group.key)).map((group) => (
                <OptionalGroup
                  key={group.key}
                  group={group}
                  monster={monster}
                  onChange={persist}
                  onClose={() =>
                    setOpen((current) => current.filter((entry) => entry !== group.key))
                  }
                />
              ))}
            </div>
          </section>
        </div>

        {/* Live preview: the real sheet, recomputed on every keystroke. */}
        <aside
          style={{
            flex: 'none',
            width: 400,
            borderLeft: '1px solid var(--color-border-default)',
            background: 'var(--color-surface-primary)',
            overflowY: 'auto',
            padding: 'var(--space-16)',
          }}
        >
          <SectionHeader
            sub
            title="Live preview"
            actions={
              issues.length === 0 ? (
                <Badge tone="success" icon="check">
                  Usable
                </Badge>
              ) : (
                <Badge tone="warning">{issues.length} to fix</Badge>
              )
            }
          />

          {issues.length > 0 && (
            <div style={{ marginTop: 'var(--space-12)' }}>
              <Alert tone="warning" title={issues[0]?.message}>
                {issues.length === 1
                  ? 'Everything else is valid. The encounter builder will not offer this creature until that field has a value.'
                  : `${issues.length} fields still need a value before this creature can be used.`}
              </Alert>
            </div>
          )}

          <MonsterSheet monster={monster} />

          <dl className="tc-deflist" style={{ marginTop: 'var(--space-12)' }}>
            <dt>Estimated challenge</dt>
            <dd>
              {estimate.label}
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-12)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {estimate.detail}
              </span>
            </dd>
            {source && (
              <>
                <dt>Differs from {source.name}</dt>
                <dd>
                  {changed.length} field{changed.length === 1 ? '' : 's'}
                  {changed.length > 0 && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--font-size-12)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {changed.join(', ')}
                    </span>
                  )}
                </dd>
              </>
            )}
          </dl>
        </aside>
      </div>

      <ActionEditor
        editing={editingAction}
        onCancel={() => setEditingAction(null)}
        onSave={saveAction}
      />
    </DMPage>
  );
}

/** One optional group, opened on demand and closeable again. */
function OptionalGroup({
  group,
  monster,
  onChange,
  onClose,
}: {
  group: { key: string; label: string; icon: IconName };
  monster: Monster;
  onChange: (next: Monster) => void;
  onClose: () => void;
}) {
  const stated = String(monster.derived.find((value) => value.key === group.key)?.value ?? '');

  return (
    <div>
      <SectionHeader
        sub
        title={group.label}
        actions={
          <IconButton icon="x" label={`Remove ${group.label}`} size="sm" onClick={onClose} />
        }
      />

      {group.key === 'traits' ? (
        <Textarea
          rows={3}
          aria-label="Traits"
          placeholder="One trait per line, as “Name. Description”"
          value={monster.traits.map((trait) => `${trait.name}. ${trait.description}`).join('\n')}
          onChange={(event) =>
            onChange({
              ...monster,
              traits: event.target.value
                .split('\n')
                .filter((line) => line.trim().length > 0)
                .map((line) => {
                  const [name, ...rest] = line.split('.');
                  return {
                    name: (name ?? '').trim(),
                    description: rest.join('.').trim(),
                  };
                }),
            })
          }
        />
      ) : (
        <TextInput
          aria-label={group.label}
          value={stated}
          onChange={(event) =>
            onChange({
              ...monster,
              derived: [
                ...monster.derived.filter((value) => value.key !== group.key),
                { key: group.key, label: group.label, value: event.target.value },
              ],
            })
          }
        />
      )}
    </div>
  );
}

/** Editing one action in a modal keeps the main form from becoming a wall of inputs. */
function ActionEditor({
  editing,
  onCancel,
  onSave,
}: {
  editing: { index: number; draft: MonsterAction } | null;
  onCancel: () => void;
  onSave: (entry: MonsterAction, index: number) => void;
}) {
  const [draft, setDraft] = useState<MonsterAction>({ name: '', description: '' });

  useEffect(() => {
    if (editing) setDraft(editing.draft);
  }, [editing]);

  if (!editing) return null;

  return (
    <Modal
      open
      onClose={onCancel}
      title={editing.index < 0 ? 'Add an action' : 'Edit action'}
      description="Attack bonus and damage are optional — a Multiattack or a breath weapon has neither."
      footer={
        <>
          <Button variant="tertiary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            disabled={draft.name.trim().length === 0}
            onClick={() => onSave(draft, editing.index)}
          >
            Save action
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
        <Field label="Name" required>
          {({ id: fieldId }) => (
            <TextInput
              id={fieldId}
              autoFocus
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          )}
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-12)' }}>
          <Field label="Attack bonus" help="e.g. +5">
            {({ id: fieldId }) => (
              <TextInput
                id={fieldId}
                mono
                placeholder="+5"
                value={draft.attackBonus ?? ''}
                onChange={(event) => setDraft({ ...draft, attackBonus: event.target.value })}
              />
            )}
          </Field>
          <Field label="Damage" help="e.g. 1d6 + 3 piercing">
            {({ id: fieldId }) => (
              <TextInput
                id={fieldId}
                mono
                placeholder="1d6 + 3 piercing"
                value={draft.damage ?? ''}
                onChange={(event) => setDraft({ ...draft, damage: event.target.value })}
              />
            )}
          </Field>
        </div>

        <Field label="Description">
          {({ id: fieldId }) => (
            <Textarea
              id={fieldId}
              rows={3}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
