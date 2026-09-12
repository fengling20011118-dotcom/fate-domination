# CARD_ACTION_SEMANTICS_MINIMAL_ACTIVATE Result

- Phase: Phase 3 / CARD_ACTION_SEMANTICS_MINIMAL
- Contract: scoped `ACTIVATE`
- Claimed Acceptance: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Promotion: independent reviewer required before `SCENARIO_VERIFIED` or scoped `E2E_VERIFIED`

## Scope

This slice promotes only the exact Olga-Marie `astronomical-science.first-loss` semantic form:

- `forced_trigger`;
- `activation.trigger = after_controller_first_loses_battle`;
- no targets, no cost, and no creates;
- one `activate_card_by_id(definitionId)` effect;
- first-loss marks a pending round-end activation; the ACTIVATE primitive runs only when the formal `round_end` event consumes that pending activation;
- target card must already exist, be owned by the controller, be in the `skill` zone, and not already be active.

It does not migrate normal play, add-to-attack, create-and-activate, close, optional response activation, target selection, hidden/private activation, variable/pending payment, modifier/power follow-up outside Olga's first-loss round-end scheduling, or roster-wide JSON.

## Inventory

Command:

```text
node docs/audits/fd-card-action-activate-inventory.mjs
```

Fresh output:

```text
CARD_ACTION_SEMANTICS_MINIMAL ACTIVATE inventory
sourceFiles=14
cardActionSemanticAbilities=7
eligible=1
skipped=6

Eligible abilities
master.olga-marie	master.olga-marie.skill.astronomical-science	astronomical-science.first-loss	activate_card_by_id
```

## Gate A Evidence

- `activate_card_by_id` is a registered typed primitive with `activatedCount` result schema.
- `isActivateCardByIdTrigger` routes by exact semantic form, not ability id.
- First-loss and round-end scheduling is split at runtime: `after_controller_first_loses_battle` records `pendingDelayedActivations`; `round_end` consumes the pending entry and executes the same compiled ability through data-flow.
- Negative coverage rejects wrong kind, wrong trigger, missing definitionId, target additions, costs, creates, missing target card, target card outside `skill`, and already-active target card.
- Generic result-schema coverage proves `activate_card_by_id.activatedCount` can be consumed by downstream binding validation/evaluation.

## Gate B Evidence

- `packages/rules/tests/regression/card-action-activate.test.ts` processes canonical Olga first-loss through a real `MatchSession`, verifies no immediate activation, then verifies formal `round_end` activation.
- The ability is compiled from canonical authoring through the executable pack.
- Runtime moves `特里斯墨吉斯忒斯之殇` from skill to field, marks it active face-up, emits `card_activated`, and records `effect_resolved(activate_card_by_id)`.
- Missing target, wrong source zone, and already-active target cases fail closed without changing authoritative state.

## Gate C Evidence

- `e2e/fd-olga-activate-card-action.spec.ts` restores a browser room from a first-loss pending snapshot in battle phase, verifies Trismegistus is still in `skill`, sends WS `client:end_turn` with `expectedRevision`, lets the server advance to `round_end`, and verifies projection/reconnect consistency after data-flow activation.
- Stale WS `client:end_turn` with the pre-activation revision is rejected and does not repeat activation.

## Verification

Fresh commands run on 2026-09-08:

```text
node docs/audits/fd-card-action-activate-inventory.mjs
PASS: sourceFiles=14, cardActionSemanticAbilities=7, eligible=1, skipped=6
```

```text
npx vitest run packages/rules/tests/regression/card-action-activate.test.ts packages/rules/tests/regression/resolution-dataflow.test.ts packages/rules/tests/regression/complex-skills-regression.test.ts
PASS: 3 test files, 57 tests
```

```text
npx playwright test e2e/fd-olga-activate-card-action.spec.ts --project=chromium
PASS: 1 test
```

## Boundaries

- Legacy `resolveExtendedEffect(activate_card_by_id)` remains for non-migrated shapes.
- The current authoring trigger remains `after_controller_first_loses_battle`; runtime now interprets the exact Olga activate-card semantic form as first-loss pending plus round-end activation to match the printed timing.
- Trismegistus follow-up abilities (`soul_drag_power_bonus`, `transform_to_return_silence_on_loss`, `return_silence_battle_start`) remain secondary runtime paths outside this slice.
