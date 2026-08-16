-- Imported creatures belong to the source that provided them.
--
-- TC-P06 added `monsters.source_id` and pointed it at `content_sources`, but the importer only
-- ever wrote `content_records` — so the column existed and nothing filled it, and a fresh
-- deployment had an empty creature library however many times the import ran. TC-P09 found
-- that by pointing the end-to-end suite at a clean staging container.
--
-- Now that the importer writes both, removing a source has to remove what it provided:
-- otherwise a source cannot be deleted at all, which is what the plain reference gave us. The
-- rows in question are ingested reference data with no owner — nobody's work is in them, and
-- the alternative (orphaned creatures pointing at a source that is gone) is worse than none.
--
-- Homebrew is untouched: `source_id` is null on anything a person made.

alter table monsters drop constraint if exists monsters_source_id_fkey;

alter table monsters
  add constraint monsters_source_id_fkey
  foreign key (source_id) references content_sources (id) on delete cascade;
