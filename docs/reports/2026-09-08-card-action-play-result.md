# CARD_ACTION_SEMANTICS_MINIMAL_PLAY Result

- Phase: Phase 3 / CARD_ACTION_SEMANTICS_MINIMAL
- Contract: scoped `PLAY`
- Claimed Acceptance: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Promotion: independent reviewer required before `SCENARIO_VERIFIED` or scoped `E2E_VERIFIED`

## Scope

This slice promotes only the exact Kiritsugu `time-alter.action` semantic form as a scoped PLAY contract:

- `phase_action` in `action`;
- no cost and no creates;
- one server-projected controller hand card target;
- target must be an attack;
- `play_selected_cards` must play that selected card face-down through the shared `playBatch` hook;
- paired `draw_cards(1)` companion effect.

It does not migrate `play_source_card`, costed play, response-window play, Drake hidden/power/lifecycle play, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, or roster-wide JSON.

## Inventory

Command:

```text
node docs/audits/fd-card-action-play-inventory.mjs
```

Fresh output:

```text
CARD_ACTION_SEMANTICS_MINIMAL PLAY inventory
sourceFiles=14
cardActionSemanticAbilities=7
eligible=1
skipped=6

Eligible abilities
master.kiritsugu	master.kiritsugu.skill.time-alter	time-alter.action	play_selected_cards,draw_cards

Skipped abilities
master.kayneth	master.kayneth.deck.volumen-hydrargyrum	volumen.extra-play	play_source_card	separate_contract:play_source_card_response
master.maiya	master.maiya.skill.military	military.attach-support-shot	attach_card_to_player_attack	out_of_scope:add_to_attack_semantics
master.maiya	master.maiya.deck.support-shot	support-shot.append-only	append_only_rule	out_of_scope:append_only_rule_marker
master.olga-marie	master.olga-marie.skill.astronomical-science	astronomical-science.first-loss	activate_card_by_id	out_of_scope:activate_semantics
servant.artoria-alt	servant.artoria-alt.skill.sc-artoria-alt-2	sc-artoria-alt-2.angra-mainyu-embrace	close_source_card	out_of_scope:close_semantics
servant.drake	servant.drake.skill.sc-drake-1	sc-drake-1.mount-summon	play_selected_cards	not_verified:play_selected_shape_not_exact_match

Before/after metrics
legacyPlayConsumerCount.before=1
legacyPlayConsumerCount.after=0
newRuntimeSemanticRoutedPlayCount.before=0
newRuntimeSemanticRoutedPlayCount.after=1
dualCompatiblePlayCount.before=1
dualCompatiblePlayCount.after=0
remainingSkippedCardActionCount.after=6
```

## Gate A Evidence

- `isPlayActionDirectAction` accepts the exact Time Alter semantic form without relying on ability id.
- Negative coverage rejects wrong phase, added cost, missing draw companion, face-up play, hidden/private target, non-hand target, non-attack target, `play_source_card`, `ADD_TO_ATTACK`, `ACTIVATE`, and `CLOSE`.
- `play_selected_cards` remains typed and hook-owned; hookless execution fails closed in the existing primitive tests.

## Gate B Evidence

- `packages/rules/tests/regression/card-action-play.test.ts` dispatches Time Alter through a real `MatchSession`.
- The ability is compiled from canonical authoring through the executable pack.
- The runtime opens a server target window, resolves through the shared `playBatch` hook, places the selected hand attack face-down in `attack_area`, emits a typed `play_selected_cards` effect result, and resolves the draw companion.
- A no-legal-hand-attack case is rejected before activation and before opening a target window.

## Gate C Evidence

- `e2e/fd-time-alter-core-primitive.spec.ts` is the representative browser Gate C candidate for this scoped PLAY contract.
- It covers browser activation, WebSocket `expectedRevision`, pending target reconnect, server target selection, face-down attack projection, draw projection, stale replay rejection, and reconnect consistency.

## Verification

Fresh commands run on 2026-09-08:

```text
node docs/audits/fd-card-action-play-inventory.mjs
PASS: sourceFiles=14, cardActionSemanticAbilities=7, eligible=1, skipped=6
```

```text
npx vitest run packages/rules/tests/regression/card-action-play.test.ts packages/rules/tests/regression/card-action-add-to-attack.test.ts packages/rules/tests/regression/phase-3a-core-primitives.test.ts packages/rules/tests/regression/resolution-dataflow.test.ts
PASS: 4 test files, 36 tests
```

```text
npx playwright test e2e/fd-time-alter-core-primitive.spec.ts --project=chromium
PASS: 1 test
```

```text
npm run typecheck
PASS: tsc -b
```

## Boundaries

- Existing `resolveEffect`/legacy play handling remains for non-migrated play shapes.
- `play_source_card` is now covered only for Kayneth `volumen.extra-play` as the separate `PLAY_SOURCE_CARD_WITH_COST_RESPONSE` scoped contract.
- Drake's `play_selected_cards` remains unverified because it introduces hidden/private, power, and lifecycle dependencies.
- Normal action-phase hand-card play remains owned by the shared PlayBatch/flow runtime and is not promoted by this scoped ability slice.
