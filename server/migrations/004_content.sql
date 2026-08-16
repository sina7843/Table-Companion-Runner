-- Rules content, and where every piece of it came from.
--
-- Two tables and two columns. The tables hold normalised content and the sources it was
-- imported from; the columns put a source and a licence on every creature in the library, so
-- "may we ship this" is a question the database can answer rather than one somebody has to
-- remember the answer to.
--
-- The shape is deliberately system-agnostic. `system_id` says which ruleset a record belongs
-- to and `data` is a JSONB bag the core never reads — a D&D species and a Pathfinder ancestry
-- are the same row here, which is what stops a second ruleset needing a second schema.

create table if not exists content_sources (
  id             text primary key,
  name           text        not null,
  publisher      text        not null,
  -- The source's own version — an SRD revision, a dataset release. What makes an import
  -- reproducible, and what an upgrade is measured against.
  version        text        not null,
  url            text,

  -- The licence, denormalised on purpose: an imported record has to stay answerable even if
  -- the licence registry in the code changes later.
  license_id     text        not null,
  license_name   text        not null,
  license_url    text        not null,
  -- The gate. The importer refuses a false in production, and nothing else in the schema is
  -- allowed to matter more than this column.
  redistributable boolean    not null,
  attribution    text        not null default '',

  -- Of the bundle as imported. Two imports of the same bytes produce the same hash, which is
  -- how "reproducible" stops being a claim.
  content_hash   text        not null,
  imported_at    timestamptz not null default now(),
  record_count   integer     not null default 0
);

create table if not exists content_records (
  system_id  text  not null,
  -- Which file the record came from. One source can be split across several bundles — the SRD
  -- is a character catalogue and a bestiary — and a re-import replaces the bundle it names
  -- rather than everything the source has ever provided.
  bundle_id  text  not null,
  kind       text  not null check (
    kind in ('class', 'species', 'background', 'feat', 'spell', 'equipment', 'monster', 'other')
  ),
  -- Stable within a system and a kind, and stated by the source rather than minted here: an
  -- import has to be able to replace a record rather than accumulate copies of it.
  key        text  not null,
  name       text  not null,
  source_id  text  not null references content_sources (id) on delete cascade,
  data       jsonb not null,
  primary key (system_id, kind, key)
);

create index if not exists content_records_kind_idx on content_records (system_id, kind);
create index if not exists content_records_source_idx on content_records (source_id);

-- Traceability on the creature library itself. `source` was already there as a display column;
-- these two are the audit trail behind it.
alter table monsters add column if not exists source_id text references content_sources (id);
alter table monsters add column if not exists license_id text;

create index if not exists monsters_source_id_idx on monsters (source_id);
