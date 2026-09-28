# FD Phase 3 Throughput Baseline

- Document Role: REPORT
- Status: BASELINE_CANDIDATE
- Date: 2026-09-09
- Scope: current Phase 3 throughput facts from real `data/authoring` and existing audit scripts
- Implementation Status: DOCUMENTATION_ONLY
- Acceptance Status: No runtime, card, flow, mechanic family, or release status is promoted by this report.

## Inputs

Read before this baseline:

- `docs/FD-DOCUMENT-ROADMAP.md`
- `docs/rules/FD-Game-Rules-Final.md`
- `docs/plans/fd-rules-conformance-and-acceptance.md`
- `docs/plans/fd-card-engine-stabilization-plan.md`
- `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md`
- `docs/plans/fd-effect-result-binding-plan.md`
- `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
- `docs/audits/fd-skill-mechanic-family-matrix.md`
- `docs/audits/fd-skill-semantic-axis-matrix.md`
- `docs/audits/fd-skill-primitive-conformance-matrix.md`
- `docs/audits/fd-skill-rule-normalization-audit.md`
- `docs/audits/fd-rule-conformance-matrix.md`
- `docs/audits/fd-rule-interaction-matrix.md`
- `docs/audits/fd-flow-runtime-inventory.md`
- latest Phase 3 reports under `docs/reports/`

## Commands Run

```powershell
node docs/audits/fd-skill-mechanic-family-inventory.mjs
node docs/audits/fd-resource-numeric-core-direct-action-inventory.mjs
node docs/audits/fd-card-zone-core-direct-action-inventory.mjs
node docs/audits/fd-card-action-play-inventory.mjs
node docs/audits/fd-card-action-add-to-attack-inventory.mjs
node docs/audits/fd-card-action-activate-inventory.mjs
node docs/audits/fd-card-action-close-inventory.mjs
node docs/audits/fd-skill-semantic-axis-inventory.mjs
```

The semantic-axis inventory is the current source for Trigger/Lifecycle/Interaction gateway priority. Earlier temporary trigger/kind, lifecycle/kind, and interaction-template buckets are retained below only as historical invalidated taxonomy notes.

## Current Total

| Metric | Count |
|---|---:|
| Authoring archives | 14 |
| Cards | 46 |
| Abilities | 92 |

## Mechanic Family Counts

| Family | Abilities | Cards |
|---|---:|---:|
| `BATTLE_RESULT` | 39 | 28 |
| `CARD_ACTION_SEMANTICS` | 13 | 10 |
| `CARD_ZONE` | 14 | 13 |
| `COST_PAYMENT` | 9 | 9 |
| `HIDDEN_INFORMATION` | 21 | 16 |
| `HISTORY_USAGE` | 16 | 15 |
| `INTERACTION` | 48 | 34 |
| `LIFECYCLE` | 49 | 36 |
| `MODIFIER` | 24 | 17 |
| `MOVEMENT` | 21 | 18 |
| `POWER` | 18 | 16 |
| `RESOURCE_NUMERIC` | 18 | 12 |
| `RESULT_BINDING` | 2 | 2 |
| `SPECIAL_SUBSYSTEM` | 18 | 13 |
| `TARGET_SELECTION` | 11 | 11 |
| `TRIGGER` | 58 | 34 |

Multi-family membership is allowed; these counts are not additive.

## Top-Level Effect Counts

| Effect | Count |
|---|---:|
| `reveal_information` | 11 |
| `record_master_directive` | 10 |
| `adjust_command_seals` | 7 |
| `adjust_victory_points` | 7 |
| `branch` | 6 |
| `adjust_mana` | 5 |
| `move_card` | 5 |
| `create_card` | 3 |
| `move_player` | 3 |
| `create_modifier` | 2 |
| `draw_cards` | 2 |
| `move_all_remaining` | 2 |
| `play_selected_cards` | 2 |
| singletons | 25 effect names |

## Legacy Consumers And Semantic Runtime Consumers

Current implementation-candidate semantic routes:

| Batch / Contract | Eligible Migrated Candidates | Legacy Before | Legacy After | New Semantic After |
|---|---:|---:|---:|---:|
| `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` | 3 | 3 | 0 | 3 |
| `CARD_ZONE_CORE_DIRECT_ACTION` | 2 | 2 | 0 | 2 |
| `CARD_ACTION_PLAY` | 1 | 1 | 0 | 1 |
| `CARD_ACTION_PLAY_SOURCE_RESPONSE` | 1 | 1 | 0 | 1 |
| `CARD_ACTION_ADD_TO_ATTACK` | 1 | 1 | 0 | 1 |
| `CARD_ACTION_ACTIVATE` | 1 | 1 | 0 | 1 |
| `CARD_ACTION_CLOSE` | 1 | 1 | 0 | 1 |
| **Total candidate semantic consumers** | **10** | **10** | **0** | **10** |

Planning baseline:

- total abilities: 92;
- semantic-routed implementation candidates: 10;
- remaining abilities requiring legacy/special/shared transitional review: approximately 82;
- independent Gate promotions: none recorded by this report.

## Card-Specific / Special Handlers

Special subsystem strict matrix count: 18 abilities / 13 cards.

Conservative text/effect estimate from fresh scan: 30 abilities have special-like markers such as directive, independent deck, replacement, bottom-deck swap, random discard, terrain/VP transfer, soul/return-silence, or similar subsystem behavior. Use 18 as the strict matrix denominator and 30 as a risk estimate, not an acceptance count.

Observed legacy/special owner areas:

- `extended-effects.ts`;
- `record_master_directive`;
- independent deck operations;
- before-resolve bottom-card swap;
- false attendant book replacement;
- return silence / soul drag;
- terrain multiplier / VP transfer;
- random discard and opponent power set;
- raw `modeState` side stores.

## Unsupported / Skipped Nodes

Existing per-batch skip counts:

| Inventory | Total In Scope | Eligible | Skipped |
|---|---:|---:|---:|
| Resource numeric direct action | 18 | 3 | 15 |
| Card zone direct action | 8 | 2 | 6 |
| Card action PLAY | 7 | 1 | 6 |
| Card action ADD_TO_ATTACK | 7 | 1 | 6 |
| Card action ACTIVATE | 7 | 1 | 6 |
| Card action CLOSE | 7 | 1 | 6 |

Common skip reasons:

- trigger-owned;
- battle-result-owned;
- hidden/private information;
- cost/payment or pending decision;
- lifecycle/cleanup/source-close;
- modifier/power;
- special subsystem;
- different card-action contract.

## Gate Status

Current rule matrix denominator: 63 candidate rule units.

| Status | Count |
|---|---:|
| `E2E_VERIFIED` | 0 |
| `SCENARIO_VERIFIED` | 2 |
| `COMPONENT_VERIFIED` | 13 |
| `IMPLEMENTED_UNVERIFIED` | 4 |
| `FAILED` | 0 |
| `BLOCKED` | 0 |
| `NOT_VERIFIED` | 44 |

This report does not change those statuses.

Current Phase 3 candidate batches have implementer evidence only. They remain `IMPLEMENTATION_COMPLETE_CANDIDATE` until independent reviewer promotion.

## Trigger Baseline

Previous trigger/kind taxonomy: `INVALID FOR PRIORITY`. It mixed ability kind, timing/window hooks, continuous passives, and requirement checks into Trigger counts.

Invalidated historical buckets:

| Bucket | Count |
|---|---:|
| `phase_action` | 34 |
| `while_active` | 10 |
| `on_use_declared` | 9 |
| `when_play_requirements_checked` | 8 |
| `on_card_played` | 6 |
| `after_controller_loses_battle` | 4 |
| `game_start` | 4 |
| `after_battle_result_determined` | 3 |
| `after_controller_wins_battle` | 3 |
| `after_battle_ended` | 2 |

Corrected strict Domain Event Trigger baseline:

| Domain Event Trigger | Count |
|---|---:|
| `on_use_declared` | 9 |
| `on_card_played` | 6 |
| `after_controller_loses_battle` | 4 |
| `game_start` | 4 |
| `after_battle_result_determined` | 3 |
| `after_controller_wins_battle` | 3 |
| `after_battle_ended` | 2 |
| `after_controller_enters_location` | 1 |
| `after_controller_first_loses_battle` | 1 |
| `after_controller_gains_victory` | 1 |
| `after_controller_loses_all_command_seals` | 1 |
| `after_player_deployed_to_battlefield` | 1 |
| `before_situation_or_event_resolves` | 1 |

Corrected coverage:

- strict Domain Event Trigger abilities: 37;
- Top 5 corrected trigger types: 26 abilities;
- Top 8 corrected trigger types: 30 abilities;
- Top 12 corrected trigger types: 36 abilities.

Separated non-trigger buckets for KPI:

| Bucket | Correct Axis |
|---|---|
| `phase_action` | Ability Kind / Flow Timing / Ability Legality |
| `while_active` | Continuous Passive / Source-Active Requirement / Modifier |
| `when_play_requirements_checked` | Requirement Check Hook |
| `when_formula_condition_met` | Continuous Formula Condition |
| `controller_combat_action_window` | Ability Window / Response Window |
| `when_power_calculation_applied` | Modifier Calculation Hook |

## Lifecycle Baseline

Previous lifecycle/kind taxonomy: `INVALID FOR PRIORITY`. Ability kinds are not lifecycle policies.

Invalidated historical buckets:

| Bucket | Count |
|---|---:|
| `kind:phase_action` | 31 |
| `kind:passive` | 16 |
| `kind:forced_trigger` | 15 |
| `kind:declaration_reveal` | 9 |
| `kind:phase_action + lifecycle effect` | 3 |
| `unique optional trigger` | 3 |

Corrected explicit lifecycle/reset baseline:

- explicit lifecycle/reset abilities: 11;
- policy memberships: 22, because one ability can carry multiple lifecycle dimensions.

| Lifecycle / Reset Policy | Memberships |
|---|---:|
| `source_or_reset_marker` | 7 |
| `limit:this_card` | 4 |
| `duration:while_card_active` | 3 |
| `limit:unique_keyword_group` | 3 |
| `cleanup:when_card_leaves_active_area` | 2 |
| `duration:round_count` | 1 |
| `cleanup:expire_after_duration` | 1 |
| `cleanup:remain_active` | 1 |

## Interaction Template Baseline

Previous interaction-template taxonomy: `INVALID FOR PRIORITY`. Timing/event buckets are not Interaction templates unless they require player choice, confirmation, response, ordering, or amount selection.

Invalidated historical buckets:

| Template | Count |
|---|---:|
| no interaction template | 21 |
| `on_use_declared + hidden` | 9 |
| `while_active` | 9 |
| `when_play_requirements_checked` | 8 |
| `on_card_played` | 5 |
| `game_start` | 4 |
| `after_battle_result_determined` | 3 |
| `after_controller_loses_battle` | 3 |
| `after_controller_wins_battle` | 3 |
| branch | 2 |

Corrected interaction baseline:

| Interaction Shape | Count |
|---|---:|
| explicit target abilities | 11 |
| target type `card_instance` | 7 |
| target type `location` | 3 |
| target type `choice` | 1 |
| target type `player` | 1 |
| response / optional response-window abilities | 7 |
| branch / yes-no candidates | 5 |
| explicit target, response/window, or branch union | 20 |
| strict target-based PendingInteraction | 11 |

Current KPI uses the corrected union count for Interaction semantic risk and the strict target-based count for PendingInteraction runtime pressure.

## Core / Special Split

Use two numbers:

- strict matrix split: 74 non-special / 18 special subsystem abilities;
- conservative risk split: 62 core-like / 30 special-like abilities.

The strict split is better for roadmap KPIs. The conservative split is better for scheduling risk.

## Baseline Conclusion

The current Phase 3 throughput blocker is not raw primitive absence. It is the lack of reusable gateway contracts, automated evidence, and burn-down reporting around corrected Domain Event Trigger, explicit Lifecycle/Reset/Persistence, explicit Interaction/Pending semantics, Result Binding, and projection/reconnect.

Permitted final status:

`PHASE_3_THROUGHPUT_OPTIMIZATION_CANDIDATE`
