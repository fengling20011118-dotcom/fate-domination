# FD Phase 3 Mechanic Family Rollout Plan

- Document Role: SUBPLAN
- Status: ACTIVE / REBASELINE_CANDIDATE
- Implementation Status: DOCUMENTATION_ONLY
- Acceptance Status: No Phase 3 mechanic family is accepted by this document. Every promoted family still requires Gate A/B/C evidence and independent review.
- Parent: `docs/plans/fd-card-engine-stabilization-plan.md`
- Depends On: `docs/FD-DOCUMENT-ROADMAP.md`; `docs/rules/FD-Game-Rules-Final.md`; `docs/plans/fd-rules-conformance-and-acceptance.md`; `docs/plans/fd-effect-result-binding-plan.md`; `docs/audits/fd-skill-rule-normalization-audit.md`; `docs/audits/fd-skill-primitive-conformance-matrix.md`; `docs/audits/fd-skill-mechanic-family-matrix.md`
- Consumed By: Phase 3 implementers, reviewers, and Golden Card / Golden Flow planners
- Supersedes: card-by-card Phase 3 pilot selection as the default execution strategy
- Last Verified: 2026-09-08

## Goal

Rebaseline Phase 3 from isolated card pilots to mechanic-family rollout:

`Mechanic Family -> Primitive Contracts -> Compiler Support -> Runtime Registry -> Representative Cards -> Bulk Migration`

The purpose is to reduce legacy ability consumers batch by batch while preserving the acceptance separation required by `docs/plans/fd-rules-conformance-and-acceptance.md`.

## Direction Change

The previous Phase 3 pilots proved valuable vertical paths, but they must not become a permanent card allowlist strategy.

`time-alter.action` is now classified as `PHASE_3_REFERENCE_VERTICAL_PILOT`.

It proves this production path:

`browser command -> WebSocket expectedRevision -> MatchSession.dispatchPlayerAction -> pending target -> shared playBatch hook -> draw primitive -> projection -> reconnect -> stale replay rejection`

It does not prove that every draw, effect-play, card-zone, hidden-information, or interaction mechanic is normalized. It is evidence that the runtime path can work when a mechanic family has a formal primitive contract.

## Mandatory Inputs

Before executing any Phase 3 batch, the implementer and reviewer must read:

1. `docs/FD-DOCUMENT-ROADMAP.md`
2. `docs/rules/FD-Game-Rules-Final.md`
3. `docs/plans/fd-rules-conformance-and-acceptance.md`
4. `docs/plans/fd-card-engine-stabilization-plan.md`
5. `docs/plans/fd-effect-result-binding-plan.md`
6. `docs/audits/fd-skill-rule-normalization-audit.md`
7. `docs/audits/fd-skill-primitive-conformance-matrix.md`
8. `docs/audits/fd-skill-mechanic-family-matrix.md`
9. The current batch's Golden Acceptance Contract

Historical reports may be used as evidence provenance only.

## Acceptance Vocabulary

Phase 3 must separate JSON shape from runtime acceptance:

| Status | Meaning |
|---|---|
| `PARTIALLY_NORMALIZED` | The authoring JSON carries recognizable semantic fields, but runtime ownership is still legacy, partial, or split. |
| `NORMALIZED_BUT_RUNTIME_UNVERIFIED` | The ability uses the intended executable semantic form, but Gate B/C and independent review are incomplete. |
| `COMPONENT_VERIFIED` | Gate A has independent acceptance for primitive/compiler/runtime component behavior. |
| `SCENARIO_VERIFIED` | Gate B has independent acceptance for representative card scenarios. |
| `E2E_VERIFIED` | Gate C has independent acceptance through production browser/server/projection/reconnect where relevant. |

JSON completeness is not automatic acceptance. Using a verified primitive is not automatic `E2E_VERIFIED`.

## Phase 3 Structure

