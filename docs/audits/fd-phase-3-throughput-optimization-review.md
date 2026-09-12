# FD Phase 3 Throughput Optimization Review

- Document Role: AUDIT
- Status: INDEPENDENT_REVIEW
- Date: 2026-09-09
- Scope: review of `docs/plans/fd-phase-3-throughput-optimization-plan.md`, `docs/plans/fd-phase-3-parallel-work-queue.md`, and `docs/reports/fd-phase-3-throughput-baseline.md`
- Acceptance Baseline: `docs/plans/fd-rules-conformance-and-acceptance.md`
- Canonical Rules: `docs/rules/FD-Game-Rules-Final.md`
- Verdict: `PLAN_NEEDS_REVISION`

## 1. Plan Verdict

`PLAN_NEEDS_REVISION`

The throughput direction is sound: moving from serial card-by-card work to dependency-DAG planning, gateway contracts, automation, reviewer packets, and legacy burn-down is aligned with the acceptance baseline.

However, the plan's current Pareto sections contaminate several orthogonal semantic axes:

- `TRIGGER_TAXONOMY_CONTAMINATION`
- `LIFECYCLE_TAXONOMY_CONTAMINATION`
- `INTERACTION_TAXONOMY_CONTAMINATION`

This contamination materially affects the stated gateway priority and dependency DAG. The plan cannot be accepted until the Trigger, Lifecycle, and Interaction sections are revised to use orthogonal counts.

## 2. Mechanic Taxonomy Findings

The plan correctly says mechanic membership is overlapping, not mutually exclusive. The issue is that several reported buckets are not the mechanic they are used to justify.

Problem examples:

| Reported Bucket | Current Use | Correct Axis |
|---|---|---|
| `phase_action` | Trigger Pareto | Activation / Ability Kind plus Phase Timing |
| `while_active` | Trigger Pareto and Interaction Template | Continuous Passive / Modifier / Source-Active Condition |
| `when_play_requirements_checked` | Trigger Pareto and Interaction Template | Requirement Check Hook / Play Legality Hook |
| `kind:phase_action` | Lifecycle Pareto | Ability Kind |
| `kind:passive` | Lifecycle Pareto | Ability Kind / Continuous Passive |
| `kind:forced_trigger` | Lifecycle Pareto | Ability Kind |
| `declaration_reveal` | Lifecycle Pareto | Activation / Reveal Timing |
| `on_card_played` as interaction | Interaction Template | Domain Event Trigger unless it opens a player choice |

The plan should keep broad family counts such as `TRIGGER=58`, `LIFECYCLE=49`, and `INTERACTION=48` as coarse risk tags only. It must not use those numbers as direct counts for Trigger Gateway, Lifecycle Policy Gateway, or Interaction/Pending Gateway implementation priority.

## 3. Corrected Trigger Counts

Reviewer recomputation from current `data/authoring`:

- total abilities: 92
- trigger-like activation entries after excluding `phase_action`, `while_active`, `when_play_requirements_checked`, and `when_formula_condition_met`: 39
- strict Domain Event Trigger entries after also excluding `controller_combat_action_window` as an ability window and `when_power_calculation_applied` as a modifier calculation hook: 37

Corrected strict Domain Event Trigger counts:

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

Non-trigger buckets that must move out:

| Bucket | Correct Classification |
|---|---|
| `phase_action` | PHASE_TIMING / ACTIVATION_TIMING |
| `while_active` | CONTINUOUS_PASSIVE / LIFECYCLE_CONDITION |
| `when_play_requirements_checked` | REQUIREMENT_CHECK |
| `when_formula_condition_met` | CONTINUOUS_FORMULA_CONDITION |
| `controller_combat_action_window` | ABILITY_WINDOW / RESPONSE_WINDOW |
| `when_power_calculation_applied` | MODIFIER_CALCULATION_HOOK |

## 4. Corrected Lifecycle Counts

