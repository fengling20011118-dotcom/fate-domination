# Effect Result Binding Phase 3A Slice Result

- Date: 2026-09-07
- Scope: Phase 3A Resolution/Data-flow Infrastructure
- Output plan: `docs/plans/fd-effect-result-binding-plan.md`
- Authority updated: `docs/plans/fd-card-engine-stabilization-plan.md`

## Scope Decision

This slice implements the minimal Phase 3A infrastructure after the project owner explicitly confirmed Phase 2 acceptance.

It does not migrate the roster, convert the full primitive registry, or add any real card-specific logic.

After review, this report now treats Phase 3A as infrastructure-only unless explicitly stated otherwise. The production `MatchSession` ability interpreter remains on the legacy mutation path and is listed as intentionally retained below.

## Original Runtime Review

The pre-slice runtime did not contain complete result binding infrastructure.

Findings:

- `resolveEffect`, `executeEffects`, and `executeAbility` in `packages/rules/src/ability/interpreter.ts` returned `void` and mutated runtime state.
- `ResolverResult` in `packages/rules/src/core/resolver-contracts.ts` returned `{ nextState, appliedLogEntries }`, but did not carry typed primitive payloads.
- `EffectContext` had `variables` and `selections`, but no typed binding store.
- `resultVar` existed in loader validation and selected effects, but it was numeric-only and effect-specific.
- There was no JSON binding/reference schema for value, target, and condition expressions.
- There was no compile-time data-flow validator for binding order, field type, branch dominance, or future references.
- `dispatchAbilityCommand` provided command-level rollback by dispatching against a cloned state, but ability-sequence transaction semantics were not explicit.

## Files Changed

- Added `docs/plans/fd-effect-result-binding-plan.md`
- Updated `docs/plans/fd-card-engine-stabilization-plan.md`
- Added `packages/rules/src/ability/resolution-dataflow.ts`
- Updated `packages/rules/src/ability/executable-card-pack.ts`
- Updated `packages/rules/src/ability/loader.ts`
- Updated `packages/rules/src/index.ts`
- Updated `packages/rules/package.json`
- Added `packages/rules/tests/regression/resolution-dataflow.test.ts`
- Updated `packages/rules/tests/executable-card-pack.test.ts`
- Updated `packages/rules/tests/regression/package-exports.test.ts`
- Added this report: `docs/reports/2026-09-07-effect-result-binding-design-result.md`

## Type Design

The new module introduces:

- `EffectResultEnvelope<Type, Payload>`
- typed payloads for `remove_advantage_position`, `adjust_victory_points`, and `noop`
- `AbilityResolutionContext`
- ephemeral `ResolutionBindingStore`
- `ValueExpression`, `TargetExpression`, and `ConditionExpression`
- `DataFlowValidationError`
- `ResolutionRuntimeError`
- `AbilityResolutionTransaction`

Bindings are held only in the resolution context and are not written to long-term `GameState`.

## Runtime Calling Chain

The synthetic Phase 3A path is:

```text
executeResolution
→ validateResolutionDataFlow
→ create AbilityResolutionTransaction with cloned workingState
→ executeNodes
→ registry lookup for registered ResolutionPrimitive
→ bind typed EffectResultEnvelope
→ downstream expression reads typed binding field
→ return nextState/results/events after full success
```

If a later primitive throws `ResolutionRuntimeError`, the original state is unchanged because all mutations occur against the transaction working copy.

## Compile-time Validation

The validator fails closed for:

- unknown binding
- future binding
- duplicate binding on one resolution path
- invalid result field
- wrong expression type
- branch-only binding used after an unsafe branch

The validator also tracks guaranteed branch bindings only when all reachable branches define the same binding with the same result type.

Compiler integration:

- `compileExecutableCardPack` now detects Phase 3A data-flow syntax in executable ability `effects` / `creates`.
- Matching nodes are passed through `validateResolutionDataFlowNodes`.
- Invalid references therefore fail during executable content compilation, with source paths rooted at the compiled card and ability.
- Existing legacy effects are not forced through the Phase 3A runtime unless they use binding/reference syntax.
- Result schemas expose only fields that the runtime evaluators can consume. For example, `adjust_victory_points.playerId` remains in the primitive payload but is not exposed as a `player_ids` binding target field.

## Transaction Strategy