| Phase | Scope | Required Output |
|---|---|---|
| 3A | Result Binding bridge and typed primitive infrastructure | Result envelopes, compiler validation, fail-closed runtime, one Golden result-binding card. |
| 3B-1 | Resource / Numeric foundation | `adjust_mana`, `pay_mana`, `adjust_command_seals`, `adjust_victory_points`, numeric expressions, resource deltas. |
| 3B-2 | Card / Zone / Card Action foundation | draw, move, shuffle, create, and separate action contracts for `PLAY`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, and `CLOSE`. |
| 3B-3 | Target / Cost / Interaction foundation | candidate generation, optional/mandatory targets, response windows, variable payment, reconnect. |
| 3B-4 | Result-dependent composition | prior-result formulas, actual moved/drawn/paid count, branch-local rollback, optional stages. |
| 3B-5 | Modifier / Power-facing foundation | rule modifiers, power modifiers, source ownership, duration, cleanup, battle power trace. |

This sequence may be adjusted only by `docs/audits/fd-skill-mechanic-family-matrix.md` evidence and reviewer approval.

## Mechanic Batch Template

Every Mechanic Batch must include:

1. Define the primitive contract: inputs, outputs, result envelope, rollback semantics, projection sensitivity, and canonical rule/card source.
2. Add compiler schema and fail-closed validation: invalid primitive, invalid field, invalid binding, unsupported target, unsupported destination, and future binding must fail before runtime mutation.
3. Register the runtime primitive in the Phase 3 registry or explicitly document why a shared runtime hook is authoritative.
4. Pass Primitive Gate A with positive and negative component evidence.
5. Choose 3-5 representative cards or abilities from the real skill pool.
6. Pass Card Scenario Gate B for each representative scenario.
7. Fix the abstraction after representative cards expose missing semantics.
8. Bulk migrate only remaining abilities whose executable semantic form is fully covered by the verified primitive contract.
9. Run 1-2 Gate C representative production paths when the mechanic affects browser command, hidden projection, reconnect, lifecycle, domain action, battle, or result-dependent behavior.
10. Submit all evidence to an independent reviewer before status promotion.

## Gate C Strategy

Gate C is not browser E2E for every card. Gate C validates the production runtime mechanic path.

Additional browser Gate C is required when a batch adds or materially changes:

- new interaction or response-window behavior;
- hidden information, private candidate, private look, or reveal behavior;
- reconnect during pending decision or lifecycle state;
- source-close, cleanup, or duration semantics;
- domain actions such as movement, play, battle settlement, scoring, or command-seal use;
- battle power, battle winner, defeat, or VP semantics.

Bulk-migrated abilities can inherit Gate C only when they use an already accepted executable semantic form and do not introduce one of the deltas above.

For `RESOURCE_NUMERIC_CORE_DIRECT_ACTION`, Gate C inheritance is intentionally narrow. A migrated ability may inherit the command spell/Tomoe representative Gate C only when it is a visible direct action whose only runtime mutation is mana, command-seal, or VP arithmetic through the accepted resource primitive path. It cannot inherit that Gate C if it introduces any trigger timing, battle result dependency, hidden choice or private target, pending payment, card movement, source lifecycle, cleanup, or modifier/power interaction. Those abilities must wait for the relevant family Gate C or provide their own production browser/server/reconnect evidence.

## Card Action Contract Split

Card action semantics must not be collapsed into one generic play primitive. These contracts may share lower-level helpers for cost payment, movement, legality, projection, and stale revision checks, but acceptance is separate:

| Contract | Runtime Owner Requirement | Must Not Inherit |
|---|---|---|
| `PLAY` | Owns normal and explicitly permitted card play into the proper destination. | Must not cover add-to-attack, activation, close, or response source-card play semantics by implication. |
| `PLAY_SOURCE_CARD_WITH_COST_RESPONSE` | Owns response-window source-card play with explicit fixed cost and source-zone revalidation. | Must not inherit ordinary playBatch, pending payment, or recursive on-play trigger semantics by implication. |
| `ADD_TO_ATTACK` | Owns appending or attaching a card/effect to an existing attack. | Must not consume normal play counters unless the card text explicitly says so. |
| `CREATE_AND_ACTIVATE` | Owns creating a card/token and immediately making it active. | Must not be treated as playing a pre-existing hand card. |
| `ACTIVATE` | Owns turning an existing card/effect active from an allowed source zone/state. | Must not create a card or pay normal play cost unless specified. |
| `CLOSE` | Owns closing an active card/effect and applying destination/lifecycle consequences. | Must not be treated as discard, return, or removal without an explicit lifecycle rule. |

