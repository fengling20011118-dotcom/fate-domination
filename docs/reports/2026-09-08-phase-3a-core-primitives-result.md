# Phase 3A Core Primitive Pilot Result

- Date: 2026-09-08
- Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Scope: `conversion-magic.preparation`, `time-alter.action`, `command-spell.gain-mana`
- Gate C: partial candidate evidence for `time-alter.action` and `conversion-magic.preparation`; `command-spell.gain-mana` remains not verified at Gate C

## Implemented

- Added typed Resolution Data-flow primitives for `adjust_mana`, `adjust_command_seals`, `draw_cards`, `move_all_remaining`, and `play_selected_cards`.
- Preserved `resultVar` authoring compatibility by binding typed primitive results and exposing the primary numeric result as a controlled variable.
- Kept `play_selected_cards` server-owned by requiring a MatchSession/interpreter hook into the shared `playBatch` path.
- Added a narrow Phase 3A pilot boundary for the three selected ability IDs plus explicit data-flow syntax. Non-pilot roster abilities intentionally remain on legacy `resolveEffect`.

## Evidence

- `packages/rules/tests/regression/resolution-dataflow.test.ts`
  - registry contains the expanded primitive set
  - exposed result schema fields are consumable
  - invalid/future/unsafe bindings fail closed
  - later runtime failure rolls back the transaction

- `packages/rules/tests/regression/phase-3a-core-primitives.test.ts`
  - Irisviel `conversion-magic.preparation`: canonical compiled definition moves all hand cards to discard and consumes the actual `movedCount` for mana gain
  - Kiritsugu `time-alter.action`: canonical compiled definition opens the hand-card target window, uses shared play batch for face-down effect play, then draws one card
  - `command-spell.gain-mana`: canonical compiled definition applies typed mana and command seal mutation and records the command-spell directive
  - negative cases cover invalid result field, runtime corruption rollback, and hookless `play_selected_cards` fail-closed

- `e2e/fd-time-alter-core-primitive.spec.ts`
  - Kiritsugu `time-alter.action`: browser activates `固有时制御`, submits the server-projected hand-card target after reconnect, verifies the selected hand card moved face-down to the attack area, verifies one deck card was drawn, and rejects a stale replay without duplicate movement or draw

- `e2e/fd-conversion-magic-core-primitive.spec.ts`
  - Irisviel `conversion-magic.preparation`: browser activates `转换魔术`, verifies two hand cards move to discard, verifies mana increases by the actual moved count, reconnects after resolution, and rejects a stale replay without duplicate discard or mana gain

## Boundary

- This slice does not migrate all cards using these primitive names.
- Gate C evidence is currently limited to Kiritsugu `time-alter.action` and Irisviel `conversion-magic.preparation`; `command-spell.gain-mana` still lacks browser/WebSocket/reconnect evidence.
- This slice does not promote any card, primitive, or phase to `E2E_VERIFIED`.