The minimal transaction boundary is explicit at the ability effect-sequence level. The transaction stores:

- base state
- working state
- resolution context
- emitted events
- typed results

Commit is represented by returning `nextState` only after the sequence succeeds. Callers keep the original state if an invariant failure is thrown.

## Synthetic Tests

Positive fixture:

- Same battlefield contains `P2`, `P3`, and `P4`.
- `P2` and `P4` have terrain assignments.
- `P3` has no terrain assignment.
- Effect A runs `remove_advantage_position` against all three opponents and binds `removedAdvantages`.
- Effect B reads `removedAdvantages.removedCount`.
- Final VP gain is `2`, not target count `3`.

Negative fixtures:

- unknown binding
- future binding
- duplicate binding
- invalid result field
- wrong expression type
- unsafe branch binding

Transaction fixture:

- Effect A and B mutate the working copy.
- Effect C throws a runtime invariant error.
- Original VP and terrain assignments remain unchanged.

Compiler fixtures:

- Positive Phase 3A binding/reference fixture compiles through `compileExecutableCardPack`.
- Negative unknown/future/wrong-type binding fixtures fail through `compileExecutableCardPack`, not by direct validator calls only.
- The `adjust_victory_points.playerId` target-reference drift fixture now fails during `compileExecutableCardPack` with `invalid_result_field`.

Registry fixture:

- Synthetic executable nodes assert the Phase 3A primitive registry contains `remove_advantage_position`, `adjust_victory_points`, `noop`, and `fail_invariant`.

Schema/runtime consistency fixture:

- Every field exposed by `resultSchemas` is validated and then consumed through `executeResolution`.
- Fields present only in payloads, but not supported by a runtime reference evaluator, are not exposed in `resultSchemas`.

## Verification

Commands:

```text
npx vitest run packages/rules/tests/regression/resolution-dataflow.test.ts
npx vitest run packages/rules/tests/regression/resolution-dataflow.test.ts packages/rules/tests/executable-card-pack.test.ts packages/rules/tests/regression/package-exports.test.ts
npm run typecheck
npm run verify:stabilization
```

Results:

```text
npx vitest run packages/rules/tests/regression/resolution-dataflow.test.ts
1 file passed, 10 tests passed

npx vitest run packages/rules/tests/regression/resolution-dataflow.test.ts packages/rules/tests/executable-card-pack.test.ts packages/rules/tests/regression/package-exports.test.ts
3 files passed, 29 tests passed

npm run typecheck
passed

npm run verify:stabilization
PASSED: all stabilization gates
```

Observed stabilization gate details:

- `typecheck`: passed
- `content:validate`: passed, reporting 7 masters, 7 servants, 20 events, 0 blocking issues
- `verify:playtest-v1`: passed, reporting 7 masters, 7 servants, 20 events, 84 starting-deck cards, 0 private-view leaks
- `verify:generated-content`: passed, deterministic hashes reported
- root tests: 88 files passed, 516 tests passed
- complex-skill regressions: 1 file passed, 37 tests passed
- client tests: 7 files passed, 47 tests passed
- real-server Playwright: 4 tests passed

## Phase 3A Acceptance Candidate

Candidate satisfied for the Phase 3A infrastructure slice after review corrections:

- typed `EffectResultEnvelope` contract exists
- `AbilityResolutionContext` and ephemeral binding store exist
- value/target/condition reference expressions exist
- data-flow validator fails closed for invalid references
- executable compiler path now invokes data-flow validation for Phase 3A nodes
- synthetic executable runtime now resolves primitives through a registry lookup
- synthetic transaction test proves rollback of the original state

The implementer does not declare final Phase PASS. The result should be reviewed independently against the Phase 3A acceptance criteria.

## Known Legacy Paths Intentionally Retained

- `packages/rules/src/ability/interpreter.ts` still uses `executeAbility` / `resolveEffect` legacy mutation semantics for production `MatchSession` abilities.
- Existing real card roster effects are not migrated into the Phase 3A resolution graph in this slice.
- The Phase 3A registry covers only the synthetic infrastructure primitives needed to prove binding, reference, validation, registry lookup, and transaction boundaries.

## Areas Not Verified

- Full production ability sequence execution through `executeResolution`.
- Full real-card primitive migration into registered `ResolutionPrimitive` handlers.
- End-to-end UI gameplay using Phase 3A binding/reference authoring nodes.
