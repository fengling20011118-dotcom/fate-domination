# FD Acceptance Framework Integration Report

- Date: 2026-09-07
- Project: `D:\fd`
- Role: Rules Conformance Integration Engineer
- Scope: acceptance governance integration plus the first Gate B Battle Winner conformance slice.

## Files Inspected

- `docs/plans/fd-rules-conformance-and-acceptance.md`
- `docs/rules/FD-Game-Rules-Final.md`
- `docs/rules/fd-rules-conformance-and-acceptance.md`
- `docs/audits/fd-flow-runtime-inventory.md`
- `docs/audits/fd-card-runtime-architecture-audit.md`
- `docs/spec/engine-capability-matrix.md`
- `docs/spec/fd-playtest-v1-content-index.md`
- `docs/product/FD本地化游戏PRD.md`
- `docs/reports/2026-09-07-effect-result-binding-design-result.md`
- `packages/rules/src/match-session.ts`
- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/core/*`
- `packages/rules/src/projection/player-match-view.ts`
- `packages/rules/src/match-room.ts`
- `packages/rules/src/match-room-hub.ts`
- `apps/server/src/match-server.ts`
- representative rules/content/client/server/e2e tests

Missing expected files or unrecovered historical documents:

- historical body of `docs/plans/fd-card-engine-stabilization-plan.md`
- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`

Present and consumed in this pass:

- `docs/audits/fd-flow-runtime-inventory.md` is a Runtime Fact Source, not an acceptance PASS source.
- `docs/plans/fd-effect-result-binding-plan.md` is present and mapped to Gate A/B/C expectations.

Git state:

- `D:\fd` is a Git worktree on `main`, tracking `origin/main`.
- Remote: `https://github.com/binchen648/fd.git`.
- Baseline short HEAD at repair time: `1dc6196`.
- Working tree was dirty during this repair; unrelated untracked document governance files were left untouched.

## Generated / Updated Files

- `docs/audits/fd-rule-conformance-matrix.md`
- `docs/audits/fd-rule-interaction-matrix.md`
- `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
- `docs/plans/fd-card-engine-stabilization-plan.md`
- `docs/reports/fd-acceptance-framework-integration-report.md`
- `packages/rules/src/schema/game.ts`
- `packages/rules/src/core/combat-resolver.ts`
- `packages/rules/src/core/scoring-resolver.ts`
- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/tools/replay.ts`
- `apps/client/src/types/props.ts`
- `apps/client/src/state/engine-bridge.ts`
- `apps/client/src/state/seven-authoring-smoke-fixture.ts`
- `packages/rules/tests/regression/battle-winner-conformance.test.ts`
- targeted rules/client tests for tied battle winners

## Executive Answers

### 1. Is the new Acceptance Baseline integrated?

Yes, as a project governance baseline. The integration now establishes:

- Canonical Rules = `docs/rules/FD-Game-Rules-Final.md`
- Acceptance Baseline = `docs/plans/fd-rules-conformance-and-acceptance.md`
- Stabilization migration reference = `docs/plans/fd-card-engine-stabilization-plan.md`
- Rule Matrix = `docs/audits/fd-rule-conformance-matrix.md`
- Rule Interaction Matrix = `docs/audits/fd-rule-interaction-matrix.md`
- Golden Card/Flow contracts = `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`

The baseline is not copied into Canonical Rules. The duplicate `docs/rules/fd-rules-conformance-and-acceptance.md` is a governance conflict because `docs/rules` should contain rule truth, not proof process.

### 2. Which old completion states conflict?

Conflicting when used as final acceptance:

- `FULL`
- `DONE`
- `COMPLETE`
- `SUPPORTED`
- `AUTOMATIC`
- `automatic`
- `supported`
- report-local `PASS`
- `Production Ready`
- `exact / manual-blocking / unsupported` from older audit recommendations

Allowed only as non-final metadata:

- display metadata
- legacy content capability metadata
- runtime capability claim
- host adjudication state

Formal acceptance status is limited to:

`DEFINED`, `IMPLEMENTED_UNVERIFIED`, `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, `E2E_VERIFIED`, `FAILED`, `BLOCKED`, `NOT_VERIFIED`.

Implementers may only declare `IMPLEMENTATION_COMPLETE_CANDIDATE`.

### 3. Current Core Rule Status Counts

Based on `docs/audits/fd-rule-conformance-matrix.md`:

- Coverage: 19 / 63
- Matrix-covered: 19
- Not yet mapped: 44

| Status | Count |
|---|---:|
| `E2E_VERIFIED` | 0 |
| `SCENARIO_VERIFIED` | 2 |
| `COMPONENT_VERIFIED` | 13 |
| `IMPLEMENTED_UNVERIFIED` | 4 |
| `FAILED` | 0 |
| `BLOCKED` | 0 |
| `NOT_VERIFIED` | 44 |

No core rule is promoted to `E2E_VERIFIED` by this pass. `FD-BATTLE-001-CANDIDATE` and `FD-VP-001-CANDIDATE` now have a named Gate B scenario in `packages/rules/tests/regression/battle-winner-conformance.test.ts`, covering tied eligible winners, defeated high-power exclusion, VP source split, event trace, scoring consumption, and a real Artoria Caster non-sole-winner trigger. They still require Gate C browser/server/projection/reconnect evidence before `E2E_VERIFIED`.

### 4. Largest 10 Evidence Gaps

1. Forty-four canonical candidate rule units are not yet mapped and therefore count as `NOT_VERIFIED`.
2. Battle winner and VP tied-winner semantics have Gate A and Gate B proof, but no Golden Flow Gate C.
3. Multiple runtime owners remain for flow, movement, play, cleanup, projection.
4. Production abilities still use the legacy interpreter path rather than Phase 3A `executeResolution`.
5. Golden Flow 1 complete action phase has no formal contract test.
6. Reconnect during pending payment/target/response is not verified.
7. Hidden passive reveal is not verified end to end.
8. Round cleanup order is not proven with residual, temporary, once-per-game, face-down, and defeat status together.
9. Modifier lifecycle is split across `ongoingEffects`, `modeState`, and card-level `powerModifiers`.
10. Current browser tests prove UI/transport fragments, not canonical rule completion.

### 5. Which tests were previously overestimated?

| Test / Gate | Overestimated Claim | Correct Interpretation |
|---|---|---|
| `npm run verify:stabilization` | Release Ready | Regression aggregate only; no Rule ID coverage guarantee. |
| `content:validate` | Cards are playable | Content shape/source checks only. |
| `verify:playtest-v1` | No private leaks overall | Pack/fixture privacy checks only; not all runtime projections. |
| `complex-skills-regression.test.ts` | Golden Cards are complete | Broad Gate B-style fragments; no real browser or reconnect proof. |
| `resolution-dataflow.test.ts` | Result Binding production-ready | Gate A synthetic infrastructure only. |
| Playwright clickflow | Flow is E2E verified | UI can click selected widgets; not full canonical flow. |
| Websocket server test | Reconnect verified | Viewer reconnect after room start only; no active pending decision restore. |
| Client component tests | Runtime projection complete | Client rendering tests; server correctness still separate. |

### 6. Multiple Runtime Owners

Rules with `MULTIPLE_RUNTIME_OWNERS`:

- Global Flow
- Player Order
- Normal Move
- Normal Play Batch
- Residual / Lifecycle
- Power Layers
- VP / Scoring
- Round Cleanup
- Hidden Information
- Projection

These are not automatically bugs, but each must have one authoritative owner and any helper/legacy path must be documented as subordinate or removed from release paths.

### 7. Secondary / Legacy Bypass

Known bypass risks:

- `core/game-loop.ts` seeded runner can execute flow separate from formal `MatchSession`.
- `core/card-play.ts` exists alongside `ability/interpreter.ts::playBatch`.
- `core/movement.ts` exists alongside ability interpreter movement helpers.
- `projection/player-match-view.ts`, `ability/interpreter.ts::projectAbilityState`, and `MatchSession.projectToClientState` are separate projection paths.
- `apps/client/src/state/playtest-fixture-loader.ts` and client fixtures can render non-production flows.
- `packages/rules/src/tools/content-bridge.ts` loads `ContentLibraryIndex` without formal ability runtime.
- `ability/extended-effects.ts` contains a large compatibility switch and ad hoc state writes.
- `ability/interpreter.ts` production path still uses void mutation resolution.
- `ability/interpreter.ts` still has a direct `controller_loses_battle` condition branch that treats "not winner" as loss if used outside derived `after_controller_loses_battle` events.
- `legacy-v0` play classifier rollback remains executable.
- `docs/rules/fd-rules-conformance-and-acceptance.md` duplicates the acceptance baseline under the rules directory.

### 8. Golden Card Candidates

Defined in `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`:

- Synthetic Phase 3A chain, then first real result-binding Golden Card.
- Artoria Caster `选王剑`.
- Artoria Caster `选定之杖`.
- Tomoe `鬼种之魔` / `真言·圣观世音菩萨`.
- Achilles `勇者的不凋花`.
- Drake `骑乘` and Artoria Alter `黑化诅咒`.

### 9. Golden Flows

Defined in `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`:

1. Complete Action Phase.
2. Combat + Power + Winner + VP.
3. Round End + Cleanup + Lifecycle.
4. Reconnect during active flow.
5. Optional Trigger / Interaction chain.

### 10. Next Minimal Implementation Slice

The next slice should finish Golden Flow 2 Gate C as the first complete Gate A -> Gate B -> Gate C demonstration, building on the Battle Winner Gate B scenario rather than starting a broad runtime rewrite:

1. Add one Gate C browser path that reaches combat/scoring through server-supplied actions and projection.
2. Assert browser-visible battle result projection for `winnerPlayerIds`, `tied`, `excludedPlayerIds`, VP sources, and scoring consumption.
3. Add reconnect during the same combat/scoring flow before any `E2E_VERIFIED` promotion.
4. Keep the direct `controller_loses_battle` condition branch marked as legacy-risk until a focused negative test or code fix proves non-participants cannot be misclassified as losers.

Do not start full roster migration or Phase 3 full primitive conversion until this first flow contract is green and independently reviewed.

## Verification Run

- `npm run typecheck`: passed.
- `npx vitest run packages/rules/tests/core/combat-resolver.test.ts packages/rules/tests/core/scoring-resolver.test.ts packages/rules/tests/core/game-loop-battle-cleanup.test.ts packages/rules/tests/regression/replay.test.ts packages/rules/tests/regression/complex-skills-regression.test.ts packages/rules/tests/match-session.test.ts packages/rules/src/__tests__/match-session-regressions.test.ts`: passed, 7 files / 110 tests.
- `npx vitest run packages/rules/tests/regression/battle-winner-conformance.test.ts`: passed, 1 file / 1 test.
- `npm run test:client`: passed within `npm run verify:stabilization`, 7 files / 48 tests.
- `npm run verify:stabilization`: passed all gates; root tests 89 files / 518 tests, complex-skill regressions 37 tests, client tests 7 files / 48 tests, Playwright Chromium 4 tests.

## Final Integration Result

Status: `SCENARIO_VERIFIED` for `FD-BATTLE-001-CANDIDATE` and `FD-VP-001-CANDIDATE`; overall framework integration remains `IMPLEMENTED_UNVERIFIED` until Reviewer Gate enforcement and Golden Flow Gate C are implemented.

The framework is now connected at the documentation and evidence-mapping level. Battle Winner now has component and scenario evidence for multi-winner result shape and consumers. This is not a Release Ready claim, and no core rule has been promoted to `E2E_VERIFIED`.
