# Tomoe reduce_opponents_power Repair Result

- Date: 2026-09-08
- Phase: P0/P1 semantic repair before Phase 3A primitive expansion
- Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Reviewer status: independent review required before any `E2E_VERIFIED` promotion

## Scope

This slice repairs Tomoe `servant.tomoe.skill.sc-tomoe-3` `sc-tomoe-3.rain-of-fire`.

Canonical text: `炽焰之雨-战斗阶段：令同一战场所有未拥有地利的对手-5合计威力。`

The implementation now treats `opponent_has_no_terrain` as an authoritative runtime predicate over `modeState.terrainAssignments` for the opponent's current battlefield. Opponents with a valid terrain assignment are not reduced. Same-battlefield opponents without terrain receive a -5 total power card modifier.

## Root Cause

The previous Extended Effects handler explicitly assumed the opponent had no terrain. That made Tomoe reduce opponents even when canonical terrain assignment state showed they owned a terrain slot.

## Runtime Evidence

- `resolveExtendedEffect` validates `reduce_opponents_power` amount, condition, and scope.
- `opponent_has_no_terrain` reads `modeState.terrainAssignments` and validates that the store is shaped as location-to-player-id arrays.
- Corrupt terrain assignment state throws, causing the interpreter's extended-effect bridge to fail closed instead of applying a guessed modifier.
- Installed modifiers carry `sourceId` as `servant.tomoe.skill.sc-tomoe-3#sc-tomoe-3.rain-of-fire`, plus source card instance and ability fields.
- `resolveBattlefield` now exposes authored card-level additive power modifiers as `skill` entries in participant breakdowns without folding them into `basePower`.

## Regression Evidence

`packages/rules/tests/regression/tomoe-reduce-opponents-power.test.ts` covers:

- P2 in the same battlefield with terrain is not reduced.
- P3 in the same battlefield without terrain is reduced from 6 to 1.
- Battle breakdown for P3 has `basePower: 6`, `totalModifier: -5`, `effectivePower: 1`.
- The battle modifier trace records a `skill` source with Tomoe's canonical card id and `targetTag: total_power`.

## Secondary Runtime Paths

This repair intentionally remains inside the Extended Effects compatibility runtime. It does not migrate Tomoe to the Phase 3 primitive registry, does not expand the roster migration scope, and does not remove card-level `powerModifiers`.

## Next Slice

Proceed to Phase 3A primitive expansion for `adjust_mana`, `adjust_command_seals`, `draw_cards`, `move_all_remaining`, and `play_selected_cards`, then validate with the low-risk cards `conversion-magic.preparation`, `time-alter.action`, and `command-spell.gain-mana`.