Future Card Action family batches must provide separate primitive contracts, compiler schemas, negatives, and representative cards for each contract they promote.

For scoped PLAY evidence as of 2026-09-08:

- Time Alter covers only exact direct action `play_selected_cards(controller hand attack, face_down) + draw_cards(1)`.
- Volumen covers only exact combat response `pay_mana(2) + play_source_card(face_up)` from hand.
- Neither path promotes Drake hidden/private/power/lifecycle play, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, or `CLOSE`.

## Pilot Bridge Exit Criteria

The historical pilot allowlist (`conversion-magic.preparation`, `time-alter.action`, `command-spell.gain-mana`) is a transitional migration mechanism only. As of the 2026-09-08 `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` implementation candidate, `command-spell.gain-mana` has exited ability-id pilot routing and is governed by the direct-action resource semantic-form contract. Remaining pilot entries must be removed when:

1. Target Mechanic Families have formal routing contracts.
2. Routing no longer depends on card id or ability id.
3. Routing is based on executable semantic form.
4. Migrated abilities no longer depend on legacy `resolveEffect`.
5. Legacy execution consumer count is measurable.
6. Legacy path shrinks batch by batch.
7. Final deletion of the pilot allowlist is covered by regression and independent review.

## Anti-Dual-Runtime Metrics

Every batch must report these counts before and after implementation:

| Metric | Required Direction |
|---|---|
| Legacy ability count | Must decrease for the targeted family. |
| New-runtime ability count | Must increase through semantic routing, not ability-id routing. |
| Dual-compatible ability count | May temporarily increase, then must decrease before Phase 3 exit. |
| Card-specific legacy handler count | Must decrease or be quarantined with deletion criteria. |

Green tests are not sufficient when these counts do not move.

## Cross-Cutting Result Binding

Result Binding remains a cross-cutting Phase 3A/3B dependency.

Simple resource mutations may move before full result binding. Any mechanic whose outcome depends on actual affected count, paid amount, selected entities, moved cards, drawn cards, battle winners, or prior branch success must use typed result envelopes before bulk migration.

## Batch Selection Rubric

Select the next Mechanic Batch using:

| Criterion | Meaning |
|---|---|
| Reuse Count | Number of current abilities/cards that consume the primitive family. |
| Ability Coverage | How many real abilities can migrate without special cases. |
| Architectural Readiness | Existing primitive/compiler/runtime evidence. |
| Semantic Complexity | Number of rule dimensions involved. |
| Interaction Complexity | Pending decisions, hidden candidates, response windows, reconnect sensitivity. |
| Current Legacy Dependency | Amount of current logic still in `resolveEffect`, `extended-effects`, `modeState`, or card-shaped handlers. |
| Risk | Chance of breaking flow, battle, projection, hidden info, or lifecycle. |
| Future Dependency Value | Whether later families need this primitive. |

## Completed Implementation-Candidate Batch

`NEXT_MECHANIC_BATCH: RESOURCE_NUMERIC_CORE_DIRECT_ACTION`

This batch was selected because the strict direct-action subset was small enough to verify independently while the broader Resource/Numeric family still has useful future reuse:

- strict family coverage: 18 abilities across 12 cards;
- first-batch direct-action target set: 3 abilities across 3 cards;
- existing primitives: `adjust_mana`, `pay_mana`, `adjust_command_seals`, `adjust_victory_points`;
- existing representative evidence: Golden Eater for `pay_mana`/`adjust_victory_points`, Conversion Magic for `adjust_mana`, command spell for `adjust_command_seals` Gate B only;
- future dependency value: Card/Zone, Cost/Payment, Result Binding, Battle Result, and Power families all consume numeric/resource deltas.

