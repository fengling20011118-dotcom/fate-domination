# RESOURCE_NUMERIC_CORE_DIRECT_ACTION Reviewer Checklist

- Date: 2026-09-08
- Scope: Independent review checklist for `RESOURCE_NUMERIC_CORE_DIRECT_ACTION`.
- Implementer claim available for review: `IMPLEMENTATION_COMPLETE_CANDIDATE`.
- This document does not promote the batch to `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED`.

## Review Inputs

Read these before promotion:

- `docs/plans/fd-card-engine-stabilization-plan.md`
- `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md`
- `docs/audits/fd-skill-mechanic-family-matrix.md`
- `docs/audits/fd-skill-primitive-conformance-matrix.md`
- `docs/audits/fd-rule-conformance-matrix.md`
- `docs/reports/2026-09-08-resource-numeric-core-direct-action-result.md`
- `docs/audits/fd-resource-numeric-core-direct-action-inventory.mjs`

## Code Evidence To Inspect

- `packages/rules/src/ability/resolution-dataflow.ts`
  - `phase3ReferenceVerticalPilotAbilityIds` contains only `time-alter.action`.
  - `shouldUseResolutionDataFlow` routes through structural data-flow syntax, semantic direct resource form, or the remaining reference pilot.
  - `isResourceNumericCoreDirectAction` fails closed without ability metadata.
  - `isResourceNumericCoreDirectAction` requires `phase_action`, `activation.phase === "action"` when present, no targets, no costs, and no creates.
  - `resourceEventPayload` emits `sourceAbilityId`, `controllerId`, `resource`, `delta`, `before`, `after`, `resultId`, and `revision`.
- `packages/rules/src/ability/interpreter.ts`
  - `executeEffects` passes ability metadata into `shouldUseResolutionDataFlow`.
  - `DataFlowValidationError` and `ResolutionRuntimeError` become `resolution_failed`.
  - After a data-flow route is selected, the function returns and does not continue to legacy `resolveEffect`.
- `packages/rules/src/ability/executable-card-pack.ts`
  - compiler validation passes ability metadata into `shouldValidateResolutionDataFlow`.

## Gate A Checklist

Reviewer should rerun:

```powershell
npx vitest run packages/rules/tests/regression/resolution-dataflow.test.ts
```

Expected: all tests pass.

Required evidence:

- primitive registry includes direct resource primitives;
- semantic routing accepts direct action resources;
- semantic routing rejects missing metadata;
- semantic routing rejects trigger-owned and combat-window resources;
- positive resource deltas are applied;
- negative mana/VP deltas clamp at zero;
- command seal underflow fails closed;
- invalid controller player fails before mutation;
- invalid result field fails compiler validation;
- unknown primitive fails compiler validation;
- bad numeric expression fails compiler validation;
- later node failure rolls back atomic transaction;
- resource mutation events expose the reviewer envelope.

## Gate B Checklist

Reviewer should rerun:

```powershell
npx vitest run packages/rules/tests/regression/phase-3a-core-primitives.test.ts
```

Expected: all tests pass.

Required evidence:

- Gatou/Olga `command-spell.gain-mana` compiles from canonical authoring/content and executes through real `MatchSession.dispatchPlayerAction`;
- command spell gains 4 mana and spends 1 command seal;
- command spell emits mana and command-seal resource envelopes;
- command spell does not require an ability-id pilot route;
- Tomoe `sc-tomoe-1.independent-action` compiles from canonical authoring/content and executes through real `MatchSession.dispatchPlayerAction`;
- Tomoe gains 3 VP and emits VP resource envelope;
- typed `effect_resolved` payloads distinguish the data-flow runtime from legacy `resolveEffect`.

## Gate C Checklist

Reviewer should rerun:

```powershell
npx playwright test -c playwright.config.ts e2e/fd-command-spell-resource-core.spec.ts --project=chromium
```

Expected: one Chromium test passes.

Required evidence:

- browser opens a restored production room;
- browser clicks the real `command-spell.gain-mana` activation prompt;
- captured WebSocket command includes `expectedRevision`;
- server revalidates legality;
- state mutates to mana +4 and command seals -1;
- projection logs expose both resource envelopes;
- reconnect preserves state and event evidence;
- stale replay is rejected and does not duplicate resource mutation.

## Inventory And Metrics Checklist

Reviewer should rerun:

```powershell
node docs/audits/fd-resource-numeric-core-direct-action-inventory.mjs
```

Expected metrics:

```text
resourceNumericAbilities=18
eligible=3
skipped=15
legacyResourceConsumerCount.before=3
legacyResourceConsumerCount.after=0
newRuntimeSemanticRoutedCount.before=0
newRuntimeSemanticRoutedCount.after=3
dualCompatibleCount.before=1
dualCompatibleCount.after=0
remainingSkippedCount.after=15
```

Reviewer should confirm every skipped ability has a scope reason and that no trigger, combat, battle-result, hidden-choice, pending-payment, card-movement, lifecycle, modifier, or power-dependent ability is promoted by this batch.

## Regression Checklist

Recommended full verification:

```powershell
npm run typecheck
npm run content:validate
npm run test:ci
```

Expected: all pass.

## Promotion Guidance

If all checklist items pass under independent review, the reviewer may consider promoting only this narrow mechanic-family slice:

- Gate A: direct resource primitive/compiler/runtime component behavior.
- Gate B: command spell and Tomoe direct-action representative scenarios.
- Gate C: command spell production browser/server/reconnect path.

Promotion must not imply:

- full Phase 3 completion;
- broad roster migration;
- Resource/Numeric trigger or battle-result acceptance;
- Card/Zone, Cost/Payment, Result Binding, Lifecycle, Modifier, or Power acceptance;
- Release Gate readiness.

## Known Legacy Paths Intentionally Retained

- `resolveEffect` for skipped resource abilities and non-resource families.
- `time-alter.action` as the remaining reference vertical pilot.
- `conversion-magic.preparation` as Card/Zone + Result Binding transitional evidence.
- historical reports that describe pre-migration command spell status; active plans and matrices should be treated as current source.
