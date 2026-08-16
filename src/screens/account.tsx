/**
 * The account screen: who you are, what the app knows, and the way out.
 *
 * Phase 1 owns one changeable field — the display name — and that is not an omission to
 * apologise for. An email change is a re-verification flow and a password change is a
 * credential flow; shipping either badly is worse than not shipping it, and both are named
 * below rather than hidden, so nobody goes looking for a setting that is not there.
 *
 * The data boundary is stated on the screen rather than buried in a policy nobody opens. It
 * is also true of the implementation: what it says other people can see is exactly what
 * `authorize.ts` returns to them, and what it says is never sent is what the server never
 * puts in a response. If one of those changed, this paragraph would be wrong, which is the
 * point of writing it where somebody would notice.
 *
 * Reachable from both shells, because one account is a DM in one campaign and a player in
 * another — the role is a fact about a campaign, not about a person.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, SectionHeader, TextInput } from '../design-system';
import { DMPage } from '../app/DMShell';
import { useRepositories, useSession } from '../domain';

export function AccountSettings() {
  const navigate = useNavigate();
  const { users } = useRepositories();
  const { user, signOut, setUser } = useSession();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // The identity can arrive after the first render — the session resolves through the same
  // data layer as everything else — and it can change in another tab.
  useEffect(() => {
    if (user) setDisplayName(user.displayName);
  }, [user]);

  const changed = user !== null && displayName.trim() !== user.displayName;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      setStatus('failed');
      setError('Tell us what to call you at the table.');
      return;
    }

    setStatus('saving');
    setError(null);
    try {
      // Submitted rather than autosaved: a name is one field somebody finishes typing, and a
      // debounce here would write "Ela" on the way to "Elandra".
      const next = await users.updateSelf({ displayName: displayName.trim() });
      setUser(next);
      setStatus('saved');
    } catch (failure) {
      // Nothing local was changed, so the field still holds what was typed and the account
      // still holds what it held. Both are true and both are said.
      setStatus('failed');
      setError(
        failure instanceof Error ? failure.message : 'That change was not saved. Try again.',
      );
    }
  }

  async function leave() {
    setLeaving(true);
    await signOut();
    navigate('/', { replace: true });
  }

  if (!user) {
    return (
      <DMPage eyebrow="Account" title="Account">
        <div className="tc-page">
          <Alert tone="info" icon="user-circle" title="You are signed out">
            Sign in to see your account.
          </Alert>
          <Button variant="primary" as={Link} to="/">
            Sign in
          </Button>
        </div>
      </DMPage>
    );
  }

  return (
    <DMPage eyebrow="Account" title={user.displayName}>
      <div className="tc-page" style={{ maxWidth: 620 }}>
        <form
          onSubmit={save}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}
        >
          <SectionHeader title="Your name at the table" />

          {status === 'failed' && error && (
            <Alert tone="danger" title="That change was not saved">
              {error} Your account still says {user.displayName}.
            </Alert>
          )}

          <Field
            label="Display name"
            help="Everyone in your campaigns sees this. Nobody sees your email address."
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                autoComplete="nickname"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  if (status !== 'idle') setStatus('idle');
                }}
              />
            )}
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
            <Button
              type="submit"
              variant="primary"
              icon="check"
              disabled={!changed}
              loading={status === 'saving'}
            >
              Save name
            </Button>
            {/*
              Announced rather than only shown: somebody using a screen reader submitted this
              and needs to hear that it worked without going looking for the confirmation.
            */}
            <span
              role="status"
              aria-live="polite"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-11)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : ''}
            </span>
          </div>
        </form>

        <SectionHeader title="What this app stores" />
        <ul
          className="tc-note"
          style={{
            color: 'var(--color-text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-8)',
            paddingLeft: '1.2em',
          }}
        >
          <li>
            <strong>Your display name</strong> — visible to everyone in a campaign you are in.
          </li>
          <li>
            <strong>Your email address</strong> — used to sign in, and shown to nobody. It is not in
            any response this app sends to another player, including your DM.
          </li>
          <li>
            <strong>Your password</strong> — stored only as a hash the server cannot read back, and
            never written to a log.
          </li>
          <li>
            <strong>Your characters, and what you marked private on them</strong> — a private note
            is filtered out before a response leaves the server, not hidden by the screen drawing
            it.
          </li>
          <li>
            <strong>Rolls you made secretly</strong> — visible to you and your DM, and to nobody
            else on the table.
          </li>
        </ul>

        <p className="tc-note" style={{ color: 'var(--color-text-tertiary)' }}>
          Changing your email address or your password is not in this release. Deleting an account
          is a support request until it is.
        </p>

        <SectionHeader title="Session" />
        <p className="tc-note" style={{ color: 'var(--color-text-secondary)' }}>
          Signing out ends this session everywhere it was open on this device. Anything already
          saved stays saved — a fight in progress is on the server, not in this tab.
        </p>
        <div>
          <Button
            variant="secondary"
            icon="sign-out"
            loading={leaving}
            onClick={() => void leave()}
          >
            Sign out
          </Button>
        </div>
      </div>
    </DMPage>
  );
}
