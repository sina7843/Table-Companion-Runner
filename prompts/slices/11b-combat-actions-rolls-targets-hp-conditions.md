# TC-11b — Combat actions, dice, targeting, HP, conditions, death saves

Execute only this slice after TC-11a. Add action execution from Character/Monster actions, integrated dice, public/secret roll state, targeting, direct damage, healing, HP quick controls, conditions, concentration where relevant, and D&D death saves through the ruleset adapter.

Required flow example: Longsword action -> attack roll -> result -> damage roll -> target -> apply -> target HP updates immediately. DM approval is not required; correction comes through edit/undo.

Avoid modal chains. Secret DM rolls must never leak to Player-facing state.

Acceptance: core combat actions work end-to-end with shared components and generic ruleset boundaries.
