/**
 * The entry experience: sign in, join with an invite code, create a campaign.
 *
 * Outside both shells, because neither is useful yet. The design's reasoning for two
 * doors: a DM signs up, a player usually arrives from a link their DM sent, and an
 * invite code skips account creation until after the campaign is joined — so a new
 * player's first screen is their character, not a form.
 *
 * No authentication is wired. TC-13 owns the transport and the session; these screens
 * are the real layout and the real states, with the submit handlers navigating onward.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  ListRow,
  SectionHeader,
  Skeleton,
  TextInput,
} from '../design-system';
import {
  CURRENT_USER_ID,
  useAsync,
  useRepositories,
  type GameSystem,
  type GameSystemId,
} from '../domain';

function EntryFrame({
  tagline,
  width = 340,
  children,
}: {
  tagline?: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="tc-appsurface"
      data-density="comfortable"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-32)',
      }}
    >
      <main
        id="main"
        style={{
          width: '100%',
          maxWidth: width,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-16)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="tc-sidebar__mark" style={{ fontSize: 19 }}>
            Table<span>·</span>Companion
          </span>
          {tagline && (
            <span style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-tertiary)' }}>
              {tagline}
            </span>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}

/** The "or" rule between the two doors. */
function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--color-border-default)' }} />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-10)',
          letterSpacing: 'var(--tracking-caps)',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
        }}
      >
        Or
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--color-border-default)' }} />
    </div>
  );
}

export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('marta@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Client-side shape check only. Real credential validation is a server concern and
    // arrives with TC-13; this must never become the thing that decides who gets in.
    if (!email.includes('@') || password.length === 0) {
      setError('Enter your email address and password.');
      return;
    }
    setError(null);
    navigate('/dm');
  }

  return (
    <EntryFrame tagline="The operating system for your tabletop campaign.">
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}
      >
        {error && (
          <Alert tone="danger" title="Check your details">
            {error}
          </Alert>
        )}

        <Field label="Email">
          {({ id }) => (
            <TextInput
              id={id}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field label="Password">
          {({ id }) => (
            <TextInput
              id={id}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" block>
          Sign in
        </Button>
      </form>

      <OrDivider />

      <Button variant="secondary" block icon="link" as={Link} to="/join">
        Join with an invite code
      </Button>

      {/*
        A player signing in on their phone lands on the player shell. There is no account
        model yet to route by, so this is an explicit choice rather than a guess.
      */}
      <Button variant="tertiary" block icon="device-mobile" as={Link} to="/play">
        Continue as a player
      </Button>
    </EntryFrame>
  );
}

export function JoinCampaign() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (code.trim().length < 4) {
      setError('That code looks too short. Codes look like CRAGMAW-7742.');
      return;
    }
    setError(null);
    navigate('/play');
  }

  return (
    <EntryFrame tagline="Join with the code your DM sent you.">
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}
      >
        <Field
          label="Invite code"
          help="Joining does not require a character — you can create one after."
          error={error ?? undefined}
        >
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              invalid={error !== null}
              mono
              placeholder="CRAGMAW-7742"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" block>
          Join campaign
        </Button>
      </form>

      <OrDivider />

      <Button variant="tertiary" block as={Link} to="/">
        Back to sign in
      </Button>
    </EntryFrame>
  );
}

/**
 * Step 1 of creating a campaign: choose the game system.
 *
 * Unavailable systems are listed with a stated reason rather than hidden — the design
 * calls this the only place unavailable content appears anywhere in Phase 1, because a
 * DM evaluating the product needs to know the architecture supports them.
 */