Battle Winner, Flow Runtime, Power Pipeline, Trigger/Lifecycle, and Golden Flow gaps remain high priority, but they are either Phase 4/5 flow issues or higher-complexity families. Starting with them would preserve the same multiple-owner problem instead of shrinking legacy ability consumers first.

### Primitive List

- `adjust_mana`
- `pay_mana`
- `adjust_command_seals`
- `adjust_victory_points`
- numeric expression helpers: `literal`, `binding_field`, `multiply`, `ceil`, `floor`, `clamp_zero`

### Consumer Abilities

Initial migration candidates:

- `command-spell.gain-mana`
- `sc-tomoe-1.independent-action`

Explicitly out of first batch:

- `drain-command.enter-miyama`: Trigger/Movement representative later.
- `clown.lose-command-seal`: Trigger/Battle/Defeat representative later.
- `sc-ereshkigal-2.gain-mana-on-deploy`: deployment trigger representative later.
- `sc-artoriac-6.gain-vp-if-not-sole-winner`: Battle Result representative later.
- `sc-kintoki-3.golden-eater`: Result Binding representative already, not simple direct-action proof.
- `conversion-magic.preparation`: Card/Zone result-binding pilot, not simple direct-action proof.

Do not migrate abilities whose resource outcome depends on triggers, battle winners, defeat, hidden choices, source lifecycle, movement, or card-zone results until their dependent families are selected.

### Representative Cards

Use 3-5 representatives:

| Representative | Mechanic Proof |
|---|---|
| Gatou / Olga command spell `command-spell.gain-mana` | gain mana and spend one command seal in a simple action window. |
| Tomoe `sc-tomoe-1.independent-action` | direct VP gain from action ability with timing requirement. |

### Golden Scenario

Golden Resource Scenario:

1. Start a seven-player `MatchSession`.
2. Resolve a command spell action and assert mana +4, command seals -1, event payload, revision increment, and no duplicate on stale replay.
3. Resolve Tomoe `sc-tomoe-1.independent-action` through an action-window ability path and assert +3 VP, explicit timing-condition rejection outside eligible turn-order state, and no duplicate on stale replay.
4. Verify command spell and Tomoe both route by executable semantic form, not ability id.
5. Do not enter movement-trigger, defeat-trigger, battle-result, card-zone, or result-binding scenarios in this batch.

### Gate A

Required positives:

- primitive registration exposes stable result schemas;
- mana, command seal, and VP deltas emit typed result envelopes;
- negative deltas clamp or fail according to the canonical resource rule selected for that field;
- expression helpers consume literal and bound numeric fields.

Required negatives:

- unknown player reference;
- invalid result field;
- invalid expression type;
- insufficient mana for `pay_mana`;
- command-seal decrement below zero;
- VP underflow behavior is explicit and tested;
- later-node failure rolls back the current atomic transaction.

### Gate B

Required scenario evidence:

- each representative ability compiles from canonical authoring JSON;
- every resource mutation is routed by semantic form, not ability id;
- no migrated representative calls legacy `resolveEffect`;
- repeated/stale dispatch does not duplicate deltas;
- event log and projection carry enough information for reviewer diagnosis.

### Gate C

Gate C is required for the command spell representative because it is a user-facing production command and currently lacks browser evidence.

Gate C is not required for Shinji trigger or defeat branches because they are no longer first-batch representatives. Tomoe direct VP may remain Gate B unless the implementation changes user-facing command/projection behavior beyond the existing action ability route.

Direct resource Gate C inheritance is invalidated by any of these deltas:

- trigger-owned resource mutation;
- battle winner, battle loss, defeat, or other battle-result resource mutation;
- hidden choice, private target, or private look before the resource mutation;
- pending payment or optional branch that can change whether a resource mutation happens;
- card movement, card-zone result binding, play/add/activate/close semantics;
- lifecycle cleanup, source-close, modifier, or power-layer dependency.

