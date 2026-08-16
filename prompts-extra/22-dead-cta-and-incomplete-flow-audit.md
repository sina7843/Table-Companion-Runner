# TC-F22 — Dead CTA And Incomplete Flow Audit

```text
Execute TC-F22. Remove the remaining "looks clickable but does nothing" product gaps before feature freeze.

Read the full routed UI, design-system Button/IconButton/ListRow usages, router, screens, tests and current requirements. Search systematically for no-op handlers, placeholder links, disabled production actions, fake success/saved states and controls that never reach persistence.

Known examples to verify, not blindly assume:
- Campaign Overview "Start combat" actions;
- recent Combat "Log" actions;
- any `onClick={() => undefined}` / no-op apply/save handlers;
- any copy that says Saved/Complete when no successful mutation occurred.

Tasks:
- inventory every user-visible interactive control in production routes and classify it as working, intentionally unavailable/absent, or defective;
- connect defective controls to the real existing flow/API when the feature is already in Phase 1 scope;
- when a feature is intentionally out of scope, remove the fake affordance instead of leaving a disabled or no-op control;
- ensure Start Combat from campaign/encounter surfaces routes through the real encounter -> combat creation path;
- ensure combat-history/log navigation opens real persisted history where the product promises it;
- verify empty states and primary CTAs route to valid destinations;
- remove stale fixture-era assumptions and false status copy;
- add focused UI tests for every repaired critical CTA and at least one route-level smoke test covering all production navigation targets;
- add a static/AST-based guard where practical to catch obvious production no-op handlers without blocking legitimate presentational components;
- update PROJECT_STATUS.md with any deliberately deferred actions.

Guardrails:
- do not create placeholder pages just to make a link resolve;
- do not silently remove a Phase 1 requirement to make the audit green;
- do not treat test/demo/dev routes as production product surfaces.

Acceptance: no production control advertises a capability it does not perform; all Phase 1 primary CTAs reach real flows; intentionally deferred features are absent or honestly explained; tests/build pass.
```
