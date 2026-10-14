# CARD_ZONE_CORE_DIRECT_ACTION Result

- Date: 2026-09-08
- Phase: Phase 3 mechanic-family rollout
- Scope: exact direct card-zone semantic matches only
- Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Acceptance: independent reviewer required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion

## Scope

In scope:

- `move_all_remaining`
- `play_selected_cards`
- `draw_cards` only as the paired Time Alter companion effect
- exact semantic-form routing for the selected direct phase-action representatives
- Result Binding consumption for `conversion-magic.preparation`
- shared `playBatch` hook delegation for `time-alter.action`

Out of scope:

- `ADD_TO_ATTACK`
- `CREATE_AND_ACTIVATE`
- `ACTIVATE`
- `CLOSE`
- trigger-owned draw or card movement
- standalone `draw_cards` direct action
- standalone `move_card` direct action
- battle-result, defeat, hidden/private look, private target, pending payment, cost, lifecycle, modifier, power, scoring, or cleanup-dependent card-zone abilities
- roster-wide JSON or runtime migration

## Inventory

Command:

```powershell
node docs/audits/fd-card-zone-core-direct-action-inventory.mjs
```

Observed output:

```text
CARD_ZONE_CORE_DIRECT_ACTION inventory
sourceFiles=14
cardZoneAbilities=8
eligible=2
skipped=6

Eligible abilities
master.irisviel  master.irisviel.skill.conversion-magic  conversion-magic.preparation  move_all_remaining,adjust_mana
master.kiritsugu  master.kiritsugu.skill.time-alter  time-alter.action  play_selected_cards,draw_cards
```

Skipped abilities:

```text
servant.artoriac / sc-artoriac-1.return-current-round-attack / move_card / hidden_or_private_information
servant.artoriac / sc-artoriac-2.pay-x-look-x-plus-two / look_at_deck_top,move_card,move_all_remaining / cost_payment
servant.drake / sc-drake-1.draw / draw_cards / trigger_or_non_phase_action
servant.drake / sc-drake-1.mount-summon / play_selected_cards / hidden_or_private_information
servant.ereshkigal / sc-ereshkigal-2.return-to-skill-zone / move_card / trigger_or_non_phase_action
servant.kintoki / sc-kintoki-3.golden-eater / move_card,branch,pay_mana,move_card,branch / mixed_non_card_zone_effect
```

No standalone pure `draw_cards` direct representative exists in current real authoring data. Drake `sc-drake-1.draw` is a forced trigger and was intentionally skipped.

## Routing Change

- `conversion-magic.preparation` and `time-alter.action` no longer rely on ability-id pilot routing.
- The Phase 3 reference pilot allowlist is empty.
- Routing is now selected by the two accepted exact semantic forms:
  - `move_all_remaining(hand -> discard, resultVar/bind) + adjust_mana(bound moved count)`
  - `play_selected_cards(controller hand attack target, face_down) + draw_cards(1)`
- Standalone `draw_cards` direct action and standalone `move_card` direct action are not routed by this slice and remain `NOT_VERIFIED`.
- Non-matching effects with the same ability IDs do not enter data-flow.
- Once selected for data-flow, validation/runtime failure returns `resolution_failed` and does not fall back to legacy `resolveEffect`.

## Gate A Evidence

Implemented candidate evidence:

- primitive registry includes `move_card`, `draw_cards`, `move_all_remaining`, and `play_selected_cards`;
- exact semantic classifier accepts the Conversion Magic and Time Alter shapes without checking card or ability IDs;
- classifier rejects trigger-owned draw, private/hidden target play, raw move to `attack_area`, `activate_card_by_id`, `close_source_card`, unbound `move_all_remaining + adjust_mana`, standalone direct `draw_cards`, and standalone direct `move_card`;
- invalid result-field compiler validation remains fail-closed;
- hookless `play_selected_cards` throws `ResolutionRuntimeError`;
- existing data-flow transaction rollback covers later-node failure.

Command:

```powershell
npx vitest run packages/rules/tests/regression/phase-3a-core-primitives.test.ts packages/rules/tests/regression/resolution-dataflow.test.ts
```

Result: 28/28 passed.

## Gate B Evidence

Implemented candidate evidence:

- Irisviel `conversion-magic.preparation` compiles from canonical authoring JSON through the executable pack and runs in `MatchSession.dispatchPlayerAction`.
- Conversion Magic moves all controller hand cards to discard, binds actual moved count, and applies mana from that count.
- Kiritsugu `time-alter.action` compiles from canonical authoring JSON through the executable pack and runs in `MatchSession.dispatchPlayerAction`.
- Time Alter opens a pending hand-card target, resolves through the shared `playBatch` effect hook, places the selected attack face-down, and draws one card.
- Both representatives route by semantic form and not by ability ID.

## Gate C Evidence

Required representative Gate C for this batch is Time Alter only:

```powershell
npx playwright test -c playwright.config.ts e2e/fd-time-alter-core-primitive.spec.ts --project=chromium
```

The candidate path covers:

- browser activation;
- WebSocket `expectedRevision`;
- server revalidation and pending target creation;
- reconnect while pending;
- target selection;
- shared play batch state mutation;
- draw projection;
- stale replay rejection.

Supporting browser evidence also exists for Conversion Magic:

```powershell
npx playwright test -c playwright.config.ts e2e/fd-conversion-magic-core-primitive.spec.ts --project=chromium
```

## Metrics

```text
pilotAbilityIdRoutes.before=2
pilotAbilityIdRoutes.after=0
legacyCardZoneDirectConsumerCount.before=2
legacyCardZoneDirectConsumerCount.after=0
newRuntimeSemanticRoutedCount.before=0
newRuntimeSemanticRoutedCount.after=2
dualCompatibleCount.before=2
dualCompatibleCount.after=0
remainingSkippedCount.after=6
```

## Gate C Non-Inheritance

Skipped abilities cannot inherit this batch's Gate C if they introduce any of:

- trigger timing;
- battle-result, battle winner, battle loss, defeat, scoring, or cleanup dependency;
- hidden/private choice, private look, or private target;
- pending payment or variable cost;
- raw move to `attack_area` or `field`;
- standalone direct `draw_cards` or standalone direct `move_card`;
- `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, or `CLOSE`;
- lifecycle, source-close, modifier, or power interaction.

## Known Legacy Paths Retained

- legacy `resolveEffect` remains for non-exact card-zone effects;
- trigger-owned Drake draw and Ereshkigal return-to-skill remain out of scope;
- hidden/private Artoria Caster look/move effects remain out of scope;
- Kintoki Golden Eater remains governed by the Result Binding Golden Card contract, not this direct card-zone batch;
- Card Action semantics are not promoted by this slice.
