# TC-P03 — API Contract Runtime Validation And Hardening

```text
Execute TC-P03. Harden the API boundary for production while preserving the existing frontend repository contracts where practical.

Inspect `src/domain/data/apiContract.ts`, HTTP repositories, backend routes/services, and the authentication layer first.

Tasks:
- define runtime request/response validation for every production API boundary using one consistent schema strategy;
- reject malformed, over-posted, unknown, and unauthorized payloads predictably;
- standardize API errors with stable machine-readable codes and safe user-facing messages;
- add pagination/filter/sort boundaries where list endpoints can grow materially;
- add request IDs/correlation IDs and structured server logs without leaking secrets or private data;
- add rate limiting or equivalent abuse controls on authentication, invite, roll, and mutation-heavy endpoints where appropriate;
- define idempotency strategy for retry-sensitive writes;
- reconcile same-origin vs cross-origin deployment, credentials, CORS, CSRF, and cookie/token behavior explicitly;
- add API contract/integration tests that exercise success, validation failure, auth failure, not-found, conflict, and retry cases;
- document any intentional API contract changes and update the frontend adapters in the same step.

Do not treat TypeScript types alone as runtime validation. Do not silently coerce security-sensitive fields.

Acceptance: malformed or unauthorized requests cannot mutate state, API errors are consistent, frontend adapters pass contract tests, and the API boundary is explicitly documented and testable.
```
