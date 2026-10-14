# P3-B11 Result Binding Production Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route the existing Golden Eater and Conversion Magic result-binding graphs through one fail-closed production bridge without migrating any additional card.

**Architecture:** Build on the B10 runtime baseline and existing typed resolution nodes. Eligibility is based on a compiler-validated supported semantic graph, while pending interaction continuation remains server-owned and transactional per dispatch. Conversion Magic remains the non-interactive control; Golden Eater proves staged result binding and rollback.

**Tech Stack:** TypeScript, Vitest, Playwright, `@fd/content` executable pack compiler, rules `MatchSession`.

---

### Task 1: Lock The Baseline And Inventory

**Files:**
- Inspect: `data/authoring/masters/master.irisviel.json`
- Inspect: `data/authoring/servants/servant.kintoki.json`
- Create: `docs/reports/2026-09-12-p3-b11-result-binding-production-bridge-result.md`

**Step 1:** Confirm HEAD descends from B10 commit `9fba6d9` and the runtime hot files are clean.

**Step 2:** Record the two scoped abilities, their binding producers/consumers, interaction dependencies, and current legacy/new route ownership.

**Step 3:** Record every superficially related ability as out of scope or skipped; do not edit it.

**Step 4:** Commit the inventory and initial report skeleton.

### Task 2: Add Failing Compiler And Routing Tests

**Files:**
- Modify: `packages/rules/tests/executable-card-pack.test.ts`
- Create or restore narrowly: `packages/rules/tests/regression/production-resolution-bridge.test.ts`

**Step 1:** Add a positive semantic-route test using equivalent valid ids to prove route eligibility is not card- or ability-id based.

**Step 2:** Add negatives for unknown binding, invalid result field, missing target reference, unsupported node, and partially supported interaction shape.

**Step 3:** Add instrumentation proving an eligible malformed graph returns `resolution_failed` and never calls legacy `resolveEffect`.

**Step 4:** Run the focused tests and confirm the new production-route cases fail for the expected reason.

**Step 5:** Commit the failing tests.

### Task 3: Implement The Minimal Production Bridge

**Files:**
- Modify: `packages/rules/src/ability/executable-card-pack.ts`
- Modify: `packages/rules/src/ability/interpreter.ts`
- Modify only if required: `packages/rules/src/ability/resolution-dataflow.ts`

**Step 1:** Add or reuse a semantic supported-graph predicate that depends on validated node, result, target, and interaction shape rather than ids.

**Step 2:** Route eligible graphs to typed resolution execution and reject validation/runtime errors as `resolution_failed`.

**Step 3:** Persist the minimum server-derived continuation context needed for Golden Eater's second target stage.

**Step 4:** Keep unsupported graphs out of the bridge and prevent eligible graphs from falling back to legacy execution.

**Step 5:** Run the focused compiler and production-bridge tests until they pass.

**Step 6:** Commit the runtime implementation.

### Task 4: Prove Transaction Boundaries

**Files:**
- Modify: `packages/rules/tests/regression/production-resolution-bridge.test.ts`

**Step 1:** Prove Conversion Magic uses actual moved count and rolls back all state/events/revision on a later-node failure.

**Step 2:** Prove Golden Eater's first-stage failure commits nothing.

**Step 3:** Prove a second-stage failure preserves the committed first stage while rolling back second-stage mana, card movement, VP, events, and revision.

**Step 4:** Prove insufficient mana cannot select the optional second target and cannot partially pay.

**Step 5:** Run focused tests and commit the rollback regressions.

### Task 5: Verify Production Interaction Evidence

**Files:**
- Create or restore narrowly: `e2e/fd-golden-eater-result-binding.spec.ts`
- Modify only if required: `e2e/fd-conversion-magic-core-primitive.spec.ts`

**Step 1:** Exercise Golden Eater through browser commands, real WebSocket revisions, both server target stages, and projection.

**Step 2:** Reconnect while the optional second target is pending and complete the same server-owned decision.

**Step 3:** Reject stale replay without duplicate movement, payment, VP, event, or revision changes.

**Step 4:** Retain Conversion Magic as a regression proving actual `movedCount` settlement and reconnect consistency.

**Step 5:** Run each scoped Playwright test with `--repeat-each=5`.

**Step 6:** Commit the E2E evidence.

### Task 6: Verify And Report

**Files:**
- Modify: `docs/reports/2026-09-12-p3-b11-result-binding-production-bridge-result.md`

**Step 1:** Run focused Vitest suites, typecheck, and the two scoped Playwright specs.

**Step 2:** Run `npm run test:ci`; report unrelated failures without changing unrelated code.

**Step 3:** Consume Codex A's current accepted baseline and report before/after `legacyResolveEffect`, `newRuntimeSemanticRouted`, and `dualRuntime` without editing A-owned classification.

**Step 4:** Report local eligible/migrated/skipped counts, unchanged skipped abilities, rollback evidence, interaction dependency, and legacy-bypass proof.

**Step 5:** Mark only `IMPLEMENTATION_COMPLETE_CANDIDATE` and hand the clean commit to Codex R.

**Step 6:** Commit the final implementation report.