export function NewCampaign() {
  const navigate = useNavigate();
  const { gameSystems, campaigns } = useRepositories();
  const state = useAsync(() => gameSystems.list(), ['game-systems']);

  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2 || !selected) {
      setFailure('Give the campaign a name.');
      return;
    }

    setCreating(true);
    setFailure(null);
    try {
      const campaign = await campaigns.create({
        name: name.trim(),
        systemId: selected as GameSystemId,
        dmUserId: CURRENT_USER_ID,
      });
      // Straight into the campaign it just made, where the invite code is in the top bar.
      navigate(`/dm/campaigns/${campaign.id}`);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : 'The campaign could not be created. Try again.',
      );
      setCreating(false);
    }
  }

  // Step 2: name and invite. Two steps to a working campaign, as the design specifies.
  if (step === 2) {
    const system =
      state.status === 'ready' ? state.data.find((entry) => entry.id === selected) : undefined;

    return (
      <EntryFrame width={480}>
        <SectionHeader eyebrow="New campaign · step 2 of 2" title="Name the campaign" />

        <form
          onSubmit={create}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}
        >
          {failure && (
            <Alert tone="danger" title="Could not create the campaign">
              {failure}
            </Alert>
          )}

          <Field
            label="Campaign name"
            help={system ? `Running ${system.name}.` : undefined}
            required
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                autoFocus
                placeholder="Lost Mine of Phandelver"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>

          <Alert tone="info" icon="link" title="An invite code is generated for you">
            Players join with it, and you can share or regenerate it from the campaign at any time.
            Joining does not require a character.
          </Alert>

          <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center' }}>
            <Button variant="secondary" icon="arrow-left" onClick={() => setStep(1)}>
              Back
            </Button>
            <div style={{ flex: 1 }} />
            <Button type="submit" variant="primary" icon="check" loading={creating}>
              Create campaign
            </Button>
          </div>
        </form>
      </EntryFrame>
    );
  }

  return (
    <EntryFrame width={640}>
      <SectionHeader eyebrow="New campaign · step 1 of 2" title="Choose a game system" />

      {state.status === 'loading' && <Skeleton count={3} height={56} gap={12} />}

      {state.status === 'error' && (
        <Alert
          tone="danger"
          icon="cloud-slash"
          title="Could not load the game systems"
          actions={
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          }
        >
          {state.error.message}
        </Alert>
      )}

      {state.status === 'ready' && state.data.length === 0 && (
        <EmptyState icon="book-open-text" title="No game systems available" />
      )}

      {state.status === 'ready' &&
        state.data.map((system: GameSystem) => {
          const available = system.status === 'ready';
          return (
            <ListRow
              key={system.id}
              leading={<Icon name="book-open-text" />}
              title={system.name}
              meta={available ? system.summary : system.unavailableReason}
              selected={selected === system.id}
              // An unavailable system is shown and explained, never selectable.
              static={!available}
              onClick={available ? () => setSelected(system.id) : undefined}
              trailing={
                available ? (
                  <Badge tone="success" icon="check">
                    Ready
                  </Badge>
                ) : (
                  <Badge tone="neutral">Not yet available</Badge>
                )
              }
            />
          );
        })}

      <p
        className="tc-note"
        style={{ fontSize: 'var(--font-size-13)', color: 'var(--color-text-secondary)' }}
      >
        The system you choose decides which steps the character builder asks for, how initiative and
        armour class are calculated, and whether death saves exist. It can be changed later, but
        existing characters would need rebuilding.
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center' }}>
        <Button variant="secondary" icon="arrow-left" as={Link} to="/dm">
          Back
        </Button>
        <div style={{ flex: 1 }} />
        <Button
          variant="primary"
          iconRight="arrow-right"
          disabled={selected === null}
          onClick={() => setStep(2)}
        >
          Name the campaign
        </Button>
      </div>
    </EntryFrame>
  );
}

export function NotFound() {
  return (
    <EntryFrame tagline="That page does not exist.">
      <EmptyState
        icon="compass"
        title="Nothing here"
        description="The link may be stale, or the campaign may have been removed."
        actions={
          <Button variant="secondary" as={Link} to="/">
            Back to the start
          </Button>
        }
      />
    </EntryFrame>
  );
}
