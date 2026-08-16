# TC-F20 — Character Lifecycle: Duplicate, Detach, Archive And Delete

```text
Execute TC-F20. Complete the missing lifecycle operations around characters.

Prerequisites: TC-F11 must be complete.

Read Character independence requirements, Campaign membership, authorization, existing attach flow, persistence schema and activity/realtime behavior.

Tasks:
- add Duplicate Character for the owner, producing a new independent character with a new id/version and clearly preserved vs reset state;
- add Detach from Campaign without deleting the character; preserve the requirement that characters outlive campaigns;
- define safe behavior when detaching a character from an active combat or when the player is the campaign's active participant; block with a clear reason rather than corrupting state;
- add Archive if useful for preserving history without clutter; if archive is not justified, document the decision and do not invent it;
- add permanent Delete Character with explicit confirmation and server-side dependency checks;
- ensure delete cannot orphan active combat/audit/history records; prefer refusing/deferred cleanup or a tombstone strategy over cascading away history silently;
- define what happens to campaign membership's characterId when detaching/deleting;
- add owner authorization; campaign DM may detach a campaign character where the product permits but must not permanently delete another user's independent character;
- expose lifecycle actions from My Characters/Character Settings with destructive actions visually distinct;
- add tests for duplicate independence, detach, reattach, delete dependency refusal, permissions, active combat protection, history preservation and refresh persistence;
- update docs/traceability.

Guardrails:
- do not equate "remove from campaign" with "delete character";
- do not let a DM delete another user's owned character from their account;
- do not cascade-delete combat history merely to satisfy a foreign key.

Acceptance: users can safely duplicate, detach and remove characters with clear ownership semantics; campaign and combat history remain consistent; destructive operations are authorized and guarded; tests/build pass.
```
