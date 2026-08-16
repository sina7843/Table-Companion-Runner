-- Table Companion — initial schema.
--
-- Two rules govern every table below.
--
-- 1. A column exists when the server needs to constrain, own, join or filter on it.
--    Everything else stays in JSONB. That is decision P4: ruleset-specific data must never
--    become a D&D column on a generic entity, because the product is game-system agnostic
--    and `src/domain/types.ts` names no D&D concept. `attributes`, `system_data`,
--    `action_groups`, `derived` and `choices` are opaque to this schema by design.
--
-- 2. Ingested library content and user campaign data are separate ownership boundaries
--    (Requirements §6.6). A library monster has no owner, and the check constraint on
--    `monsters` makes that a rule the database enforces rather than a convention.
--
-- Migrations are additive. Nothing in this repository drops or truncates a developer's data.

create table if not exists users (
  id            text primary key,
  display_name  text        not null,
  created_at    timestamptz not null default now()
);

create table if not exists campaigns (
  id           text primary key,
  name         text        not null,
  system_id    text        not null,
  dm_user_id   text        not null references users (id),
  -- The campaign's current joining code, which is what `Campaign.inviteCode` carries.
  -- The `invites` table below is the auditable record; this is the one the UI shows.
  invite_code  text        not null unique,
  created_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

-- Invite codes as records rather than as a single string on the campaign, so a code can be
-- expired, revoked or counted. TC-P01 mints one per campaign and reads it back; redemption
-- and expiry are TC-P02, which is where an invite first has to be trusted.
create table if not exists invites (
  code        text primary key,
  campaign_id text        not null references campaigns (id) on delete cascade,
  created_by  text        not null references users (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  max_uses    integer,
  used_count  integer     not null default 0,
  revoked_at  timestamptz
);

create index if not exists invites_campaign_idx on invites (campaign_id);

-- A character outlives any campaign, so `campaign_id` is nullable and detaching is a null
-- rather than a delete. Promoted columns are the ones a roster query sorts and filters on.
create table if not exists characters (
  id                 text primary key,
  system_id          text        not null,
  campaign_id        text references campaigns (id) on delete set null,
  owner_user_id      text        not null references users (id),
  name               text        not null,
  subtitle           text        not null,
  archetype          text,
  level              integer     not null,
  health             jsonb       not null,
  attributes         jsonb       not null,
  resources          jsonb       not null,
  conditions         jsonb       not null,
  section_visibility jsonb       not null default '{}'::jsonb,
  draft              jsonb,
  pending_level_up   boolean     not null default false,
  system_data        jsonb       not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

create index if not exists characters_campaign_idx on characters (campaign_id);
create index if not exists characters_owner_idx on characters (owner_user_id);

create table if not exists campaign_members (
  campaign_id  text not null references campaigns (id) on delete cascade,
  user_id      text not null references users (id) on delete cascade,
  role         text not null check (role in ('dm', 'player')),
  character_id text references characters (id) on delete set null,
  primary key (campaign_id, user_id)
);

create index if not exists campaign_members_user_idx on campaign_members (user_id);

-- A draft is deliberately not a character: it has no rules-valid shape and must never
-- appear in a party, which is why it is a separate table and not a nullable character.
create table if not exists character_drafts (
  id            text primary key,
  system_id     text        not null,
  owner_user_id text        not null references users (id) on delete cascade,
  campaign_id   text references campaigns (id) on delete set null,
  name          text        not null default '',
  choices       jsonb       not null default '{}'::jsonb,
  step_id       text        not null,
  updated_at    timestamptz not null
);

create index if not exists character_drafts_owner_idx on character_drafts (owner_user_id);

create table if not exists monsters (
  id              text primary key,
  system_id       text             not null,
  name            text             not null,
  subtitle        text             not null,
  origin          text             not null check (origin in ('library', 'homebrew')),
  owner_user_id   text references users (id) on delete cascade,
  cloned_from     text references monsters (id) on delete set null,
  challenge_label text             not null,
  -- double precision, not numeric: CR 1/8 is 0.125 and `pg` returns numeric as a string,
  -- which would break `Monster.challengeRank` being a number on the wire.
  challenge_rank  double precision not null,
  source          text             not null,
  facets          jsonb            not null default '{}'::jsonb,
  attributes      jsonb            not null default '[]'::jsonb,
  health          jsonb            not null,
  derived         jsonb            not null default '[]'::jsonb,
  traits          jsonb            not null default '[]'::jsonb,
  action_groups   jsonb            not null default '[]'::jsonb,
  system_data     jsonb            not null default '{}'::jsonb,
  updated_at      timestamptz      not null default now(),
  -- The ingest isolation rule, enforced rather than trusted: reference content is owned by
  -- nobody, so no user write can attach itself to a library record.
  constraint monsters_library_is_unowned check (origin = 'homebrew' or owner_user_id is null)
);

create index if not exists monsters_origin_idx on monsters (origin);
create index if not exists monsters_challenge_idx on monsters (challenge_rank);
create index if not exists monsters_owner_idx on monsters (owner_user_id);
-- Facets are a ruleset-declared taxonomy the core never interprets, so they are queried as
-- JSON containment rather than as columns.
create index if not exists monsters_facets_idx on monsters using gin (facets);

-- The roster lives in JSONB because an encounter is edited as one document by one writer
-- (the builder's autosave), and decision P8 keeps whole-record writes for exactly that case.
create table if not exists encounters (
  id                   text primary key,
  campaign_id          text        not null references campaigns (id) on delete cascade,
  name                 text        not null,
  location             text,
  entries              jsonb       not null default '[]'::jsonb,
  absent_character_ids jsonb,
  notes                text,
  updated_at           timestamptz,
  last_run_at          timestamptz
);

create index if not exists encounters_campaign_idx on encounters (campaign_id);

-- A combat instance is a copy of a template, never a view of one. `encounter_template_id`
-- is a provenance note and nulls out if the template is deleted; nothing here writes back.
create table if not exists combats (
  id                    text primary key,
  campaign_id           text        not null references campaigns (id) on delete cascade,
  encounter_template_id text references encounters (id) on delete set null,
  name                  text        not null,
  location              text,
  status                text        not null check (status in ('preparing', 'live', 'ended')),
  round                 integer     not null default 0,
  -- Not a foreign key: the participant set is rewritten as a unit on save, so a constraint
  -- here would fight the write rather than protect it.
  active_participant_id text,
  started_at            timestamptz,
  ended_at              timestamptz,
  -- Incremented on every write. TC-P04 turns this into the concurrency check that stops a
  -- stale client silently overwriting a fight; TC-P01 only maintains it.
  version               integer     not null default 1,
  updated_at            timestamptz not null default now()
);

create index if not exists combats_campaign_idx on combats (campaign_id);
create index if not exists combats_live_idx on combats (campaign_id) where status = 'live';

-- Participants are rows rather than a JSON array on the combat, because TC-P04 needs to
-- authorize and update one participant at a time. TC-P01 still writes the set as a unit,
-- matching the current whole-record contract; the table is what makes the later change a
-- store change instead of a schema migration under a live product.
create table if not exists combat_participants (
  id                  text primary key,
  combat_id           text    not null references combats (id) on delete cascade,
  -- Initiative order is decided by the client's sort and must survive a round trip.
  ordinal             integer not null,
  name                text    not null,
  subtitle            text    not null,
  entity_type         text    not null check (entity_type in ('player', 'monster', 'npc', 'ally')),
  initiative          integer,
  health              jsonb   not null,
  conditions          jsonb   not null default '[]'::jsonb,
  state               text    not null check (state in ('active', 'waiting', 'unconscious', 'defeated')),
  death_saves         jsonb,
  visibility          text    not null check (visibility in ('public', 'party', 'private', 'dm-only', 'secret')),
  targeted            boolean not null default false,
  group_key           text,
  source_kind         text    not null check (source_kind in ('character', 'monster')),
  source_character_id text references characters (id) on delete set null,
  source_monster_id   text references monsters (id) on delete set null,
  constraint combat_participants_source_matches_kind check (
    (source_kind = 'character' and source_character_id is not null and source_monster_id is null)
    or (source_kind = 'monster' and source_monster_id is not null and source_character_id is null)
  )
);

create index if not exists combat_participants_combat_idx on combat_participants (combat_id, ordinal);

-- Append-only history of what happened to a fight. Written inside the same transaction as
-- the combat write, so a fight and its history cannot disagree. TC-P04 and TC-P05 read this
-- for authoritative replay and reconnect recovery; TC-P01 establishes the record.
create table if not exists combat_events (
  combat_id     text        not null references combats (id) on delete cascade,
  seq           integer     not null,
  kind          text        not null,
  actor_user_id text references users (id) on delete set null,
  payload       jsonb       not null default '{}'::jsonb,
  at            timestamptz not null default now(),
  primary key (combat_id, seq)
);

-- Append only. A correction is a new roll, never an edit to the one it corrects, so there
-- is no updated_at and no update path in the store.
create table if not exists rolls (
  id         text primary key,
  combat_id  text references combats (id) on delete cascade,
  actor      text        not null,
  title      text        not null,
  expression text        not null,
  mode       text        not null check (mode in ('normal', 'advantage', 'disadvantage')),
  dice       jsonb       not null default '[]'::jsonb,
  modifier   integer     not null default 0,
  total      integer     not null,
  outcome    text        not null check (outcome in ('normal', 'critical', 'fumble')),
  visibility text        not null check (visibility in ('public', 'party', 'private', 'dm-only', 'secret')),
  at         timestamptz not null
);

create index if not exists rolls_combat_idx on rolls (combat_id, at desc);

create table if not exists recents (
  user_id   text        not null references users (id) on delete cascade,
  kind      text        not null,
  entity_id text        not null,
  label     text        not null,
  href      text        not null,
  at        timestamptz not null,
  primary key (user_id, kind, entity_id)
);

create index if not exists recents_user_idx on recents (user_id, at desc);

create table if not exists campaign_activity (
  id           text primary key,
  campaign_id  text        not null references campaigns (id) on delete cascade,
  kind         text        not null,
  summary      text        not null,
  detail       text        not null,
  character_id text references characters (id) on delete set null,
  at           timestamptz not null
);

create index if not exists campaign_activity_campaign_idx on campaign_activity (campaign_id, at desc);