The plan reports lifecycle-like buckets from ability kind. That is not valid lifecycle policy evidence.

Corrected explicit lifecycle/reset usage from current authoring:

- explicit `lifecycle` or `limit` policy abilities: 11
- policy memberships: 22, because a single ability can have duration and cleanup or a limit and reset semantics

Corrected lifecycle policy buckets:

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

Representative abilities in the corrected lifecycle set include:

- `sc-artoria-alt-2.angra-mainyu-embrace`
- `sc-artoriac-1.residual-special-power-bonus`
- `sc-artoriac-3.discard-public-and-power-formula`
- `sc-ereshkigal-2.netherworld-protection`
- `sc-kintoki-1.once-per-game`
- `sc-kintoki-2.once-per-game`
- `false-attendant-book.first-empty-seals`
- Artoria Caster unique optional trigger group abilities

`phase_action`, `passive`, `forced_trigger`, and `declaration_reveal` must be removed from Lifecycle Pareto unless they also carry explicit duration, persistence, cleanup, or reset policy.

## 5. Corrected Interaction Counts

The plan's Interaction Template section currently lists timing/event buckets. True interaction should mean a player must provide a choice, confirmation, amount, ordering, or response decision.

Corrected interaction counts from current authoring:

| Interaction Shape | Count |
|---|---:|
| explicit target abilities | 11 |
| target type `card_instance` | 7 |
| target type `location` | 3 |
| target type `choice` | 1 |
| target type `player` | 1 |
| response / optional response-window abilities | 7 |
| branch / yes-no candidates | 5 |
| union of explicit target, response/window, or branch candidates | 20 |

The upper-bound PendingInteraction candidate count is 20. The stricter target-only pending count is 11. The plan should not use `on_use_declared + hidden`, `while_active`, `when_play_requirements_checked`, `on_card_played`, or `game_start` as Interaction Templates unless the ability opens an actual choice or response window.

## 6. Orthogonal Mechanic Axis Model

The plan should replace contaminated Pareto tables with orthogonal axes:

| Axis | Examples |
|---|---|
| Activation / Ability Kind | `phase_action`, `passive`, `forced_trigger`, `optional_trigger`, `response`, `residual`, `declaration_reveal` |
| Timing / Window | preparation, advance/outpost, action, combat, round end, ability window, response window |
| Domain Event Trigger | card played, card use declared, battle result determined, controller wins/loses battle, player deployed, player enters location |
| Requirement | mana, location, source active, card attribute, battle status, command seals |
| Target | player, card, location, choice, count, controller/opponent scope |
| Cost | mana, command seal, discard, close, source movement |
| Interaction | choose target, choose amount, yes/no, response decision, order entities, confirm |
| Effect Primitive | resource, card-zone, movement, card-action, reveal, create, shuffle |
| Modifier | power, prohibition, status, replacement, terrain |
| Lifecycle | duration, persistence, source dependency, cleanup destination, once-per-round, once-per-game |
| Visibility / Hidden Information | hidden source, face-down card, true name, private look, reveal |
| Result Binding | actual affected count, paid amount, selected cards, battle winners, prior branch success |
| Battle Integration | power, winner, defeat, scoring, battle-triggered reward |

No future coverage reporter should collapse these axes into one exclusive family enum.

## 7. Gateway Priority Re-evaluation

Gateway priority remains directionally valid, but the supporting counts must change:

