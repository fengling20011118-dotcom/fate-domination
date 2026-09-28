# CARD_ACTION_SEMANTICS_MINIMAL_PLAY_SOURCE_CARD_WITH_COST_RESPONSE Result

- Phase: Phase 3 / CARD_ACTION_SEMANTICS_MINIMAL
- Contract: scoped `PLAY_SOURCE_CARD_WITH_COST_RESPONSE`
- Claimed Acceptance: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Promotion: independent reviewer required before `SCENARIO_VERIFIED` or scoped `E2E_VERIFIED`

## Scope

This slice promotes only the exact Kayneth `volumen.extra-play` semantic form:

- `response` ability opened by `controller_combat_action_window`;
- explicit `responseWindow.opens = controller_combat_action_window`;
- no targets and no creates;
- fixed `pay_mana(2)` ability cost;
- one `play_source_card(face_up)` effect;
- source card must still be in the controller's hand at server revalidation time.

It does not migrate other costed play, variable/pending payment, normal play batches, Drake hidden/power/lifecycle play, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, or roster-wide JSON.

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
```

Volumen is not a `CARD_ACTION_SEMANTICS_MINIMAL_PLAY` eligible ability. Its evidence belongs only to this separate `CARD_ACTION_SEMANTICS_MINIMAL_PLAY_SOURCE_CARD_WITH_COST_RESPONSE` contract.

## Gate A Evidence

- `play_source_card` is a registered typed primitive with `playedCount` result schema.
- `isPlaySourceCardWithCostResponse` routes by exact semantic form, not ability id.
- Negative coverage rejects phase action, wrong trigger, wrong response window, missing/wrong cost, face-down source play, targets, creates, and legacy non-play-source effects.
- Generic result-schema coverage proves `play_source_card.playedCount` can be consumed by downstream binding validation/evaluation.

## Gate B Evidence

- `packages/rules/tests/regression/card-action-play-source-response.test.ts` dispatches canonical Volumen through a real `MatchSession`.
- Server event processing opens the response window from `controller_combat_action_window`.
- Legal action is withheld when the source card leaves hand or controller mana is below 2.
- Resolution pays 2 mana, moves the source card to `attack_area`, sets active face-up runtime state, emits `source_card_played`, and records `effect_resolved(play_source_card)`.

## Gate C Evidence

- `e2e/fd-volumen-extra-play-card-action.spec.ts` covers browser prompt, WebSocket `expectedRevision`, server response revalidation, state mutation, projection, reconnect consistency, and stale replay rejection.
- Stale replay does not move the source card a second time and does not charge mana a second time.

## Verification

Fresh commands run on 2026-09-08:

```text
node docs/audits/fd-card-action-play-inventory.mjs
PASS: sourceFiles=14, cardActionSemanticAbilities=7, eligible=1, skipped=6; Volumen skipped as separate_contract:play_source_card_response
```

```text
npx vitest run packages/rules/tests/regression/card-action-play-source-response.test.ts packages/rules/tests/regression/resolution-dataflow.test.ts
PASS: 2 test files, 20 tests
```

```text
npx playwright test e2e/fd-volumen-extra-play-card-action.spec.ts --project=chromium
PASS: 1 test
```

## Boundaries

- Legacy `resolveEffect` still retains a `play_source_card` branch for non-migrated shapes.
- This report does not grant Volumen inheritance from Time Alter's `CARD_ACTION_SEMANTICS_MINIMAL_PLAY` Gate C; Volumen's Gate C is scoped to `PLAY_SOURCE_CARD_WITH_COST_RESPONSE` only.
- The new data-flow primitive emits `source_card_played`; recursive `on_use_declared` / `on_card_played` trigger processing remains owned by the legacy branch and is a secondary runtime path for future cleanup.
- The client now renders server-returned `resolve_response` legal actions in the generic ability prompt, but it still does not perform rule legality checks.
