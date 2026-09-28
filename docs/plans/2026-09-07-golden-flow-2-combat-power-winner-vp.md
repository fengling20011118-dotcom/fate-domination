# Golden Flow 2 Combat Power Winner VP Implementation Plan

**Goal:** Build the first complete FD Gate A -> Gate B -> Gate C acceptance slice for combat, power, battle winners, and VP scoring.

**Architecture:** Keep `MatchSession` as the production authority path for this slice. Reuse the existing `combat-resolver` and `scoring-resolver` component evidence, then add one named Golden Flow scenario that proves battle result shape, scoring consumption, event/replay trace, projection, browser/server path, and reconnect behavior without starting a broad Flow Engine rewrite.

**Tech Stack:** TypeScript, Vitest, Playwright, FD rules package, FD client/server packages.

---

## Scope Boundary

This slice should prove Golden Flow 2 only:

```text
Combat + Power + Winner + VP
```

In scope:

- tied highest eligible winners
- defeated high-power participant exclusion
- solo battlefield winner without competition VP
- event VP plus competition VP source separation
- ceil split across multiple winners
- personal rewards as separate VP adjustments
- recon +2 once
- `after_battle_result_determined`, after-win, and after-loss trigger dispatch evidence
- power trace / participant breakdown evidence
- battle result consumption by scoring
- player projection and client projection preservation
- one production-path server/browser proof
- reconnect check around the same flow

Out of scope:

- full Global Flow Engine rewrite
- complete Action Phase sub-state machine
- Result Binding production bridge
- broad card roster migration
- full lifecycle cleanup refactor
- changing canonical rule facts
- deleting legacy runtime paths

## Authority And Required Reading

Read in this order before editing:

1. `docs/FD-DOCUMENT-ROADMAP.md`
2. `docs/rules/FD-Game-Rules-Final.md`
3. `docs/plans/fd-rules-conformance-and-acceptance.md`
4. `docs/audits/fd-flow-runtime-inventory.md`
5. `docs/audits/fd-rule-conformance-matrix.md`
6. `docs/audits/fd-rule-interaction-matrix.md`
7. `docs/plans/fd-card-engine-stabilization-plan.md`
8. `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
9. `docs/reports/fd-acceptance-framework-integration-report.md`

Treat reports as historical evidence only. Do not promote any status from a report without current tests and reviewer acceptance.

## Current Evidence To Preserve

Existing relevant files:

- `packages/rules/src/core/combat-resolver.ts`
- `packages/rules/src/core/scoring-resolver.ts`
- `packages/rules/src/match-session.ts`
- `packages/rules/src/tools/replay.ts`
- `packages/rules/src/schema/game.ts`
- `apps/client/src/state/engine-bridge.ts`
- `apps/client/src/types/props.ts`
- `apps/server/src/match-server.ts`
- `packages/rules/tests/core/combat-resolver.test.ts`
- `packages/rules/tests/core/scoring-resolver.test.ts`
- `packages/rules/tests/regression/battle-winner-conformance.test.ts`
- `packages/rules/tests/regression/replay.test.ts`
- `packages/rules/tests/match-session.test.ts`
- `apps/client/src/state/engine-bridge.test.ts`
- `apps/server/src/match-server.test.ts`
- `e2e/fd-match-clickflow.spec.ts`
- `e2e/fd-remote-sync.spec.ts`

Known current status:

- `FD-BATTLE-001-CANDIDATE`: `COMPONENT_VERIFIED`, Gate B/C missing.
- `FD-VP-001-CANDIDATE`: `COMPONENT_VERIFIED`, Gate B/C missing.
- `FD-POWER-001-CANDIDATE`: `COMPONENT_VERIFIED`, lacks full canonical layer trace.
- `FD-PROJECTION-001-CANDIDATE`: `COMPONENT_VERIFIED`, lacks active Golden Flow proof.
- `FD-RECONNECT-001-CANDIDATE`: `COMPONENT_VERIFIED`, lacks active flow proof.

## Acceptance Target

Final expected status after this slice, if all evidence passes and an independent reviewer agrees:

```text
FD-BATTLE-001-CANDIDATE: SCENARIO_VERIFIED candidate, with Gate C evidence candidate
FD-VP-001-CANDIDATE: SCENARIO_VERIFIED candidate, with Gate C evidence candidate
Golden Flow 2: IMPLEMENTATION_COMPLETE_CANDIDATE
```

Do not self-declare `E2E_VERIFIED`. The implementer may only declare `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review decides final promotion.

