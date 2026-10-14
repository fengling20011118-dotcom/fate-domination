# FD Effect Result Binding Plan

Document Role: SUBPLAN
Status: ACTIVE
Implementation Status: PHASE_3A_PRODUCTION_BRIDGE_IMPLEMENTATION_COMPLETE_CANDIDATE
Acceptance Status: Gate A/B/C implementer evidence for the complete Golden Eater candidate / independent review pending
Parent: `docs/plans/fd-card-engine-stabilization-plan.md`
Depends On: `docs/rules/FD-Game-Rules-Final.md`; `docs/plans/fd-rules-conformance-and-acceptance.md`; `docs/audits/fd-flow-runtime-inventory.md`; `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
Consumed By: independent Phase 3A Gate A/B/C review and later primitive migration
Supersedes: none
Last Verified: 2026-09-07

日期：2026-09-07
项目路径：`D:\fd`
计划定位：Global Rules Runtime 的专项子计划。
计划范围：Phase 3A Resolution/Data-flow Infrastructure，以及后续接入生产能力执行链的最小路线。它不是全项目下一步计划，也不覆盖完整 Flow Engine、UI 全迁移或全部 combat/scoring primitive 迁移。
状态：ACTIVE — Phase 3A Production Bridge `IMPLEMENTATION_COMPLETE_CANDIDATE`，独立 review 待执行。

当前 Acceptance：

- Gate A: implementer evidence complete，待独立 Reviewer 确认
- Gate B: first Golden Card implementer evidence complete，待独立 Reviewer 确认
- Gate C: complete Golden Eater candidate implementer evidence complete; independent Reviewer confirmation pending

前置依赖：

- Phase 2 Acceptance: historical prerequisite claim only; not re-adjudicated by this slice
- Flow Runtime Inventory: COMPLETE (`D:\fd\docs\audits\fd-flow-runtime-inventory.md`)

当前正式 Runtime：

- legacy `executeAbility`: ACTIVE
- `executeResolution`: infrastructure plus first production-dispatch path
- production bridge: IMPLEMENTATION_COMPLETE_CANDIDATE / TRANSITIONAL ONLY
- first Golden contract: Kintoki `sc-kintoki-3.golden-eater` complete canonical single-card migration

## 1. Purpose

Effect Result Binding 解决的问题是：一个 effect primitive 的真实执行结果必须能被后续 primitive 安全引用，而不是由后续 primitive 重新查询状态、猜测前序结果，或依赖隐式副作用。

目标链路：

```text
Effect A executes
→ returns typed EffectResult
→ result is bound into ResolutionContext
→ Effect B reads a declared field through a reference expression
→ compiler and runtime both reject invalid references fail-closed
```

这不是某一个 effect primitive，而是所有 primitive 之间组合所需的 Resolution/Data-flow Infrastructure。

## 2. Scope

本计划覆盖：

- typed effect result envelope
- resolution context and ephemeral binding store
- result binding declarations
- reference expressions for values, targets, and conditions
- data-flow validation
- primitive registry contract
- transaction boundary for a resolution sequence
- executable pack compiler integration
- synthetic acceptance fixtures
- later production `MatchSession` integration plan

本计划不直接覆盖：

- 全量真实卡牌迁移
- 完整 Flow Engine 重构
- UI/浏览器端所有卡牌交互迁移
- 所有 combat/scoring primitive 注册化

## 3. Current implementation evidence

当前已存在的基础设施：

- `D:\fd\packages\rules\src\ability\resolution-dataflow.ts`
  - `EffectResultEnvelope`
  - `KnownEffectResult`
  - `resultSchemas`
  - `ResolutionBindingStore`
  - `AbilityResolutionContext`
  - `validateResolutionDataFlow`
  - `validateResolutionDataFlowNodes`
  - `executeResolution`
  - primitive registry and synthetic primitives
- `D:\fd\packages\rules\src\ability\executable-card-pack.ts`
  - `compileExecutableCardPack` path now invokes ability resolution data-flow validation for Phase 3A syntax.
- `D:\fd\packages\rules\tests\regression\resolution-dataflow.test.ts`
  - covers synthetic result binding, validator failures, registry lookup, rollback, and schema/runtime consistency.
- `D:\fd\packages\rules\tests\executable-card-pack.test.ts`
  - covers compiler-path binding/reference failures.
- `D:\fd\packages\rules\src\ability\interpreter.ts`
  - contains the transitional production bridge in `executeEffects`; Phase 3A graph failures return `resolution_failed` and do not fall back to legacy.
- `D:\fd\packages\rules\tests\regression\production-resolution-bridge.test.ts`
  - covers the complete canonical Kintoki Golden Eater through `MatchSession.dispatchPlayerAction`, both private target stages, optional typed payment, invalid target/reference, insufficient mana, and stage-local transaction rollback.
- `D:\fd\e2e\fd-golden-eater-result-binding.spec.ts`
  - covers real browser target selection, captured WebSocket `expectedRevision`, server-side illegal-target revalidation, `executeResolution` state/projection effects, controller reconnect, and stale replay rejection.

Current legacy boundary:

- `activate_ability` still enters `executeAbility` for shared legality, activation costs, and pending-target ownership; `executeEffects` routes detected Phase 3A graphs into staged `executeResolution` calls. Golden Eater's optional 7-mana effect is executed by the typed `pay_mana` primitive.
- Existing real card roster is not generally authored as Phase 3A resolution nodes.

## 4. Design model

### EffectResultEnvelope

Every registered primitive that participates in binding returns a typed envelope:

```ts
interface EffectResultEnvelope<Type extends string, Payload> {
  type: Type;
  payload: Payload;
}
```

Required properties:

- stable primitive result type
- structured payload
- no implicit binding from arbitrary runtime state
- fields exposed for binding must be declared in schema

### ResolutionContext

Resolution context holds ephemeral execution data:

- source card
- controller
- triggering event, if any
- selected targets
- variables
- binding store

Bindings must not be persisted into long-term `GameState` unless a separate effect explicitly writes state.

### Result Binding

An effect node may declare a binding id for its result. Later nodes may reference fields from that binding.

Rules:

- binding ids are local to one resolution sequence
- duplicate binding on one reachable path is invalid
- future binding reference is invalid
- branch-local binding is unsafe unless all reachable branches define the same binding with compatible result type

### Reference Expressions

Supported reference categories:

- value expression: scalar/numeric fields such as removed count
- target expression: player/location/card id collections
- condition expression: boolean predicates derived from prior results

Each category must declare and validate expected value type.

### Data-flow Validator

The validator is compile-time protection. It must fail closed for:

- unknown binding id
- future binding reference
- duplicate binding id
- invalid result field
- expected type mismatch
- unsafe branch dominance
- schema/runtime drift where a field is declared but cannot be consumed

### Transaction Boundary

Resolution sequence execution must be transactional:

- execute against a cloned working state
- collect typed results and emitted events
- return `nextState` only after the whole sequence succeeds
- keep original state unchanged on invariant failure

## 5. Acceptance gates

### Gate A: infrastructure acceptance

Required:

- typed result envelope exists
- binding store exists and is local to resolution context
- value/target/condition references compile
- invalid references fail through `compileExecutableCardPack`
- synthetic primitive chain executes through registry lookup
- runtime rollback is proven by a failing later primitive
- schema/runtime consistency fixture proves every exposed field can actually be consumed

Evidence expected:

```text
npx vitest run packages/rules/tests/regression/resolution-dataflow.test.ts
npx vitest run packages/rules/tests/regression/resolution-dataflow.test.ts packages/rules/tests/executable-card-pack.test.ts packages/rules/tests/regression/package-exports.test.ts
npm run typecheck
```

Gate A can be claimed only for infrastructure. It does not mean production `MatchSession` abilities have migrated.

### Gate B: first real-card binding

Required:

- choose one real card or Golden Card fixture whose second effect consumes the actual result of the first effect
- author it using Phase 3A binding/reference syntax
- compile through `compileExecutableCardPack`
- execute through the same runtime path intended for production ability resolution
- assert state delta, projection, events, and rollback negative case

Candidate scenario:

```text
P2 has advantage position
P3 has no advantage position
P4 has advantage position

