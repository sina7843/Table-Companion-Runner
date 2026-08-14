# TC-01 — Design System Integration

```text
Execute TC-01. Integrate the approved Table Companion Design System into the application without visually reinterpreting it.

Read the approved design source through `claude_design` again as needed, especially all token CSS, component CSS, skin CSS, `_ds_bundle.js`, and `styles.css`.

Tasks:
- map source tokens into the chosen app architecture;
- preserve typography, colors, spacing, shapes, motion, icon treatment, density, dark/light behavior, and touch-target rules;
- create reusable primitives/adapters rather than copying giant static HTML blocks;
- preserve CSS variables where useful;
- ensure Tailwind, if used, references semantic tokens instead of replacing the design system with arbitrary utility values;
- implement representative primitives: buttons, inputs, tabs, badges/chips, drawers, dialogs, tooltips, skeletons, toasts, list/table rows, stat display, HP control, condition chip, and roll result shell;
- create a lightweight internal showcase/dev route only if it materially helps fidelity checking.

Acceptance: design tokens and core primitives visually match the approved Design System, build/typecheck pass, and no parallel visual language is introduced.
```