## Task 1: Establish Golden Flow 2 Fixture Builder

**Files:**

- Create or modify: `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts`
- Reuse helpers from: `packages/rules/tests/regression/battle-winner-conformance.test.ts`
- Avoid modifying production code in this task.

**Step 1: Write a fixture helper**

Create a deterministic `GameState` with:

- P1 and P2 tied as highest eligible winners at `miyama_town`
- P3 higher raw power but defeated / unable to win
- P4 solo at `shinto`
- P5 at `recon`
- public and hidden event coverage where current runtime supports it
- explicit event VP and location competition VP

**Step 2: Add a failing scenario test**

The test should call the production domain services used by `MatchSession`:

```ts
const resolved = resolveBattlefield(state, {
  battlefieldId: "miyama_town",
  revealHiddenEvents: true,
}).nextState;

const battle = resolved.battleResults.at(-1)!;

expect(battle).toMatchObject({
  battlefieldId: "miyama_town",
  winnerPlayerIds: ["p1", "p2"],
  tied: true,
  winnerPlayerId: null,
  excludedPlayerIds: ["p3"],
});

expect(battle.participantBreakdowns).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ playerId: "p1" }),
    expect.objectContaining({ playerId: "p2" }),
    expect.objectContaining({ playerId: "p3" }),
  ]),
);
```

**Step 3: Run it and record failure**

Run:

```powershell
npx vitest run packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts
```

Expected before implementation: fail only on missing scenario expectations or fixture wiring, not unrelated compile errors.

**Step 4: Implement only if the test exposes a real current gap**

If existing code already passes the result-shape test, do not edit resolver code. Continue to Task 2.

## Task 2: Prove VP Source Separation And Scoring Consumption

**Files:**

- Modify test: `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts`
- Modify only if needed: `packages/rules/src/core/combat-resolver.ts`
- Modify only if needed: `packages/rules/src/core/scoring-resolver.ts`

**Step 1: Add VP expectations**

Assert:

- event VP pool is represented separately from competition VP pool
- multiple winners receive ceil split
- personal rewards are represented as separate adjustments
- `applyBattleScoring` consumes `battleResults` exactly once
- replay/scoring logs preserve enough source labels to audit the result

Example expectation shape:

```ts
expect(battle.vpAdjustments).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ playerId: "p1", source: "battle_event" }),
    expect.objectContaining({ playerId: "p1", source: "battle_competition" }),
    expect.objectContaining({ playerId: "p2", source: "battle_event" }),
    expect.objectContaining({ playerId: "p2", source: "battle_competition" }),
  ]),
);

const scored = applyBattleScoring(resolved).nextState;
expect(scored.battleResults).toHaveLength(0);
```

**Step 2: Run focused tests**

Run:

```powershell
npx vitest run packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts packages/rules/tests/core/scoring-resolver.test.ts packages/rules/tests/core/combat-resolver.test.ts
```

Expected: new test fails first if current source labels or scoring consumption are insufficient.

**Step 3: Patch minimal runtime gap**

If needed, modify only the source-adjustment shape or scoring consumption code. Do not change canonical VP facts. Do not collapse event VP and competition VP into a single ambiguous source.

**Step 4: Re-run focused tests**

Expected: focused tests pass.

## Task 3: Add Event And Replay Trace Evidence

**Files:**

- Modify test: `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts`
- Modify test: `packages/rules/tests/regression/replay.test.ts`
- Modify only if needed: `packages/rules/src/tools/replay.ts`
- Modify only if needed: `packages/rules/src/core/combat-resolver.ts`

