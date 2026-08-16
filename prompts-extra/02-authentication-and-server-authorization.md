# TC-P02 — Authentication And Server Authorization

```text
Execute TC-P02. Implement real authentication and enforce authorization on the server.

Read the existing SessionProvider, permissions model, campaign/member flows, privacy rules, roll visibility rules, and the backend foundation from TC-P01.

Tasks:
- implement account/session lifecycle appropriate to the chosen backend: sign in, sign out, session validation/refresh, and account identity retrieval;
- implement campaign membership and invite acceptance flows required by Phase 1;
- enforce authorization server-side for Campaign, Character, Monster/Homebrew, Encounter, Combat, Roll, privacy, and DM override actions;
- ensure Player permissions are scoped to their own permitted characters/actions and DM privileges are campaign-scoped;
- ensure private/secret data is never returned to unauthorized callers, not merely hidden in the UI;
- add CSRF/CORS/SameSite/token handling appropriate to the actual deployment topology;
- add negative authorization tests covering horizontal privilege escalation, direct-ID access, DM-only actions, character privacy, and secret rolls;
- keep client permission helpers for UX only; document that the server is authoritative.

Do not expose passwords, tokens, secrets, or private roll payloads in logs. Do not rely on client-supplied role claims without server verification.

Acceptance: authenticated sessions work end-to-end, unauthorized direct API calls are rejected, privacy/DM boundaries are enforced by backend tests, and the frontend can obtain its real session identity through the existing session seam.
```
