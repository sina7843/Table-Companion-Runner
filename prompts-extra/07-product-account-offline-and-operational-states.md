# TC-P07 — Product Account Offline And Operational States

```text
Execute TC-P07. Close the product-level gaps that appear once the app is backed by real accounts, APIs, persistence, and realtime infrastructure.

Inspect current entry/home/campaign/character/combat screens and the production services implemented in TC-P01 through TC-P06.

Tasks:
- complete account-facing states required for Phase 1: authenticated entry, signed-out handling, expired session handling, basic account settings, logout, and safe account-data boundaries;
- complete campaign invite/join states including invalid, expired, already-used, unauthorized, and success cases;
- replace fixture-era assumptions with real loading, empty, error, retry, saving, saved, conflict, offline, reconnecting, and resynced states where relevant;
- ensure drafts/autosave communicate failures and do not silently discard user work;
- define safe refresh/recovery behavior for Character Builder, Encounter Builder, and active Combat;
- add user-facing handling for API conflicts such as stale versions without exposing internal error details;
- verify Player mobile touch targets and DM desktop/tablet workflows remain usable under latency and partial failure;
- add accessibility checks for new dialogs, errors, focus transitions, and status announcements;
- add minimal product analytics/telemetry hooks only if a provider-neutral boundary can be created without requiring secrets; do not add invasive tracking.

Do not expand into Phase 2/3 features. Do not mask failed writes as success.

Acceptance: the product behaves coherently under signed-out, loading, no-data, slow-network, failed-save, conflict, offline, reconnect, and expired-session conditions, with no silent data loss and no regression to core Phase 1 UX.
```
