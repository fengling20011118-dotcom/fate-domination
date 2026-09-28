# CARD_ACTION_SEMANTICS_MINIMAL_ADD_TO_ATTACK Result

- Phase: Phase 3 / CARD_ACTION_SEMANTICS_MINIMAL
- Contract: `ADD_TO_ATTACK`
- Claimed Acceptance: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Promotion: independent reviewer required before `SCENARIO_VERIFIED` or scoped `E2E_VERIFIED`

## Scope

This slice migrates only the exact Maiya `military.attach-support-shot` semantic form:

- fixed phase action in `advance`;
- fixed `pay_mana` cost of 2;
- server-projected one-player target with `not_controller`;
- effect `attach_card_to_player_attack`;
- `returnAtRoundEnd: true`;
- `controllerCannotWinStatus: maiya_cannot_win_battle_this_round`.

It does not migrate normal `PLAY`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, support-shot suppress, broad card-action semantics, or roster-wide JSON.

## Inventory

Command:

```text
node docs/audits/fd-card-action-add-to-attack-inventory.mjs
```

Fresh output:

```text
CARD_ACTION_SEMANTICS_MINIMAL ADD_TO_ATTACK inventory
sourceFiles=14
cardActionSemanticAbilities=7
eligible=1
skipped=6

Eligible abilities
master.maiya	master.maiya.skill.military	military.attach-support-shot	attach_card_to_player_attack

Skipped abilities
master.kayneth	master.kayneth.deck.volumen-hydrargyrum	volumen.extra-play	play_source_card	out_of_scope:play_semantics
master.kiritsugu	master.kiritsugu.skill.time-alter	time-alter.action	play_selected_cards,draw_cards	out_of_scope:play_semantics
master.maiya	master.maiya.deck.support-shot	support-shot.append-only	append_only_rule	out_of_scope:append_only_rule_marker
master.olga-marie	master.olga-marie.skill.astronomical-science	astronomical-science.first-loss	activate_card_by_id	out_of_scope:activate_semantics
servant.artoria-alt	servant.artoria-alt.skill.sc-artoria-alt-2	sc-artoria-alt-2.angra-mainyu-embrace	close_source_card	out_of_scope:close_semantics
servant.drake	servant.drake.skill.sc-drake-1	sc-drake-1.mount-summon	play_selected_cards	out_of_scope:play_semantics

Cannot inherit ADD_TO_ATTACK Gate C
master.kayneth	master.kayneth.deck.volumen-hydrargyrum	volumen.extra-play	out_of_scope:play_semantics
master.kiritsugu	master.kiritsugu.skill.time-alter	time-alter.action	out_of_scope:play_semantics
master.maiya	master.maiya.deck.support-shot	support-shot.append-only	out_of_scope:append_only_rule_marker
master.olga-marie	master.olga-marie.skill.astronomical-science	astronomical-science.first-loss	out_of_scope:activate_semantics
servant.artoria-alt	servant.artoria-alt.skill.sc-artoria-alt-2	sc-artoria-alt-2.angra-mainyu-embrace	out_of_scope:close_semantics
servant.drake	servant.drake.skill.sc-drake-1	sc-drake-1.mount-summon	out_of_scope:play_semantics

Before/after metrics
legacyAddToAttackConsumerCount.before=1
legacyAddToAttackConsumerCount.after=0
newRuntimeSemanticRoutedAddToAttackCount.before=0
newRuntimeSemanticRoutedAddToAttackCount.after=1
dualCompatibleAddToAttackCount.before=1
dualCompatibleAddToAttackCount.after=0
remainingSkippedCardActionCount.after=6
```

## Gate A Evidence

- `attach_card_to_player_attack` is registered as a typed Resolution Data-flow primitive.
- `isAddToAttackDirectAction` accepts only the exact semantic shape above.
- Negative coverage rejects missing cost, wrong phase, missing `not_controller`, missing return marker, wrong cannot-win status, `play_source_card`, and `append_only_rule`.
- Canonical condition negative coverage proves Maiya cannot activate this ability while already at a battlefield, and the failed dispatch does not spend the 2 mana cost or move `援护射击`.
- Activation fails closed before spending mana if the required support-shot card is absent.

## Gate B Evidence

- `packages/rules/tests/regression/card-action-add-to-attack.test.ts` dispatches Maiya `military.attach-support-shot` through a real `MatchSession`.
- The ability is compiled from canonical authoring through the executable pack.
- The runtime opens server target selection, rejects self-target through server revalidation, attaches `援护射击` to another player's `attack_area`, records `modeState.supportShotAttachments`, creates the cannot-win status, and emits traceable `attack_added` / `effect_resolved` events.

## Gate C Evidence

- `e2e/fd-add-to-attack-card-action.spec.ts` restores a real room snapshot and starts from the browser ability button.
- The WebSocket command carries `expectedRevision`.
- Reconnect while target selection is pending preserves the target window.
- Browser target selection resolves through the server, mutates state, and projects the card in `attack_area`.
- Stale replay of the same target command is rejected and does not duplicate `attack_added`.
- Reconnect after settlement preserves the attachment projection and event trace.

## Verification

Fresh commands run on 2026-09-08:

```text
node docs/audits/fd-card-action-add-to-attack-inventory.mjs
PASS: sourceFiles=14, cardActionSemanticAbilities=7, eligible=1, skipped=6
```

```text
npx vitest run packages/rules/tests/regression/card-action-add-to-attack.test.ts packages/rules/tests/regression/phase-3a-core-primitives.test.ts packages/rules/tests/regression/resolution-dataflow.test.ts
PASS: 3 test files, 33 tests
```

```text
npm run typecheck
PASS: tsc -b
```

```text
npx playwright test e2e/fd-add-to-attack-card-action.spec.ts --project=chromium
PASS: 1 test
```

## Boundaries

- Legacy `resolveExtendedEffect` still contains an `attach_card_to_player_attack` compatibility branch for non-migrated or historical paths.
- Round-end return cleanup for `援护射击` is not promoted by this slice.
- Support-shot suppress, terrain multiplier, VP transfer, battle-result consequences, and power modifiers remain outside this slice.
- Normal `PLAY`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, and `CLOSE` remain `NOT_VERIFIED` for Card Action semantics.
