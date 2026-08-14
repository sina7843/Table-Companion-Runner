# TC-10c — Start Combat handoff

Execute only this slice after TC-10b. Implement Start Combat from a saved Encounter Template.

Create a separate Combat Instance in state/data architecture, preserve template data, allow only meaningful pre-start adjustments, then move into initiative setup / Round 1 with minimal ceremony.

Avoid unnecessary confirmation dialogs. Clearly distinguish template editing from runtime combat state.

Acceptance: starting combat cannot mutate the source template and transitions cleanly into the TC-11 combat shell.