| Gateway | Review Decision |
|---|---|
| Trigger/Event Gateway | Still high priority, but based on 37 strict domain-event triggers, not 58. It should start with event taxonomy, source identity, ordering, optional/forced split, and processed-event id. |
| Lifecycle Policy Gateway | Still high priority because it gates residual/modifier/source cleanup, but current explicit lifecycle/reset count is 11 abilities, not 49. It should not outrank all work solely on contaminated count. |
| Interaction/Pending Gateway | Still high priority because 20 candidate abilities may need choices/response/branch handling, but not 48. It should focus on target/response/branch templates. |
| Target Selection Contract | Higher than currently stated for implementation, because it is the concrete basis for most PendingInteraction work. |
| Result Binding | Remains cross-cutting; count is low today but unlock value is high. |
| Modifier Runtime | Remains high risk and depends on Lifecycle and Battle/Power contracts. |
| Battle Result Envelope | Remains high priority for correctness, but should not be treated as a Phase 3 bulk migration factory until power/trigger/event envelope contracts are stable. |
| Hidden Projection | Should be elevated relative to raw Interaction count because hidden/private proof blocks several skipped card-zone and play abilities. |

## 8. Dependency DAG Findings

Current plan DAG contains problematic implied dependencies:

```text
target selection -> interaction templates -> trigger gateway -> lifecycle gateway
```

This is too linear and is partly driven by contaminated taxonomy.

Recommended corrected DAG:

```text
Result Envelope / Transaction / Event Envelope
  -> Semantic Routing / Coverage Reporter

Flow / Timing Contract
  -> Ability Legality for phase_action abilities

Domain Event Trigger Gateway
  -> Triggered resource/card-zone/battle/lifecycle abilities

Lifecycle Policy Gateway
  -> residual, source-close, modifier duration, cleanup, reset

Interaction Template Gateway
  -> explicit target, optional/response, choose amount, yes/no, private pending

Target Selection Contract
  -> Interaction Template Gateway
  -> Hidden Projection where targets are private

Modifier / Power Contract
  -> Battle Result Envelope

Battle Result Envelope
  -> battle-triggered resource and VP abilities
```

Trigger, Lifecycle, and Interaction gateway specs can run in parallel, but their runtime implementations must not be sequenced by contaminated counts.

## 9. RESOURCE_NUMERIC_CORE Decision

`RESOURCE_NUMERIC_CORE_DIRECT_ACTION` remains a valid low-risk factory slice and should not be delayed merely because Trigger/Lifecycle/Interaction are larger families.

Decision:

- keep Resource Numeric direct-action as an implementation-candidate baseline;
- allow future resource sub-slices to run in parallel with Gateway SPEC work when they do not require trigger/lifecycle/interaction runtime changes;
- do not expand resource into trigger-owned, battle-owned, hidden/private, movement, cost-window, or lifecycle-dependent abilities until the corresponding gateway contract exists.

This distinction matters:

- Gateway SPEC work should start immediately.
- Gateway RUNTIME implementation should wait for corrected taxonomy and contracts.
- Low-risk exact primitive work may continue if it does not touch the same hot files concurrently.

## 10. Parallelization Conflicts

No immediate `PARALLELIZATION_CONFLICT` found in the current READY queue:

- P3-TO-01, P3-TO-03, P3-TO-04, P3-TO-05, and P3-TO-06 are documentation, schema, gateway spec, or reviewer-template tasks.
- They do not directly require simultaneous edits to `interpreter.ts`, `resolution-dataflow.ts`, `match-session.ts`, core schema, or primitive registry.

Warnings:

- P3-TO-02 may touch `package.json`; it must reserve package script ownership if another task is editing scripts.
- P3-TO-07 touches `e2e/support/*`; it must not run in parallel with another Gate C helper refactor.
- P3-TO-11, P3-TO-12, and P3-TO-13 correctly remain `WAIT_GATEWAY` and conflict with each other on runtime hot files.

## 11. Automation Priority

Automation should remain first batch, but the reporter must be corrected before use.

Required automation priorities:

1. `mechanic taxonomy validator`: separate activation kind, timing/window, domain trigger, lifecycle, interaction, visibility, result binding, battle integration, and primitive axes.
2. `coverage reporter`: output orthogonal axis membership, not one contaminated family count.
3. `legacy/new/dual routing counter`: keep existing burn-down value.
4. `primitive schema drift checker`: compare result schema fields with runtime-consumable fields.
5. `review packet generator`: require canonical text, owner, call path, positives, negatives, Gate C inheritance invalidations, and secondary path scan commands.

