# TC-F21 — Campaign Management And Membership Controls

```text
Execute TC-F21. Turn Campaign Settings and party administration into real management flows.

Read CampaignRepository/API/schema, Campaign Settings/Party screens, invite handling, authorization, active combat dependencies and Requirements.md.

Tasks:
- add server-authorized campaign rename and other Phase 1 editable campaign identity fields;
- add Regenerate Invite Code, invalidating the old code atomically and making repeated requests safe;
- add DM controls to remove a player from the campaign and define what happens to that player's attached character: default to detach, never delete the player's character;
- add DM control to detach a character from the party without removing the user when appropriate;
- add Player Leave Campaign with clear consequences for attached character and active combat;
- add campaign Archive/Delete only with explicit dependency rules: completed combat/history must not disappear accidentally;
- refuse membership/destructive changes that would corrupt a live CombatInstance, with actionable UI copy;
- keep the one-primary-DM Phase 1 rule; do not add co-DM in this slice;
- update Campaign Settings and Party UI so every visible management CTA performs a real persisted action;
- publish safe realtime invalidation after membership/settings commits;
- add tests for rename, invite regeneration/old-code refusal, remove player, leave campaign, detach semantics, active-combat protection, DM-only authorization and history preservation;
- update docs/traceability.

Guardrails:
- removing a player must not delete that user's independent character;
- invite codes are server-generated; do not accept a client-selected replacement;
- do not expose a future co-DM feature as a disabled fake control.

Acceptance: the DM can genuinely manage campaign identity, invite and membership; players can leave safely; characters retain correct ownership/independence; live combat/history cannot be corrupted; tests/build pass.
```