**Step 1: Assert battle event payload**

The scenario must prove that the emitted battle event contains:

- `winnerPlayerIds`
- `tied`
- `excludedPlayerIds`
- `winnerPlayerId`
- `participantBreakdowns`
- `vpAdjustments`

**Step 2: Assert replay summary**

Add or extend replay expectations so replay output includes:

- last battle winners
- tied flag
- participant breakdowns
- VP source adjustments
- scoring consumption evidence

**Step 3: Run replay tests**

Run:

```powershell
npx vitest run packages/rules/tests/regression/replay.test.ts packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts
```

Expected: pass after minimal trace additions.

## Task 4: Prove MatchSession Production Path

**Files:**

- Modify test: `packages/rules/tests/match-session.test.ts`
- Modify test or create: `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts`
- Modify only if needed: `packages/rules/src/match-session.ts`

**Step 1: Add a MatchSession scenario**

The test must drive the same production path used by room/server:

```text
MatchSession
-> battle phase / resolveBattlePhase path
-> resolveBattlefield
-> applyBattleScoring
-> projection-visible battle history
```

Avoid direct-only proof through `core/game-loop.ts`.

**Step 2: Assert production result**

The scenario must assert:

- battle history contains multi-winner result
- scoring mutates authoritative `GameState.players`
- battle results are not scored twice
- after-win/after-loss events are generated or traceable

**Step 3: Run MatchSession tests**

Run:

```powershell
npx vitest run packages/rules/tests/match-session.test.ts packages/rules/src/__tests__/match-session-regressions.test.ts packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts
```

Expected: pass without introducing a second battle/scoring production path.

## Task 5: Prove Projection And Client Bridge

**Files:**

- Modify test: `apps/client/src/state/engine-bridge.test.ts`
- Modify only if needed: `apps/client/src/state/engine-bridge.ts`
- Modify only if needed: `apps/client/src/types/props.ts`
- Optionally modify: `packages/rules/tests/projection/player-match-view.test.ts`

**Step 1: Add projection preservation test**

Use a battle result from the Golden Flow 2 shape and assert the client-visible state preserves:

- `winnerPlayerIds`
- `tied`
- `winnerPlayerId: null` for ties
- participant breakdowns if intentionally exposed
- no hidden hand/deck leakage

**Step 2: Run client bridge tests**

Run:

```powershell
npm run test:client -- --run apps/client/src/state/engine-bridge.test.ts
```

If the package script does not accept the path, run the app test command currently used by the repo and document the exact command in the final report.

## Task 6: Add Server-Level Reconnect Evidence

**Files:**

- Modify test: `apps/server/src/match-server.test.ts`
- Modify only if needed: `apps/server/src/match-server.ts`
- Modify only if needed: `packages/rules/src/match-room.ts`
- Modify only if needed: `packages/rules/src/match-room-hub.ts`

**Step 1: Add server test around Golden Flow 2 projection**

The test should:

1. Start a room.
2. Reach or install a deterministic pre-battle state for the Golden Flow 2 fixture.
3. Resolve combat/scoring through the production room/session path.
4. Capture P1/P2 projections.
5. Reconnect one viewer.
6. Assert the reconnected projection preserves the same battle/scoring facts and does not leak hidden information.

**Step 2: Assert command causality limits**

If expected revision / stale command support is absent, record `stale command explicit rejection: NOT VERIFIED` rather than inventing a large revision system in this slice.

**Step 3: Run server test**

Run:

```powershell
npx vitest run apps/server/src/match-server.test.ts
```

Expected: server-level Golden Flow 2 projection/reconnect evidence passes or reports a narrow blocker.

## Task 7: Add One Browser Gate C Path

**Files:**

- Modify or create: `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts`
- Modify only if needed: `e2e/fd-match-clickflow.spec.ts`
- Modify only if needed: UI code directly required to render server-supplied battle/scoring facts.

**Step 1: Write browser scenario**

The browser path must prove:

