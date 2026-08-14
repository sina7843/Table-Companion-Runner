# TC-11c — Combat log, undo/correction, realtime states, tablet polish

Execute only this slice after TC-11b. Implement useful Combat Log history, targeted undo/correction, DM overrides, recent roll activity, reconnecting/state-restored indicators, and combat-ended state.

Undo should communicate what is being reversed, e.g. `Undo 12 damage to Goblin #3`, rather than ambiguous global undo.

Keep the log informative but secondary. Realtime changes should be noticeable without constant distracting animation.

Do a dedicated tablet pass so initiative, HP editing, conditions, turn advancement, and details remain usable.

Acceptance: combat can recover from common mistakes and brief connectivity changes without the DM losing context.
