# Extra Prompts

This folder is reserved for additional prompts that are intentionally kept separate from the existing Phase 1 Runner prompt sequence in `/prompts`.

Use this folder for follow-up production work such as:

- Backend and PostgreSQL implementation
- Authentication and server-side authorization
- Server-authoritative combat and concurrency control
- Realtime/WebSocket production hardening
- Rules/content ingestion pipeline
- Integration and end-to-end testing
- CI/CD, deployment, observability, and release readiness
- Security and production-readiness audits

## Important

Files in this folder are **not part of the current Runner sequence by default** and should not be added to `prompts/prompt-manifest.json` unless we explicitly decide to integrate them into the automated Runner flow.
