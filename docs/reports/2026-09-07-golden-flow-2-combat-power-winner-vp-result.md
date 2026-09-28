# Golden Flow 2 Combat Power Winner VP Result

- Date: 2026-09-07
- Slice: Golden Flow 2 - Combat + Power + Winner + VP
- Canonical rules: `docs/rules/FD-Game-Rules-Final.md`
- Plan: `docs/plans/2026-09-07-golden-flow-2-combat-power-winner-vp.md`
- Acceptance baseline: `docs/plans/fd-rules-conformance-and-acceptance.md`
- Runtime authority for this slice: `MatchSession`

## Final Claim

Implementation claim: IMPLEMENTATION_COMPLETE_CANDIDATE
Reviewer required: yes
Rules covered: FD-BATTLE-001-CANDIDATE, FD-VP-001-CANDIDATE, partial FD-POWER-001-CANDIDATE, partial FD-PROJECTION-001-CANDIDATE, partial FD-RECONNECT-001-CANDIDATE

Gate C status: CANDIDATE_EVIDENCE_READY_FOR_REVIEW

This report does not self-promote Golden Flow 2 to `E2E_VERIFIED`. Independent Reviewer acceptance is still required.

## Scope Covered

- Tied highest eligible winners at `miyama_town`.
- Defeated high-power participant excluded from winner set.
- Solo `shinto` battlefield winner without competition VP.
- Event VP and competition VP remain separate and auditable.
- Multiple winners receive ceil-split VP.
- Recon player receives +2 VP once in the same scoring flow.
- Battle result is consumed once by scoring.
- Battle result payload preserves winner ids, tie flag, excluded ids, participant breakdowns, and VP adjustments.
- Production `MatchSession` path preserves the same facts through battle history and projection.
- Server room command-chain/reconnect preserves the same public battle/scoring projection.
- Browser E2E starts from battle-pre state, sends a real remote end-turn command, displays tied-winner and VP-pool facts, rejects a stale command, and preserves the result after reconnect.

## Changed Files