Reviewer-facing resource events for direct VP/mana/seal mutations must expose the same minimum envelope:

| Field | Meaning |
|---|---|
| `sourceAbilityId` | Ability whose executable graph caused the resource mutation. |
| `controllerId` | Player controlling the ability at resolution time. |
| `resource` | `mana`, `command_seals`, or `victory_points`. |
| `delta` | Actual applied delta after caps, clamps, or fail-closed validation. |
| `before` | Resource value immediately before this primitive mutates state. |
| `after` | Resource value immediately after this primitive mutates state. |
| `resultId` | Stable primitive event id emitted by the resolution transaction. |
| `revision` | Accepted ability runtime revision for the command/event commit that contains the mutation. |

### Migration Scope

In scope:

- simple direct resource mutations;
- direct command-seal spend/gain/loss;
- direct VP gain/loss with explicit clamp semantics;
- `pay_mana` component contract only; no new optional payment scenario unless it is isolated at Gate A;
- semantic-form routing for these primitives.

Out of scope:

- full battle winner repair;
- full Flow Runtime owner consolidation;
- optional response-window engine;
- movement-trigger and defeat-trigger resource abilities;
- hidden/private look semantics;
- lifecycle cleanup model;
- modifier and power-layer normalization;
- broad card-zone migration beyond numeric compatibility checks.

### Legacy Paths Expected To Disappear

- ability-id routing for `command-spell.gain-mana`;
- non-pilot legacy `resolveEffect` handling for simple `adjust_mana`;
- non-pilot legacy `resolveEffect` handling for simple `adjust_command_seals`;
- non-pilot legacy `resolveEffect` handling for simple direct `adjust_victory_points`.

Deletion gate for the next batch:

| Required Measurement | Before | After |
|---|---|---|
| Pilot ability-id routes | Count `conversion-magic.preparation`, `time-alter.action`, and `command-spell.gain-mana` routes separately. | `command-spell.gain-mana` ability-id route is deleted; the other two may remain for Card/Zone and Card Action batches only. |
| Direct-action resource legacy consumers | Count direct action abilities with top-level `adjust_mana`, `adjust_command_seals`, or `adjust_victory_points` that still call legacy `resolveEffect`. | Count must decrease by the migrated representative set. |
| Semantic-form resource consumers | Count abilities classified by primitive shape. | Count must increase by the migrated representative set. |
| Legacy fallback after classification | Identify whether classified resource primitives can fall back to `resolveEffect`. | No fallback for migrated direct-action resource abilities. |

Required deletion proof:

- test fails if `command-spell.gain-mana` is reintroduced as an ability-id route;
- test passes when command spell is classified only by `adjust_mana + adjust_command_seals`;
- stale/replay command does not duplicate mana or command-seal deltas;
- implementation report includes before/after counts.

### Legacy Paths Retained

- battle-result-derived resource/VP effects until Battle Result and Trigger families are verified;
- result-dependent moved/drawn count effects until Result Binding and Card/Zone families cover them;
- modifier/power/resource hybrids until Modifier/Power families are verified;
- special subsystem directives until their subsystem family is selected.

## Next Mechanic Batch

`NEXT_MECHANIC_BATCH: CARD_ZONE_CORE_DIRECT_ACTION`

This batch exits the remaining Phase 3 reference pilot allowlist without promoting the whole Card/Zone or Card Action family. It only covers exact semantic matches whose top-level behavior is already represented by typed data-flow primitives.

### Primitive List

- `move_all_remaining`
- `play_selected_cards`
- `draw_cards` only as the paired companion effect in the selected Time Alter exact shape

Out of scope:

- standalone `draw_cards` direct action until a real representative exists;
- standalone `move_card` direct action until a real representative exists;
- `ADD_TO_ATTACK`
- `CREATE_AND_ACTIVATE`
- `ACTIVATE`
- `CLOSE`
- trigger-owned card movement or draw;
- hidden/private look or private target flows;
- pending payment/cost flows;
- lifecycle, modifier, power, battle-result, or cleanup-dependent card movement;
- roster-wide migration.