Effect A removes advantage position from all selected opponents and binds removedAdvantages.
Effect B awards VP based on removedAdvantages.removedCount.
Expected VP delta is 2, not 3.
```

Gate B is not satisfied by direct validator tests alone.

### Gate C: production flow integration

Required:

- `MatchSession.dispatchPlayerAction -> dispatchAbilityCommand -> activate_ability` can execute Phase 3A resolution nodes through `executeResolution`
- legal action projection remains stable
- pending target and response windows continue to block correctly
- rejected resolution does not mutate authoritative state
- reconnect/projection path shows consistent post-resolution state
- browser or server-level E2E proves the path outside synthetic tests

Current candidate evidence: `IMPLEMENTED_UNVERIFIED`. The complete Golden Eater definition satisfies the listed browser/WS/reconnect path as implementer evidence, including reconnect while the second target is pending, successful and insufficient 7-mana branches, and stale replay rejection. Only an independent Reviewer may promote Gate C.

## 6. Implementation sequence

1. Keep current `resolution-dataflow.ts` as the infrastructure module.
2. Keep compiler validation in `compileExecutableCardPack` for all Phase 3A nodes.
3. Introduce a production bridge that lets executable ability effects route either to legacy `executeAbility` or Phase 3A `executeResolution` based on node syntax. This bridge is TRANSITIONAL ONLY.
4. Add one real-card/Golden Card fixture before migrating broader card content.
5. Move primitive-by-primitive from legacy `resolveEffect` into registered `ResolutionPrimitive` handlers.
6. Remove schema/runtime duplication by keeping result schemas and evaluator-supported fields in one reviewed contract.
7. Add Flow Engine hooks only after Gate B proves the binding runtime in a real ability path.

The bridge is a migration tool, not the final architecture. It must not become a permanent split where new cards use `executeResolution` and old cards continue to bypass the shared runtime through `executeAbility`.

Bridge Exit Criteria:

1. Phase 3A Golden Card Gate B passed.
2. Required primitive coverage migrated.
3. Legacy card semantics migrated.
4. No production card requires legacy `resolveEffect`.
5. `executeAbility` legacy branch removed.

## 7. Non-goals and intentionally retained legacy paths

Intentionally retained until later phases:

- `D:\fd\packages\rules\src\ability\interpreter.ts` legacy `executeAbility` / `resolveEffect`
- existing real card JSON not using binding/reference
- old `core` helpers that do not return typed effect results
- battle resolver card-specific special cases until battle primitive registration begins

These paths must not be cited as proof that Effect Result Binding is production-complete.

## 8. Required negative tests

The test suite must include compiler-path failures for:

- unknown binding
- future binding
- duplicate binding
- invalid field
- wrong expected type
- unsafe branch binding
- declared schema field that runtime cannot consume

Runtime failures must prove:

- original `GameState` is unchanged
- no partial result escapes as committed state
- emitted events are not published as committed events after rollback

## 9. Reporting standard

Any future handoff for this area must report:

- Phase
- Changed files
- Claimed Acceptance
- Tests
- Known failures
- Known legacy paths intentionally retained
- Areas not verified

Do not claim final Phase PASS from infrastructure-only evidence.
