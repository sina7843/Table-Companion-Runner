# TC-F15 — Character Avatar And Portrait Media

```text
Execute TC-F15. Add real character avatars/portraits without coupling the core product to one storage vendor.

Prerequisite: TC-F11 character persistence must be complete.

Read the Character model, Avatar component/usages, account/media/security patterns, server routing/validation, deployment docs and tests.

Tasks:
- extend Character with a generic portrait/avatar reference suitable for all game systems; keep initials/name fallback when absent;
- add owner and campaign-DM controls to upload, replace and remove a character portrait;
- add a server-mediated upload path with strict content-type, byte-size and image-dimension limits; accept only intended raster formats and reject disguised/non-image payloads;
- strip or ignore unsafe metadata where practical and never serve uploaded content with executable HTML/SVG semantics;
- store only a stable media key/reference on Character, not raw base64 image data in PostgreSQL domain records;
- introduce a storage abstraction so local development can use a local/test adapter while production can later point to object storage/CDN without changing Character domain APIs;
- add accessible crop/position behavior only if it can be implemented reliably; otherwise use a predictable object-fit presentation and do not fake crop persistence;
- render the portrait consistently in My Characters, Party, Character Sheet, DM character lists and combat participants where identity is shown;
- preserve privacy expectations: a character portrait visible to party follows the same visibility as character identity, not private notes;
- add tests for upload authorization, file validation, oversized/invalid input, replace/remove, missing media fallback and persistence;
- document production storage configuration and backup/retention expectations without committing credentials.

Guardrails:
- do not accept arbitrary remote URLs as trusted image sources unless there is an explicit safe proxy/allowlist design;
- do not put object-store credentials in VITE_* variables;
- do not make SVG upload executable;
- do not break existing Avatar initials fallback.

Acceptance: a character owner or authorized DM can set/replace/remove a portrait; it persists and renders across the product; invalid/unauthorized uploads are refused; storage is provider-agnostic; tests/build pass.
```
