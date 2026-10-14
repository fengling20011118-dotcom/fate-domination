# Attack/Play Stabilization Slice Result

- Date: 2026-09-07
- Scope: Phase 0 plus the Phase 1 attack/play classifier only
- Release gate: FAILED because root tests and real-server Playwright remain red
- Capability promotion: BLOCKED by Release Policy

## Fixed Scope

- Replaced power/effect heuristics with explicit card-type play classification.
- Set the explicit-v1 regular attack allowance to two and retained `legacy-v0` as a rollback option.
- Separated total cards played, regular attacks declared, and current attack-area occupancy.
- Separated effect-driven card plays from the regular attack declaration quota.
- Made staged selection use the same legality evaluator as direct play and permit building the two-card batch.
- Added owner-only play diagnostics and summary data to the internal ability projection.

## Golden Regression Results

| Scenario | Classifier result |
|---|---|
| Caster sword + pilgrim | PASS: legal two-card batch |
| Drake Golden Hind + Voyager | PASS: legal two-card batch |
| Ereshkigal continuation + protection | PASS: legal two-card batch |
| Kintoki two Golden Impact copies | PASS: legal two-card batch; per-card replay limit remains authoritative |
| Tomoe Independent Action + Inferno Fire | PASS: legal two-card batch |

These results remove the unrelated one-attack quota blocker only. They do not prove every effect, lifecycle, interaction, or E2E flow for these cards.

## Remaining Failure Baseline

### Root tests: 15 failures in 5 files

| Owner | File/category | Count | Relation to this slice |
|---|---|---:|---|
| Content Platform | `fd-playtest-servants.test.ts`: named starting-deck card assumed to be a basic ID | 1 | Unrelated pre-existing content-contract drift |
| Content Platform | `playtest-pack-loader.test.ts`: expects five servants while approved manifest contains seven | 1 | Unrelated stale roster assertion |
| Rules Engine / Combat | `combat-resolver.test.ts`: legacy field-card participant and competition reward expectations | 4 | Unrelated pre-existing combat/zone/reward contract drift; no classifier code path |
| Rules Engine / Combat | `game-loop-battle-cleanup.test.ts`: same legacy participant derivation propagates into battle cleanup | 8 | Unrelated pre-existing combat/zone contract drift; no classifier code path |
| Rules Engine / Tests | `match-session.test.ts`: Surveil definition is action-phase but test activates it in battle | 1 | Unrelated stale timing expectation; backend rejection confirmed as `illegal_action` |

Root result after this slice: 465 passed, 15 failed, 480 total. Before the slice: 439 passed, 30 failed, 469 total.

### Real-server Playwright: 4 failures

| Owner | Failure | Relation to this slice |
|---|---|---|
| Frontend / QA | Fixture waits for `/round 1 start/` replay button | Unrelated fixture/UI text drift |
| Frontend / Accessibility | `本人操作台` locator matches region and nested summary | Unrelated ambiguous accessible labels |
| Frontend / QA | Test requests `结束行动` while real match is in preparation and exposes `完成准备` | Unrelated phase-aware E2E drift |
| Frontend / Accessibility | Remote sync repeats ambiguous `本人操作台` label | Unrelated accessible-label drift |

## Acceptance Assessment

### Phase 0

- PASS: `npm run verify:stabilization` executes all required gates and reports named failing groups without stopping early.
- PASS: capability baseline separates parse, runtime, legality, interaction, and E2E evidence.
- PASS: generated artifacts have an owner and pass two-clean-build plus checked-in SHA-256 comparison.
- Constraint recorded: `D:\fd` is not a Git worktree, so branch and HEAD remain `UNKNOWN`.

### Phase 1 attack/play classifier

- PASS: all five known scenarios are no longer blocked by the unrelated one-attack quota.
- PASS: diagnostics, legal action offers, and direct dispatch agree in tested wrong-phase and insufficient-mana states.
- PASS: remaining root failures are listed above with owners and do not execute the new classifier path.
- PASS: explicit-v1 behavior is guarded by a tested `legacy-v0` rollback version.

### Release Policy

- FAILED: root and real-server E2E gates are red.
- BLOCKED: no card is promoted to `FULL`, `INTERACTION_COMPLETE`, or `E2E_VERIFIED`.
- No Phase 2+ work was performed.
