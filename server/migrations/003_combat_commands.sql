-- Combat becomes command-driven, and its history becomes the thing undo reads.
--
-- Additive, like every migration here. `combat_events` already existed as the append-only
-- record TC-P01 wrote one row into per save; this gives it the columns that make it an audit
-- log rather than a note, and makes a retried command a no-op rather than a second one.
--
-- Nothing is ever deleted from this table. Undoing an event appends a new one and marks the
-- original as undone; the original stays exactly where it was.

-- The client's id for one command. A retry carries the same one, and the unique index below
-- is what makes replaying it safe rather than a second application.
alter table combat_events add column if not exists command_id text;

-- Who issued it, and what the fight looked like for the participant it touched. `undo_restore`
-- is null for an event that cannot be reversed — a turn advance, a fight ending — and the
-- store refuses to undo one.
alter table combat_events add column if not exists undo_restore jsonb;

-- Set on the original when it is undone, and on the undo when it undoes something. Two
-- columns rather than a delete, so the history reads as what happened including the correction.
alter table combat_events add column if not exists undone_by_seq integer;
alter table combat_events add column if not exists undoes_seq integer;

-- One sentence, for the log and for a person reading the audit later.
alter table combat_events add column if not exists summary text;

-- The version the fight was at *after* this event, so a row can be matched to a state.
alter table combat_events add column if not exists version integer;

-- A command id is unique within one fight. Two devices generating the same uuid is not a
-- thing that happens; the same device sending one twice is, and this is what catches it.
create unique index if not exists combat_events_command_idx
  on combat_events (combat_id, command_id)
  where command_id is not null;

create index if not exists combat_events_undoable_idx
  on combat_events (combat_id, seq desc)
  where undo_restore is not null and undone_by_seq is null;
