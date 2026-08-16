/**
 * The entry experience: sign in, join with an invite code, create a campaign.
 *
 * Outside both shells, because neither is useful yet. The design's reasoning for two
 * doors: a DM signs up, a player usually arrives from a link their DM sent, and an
 * invite code skips account creation until after the campaign is joined — so a new
 * player's first screen is their character, not a form.
 *
 * As of TC-P02 these are real. Sign-in posts a credential and reads back a user; joining
 * redeems a code the server resolves. Neither screen decides anything — the shape checks
 * below save a round trip on an empty form and nothing more, and every refusal shown here is
 * the server's own sentence rather than one this file invented.
 *
 * TC-P07 finished the lifecycle: an account can be created, a session that ended says so
 * rather than silently returning somebody to a form, and a signed-out visitor who lands
 * somewhere deep is sent back there once they are in. The approved design draws no sign-up
 * screen, so this one is built from the same `EntryFrame` as the door beside it rather than
 * inventing a composition — the design's rule is one column, one decision, no chrome.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { returnPath } from '../app/returnPath';
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
  useAsync,
  useRepositories,
  useSession,
  useTelemetry,
  useUserId,
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
          {/*
            The wordmark is the page's heading, not decoration beside one. Every entry screen
            had no heading at all until TC-P08's accessibility pass found it: a page without
            one cannot be oriented in by anybody navigating by headings, which is how a lot of
            people move around a page. `h1` with the same class and the margin reset is the
            same pixels and a page that announces itself.
          */}
          <h1 className="tc-sidebar__mark" style={{ margin: 0, fontSize: 19 }}>
            Table<span>·</span>Companion
          </h1>
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
  const location = useLocation();
  const { signIn, expired } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const back = returnPath(location.state);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    // A shape check, so an empty form does not cost a round trip. It decides nothing: the
    // credential is checked by the server, which is the only party that can.
    if (!email.includes('@') || password.length === 0) {
      setError('Enter your email address and password.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await signIn({ email, password });
      // Back to whatever they were looking at, if they were looking at something.
      navigate(back ?? '/dm', { replace: true });
    } catch (failure) {
      // The server's own sentence. It says the same thing for an unknown address and a wrong
      // password, so this screen cannot become a way to find out who has an account.
      setError(
        failure instanceof Error ? failure.message : 'That did not work. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntryFrame tagline="The operating system for your tabletop campaign.">
      {/*
        A session that ran out mid-session is not the same event as arriving signed out, and
        saying so is the difference between "the app lost my place" and "that took a while".
        Nothing was lost: every write this app makes is committed on the server or refused.
      */}
      {expired && !error && (
        <Alert tone="warning" icon="clock-countdown" title="Your session ended">
          Sign in again to pick up where you were. Nothing you had already saved was lost.
        </Alert>
      )}

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

        <Button type="submit" variant="primary" block loading={busy}>
          Sign in
        </Button>
      </form>

      <OrDivider />

      <Button variant="secondary" block icon="link" as={Link} to="/join">
        Join with an invite code
      </Button>

      <Button variant="secondary" block icon="user-plus" as={Link} to="/signup">
        Create an account
      </Button>

      {/*
        A player signing in on their phone lands on the player shell. One account can be both
        a DM and a player — the role is a fact about a campaign, not about a person — so this
        stays an explicit choice rather than something inferred from the account.
      */}
      <Button variant="tertiary" block icon="device-mobile" as={Link} to="/play">
        Continue as a player
      </Button>
    </EntryFrame>
  );
}

/**
 * Creating an account.
 *
 * The password rule shown here is the server's, stated up front rather than discovered by
 * being refused — and it is still the server that enforces it. Nothing about the account is
 * decided on this side of the wire.
 */
export function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const back = returnPath(location.state);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      setError('Tell us what to call you at the table.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter an email address.');
      return;
    }
    if (password.length < 12) {
      setError('Passwords need at least 12 characters.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await signUp({ email, password, displayName: displayName.trim() });
      navigate(back ?? '/dm', { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'That did not work. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntryFrame tagline="One account runs campaigns and plays in them.">
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}
      >
        {error && (
          <Alert tone="danger" title="Check your details">
            {error}
          </Alert>
        )}

        <Field label="Display name" help="What the rest of the table sees. Change it any time.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}
        </Field>

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

        <Field label="Password" help="At least 12 characters.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" block loading={busy}>
          Create account
        </Button>
      </form>

      <OrDivider />

      <Button variant="tertiary" block as={Link} to="/">
        I already have an account
      </Button>
    </EntryFrame>
  );
}

export function JoinCampaign() {
  const { campaigns } = useRepositories();
  const { status } = useSession();
  const telemetry = useTelemetry();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ name: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (code.trim().length < 4) {
      setError('That code looks too short. Codes look like CRAGMAW-7742.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      // The server decides what a code means — whether it exists, whether it is still good,
      // and which campaign it joins. This screen only carries it across.
      const campaign = await campaigns.acceptInvite(code.trim());
      setJoined({ name: campaign.name });
    } catch (failure) {
      telemetry({ name: 'invite_rejected' });
      setError(
        failure instanceof Error
          ? failure.message
          : 'That code could not be used. Check it with your DM.',
      );
    } finally {
      setBusy(false);
    }
  }

  /*
   * A code cannot be redeemed by nobody: joining adds an account to a campaign, so there has
   * to be an account. Said here rather than by letting the request fail, because "Not signed
   * in." on a form with no way out of it is a dead end.
   *
   * Where they were going is carried across in the router state so it survives the detour,
   * and the sign-in screen sends them back here once they are in.
   */
  if (status === 'signed-out') {
    return (
      <EntryFrame tagline="Join with the code your DM sent you.">
        <Alert tone="info" icon="user-circle" title="Sign in first">
          An invite adds your account to the campaign, so you need one before you can use the code.
          It stays valid while you do.
        </Alert>

        <Button variant="primary" block as={Link} to="/signup" state={{ from: '/join' }}>
          Create an account
        </Button>
        <Button variant="secondary" block as={Link} to="/" state={{ from: '/join' }}>
          Sign in
        </Button>
      </EntryFrame>
    );
  }

  /*
   * One answer for joining and for joining again.
   *
   * Redeeming a code twice is not an error — a second tap on the same link is a second tap —
   * and the server treats it that way. "You are in Cragmaw Hollow" is true either way, which
   * is also why this screen does not try to tell the two apart: it would have to ask the
   * server who was already a member of what, and that is a question somebody holding only a
   * code should not be able to ask.
   *
   * Invalid, expired, revoked and spent all arrive as one sentence, deliberately. The server
   * refuses to say which, so a stranger cannot use this form to find out which campaigns
   * exist. The screen shows what it was told and offers the code field again.
   */
  if (joined) {
    return (
      <EntryFrame tagline="You are in.">
        <Alert tone="success" icon="check-circle" title={'Joined ' + joined.name}>
          You can play without a character — your DM sees you in the party either way.
        </Alert>

        <Button variant="primary" block icon="device-mobile" as={Link} to="/play">
          Go to the table
        </Button>
        <Button variant="secondary" block icon="user-plus" as={Link} to="/builder">
          Build a character
        </Button>
      </EntryFrame>
    );
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

        <Button type="submit" variant="primary" block loading={busy}>
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
  const userId = useUserId();
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

    if (!userId) {
      setFailure('You are signed out. Sign in again to create a campaign.');
      return;
    }

    setCreating(true);
    setFailure(null);
    try {
      const campaign = await campaigns.create({
        name: name.trim(),
        systemId: selected as GameSystemId,
        dmUserId: userId,
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
            <Button size="sm" variant="secondary" onClick={state.reload}>
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
