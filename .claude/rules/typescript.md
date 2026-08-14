---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.vue"
  - "**/package.json"
---
# TypeScript and application rules
- Keep strict type checking enabled and avoid `any` unless the boundary is isolated and justified.
- Validate environment variables and untrusted runtime inputs at startup or request boundaries.
- Organize code by feature/domain rather than technical layers alone.
- Return safe, consistent API errors and never expose stack traces or secrets to clients.
- Include loading, empty, error, disabled, and permission-denied UI states where applicable.
- Add tests closest to the changed risk and keep them deterministic.