- the client receives server projection after combat/scoring
- tied winners are displayed or otherwise machine-assertable
- VP changes are visible or machine-assertable
- no private hidden hand/deck data is exposed
- reconnect after the flow shows the same public result

**Step 2: Run only this E2E first**

Run:

```powershell
npx playwright test e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts --project=chromium
```

Expected: pass after minimal UI/projection adjustments.

**Step 3: Do not broaden UI scope**

If the current UI cannot naturally drive the full setup, use a test-only deterministic room setup hook only if the project already has a comparable test fixture pattern. Do not build a new debug UI or bypass server authority for production.

## Task 8: Run Regression Gate

**Files:**

- No code changes unless regressions expose direct slice breakage.

**Step 1: Run focused rules tests**

```powershell
npx vitest run packages/rules/tests/core/combat-resolver.test.ts packages/rules/tests/core/scoring-resolver.test.ts packages/rules/tests/regression/battle-winner-conformance.test.ts packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts packages/rules/tests/regression/replay.test.ts packages/rules/tests/match-session.test.ts
```

**Step 2: Run client/server tests**

```powershell
npm run test:client
npx vitest run apps/server/src/match-server.test.ts
```

**Step 3: Run browser proof**

```powershell
npx playwright test e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts --project=chromium
```

**Step 4: Run stabilization gate**

```powershell
npm run verify:stabilization
```

Expected final result: no new failures. Existing unrelated failures must be listed with owners if the suite is not fully green.

## Task 9: Update Documentation And Handoff Report

**Files:**

- Modify: `docs/audits/fd-rule-conformance-matrix.md`
- Modify: `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
- Create: `docs/reports/2026-09-07-golden-flow-2-combat-power-winner-vp-result.md`

**Step 1: Update matrix conservatively**

Only update statuses that are actually proven:

- If Gate B passes but Gate C remains incomplete, use `SCENARIO_VERIFIED` candidate language and keep Gate C open.
- If browser/server/reconnect proof passes, mark as candidate evidence for reviewer, not final `E2E_VERIFIED`.
- Never use `FULL`, `COMPLETE`, or local `PASS` as acceptance status.

**Step 2: Update Golden Flow 2 section**

Record exact evidence files and commands under Golden Flow 2. Do not change Golden Flow 1/3/4/5 status unless touched by this slice.

**Step 3: Write result report**

The report must include:

- slice scope
- changed files
- canonical rules covered
- Gate A evidence
- Gate B evidence
- Gate C evidence
- projection evidence
- reconnect evidence
- tests run and exact results
- known failures
- known secondary runtime paths
- reviewer-ready final claim

Final claim format:

```text
Implementation claim: IMPLEMENTATION_COMPLETE_CANDIDATE
Reviewer required: yes
Rules covered: FD-BATTLE-001-CANDIDATE, FD-VP-001-CANDIDATE, partial FD-POWER-001-CANDIDATE, partial FD-PROJECTION-001-CANDIDATE, partial FD-RECONNECT-001-CANDIDATE
```

## Stop Conditions

Stop and report rather than expanding scope if any of these happen:

- proving Golden Flow 2 requires implementing a full FlowState
- proving reconnect requires designing a new global command revision protocol
- Result Binding production bridge becomes necessary
- test setup requires rewriting card authoring or broad content packs
- fixing lifecycle cleanup becomes larger than the battle/scoring proof itself

When blocked, write the blocker as a narrow missing prerequisite and keep the slice report factual.

## Final Reviewer Checklist

A reviewer should be able to answer:

- Which canonical rule sections were covered?
- Which runtime owner executed the flow?
- Did the test use `MatchSession` / server path, or only core helpers?
- Are tied winners represented as `winnerPlayerIds`?
- Is `winnerPlayerId` compatibility field non-authoritative for ties?
- Are defeated high-power participants excluded?
- Are event VP and competition VP auditable separately?
- Is scoring consumed once?
- Are after-battle events traceable?
- Does projection preserve the result without private leaks?
- Does reconnect preserve the same projection?
- Are secondary runtime paths still present and documented?
- Is the final claim no stronger than the evidence?