- `packages/rules/src/core/combat-resolver.ts`
- `packages/rules/src/core/scoring-resolver.ts`
- `packages/rules/src/phases/battle-phase.ts`
- `packages/rules/src/match-room-hub.ts`
- `packages/rules/src/match-room-protocol.ts`
- `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts`
- `packages/rules/tests/regression/legacy-battle-phase-quarantine.test.ts`
- `packages/rules/tests/match-session.test.ts`
- `apps/client/src/App.tsx`
- `apps/client/src/types/props.ts`
- `apps/client/src/state/engine-bridge.ts`
- `apps/client/src/state/engine-bridge.test.ts`
- `apps/client/src/state/remote-room-fixture.ts`
- `apps/server/src/match-server.ts`
- `apps/server/src/match-server.test.ts`
- `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts`
- `e2e/support/build-golden-flow-2-snapshot.ts`
- `docs/audits/fd-rule-conformance-matrix.md`
- `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
- `docs/reports/2026-09-07-golden-flow-2-combat-power-winner-vp-result.md`

## Gate A Evidence

- `packages/rules/tests/core/combat-resolver.test.ts`
- `packages/rules/tests/core/scoring-resolver.test.ts`
- `apps/client/src/state/engine-bridge.test.ts`

Evidence added or preserved:

- Tied winner shape uses `winnerPlayerIds`; compatibility `winnerPlayerId` is `null` for ties.
- Defeated/cannot-win status ids are normalized for battle winner exclusion.
- VP result details include `baseVpPerWinner`, `eventVpPool`, `competitionVpPool`, `vpAdjustments`, and `participantBreakdowns`.
- Client bridge preserves the public battle result fields without hand/deck leakage.

## Gate B Evidence

- `packages/rules/tests/regression/battle-winner-conformance.test.ts`
- `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts`
- `packages/rules/tests/regression/replay.test.ts`
- `packages/rules/tests/match-session.test.ts`

Evidence added:

- Named Golden Flow 2 fixture covers tied winners, defeated high-power exclusion, solo battlefield, hidden event reveal, recon VP, scoring consumption, and replay summary.
- `MatchSession` production-path test drives `resolveBattlePhase`, not only isolated core helpers.
- After-battle win/loss event ids are asserted for the tied/defeated battlefield.

## Gate C Status

- `apps/server/src/match-server.test.ts`
- `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts`

Status: candidate evidence ready for independent review.

- Server test builds a running room, installs a deterministic battle-pre fixture, then sends public `client:end_turn` over WebSocket.
- Server handler validates `expectedRevision` before calling `MatchRoom.endClientTurn()`.
- Accepted command path is `client:end_turn -> expectedRevision check -> MatchRoom.endClientTurn -> MatchSession.passPriority -> advanceToNextDecision -> resolveBattlePhase -> resolveBattlefield -> applyBattleScoring -> projection broadcast`.
- Browser test restores only battle-pre state through `/rooms/:id/restore`, opens host and P2 remote pages, clicks the real P2 end-turn UI, verifies tied winner and VP-pool display, sends stale revision `client:end_turn`, reconnects P2, and verifies the same public result remains visible without doubled VP.
- Projection assertion checks opponent private hand/deck definitions are not exposed in the restored P2 view.
- These tests now prove `Real Client -> Command -> Server Revalidation -> State Mutation -> Projection -> WebSocket -> Reconnect` for this named Golden Flow 2 slice.

## Tests Run

- `npx vitest run packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts` - passed, 1 file / 1 test.
- `npx vitest run packages/rules/tests/regression/legacy-battle-phase-quarantine.test.ts packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts` - passed, 2 files / 2 tests.
- `npx vitest run packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts packages/rules/tests/core/scoring-resolver.test.ts packages/rules/tests/core/combat-resolver.test.ts packages/rules/tests/regression/replay.test.ts` - passed, 4 files / 31 tests.
- `npx vitest run packages/rules/tests/match-session.test.ts packages/rules/src/__tests__/match-session-regressions.test.ts packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts` - passed, 3 files / 35 tests.
- `npx vitest --config vitest.config.ts --run src/state/engine-bridge.test.ts` from `apps/client` - passed, 1 file / 5 tests.
- `npx vitest --config vitest.config.ts --run src/match-server.test.ts` from `apps/server` - passed, 1 file / 2 tests.
- `npx vitest run packages/rules/tests/core/combat-resolver.test.ts packages/rules/tests/core/scoring-resolver.test.ts packages/rules/tests/regression/battle-winner-conformance.test.ts packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts packages/rules/tests/regression/replay.test.ts packages/rules/tests/match-session.test.ts` - passed, 6 files / 59 tests.
- `npm run test:client` - passed, 7 files / 48 tests.
- `npx playwright test e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts --project=chromium` - passed, 1 file / 1 test.
- `npx playwright test e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts e2e/fd-remote-sync.spec.ts e2e/fd-match-clickflow.spec.ts --project=chromium` - passed, 5 tests.
- `npm run typecheck` - passed.
- `npm run verify:stabilization` - passed: all stabilization gates; root rules/content suite included 91 files / 521 tests after adding the legacy quarantine regression.

## Known Failures

- Independent Reviewer has not yet promoted Golden Flow 2 to `E2E_VERIFIED`.
- `/rooms/:id/restore` is still used to install the deterministic battle-pre fixture, not to install a settled result.
- `npm run test:client -- --run apps/client/src/state/engine-bridge.test.ts` failed because the root script already injects `--run`, producing a duplicate command shape. The equivalent app-local command passed.
- `npx vitest run apps/server/src/match-server.test.ts` from repo root failed because the root Vitest include does not collect app server tests by that path. The app-local command passed.
- First `npm run verify:stabilization` run failed on `apps/server/src/match-server.test.ts` typecheck because the test assigned `undefined` to optional `locationId` under `exactOptionalPropertyTypes`. Fixed by using `delete player.locationId`; rerun passed.
- Early Playwright attempts failed before assertions due to test loader/runtime setup issues (`@fd/rules` JSON import in Playwright spec, then Windows child-process wrapper). Fixed by moving snapshot construction to `e2e/support/build-golden-flow-2-snapshot.ts` executed with local `tsx`.

## Known Legacy Paths Intentionally Retained

- `MatchSession` remains the production authority for this slice.
- `core/game-loop.ts` remains as a secondary test/simulation path.
- `core/card-play.ts` legacy pair-play path remains.
- `packages/rules/src/phases/battle-phase.ts` is retained but quarantined: `executeBattlePhase()` now fails closed and directs callers to the MatchSession battle/scoring path.
- `ability/interpreter.ts` legacy mutation runtime remains; Phase 3A `executeResolution` is not bridged into production in this slice.
- `projection/player-match-view.ts`, `projectAbilityState`, and `MatchSession.projectToClientState` remain separate projection owners.
- Compatibility `winnerPlayerId` remains for older display/contracts; ties use authoritative `winnerPlayerIds` and set `winnerPlayerId: null`.

## Areas Not Verified

- Full canonical power layer ordering across every modifier class.
- Golden Flow 1 complete action phase.
- Pending-decision reconnect.
- Stale command / expected revision rejection.
- Result Binding production bridge.
- Full round-end cleanup and lifecycle owner cleanup.
- Browser engines other than Chromium.