Do not implement a coverage reporter that preserves the current contaminated Trigger/Lifecycle/Interaction bucket names as authoritative implementation counts.

## 12. Blocking Findings

### BF-1: `TRIGGER_TAXONOMY_CONTAMINATION`

Evidence:

- `fd-phase-3-throughput-optimization-plan.md` counts `phase_action`, `while_active`, and `when_play_requirements_checked` under Trigger Pareto.
- These are activation timing, continuous/source-active condition, and requirement-check hooks, not canonical domain event triggers.

Impact:

- Inflates Trigger Gateway from strict 37 domain-event trigger abilities to 58 broad trigger-family abilities.
- Causes the first Trigger Gateway design to target `phase_action`, which should instead be Flow/Timing -> Ability Legality work.

Minimum fix:

- Replace Trigger Pareto with strict Domain Event Trigger counts.
- Move `phase_action` to Activation/Timing, `while_active` to Continuous/Lifecycle/Modifier, and `when_play_requirements_checked` to Requirement Check.

### BF-2: `LIFECYCLE_TAXONOMY_CONTAMINATION`

Evidence:

- `fd-phase-3-throughput-optimization-plan.md` counts `kind:phase_action`, `kind:passive`, `kind:forced_trigger`, and `kind:declaration_reveal` as lifecycle policy buckets.

Impact:

- Inflates Lifecycle Policy evidence from 11 explicit lifecycle/reset abilities to a 49-family risk count.
- May cause lifecycle runtime work to chase ability kinds instead of duration, persistence, source dependency, cleanup, and reset semantics.

Minimum fix:

- Replace Lifecycle Pareto with explicit `lifecycle`, `limit`, duration, cleanup, source dependency, and reset policy counts.

### BF-3: `INTERACTION_TAXONOMY_CONTAMINATION`

Evidence:

- `fd-phase-3-throughput-optimization-plan.md` labels `on_use_declared + hidden`, `while_active`, `when_play_requirements_checked`, `on_card_played`, and `game_start` as interaction templates.

Impact:

- Inflates Interaction/Pending Gateway evidence from 20 explicit target/response/branch candidates, or 11 strict target abilities, to 48 broad interaction-family abilities.
- Risks building reusable pending templates around timing events rather than actual player input.

Minimum fix:

- Replace Interaction templates with explicit choose/response/branch/confirm/amount/order categories.

### BF-4: Dependency DAG uses contaminated categories

Evidence:

- The plan makes Trigger, Lifecycle, and Interaction the top three gateway priorities using contaminated counts.

Impact:

- The overall throughput direction is valid, but the order and rationale need correction.

Minimum fix:

- Revise DAG to separate Flow/Timing, Domain Event Trigger, Lifecycle Policy, Target Selection, and Interaction Template gateways.

## 13. Required Plan Revisions

Required before `PLAN_ACCEPTED`:

1. Update `fd-phase-3-throughput-optimization-plan.md` Sections 5, 6, 10, 11, and 12 with corrected orthogonal taxonomy.
2. Update `fd-phase-3-throughput-baseline.md` Trigger, Lifecycle, and Interaction baselines with corrected counts.
3. Update `fd-phase-3-parallel-work-queue.md` P3-TO-03, P3-TO-04, and P3-TO-05 names/goals so:
   - Trigger Gateway targets Domain Event Trigger only.
   - Lifecycle Gateway targets duration/persistence/source/reset/cleanup policy only.
   - Interaction Template Gateway targets target/response/branch/choice/amount/confirm/order only.
4. Add a first automation task for a mechanic taxonomy validator before any coverage reporter is treated as authoritative.
5. Keep `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` available as a low-risk factory track in parallel with Gateway SPEC work, but do not expand it into trigger/battle/lifecycle/hidden/resource hybrids before gateways exist.

Final verdict:

`PLAN_NEEDS_REVISION`