### Consumer Abilities

Initial migration candidates from exact semantic matches:

- `conversion-magic.preparation`: `move_all_remaining(hand -> discard) + adjust_mana(bound moved count)`.
- `time-alter.action`: `play_selected_cards(controller hand attack, face_down) + draw_cards(1)`.

No standalone direct `draw_cards` representative exists in the current real authoring data. Drake `sc-drake-1.draw` is a forced trigger and cannot be migrated in this batch. No standalone direct `move_card` representative is promoted either; single-card move effects in current data introduce hidden/private, trigger, lifecycle, battle, or add/activate/close semantics.

### Inventory

Inventory command:

```powershell
node docs/audits/fd-card-zone-core-direct-action-inventory.mjs
```

Current implementation-candidate inventory, 2026-09-08:

```text
cardZoneAbilities=8
eligible=2
skipped=6

eligible:
master.irisviel / master.irisviel.skill.conversion-magic / conversion-magic.preparation / move_all_remaining,adjust_mana
master.kiritsugu / master.kiritsugu.skill.time-alter / time-alter.action / play_selected_cards,draw_cards
```

### Gate C Inheritance

`CARD_ZONE_CORE_DIRECT_ACTION` may inherit the Time Alter representative Gate C only for visible direct phase actions whose accepted executable semantic form is one of the two exact shapes in this batch and whose only card-zone consequences are:

- move all controller hand cards to discard, bind actual moved count, then consume that count for a resource companion effect; or
- select one controller hand attack, effect-play it face-down through shared `playBatch`, then draw one card.

Gate C inheritance is forbidden when an ability introduces any of:

- trigger timing or battle-result timing;
- hidden choice, private look, private target, or face-down information validation not already covered by the exact target shape;
- pending payment or variable cost;
- `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, or `CLOSE`;
- movement to `attack_area` or `field` via raw `move_card`;
- lifecycle cleanup, source-close, modifier, power, battle winner, defeat, or scoring dependency.
- standalone direct `draw_cards` or standalone direct `move_card` until those shapes have real representative Gate B/C evidence.

### Required Deletion Proof

- `conversion-magic.preparation` and `time-alter.action` no longer appear in the Phase 3 ability-id pilot allowlist.
- Both representatives route by semantic form and fail closed if their effects are replaced by non-matching legacy-shaped effects.
- Once routed to data-flow, validation/runtime errors return `resolution_failed` and do not fall back to `resolveEffect`.
- Inventory reports eligible/skipped abilities and before/after legacy route counts.

### Implementation-Candidate Status

- Inventory source: `docs/audits/fd-card-zone-core-direct-action-inventory.mjs`.
- Eligible direct card-zone abilities from `data/authoring`: 2.
- Skipped card-zone abilities: 6, each with explicit skip reason.
- Migrated representatives: Irisviel `conversion-magic.preparation`, Kiritsugu `time-alter.action`.
- Pilot ability-id routes: 2 -> 0.
- Exact direct card-zone legacy consumers: 2 -> 0.
- New-runtime semantic-routed card-zone consumers: 0 -> 2.
- Dual-compatible migrated consumers: 2 -> 0.
- Gate C implementer evidence exists in `e2e/fd-time-alter-core-primitive.spec.ts`; `e2e/fd-conversion-magic-core-primitive.spec.ts` remains supporting browser evidence.
- Status claim remains `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review is required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion.

## Reviewer Stop Conditions

An independent reviewer must reject promotion if:

- routing is still based on card id or ability id after the batch;
- migrated abilities can still fall back to legacy `resolveEffect`;
- legacy consumer count is not reported;
- command spell lacks Gate C evidence;
- any status is promoted solely because content JSON is complete or tests are green.

## Final Candidate Status

This plan may only support the claim:

`PHASE_3_DIRECTION_REBASELINE_CANDIDATE`

It does not support `PLAN_ACCEPTED`, `Phase 3 PASS`, `Roster Migration PASS`, or `Release Ready`.
