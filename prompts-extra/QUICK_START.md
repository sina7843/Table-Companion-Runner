# Quick Start — Extra Production Sequence

Run these prompts only after the existing Phase 1 prompt sequence is complete or when the repository already has the Phase 1 frontend/domain foundation.

Recommended order:

```text
TC-P00
TC-P01
TC-P02
TC-P03
TC-P04
TC-P05
TC-P06
TC-P07
TC-P08
TC-P09
TC-P10
```

Each prompt must inspect the repository before changing code, preserve existing architecture where sound, run the available validation suite, and update implementation documentation when architecture or readiness changes.

This sequence is intentionally independent from `/prompts/prompt-manifest.json`.
