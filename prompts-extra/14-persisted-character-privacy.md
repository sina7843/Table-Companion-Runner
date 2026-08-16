# TC-F14 — Persisted Character Privacy

```text
Execute TC-F14. Make Character Privacy a real persisted authorization feature instead of local UI state.

Prerequisite: TC-F11 character writes must be complete.

Read CharacterPrivacy, Character.sectionVisibility, permissions.ts, API authorization/response shaping, realtime behavior and Requirements.md privacy rules.

Tasks:
- persist each supported CharacterSectionKey visibility through the versioned character write boundary;
- keep combat state/overview non-hideable where the product requires it;
- enforce the visibility model server-side when returning another player's character data; do not rely on hidden tabs or client filtering as the security boundary;
- ensure the owner and campaign DM always retain required access while other party members receive only allowed sections;
- validate visibility values and section keys; refuse unknown or system-inapplicable keys rather than storing arbitrary data;
- implement Save/Autosave behavior with visible saving/saved/failed state and stale-version recovery;
- make realtime invalidation update other clients after a privacy change without leaking the now-hidden content in the event payload;
- remove the current warning that changes are only held on the device once persistence exists;
- add API/security tests proving private data is absent from unauthorized responses, DOM/E2E where appropriate, and still visible to owner/DM;
- add tests for persistence across refresh/restart and concurrent privacy changes.

Guardrails:
- privacy is server-side data minimization, not CSS/UI hiding;
- do not make HP/conditions/death-save combat state private if the product contract says it is always shared;
- do not leak hidden section content through realtime summaries, logs or error payloads.

Acceptance: a player can change supported section visibility, refresh and retain it; party members immediately lose/gain the correct access; DM and owner retain required visibility; unauthorized API responses never contain private section data; validation suite passes.
```
