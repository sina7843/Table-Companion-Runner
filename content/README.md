# Rules content

Every piece of rules data the product serves lives here as a **bundle**: one JSON file naming a
source, its version, its licence, and the records it carries. The pipeline imports a bundle into
normalised storage; the ruleset adapter reads it back. Nothing in the product holds a
hand-maintained catalogue any more.

```
content/
  srd-5.1/            approved — shipped
    character.json    species, backgrounds, classes, fighting styles, packs, spells
    monsters.json     the creature library
  quarantine/         not shipped, kept visible
    product-identity.json
```

## The legal boundary

**Only content whose licence explicitly permits redistribution is imported into production.**
That is enforced, not assumed: `server/content/import.ts` refuses a source whose licence says
otherwise and names the reason. There is no flag that overrides it when `NODE_ENV=production`.

The rule the boundary encodes: **mechanics are not the question, redistribution is.** Nobody
needs permission to write software that adds a modifier to a die roll. Shipping somebody else's
*text* — a class description, a stat block, a spell's wording — needs a licence that says so.

| Source | Verdict | Why |
| --- | --- | --- |
| **System Reference Document 5.1** | **Approved** | Published under CC BY 4.0, which permits redistribution with attribution. The approved source for the first ruleset |
| The operator's own content | Approved | Homebrew belongs to whoever wrote it, and never leaves their account anyway |
| 5e.tools and equivalent community datasets | **Blocked** | Aggregates published rulebook material far beyond the SRD, under no licence that permits redistribution |
| Published rulebooks | **Blocked** | Copyrighted text, much of it Product Identity that no licence covers |

The verdicts are code, in [`src/domain/content/licenses.ts`](../src/domain/content/licenses.ts),
so "why is that not imported" has one answer in one place.

### `Requirements.md` §6.35

The requirement names 5e.tools as the expected data source for D&D content. **It cannot be met
that way in production**, and this is the documented blocker. The requirement's intent — the
library is real content, ingested rather than typed — is met from the SRD instead, and the
`Monster` shape and the `library` / `homebrew` split it asked for are exactly what the pipeline
writes into.

### Attribution

CC BY 4.0 requires it, so the text travels with the content: every record carries its source,
every source carries its licence, and `attributionsFor(library)` returns the lines a screen owes.
It is a condition of the licence, not a courtesy.

### Quarantine

`content/quarantine/` holds records that were in the catalogue and cannot be shipped. Two
creatures are there — **Beholder** and **Mind Flayer** — because they are Product Identity: named
in no licence this product holds, whatever their statistics say. They are kept rather than
deleted so the decision is visible and reversible if a licence ever changes.

The importer refuses that bundle. A developer working on their own machine can load it with
`--allow-unlicensed`, which is the whole distinction between "usable for development" and
"shippable".

> **Operator task, not yet done.** The remaining 48 creatures are marked `srd-5.1` on the basis
> that they are SRD creatures. That has not been checked entry by entry against the SRD index.
> Before a production launch, confirm each name appears in the SRD and move anything that does
> not into `quarantine/`. The pipeline makes that a data change with no code in it.

## Running the pipeline

```bash
npm run content:import                      # every bundle under content/srd-5.1
npm run content:import -- --from=content/x  # a directory of your own
npm run content:import -- --allow-unlicensed   # development only; refused in production
```

Deterministic by construction:

- **Reproducible.** The same bytes produce the same rows and the same `content_hash`. A re-import
  of an unchanged bundle reports `unchanged`.
- **Replaced, not merged.** A bundle states what it now contains. A record it dropped disappears
  rather than lingering as an orphan — scoped to the bundle, so a source split across files does
  not wipe its own other half.
- **Validated per record.** One malformed entry is refused by name and the rest import. A source
  with a typo in one creature is not a reason to import nothing.
- **Duplicates named.** The first record to claim a key wins and the rest are reported, because a
  silent last-write-wins is a catalogue nobody can explain.

## Adding another ruleset

Nothing in the core changes. The content model is category-shaped, not system-shaped: a
`ContentRecord` states its system, its category, its name and its source, and puts everything
else in a `data` bag the core never reads.

To add Pathfinder — or anything else:

1. **Write bundles** under `content/<source>/` with `systemId: 'pf2e'` and the source's own
   licence. Ancestries go in as `species`, heritages and archetypes in as `other`; the categories
   are slots every system in scope has, not D&D words.
2. **Add the licence verdict** to `licenses.ts` if the source is new. If it is not
   redistributable, the importer will refuse it — that is the boundary working.
3. **Write the adapter's content module**, the equivalent of
   [`src/domain/ruleset/dnd5e/content.ts`](../src/domain/ruleset/dnd5e/content.ts). It is the only
   place that system's shapes and the generic model meet: it filters the library by `systemId` and
   reads each `data` bag back as the shapes its own `Ruleset` implementation expects.
4. **Register the adapter** in `ruleset/registry.ts`, as `dnd5e` already is.

What you do **not** do: change `ContentRecord`, add a column, touch a UI component, or widen a
generic interface. `content.test.ts` holds a record from another system in the same library as a
D&D one and asserts that each adapter sees only its own — that is the property being protected.

## Where content goes at runtime

| Context | Library |
| --- | --- |
| A deployment | Imported rows, read by `loadContent(db)` and handed to the adapter with `useContentLibrary` |
| `npm run dev` with no server | The bundles in this directory, read directly — the same files, so the two cannot drift |
| Tests | Whatever the test builds, via `useContentLibrary` |
