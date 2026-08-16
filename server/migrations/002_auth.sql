-- Accounts and sessions.
--
-- Additive, like every migration here: `users` gains credentials, and sessions get a table of
-- their own. No existing row is rewritten and nothing is dropped.
--
-- Two things are deliberately absent. There is no `role` column on `users`: a role is a fact
-- about a campaign, not about a person, and it already lives on `campaign_members` where it
-- can be scoped. And no session token is stored — only its SHA-256 — so a database read does
-- not hand out the ability to impersonate anybody.

alter table users add column if not exists email text;
alter table users add column if not exists password_hash text;
alter table users add column if not exists password_updated_at timestamptz;

-- Case-insensitive uniqueness without the citext extension, which a managed PostgreSQL may
-- not let us install. Partial, so rows without an email (seeded before this migration, or
-- created by a future invite flow) do not collide with each other on null.
create unique index if not exists users_email_key on users (lower(email)) where email is not null;

create table if not exists sessions (
  -- The SHA-256 of the token, hex. The token itself exists only in the client's cookie and
  -- in the response that set it; it is never written down and never logged.
  token_hash   text primary key,
  user_id      text        not null references users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- Kept for a future "sign out everywhere" list. Truncated on write; never used to
  -- authenticate anything, because a user agent string is attacker-controlled.
  user_agent   text
);

create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);
