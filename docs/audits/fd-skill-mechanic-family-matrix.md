# FD Skill Mechanic Family Matrix

- Document Role: AUDIT
- Status: ACTIVE / REBASELINE_CANDIDATE
- Scope: current 7 Masters and 7 Servants in `data/authoring`
- Canonical Source: `docs/rules/FD-Game-Rules-Final.md` plus printed card text in canonical authoring archives
- Acceptance Source: `docs/plans/fd-rules-conformance-and-acceptance.md`
- Related Audits: `docs/audits/fd-skill-rule-normalization-audit.md`; `docs/audits/fd-skill-primitive-conformance-matrix.md`
- Last Verified: 2026-09-08

This matrix is a planning audit, not acceptance evidence. Counts below are broad mechanic-family and risk-summary counts. Multi-family membership is allowed, but the family view must not be used as the source of truth for Trigger Gateway, Lifecycle Policy Gateway, Interaction/Pending Gateway, or Dependency DAG priority.

Corrected source of truth for orthogonal semantic axes:

- `docs/audits/fd-skill-semantic-axis-inventory.mjs`
- `docs/audits/fd-skill-semantic-axis-matrix.md`

The previous broad counts `TRIGGER=58`, `LIFECYCLE=49`, and `INTERACTION=48` are `INVALID FOR PRIORITY` because they include ability kind, timing/window hooks, continuous passives, requirement checks, lifecycle/reset policies, and player-input semantics in overlapping family buckets. Current gateway priority must use the corrected semantic-axis baseline: strict Domain Event Trigger = 37 abilities, explicit Lifecycle/Reset/Persistence = 11 abilities, explicit Interaction union = 20 abilities, and strict target-based PendingInteraction = 11 abilities.

## Reproducible Counting Contract

Inventory source:

- `data/authoring/masters/*.json`
- `data/authoring/servants/*.json`

Counting unit:

- ability, not card;
- card affected count is the unique card count among abilities assigned to that family;
- top-level effect counts inspect only `ability.effects[].type`;
- family membership may additionally use explicit `kind`, `targets`, `ruleModifiers`, `powerModifiers`, activation fields, and narrow printed-text markers where passive/condition-only semantics have no top-level effect.

Resource/Numeric strict rule:

- Count in `RESOURCE_NUMERIC` only when top-level effects include `adjust_mana`, `adjust_command_seals`, `adjust_victory_points`, or `pay_mana`.
- Do not count abilities merely because their text mentions mana, VP, battle reward, command seals, cost, or power.

## Command Output

Recompute command:

```powershell
node docs/audits/fd-skill-mechanic-family-inventory.mjs
```

Recomputed from current `data/authoring` with that script:

```text
archives=14 cards=46 abilities=92

Top-level effect counts
reveal_information 11
record_master_directive 10
adjust_command_seals 7
adjust_victory_points 7
branch 6
adjust_mana 5
move_card 5
create_card 3
move_player 3
create_modifier 2
draw_cards 2
move_all_remaining 2
play_selected_cards 2
pay_mana 1
```

Strict family counts:

```text
BATTLE_RESULT 39 abilities / 28 cards
CARD_ACTION_SEMANTICS 13 abilities / 10 cards
CARD_ZONE 14 abilities / 13 cards
COST_PAYMENT 9 abilities / 9 cards
HIDDEN_INFORMATION 21 abilities / 16 cards
HISTORY_USAGE 16 abilities / 15 cards
INTERACTION 48 abilities / 34 cards
LIFECYCLE 49 abilities / 36 cards
MODIFIER 24 abilities / 17 cards
MOVEMENT 21 abilities / 18 cards
POWER 18 abilities / 16 cards
RESOURCE_NUMERIC 18 abilities / 12 cards
RESULT_BINDING 2 abilities / 2 cards
SPECIAL_SUBSYSTEM 18 abilities / 13 cards
TARGET_SELECTION 11 abilities / 11 cards
TRIGGER 58 abilities / 34 cards
```

## Mechanic Family Status Matrix

| Mechanic Family | Ability Count | Cards Affected | Existing Primitives / Owners | Missing Primitives | Legacy Runtime Dependency | New Runtime Coverage | Semantic Complexity | Interaction Complexity | Result-Binding Dependency | Lifecycle Dependency | Gate Status |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| `RESOURCE_NUMERIC` | 18 | 12 | `adjust_mana`, `pay_mana`, `adjust_command_seals`, `adjust_victory_points`; mixed Resolution Data-flow and legacy interpreter | numeric expression contract, clamp/underflow contract, semantic-form routing, event envelope | High outside pilots | Partial: Golden Eater, Conversion Magic, command spell Gate B | Medium | Low for direct action; high when trigger/battle-owned | Medium for actual affected counts | Low for direct action | `IMPLEMENTED_UNVERIFIED` / family not verified |
| `CARD_ZONE` | 14 | 13 | `move_card`, `draw_cards`, `move_all_remaining`, `play_selected_cards`; `playBatch` hook | typed draw/shuffle/create/look/move-all result envelopes, destination policy, face-down ownership | High | Partial pilots only | Medium-High | Medium | High | Medium | `IMPLEMENTED_UNVERIFIED` / family not verified |
| `CARD_ACTION_SEMANTICS` | 13 | 10 | shared playBatch, ruleModifiers, legacy play rules | separate contracts for `PLAY`, `PLAY_SOURCE_CARD_WITH_COST_RESPONSE`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, and `CLOSE` | High | Time Alter, Volumen, Maiya, Olga, and Artoria Alter scoped implementation candidates only | High | High | Medium | Medium | `IMPLEMENTED_UNVERIFIED` representatives / family not verified |
| `TARGET_SELECTION` | 11 | 11 | pending target owner, candidate validation, Golden Eater private targets | closed target constraint registry, semantic candidate routing, private projection contract | High | Golden Eater and Time Alter representatives | High | High | High | Medium | `IMPLEMENTED_UNVERIFIED` representatives only |
| `COST_PAYMENT` | 9 | 9 | `pay_mana`, legacy ability cost loop | variable cost result envelopes, optional payment windows, source-card cost movement | High | Golden Eater optional payment only | Medium-High | High | High | Medium | `IMPLEMENTED_UNVERIFIED` representative only |
| `INTERACTION` | 48 | 34 | pending decisions, response windows, action/combat windows | unified response/optional trigger queue, reconnect for all window types | High | Partial: Golden Eater, Time Alter, Conversion Magic | High | Very High | Medium-High | Medium | `NOT_VERIFIED` family |
| `RESULT_BINDING` | 2 strict graph abilities; broader candidates require review | 2 | `EffectResultEnvelope`, `binding_field`, Golden Eater graph | broad result envelopes for draw/play/shuffle/look/trigger/battle | High | One real full graph plus Conversion Magic `resultVar` pilot | Very High | High | Required | Medium | `IMPLEMENTED_UNVERIFIED` representatives only |
| `MODIFIER` | 24 | 17 | `create_modifier`, `create_status`, ruleModifiers, ongoing effects, modeState | one modifier owner, typed source/duration/priority contract | Very High | Artoria Caster `选王剑` candidate; Tomoe repair compatibility path | High | Medium | Medium | High | `IMPLEMENTED_UNVERIFIED` representatives only |
| `POWER` | 18 | 16 | combat resolver, `calculateCardPower`, extended effects, power modifiers | canonical layer order, source trace, external/event/situation polarity contract | Very High | Golden Flow 2 candidate plus Artoria/Tomoe fragments | Very High | Medium | Medium | High | `IMPLEMENTED_UNVERIFIED` / battle review pending |
| `MOVEMENT` | 21 | 18 | `move_player`, movement/deployment overrides, Flow Runtime | unified domain action primitive, engagement/override contract, route metrics | High | Golden Flow 1 candidate for normal movement only | High | Medium | Medium | Medium | `IMPLEMENTED_UNVERIFIED` representative only |
| `TRIGGER` | 58 | 34 | trigger allowlist, forced/optional triggers, response windows | closed trigger registry, ordering, uniqueness arbitration, hidden trigger projection | Very High | component fragments only | Very High | Very High | Medium | High | `NOT_VERIFIED` family |
| `LIFECYCLE` | 49 | 36 | ongoing effects, cleanup, source state, modeState, per-game limits | single lifecycle owner, source-close, duration, cleanup ordering | Very High | Artoria Caster `选王剑` candidate | Very High | Medium | Medium | Required | `IMPLEMENTED_UNVERIFIED` representative only |
| `HISTORY_USAGE` | 16 | 15 | limits, movement metrics, played-round metrics, modeState | typed history query/update primitives, replay-safe counters | High | fragments only | High | Medium | Medium | High | `NOT_VERIFIED` family |
| `HIDDEN_INFORMATION` | 21 | 16 | reveal, visibility, private targets, projections | closed reveal/look/hide projection contract, owner-only reconnect | High | Time Alter face-down and Golden Eater private target representatives | High | High | Medium | Medium | `IMPLEMENTED_UNVERIFIED` representatives only |
| `BATTLE_RESULT` | 39 | 28 | battle resolver, scoring resolver, defeat/status fragments | battle result envelope, winner set, defeated exclusion, scoring consumption, trigger feed | High | Golden Flow 2 candidate, independent review pending | Very High | Medium | High | High | `IMPLEMENTED_UNVERIFIED` / not Phase 3 first batch |
| `SPECIAL_SUBSYSTEM` | 18 | 13 | extended directives, independent deck, replacement, swap, identity handlers | subsystem-specific primitive contracts and deletion criteria | Very High | Mostly legacy | Very High | High | High | High | `NOT_VERIFIED` family |

## RESOURCE_NUMERIC Ability Membership

| Archive | Card | Ability | Top-Level Effects | First Batch Eligibility |
|---|---|---|---|---|
| `master.gatou` | `master.gatou.command-spell` | `command-spell.gain-mana` | `adjust_mana`, `adjust_command_seals` | In: direct action resource. |
| `master.gatou` | `master.gatou.command-spell` | `command-spell.power-victory` | `record_master_directive`, `adjust_command_seals` | Out: battle/power directive. |
| `master.gatou` | `master.gatou.command-spell` | `command-spell.free-move` | `record_master_directive`, `adjust_command_seals` | Out: movement directive. |
| `master.irisviel` | `master.irisviel.skill.conversion-magic` | `conversion-magic.preparation` | `move_all_remaining`, `adjust_mana` | Out: card-zone result binding; existing pilot only. |
| `master.olga-marie` | `master.olga-marie.command-spell` | `command-spell.gain-mana` | `adjust_mana`, `adjust_command_seals` | In: direct action resource. |
| `master.olga-marie` | `master.olga-marie.command-spell` | `command-spell.power-victory` | `record_master_directive`, `adjust_command_seals` | Out: battle/power directive. |
| `master.olga-marie` | `master.olga-marie.command-spell` | `command-spell.free-move` | `record_master_directive`, `adjust_command_seals` | Out: movement directive. |
| `master.shinji` | `master.shinji.skill.drain-command` | `drain-command.enter-miyama` | `adjust_mana` | Out: Trigger/Movement representative later. |
| `master.shinji` | `master.shinji.skill.clown` | `clown.lose-command-seal` | `adjust_command_seals` | Out: Trigger/Battle/Defeat representative later. |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-3` | `sc-artoria-alt-3.noble-bloom` | `adjust_victory_points` | Out: optional battle trigger. |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-3` | `sc-artoria-alt-3.noble-bloom-extra-vp` | `adjust_victory_points` | Out: optional battle trigger. |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-4` | `sc-artoriac-4.recon-gain-vp-and-move` | `adjust_victory_points`, `move_player` | Out: movement/recon hybrid. |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-6` | `sc-artoriac-6.gain-vp-if-not-sole-winner` | `adjust_victory_points` | Out: battle-result trigger. |
| `servant.drake` | `servant.drake.skill.sc-drake-3` | `sc-drake-3.plunder` | `adjust_victory_points` | Out: movement history / battle phase. |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-2` | `sc-ereshkigal-2.gain-mana-on-deploy` | `adjust_mana` | Out: deployment trigger. |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-3` | `sc-kintoki-3.golden-eater` | `move_card`, `branch`, `pay_mana`, `move_card`, `branch` | Out: Result Binding representative already. |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-1` | `sc-tomoe-1.independent-action` | `adjust_victory_points` | In: direct action VP with explicit timing condition. |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-1` | `sc-tomoe-1.penalty-on-defeat` | `adjust_victory_points` | Out: defeat trigger. |

First batch strict direct-action target set:

- `master.gatou.command-spell` / `command-spell.gain-mana`
- `master.olga-marie.command-spell` / `command-spell.gain-mana`
- `servant.tomoe.skill.sc-tomoe-1` / `sc-tomoe-1.independent-action`

## Card Action Primitive Split

The Card Action family must not collapse canonical action semantics into one primitive. These contracts may share lower-level helpers, but each needs separate acceptance:

| Contract | Meaning | Acceptance Boundary |
|---|---|---|
| `PLAY` | Normal or explicitly permitted play of card(s) into the correct play destination. | Must verify normal play limit, cost, visibility, timing, response windows, and projection; scoped response-play requires its own Gate C. |
| `ADD_TO_ATTACK` | Append or attach a card/effect to an existing attack. | Must not inherit normal play counters unless a rule explicitly says so. |
| `CREATE_AND_ACTIVATE` | Create a card or token and immediately put it into an active state. | Must verify identity, ownership, source, and cleanup. |
| `ACTIVATE` | Turn an existing card/effect from inactive/face-down/available into active. | Must verify source zone, visibility, timing, and duplicate activation rejection. |
| `CLOSE` | Close an active card/effect and trigger its destination/lifecycle consequences. | Must verify source-close, modifier removal, return/discard/remove destination, and stale duplicate rejection. |

## Primitive Reuse Map

| Mechanic Family | Primitive / Contract | Consumer Abilities | Reuse Impact |
|---|---|---|---|
| `RESOURCE_NUMERIC` | `adjust_mana` | `command-spell.gain-mana`, `conversion-magic.preparation`, `drain-command.enter-miyama`, `sc-ereshkigal-2.gain-mana-on-deploy` | Removes common legacy resource mutation after trigger/card-zone dependencies are separated. |
| `RESOURCE_NUMERIC` | `adjust_command_seals` | `command-spell.gain-mana`, command spell directive abilities, `clown.lose-command-seal` | Removes command-seal mutation from ability-id pilot routing for direct action first; trigger/battle later. |
| `RESOURCE_NUMERIC` | `adjust_victory_points` | `sc-tomoe-1.independent-action`, `sc-tomoe-1.penalty-on-defeat`, `sc-artoria-alt-3.noble-bloom`, `sc-artoriac-6.gain-vp-if-not-sole-winner`, `sc-drake-3.plunder` | High cross-family value, but only direct action VP enters the first batch. |
| `COST_PAYMENT` | `pay_mana` | `sc-kintoki-3.golden-eater` | Currently one strict top-level effect; variable/optional payment expansion needs separate Cost/Interaction work. |
| `CARD_ZONE` | `move_card` / `move_all_remaining` | `sc-kintoki-3.golden-eater`, `conversion-magic.preparation`, `sc-artoriac-2.pay-x-look-x-plus-two` | Important for actual-count result binding; not first resource batch scope. |
| `CARD_ACTION_SEMANTICS` | `PLAY`, `PLAY_SOURCE_CARD_WITH_COST_RESPONSE`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE` | Time Alter, Volumen, Drake, Maiya, Olga, Kiritsugu, Artoria Alter card-action abilities | Prevents canonical play/add/activate/close semantics from being merged incorrectly. |

## Candidate Batch Ranking

| Candidate Batch | Reuse | Readiness | Complexity | Risk | Future Value | Direction |
|---|---|---|---|---|---|---|
| `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` | Medium strict direct count; high future value | High | Low-Medium | Low-Medium | Very High | Select next. |
| `CARD_ZONE_CORE` | Medium | Medium | Medium-High | High | Very High | Second, after numeric envelopes are stable. |
| `TARGET_COST_INTERACTION` | Medium | Medium | High | High | Very High | Needs resource and card-zone primitives first. |
| `RESULT_DEPENDENT_COMPOSITION` | Low strict graph count; high latent count | Medium | Very High | High | Very High | Keep cross-cutting; do not block simple direct resource migration. |
| `MODIFIER_POWER_LIFECYCLE` | High | Medium | Very High | Very High | High | Use Artoria/Tomoe as representatives after simpler primitive routing shrinks legacy consumers. |
| `BATTLE_RESULT` | High | Medium | Very High | Very High | High | Phase 4/Golden Flow blocker, not the first Phase 3 mechanic batch. |

## Previous Implementation-Candidate Batch

`RESOURCE_NUMERIC_CORE_DIRECT_ACTION`

Original selection rationale:

- strict full family count is 18 abilities / 12 cards, not 45 / 35;
- the first batch only claims the direct-action subset, not trigger, battle, movement, card-zone, or result-binding hybrids;
- it can remove ability-id routing for `command-spell.gain-mana`;
- it has immediate command spell Gate C value because that pilot currently lacks browser evidence;
- it prepares later Card/Zone, Cost/Payment, Result Binding, Battle Result, and Power work without binding them into this slice.

Gate C inheritance rule:

`RESOURCE_NUMERIC_CORE_DIRECT_ACTION` can inherit command spell/Tomoe representative Gate C only for visible direct-action abilities whose accepted executable semantic form mutates mana, command seals, or VP and does not introduce another runtime family. Inheritance is not allowed when the ability introduces any of:

- trigger timing;
- battle result, battle winner, battle loss, or defeat dependency;
- hidden choice, private target, or private look;
- pending payment or optional branch that changes whether the mutation resolves;
- card movement, card-zone result binding, play/add/activate/close semantics;
- source lifecycle, cleanup, modifier, or power-layer dependency.

Implementation-candidate status, 2026-09-08:

- Inventory source: `docs/audits/fd-resource-numeric-core-direct-action-inventory.mjs`.
- Eligible direct-action resource abilities from `data/authoring`: 3.
- Skipped resource abilities: 15, each with explicit skip reason in the script output.
- Migrated representatives: Gatou `command-spell.gain-mana`, Olga `command-spell.gain-mana`, Tomoe `sc-tomoe-1.independent-action`.
- Direct-action legacy resource consumers: 3 before, 0 after.
- New-runtime semantic-routed direct resource consumers: 0 before, 3 after.
- Dual-compatible migrated consumers: 1 before, 0 after.
- Command spell Gate C implementer evidence exists in `e2e/fd-command-spell-resource-core.spec.ts`.
- Status claim remains `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review is required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion.

Resource event envelope requirement:

Every direct VP/mana/seal event emitted by this family must expose `sourceAbilityId`, `controllerId`, `resource`, `delta`, `before`, `after`, `resultId`, and `revision`. Reviewer checks for duplicate settlement and source confusion should use these fields instead of display text or card-specific log strings.

## Selected Next Batch

`NEXT_MECHANIC_BATCH: CARD_ZONE_CORE_DIRECT_ACTION`

Selection rationale:

- current authoring contains 8 card-zone abilities, but only 2 are exact direct phase-action matches without trigger, hidden/private, cost, lifecycle, add/activate/close, battle, or modifier dependencies;
- it removes the remaining Phase 3 reference pilot ability-id routes for `conversion-magic.preparation` and `time-alter.action`;
- it proves card-zone typed result envelopes continue to support Result Binding and shared `playBatch` delegation;
- it avoids broad Card Action migration by excluding `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, and `CLOSE`.

Implementation-candidate status, 2026-09-08:

- Inventory source: `docs/audits/fd-card-zone-core-direct-action-inventory.mjs`.
- Eligible direct card-zone abilities from `data/authoring`: 2.
- Skipped card-zone abilities: 6, each with explicit skip reason.
- Migrated representatives: Irisviel `conversion-magic.preparation`, Kiritsugu `time-alter.action`.
- Pilot ability-id routes: 2 before, 0 after.
- Exact direct card-zone legacy consumers: 2 before, 0 after.
- New-runtime semantic-routed card-zone consumers: 0 before, 2 after.
- Dual-compatible migrated consumers: 2 before, 0 after.
- Gate C implementer evidence exists for Time Alter in `e2e/fd-time-alter-core-primitive.spec.ts`; Conversion Magic browser evidence remains supporting evidence.
- Status claim remains `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review is required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion.

Gate C inheritance rule:

`CARD_ZONE_CORE_DIRECT_ACTION` can inherit the Time Alter representative Gate C only for exact visible direct phase-action semantic matches in this batch. It cannot inherit Gate C if an ability introduces trigger timing, battle result dependency, hidden/private choice, pending payment, raw movement to `attack_area` or `field`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, lifecycle cleanup, source-close, modifier, power, defeat, or scoring dependency.

## Current Implementation-Candidate Batch

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_ADD_TO_ATTACK`

Selection rationale:

- current authoring contains 7 card-action semantic abilities matching the scoped inventory, but only 1 is an exact `ADD_TO_ATTACK` semantic match;
- it separates appending/attaching to another player's attack from normal `PLAY`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, and `CLOSE`;
- it migrates Maiya `military.attach-support-shot` by executable semantic form without ability-id pilot routing or roster-wide JSON edits.

Implementation-candidate status, 2026-09-08:

- Inventory source: `docs/audits/fd-card-action-add-to-attack-inventory.mjs`.
- Eligible ADD_TO_ATTACK abilities from `data/authoring`: 1.
- Skipped card-action semantic abilities: 6, each with explicit skip reason.
- Migrated representative: Maiya `military.attach-support-shot`.
- Legacy add-to-attack consumers for the exact representative: 1 before, 0 after.
- New-runtime semantic-routed add-to-attack consumers: 0 before, 1 after.
- Dual-compatible migrated add-to-attack consumers: 1 before, 0 after.
- Gate C implementer evidence exists in `e2e/fd-add-to-attack-card-action.spec.ts`.
- Status claim remains `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review is required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion.

Gate C inheritance rule:

`CARD_ACTION_SEMANTICS_MINIMAL_ADD_TO_ATTACK` can inherit the Maiya representative Gate C only for exact visible direct phase-action `attach_card_to_player_attack` semantic matches with the same fixed mana cost, server-projected non-controller player target, required support-card source, return-at-round-end marker, and cannot-win status semantics. It cannot inherit Gate C if an ability introduces normal `PLAY`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, trigger timing, battle result dependency, hidden/private choice, variable or pending payment, non-player target, source-close, modifier/power calculation, defeat, scoring, or a different lifecycle/cleanup rule.

## Current Implementation-Candidate Batch

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_PLAY`

Selection rationale:

- current authoring contains 7 card-action semantic abilities matching the scoped inventory, with 1 exact scoped PLAY semantic match;
- it separates normal/effect play into the shared `playBatch` owner; response source-card play remains a separate `PLAY_SOURCE_CARD_WITH_COST_RESPONSE` contract instead of inheriting PLAY;
- it keeps Drake hidden/power/lifecycle play out of scope until its additional contract is verified.

Implementation-candidate status, 2026-09-08:

- Inventory source: `docs/audits/fd-card-action-play-inventory.mjs`.
- Eligible PLAY abilities from `data/authoring`: 1.
- Skipped card-action semantic abilities: 6, each with explicit skip reason; Kayneth `volumen.extra-play` is skipped here as `separate_contract:play_source_card_response`.
- Migrated representative: Kiritsugu `time-alter.action`.
- Scoped legacy play consumers for the exact representative: 1 before, 0 after.
- New-runtime semantic-routed PLAY consumers: 0 before, 1 after.
- Dual-compatible migrated PLAY consumers: 1 before, 0 after.
- Gate C implementer evidence exists in `e2e/fd-time-alter-core-primitive.spec.ts`.
- Status claim remains `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review is required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion.

Gate C inheritance rule:

`CARD_ACTION_SEMANTICS_MINIMAL_PLAY` can inherit the Time Alter representative Gate C only for exact visible direct phase-action `play_selected_cards(controller hand attack, face_down) + draw_cards(1)` semantic matches with no cost, no creates, no hidden/private target, and mandatory target availability checked before activation.

`CARD_ACTION_SEMANTICS_MINIMAL_PLAY_SOURCE_CARD_WITH_COST_RESPONSE` can inherit the Volumen representative Gate C only for exact visible response-window `play_source_card(face_up)` semantic matches opened by `controller_combat_action_window`, with fixed `pay_mana(2)`, no targets, no creates, and source-card-in-hand revalidation. It cannot inherit Gate C if an ability introduces variable or pending payment, target selection, hidden/private choice, multiple selected cards, face-down source play, non-hand source, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, lifecycle cleanup, source-close, modifier/power calculation, battle result dependency, defeat, scoring, or recursive on-play trigger dependency.

## Current Implementation-Candidate Batch

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_ACTIVATE`

Selection rationale:

- current authoring contains 7 card-action semantic abilities matching the scoped inventory, but only 1 is an exact `ACTIVATE` semantic match;
- it separates activating an existing card by definition id from `PLAY`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, and `CLOSE`;
- it migrates Olga-Marie `astronomical-science.first-loss` by executable semantic form without ability-id pilot routing or roster-wide JSON edits.

Implementation-candidate status, 2026-09-08:

- Inventory source: `docs/audits/fd-card-action-activate-inventory.mjs`.
- Eligible ACTIVATE abilities from `data/authoring`: 1.
- Skipped card-action semantic abilities: 6, each with explicit skip reason.
- Migrated representative: Olga-Marie `astronomical-science.first-loss`.
- Scoped legacy activate consumers for the exact representative: 1 before, 0 after.
- New-runtime semantic-routed ACTIVATE consumers: 0 before, 1 after.
- Dual-compatible migrated ACTIVATE consumers: 1 before, 0 after.
- Browser projection/reconnect implementer evidence exists in `e2e/fd-olga-activate-card-action.spec.ts`.
- Status claim remains `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review is required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion.

Gate C inheritance rule:

`CARD_ACTION_SEMANTICS_MINIMAL_ACTIVATE` can inherit the Olga representative Gate C only for exact forced-trigger `activate_card_by_id(definitionId)` semantic matches where `after_controller_first_loses_battle` marks a pending round-end activation, formal `round_end` consumes that pending entry, there are no targets/cost/creates, and the existing inactive owned target card is in the `skill` zone. The candidate browser chain covers pending battle-state projection, WS `client:end_turn` with `expectedRevision`, server round-end activation, reconnect consistency, and stale end-turn rejection. It cannot inherit Gate C if an ability introduces `PLAY`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `CLOSE`, optional response timing, target selection, hidden/private choice, variable or pending payment, source lifecycle beyond this pending marker, cleanup, modifier/power calculation, battle-result derivation, defeat/scoring side effects, or a different delayed trigger schedule.

## Current Implementation-Candidate Batch

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_CLOSE`

Selection rationale:

- current authoring contains 7 card-action semantic abilities matching the scoped inventory, but only 1 is an exact `CLOSE` semantic match;
- it separates closing an already-active source card from normal `PLAY`, `PLAY_SOURCE_CARD_WITH_COST_RESPONSE`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, and `ACTIVATE`;
- it migrates Artoria Alter `sc-artoria-alt-2.angra-mainyu-embrace` by executable semantic form without ability-id pilot routing or roster-wide JSON edits.

Implementation-candidate status, 2026-09-08:

- Inventory source: `docs/audits/fd-card-action-close-inventory.mjs`.
- Eligible CLOSE abilities from `data/authoring`: 1.
- Skipped card-action semantic abilities: 6, each with explicit skip reason.
- Migrated representative: Artoria Alter `sc-artoria-alt-2.angra-mainyu-embrace`.
- Scoped legacy close consumer count for the exact representative: 1 before, 0 after.
- New-runtime semantic-routed CLOSE consumers: 0 before, 1 after.
- Dual-compatible migrated CLOSE consumers: 1 before, 0 after.
- Gate C implementer evidence exists in `e2e/fd-artoria-alt-close-card-action.spec.ts`.
- Status claim remains `IMPLEMENTATION_COMPLETE_CANDIDATE`; independent review is required before any `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED` promotion.

Gate C inheritance rule:

`CARD_ACTION_SEMANTICS_MINIMAL_CLOSE` can inherit the Artoria Alter representative Gate C only for exact residual `on_card_played` source-close semantic matches where the source card is active face-up on the board, the triggering played card belongs to the same controller, is visible to the trigger, has the `宝具` attribute, there are no targets/cost/creates, and the single effect is `close_source_card`. The candidate browser chain covers browser-opened remote room, WS `client:dispatch_command` with `expectedRevision` for playing the noble phantasm, server trigger revalidation, typed source close, projection, reconnect consistency, and stale replay rejection. It cannot inherit Gate C if an ability introduces targeted close, close-then-activate, `CREATE_AND_ACTIVATE`, normal `PLAY`, `ADD_TO_ATTACK`, response timing, hidden/private or face-down source identity, variable/pending payment, modifier/power calculation, battle-result dependency, temporary-card dissolve, non-skill close destination, once-per-game removal, or broader cleanup ordering.

## Pilot Allowlist Deletion Gate For Next Batch

Current baseline to record before implementation:

| Metric | Baseline Required Before Coding |
|---|---|
| Pilot ability-id routes | Identify all routes for `conversion-magic.preparation`, `time-alter.action`, and any remaining reference pilot entries. |
| Direct card-zone ability-id routes | `conversion-magic.preparation` and `time-alter.action` must be counted separately from resource/numeric routes. |
| Legacy exact card-zone consumers | Count exact direct abilities with `move_all_remaining`, `draw_cards`, or `play_selected_cards` that still call legacy `resolveEffect`. |
| New semantic-form card-zone consumers | Count abilities routed by primitive shape rather than ability id. |

Required after implementation:

- `conversion-magic.preparation` and `time-alter.action` ability-id routes removed.
- `conversion-magic.preparation` routes by semantic form: `move_all_remaining(hand -> discard) + adjust_mana(bound moved count)`.
- `time-alter.action` routes by semantic form: `play_selected_cards(controller hand attack, face_down) + draw_cards(1)`.
- no legacy fallback after classification into the card-zone primitive path;
- regression proves deleting the remaining pilot allowlist entries does not break Gate A/B/C candidate evidence for Time Alter and Conversion Magic.

## Full Ability Family Membership

This table is generated by the strict classifier described above.

| Archive | Card | Ability | Top-Level Effects | Families |
|---|---|---|---|---|
| `master.gatou` | `master.gatou.skill.seeker` | `seeker.battle-end-reward` | `record_master_directive` | `MOVEMENT`, `TRIGGER`, `LIFECYCLE`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.gatou` | `master.gatou.skill.seeker` | `seeker.meditation` | `record_master_directive` | `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE`, `SPECIAL_SUBSYSTEM` |
| `master.gatou` | `master.gatou.command-spell` | `command-spell.gain-mana` | `adjust_mana`, `adjust_command_seals` | `RESOURCE_NUMERIC`, `INTERACTION` |
| `master.gatou` | `master.gatou.command-spell` | `command-spell.power-victory` | `record_master_directive`, `adjust_command_seals` | `RESOURCE_NUMERIC`, `INTERACTION`, `POWER`, `LIFECYCLE`, `HISTORY_USAGE`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.gatou` | `master.gatou.command-spell` | `command-spell.free-move` | `record_master_directive`, `adjust_command_seals` | `RESOURCE_NUMERIC`, `INTERACTION`, `MOVEMENT`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.irisviel` | `master.irisviel.skill.proxy-master` | `proxy-master.command-spell-timing` | `record_master_directive` | `TRIGGER`, `SPECIAL_SUBSYSTEM` |
| `master.irisviel` | `master.irisviel.skill.conversion-magic` | `conversion-magic.preparation` | `move_all_remaining`, `adjust_mana` | `RESOURCE_NUMERIC`, `CARD_ZONE`, `INTERACTION`, `RESULT_BINDING` |
| `master.kayneth` | `master.kayneth.skill.double-master` | `double-master.passive` | `record_master_directive` | `CARD_ACTION_SEMANTICS`, `MODIFIER`, `TRIGGER`, `SPECIAL_SUBSYSTEM` |
| `master.kayneth` | `master.kayneth.skill.alchemist` | `alchemist.setup` | `create_independent_deck` | `CARD_ZONE`, `TRIGGER`, `SPECIAL_SUBSYSTEM` |
| `master.kayneth` | `master.kayneth.skill.alchemist` | `alchemist.draw-volumen` | `draw_from_independent_deck` | `CARD_ZONE`, `INTERACTION`, `SPECIAL_SUBSYSTEM` |
| `master.kayneth` | `master.kayneth.skill.pride` | `pride.must-deploy` | `deployment_rule_override` | `MOVEMENT`, `TRIGGER`, `BATTLE_RESULT` |
| `master.kayneth` | `master.kayneth.deck.volumen-hydrargyrum` | `volumen.extra-play` | `play_source_card` | `CARD_ACTION_SEMANTICS`, `COST_PAYMENT`, `INTERACTION`, `TRIGGER`, `BATTLE_RESULT` |
| `master.kayneth` | `master.kayneth.deck.volumen-hydrargyrum` | `volumen.slash` | none | `INTERACTION`, `POWER`, `LIFECYCLE` |
| `master.kiritsugu` | `master.kiritsugu.skill.magus-killer` | `magus-killer.setup` | `replace_card_in_deck` | `CARD_ZONE`, `TARGET_SELECTION`, `INTERACTION`, `SPECIAL_SUBSYSTEM` |
| `master.kiritsugu` | `master.kiritsugu.skill.time-alter` | `time-alter.action` | `play_selected_cards`, `draw_cards` | `CARD_ZONE`, `CARD_ACTION_SEMANTICS`, `TARGET_SELECTION`, `INTERACTION`, `HIDDEN_INFORMATION` |
| `master.kiritsugu` | `master.kiritsugu.skill.square-accel` | `square-accel.combat` | `record_master_directive` | `INTERACTION`, `LIFECYCLE`, `HIDDEN_INFORMATION`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.kiritsugu` | `master.kiritsugu.deck.origin-bullet` | `origin-bullet.cut-bind` | `record_master_directive` | `INTERACTION`, `POWER`, `LIFECYCLE`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.maiya` | `master.maiya.skill.military` | `military.has-support-shot` | `create_card` | `CARD_ZONE`, `TRIGGER` |
| `master.maiya` | `master.maiya.skill.military` | `military.attach-support-shot` | `attach_card_to_player_attack` | `TARGET_SELECTION`, `COST_PAYMENT`, `INTERACTION`, `MOVEMENT`, `LIFECYCLE`, `HISTORY_USAGE`, `BATTLE_RESULT` |
| `master.maiya` | `master.maiya.deck.support-shot` | `support-shot.append-only` | `append_only_rule` | `CARD_ACTION_SEMANTICS`, `TRIGGER` |
| `master.maiya` | `master.maiya.deck.support-shot` | `support-shot.suppress` | `terrain_multiplier`, `transfer_vp_to_owner` | `INTERACTION`, `MODIFIER`, `POWER`, `LIFECYCLE` |
| `master.olga-marie` | `master.olga-marie.skill.astronomical-science` | `astronomical-science.has-chaldeas` | `create_card` | `CARD_ZONE`, `TRIGGER` |
| `master.olga-marie` | `master.olga-marie.skill.astronomical-science` | `astronomical-science.first-loss` | `activate_card_by_id` | `CARD_ACTION_SEMANTICS`, `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.olga-marie` | `master.olga-marie.skill.chaldeas` | `chaldeas.peek-bottoms` | `look_at_match_deck_bottoms` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `master.olga-marie` | `master.olga-marie.skill.chaldeas` | `chaldeas.swap-before-resolve` | `swap_revealed_with_deck_bottom` | `INTERACTION`, `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE`, `HIDDEN_INFORMATION`, `SPECIAL_SUBSYSTEM` |
| `master.olga-marie` | `master.olga-marie.skill.trismegistus-grief` | `trismegistus.soul-drag` | `soul_drag_power_bonus` | `MODIFIER`, `POWER`, `TRIGGER`, `LIFECYCLE`, `BATTLE_RESULT` |
| `master.olga-marie` | `master.olga-marie.skill.trismegistus-grief` | `trismegistus.loss-transform` | `transform_to_return_silence_on_loss` | `TRIGGER`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.olga-marie` | `master.olga-marie.skill.trismegistus-grief` | `trismegistus.return-silence` | `return_silence_battle_start` | `MOVEMENT`, `TRIGGER`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.olga-marie` | `master.olga-marie.command-spell` | `command-spell.gain-mana` | `adjust_mana`, `adjust_command_seals` | `RESOURCE_NUMERIC`, `INTERACTION` |
| `master.olga-marie` | `master.olga-marie.command-spell` | `command-spell.power-victory` | `record_master_directive`, `adjust_command_seals` | `RESOURCE_NUMERIC`, `INTERACTION`, `POWER`, `LIFECYCLE`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.olga-marie` | `master.olga-marie.command-spell` | `command-spell.free-move` | `record_master_directive`, `adjust_command_seals` | `RESOURCE_NUMERIC`, `INTERACTION`, `MOVEMENT`, `BATTLE_RESULT`, `SPECIAL_SUBSYSTEM` |
| `master.shinji` | `master.shinji.skill.drain-command` | `drain-command.enter-miyama` | `adjust_mana` | `RESOURCE_NUMERIC`, `TRIGGER` |
| `master.shinji` | `master.shinji.skill.useless-person` | `useless-person.setup` | `create_card` | `CARD_ZONE`, `TRIGGER` |
| `master.shinji` | `master.shinji.skill.clown` | `clown.lose-command-seal` | `adjust_command_seals` | `RESOURCE_NUMERIC`, `TRIGGER`, `BATTLE_RESULT` |
| `master.shinji` | `master.shinji.skill.false-attendant-book` | `false-attendant-book.first-empty-seals` | `false_attendant_book_replacement` | `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE`, `SPECIAL_SUBSYSTEM` |
| `servant.achilles` | `servant.achilles.skill.sc-achilles-1` | `sc-achilles-1.achilles-heel` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION`, `BATTLE_RESULT` |
| `servant.achilles` | `servant.achilles.skill.sc-achilles-1` | `sc-achilles-1.gale-advance` | `opponents_random_discard`, `set_opponent_power_to_zero` | `INTERACTION`, `MODIFIER`, `POWER`, `LIFECYCLE`, `HIDDEN_INFORMATION`, `BATTLE_RESULT` |
| `servant.achilles` | `servant.achilles.skill.sc-achilles-2` | `sc-achilles-2.blue-sky` | `branch` | `CARD_ACTION_SEMANTICS`, `TARGET_SELECTION`, `INTERACTION`, `MODIFIER`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.achilles` | `servant.achilles.skill.sc-achilles-3` | `sc-achilles-3.hero-duel` | none | `INTERACTION`, `MODIFIER`, `POWER`, `MOVEMENT`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-1` | `sc-artoria-alt-1.true-name-release` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-1` | `sc-artoria-alt-1.ignore-situation-restrictions` | none | `MODIFIER`, `TRIGGER` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-1` | `sc-artoria-alt-1.chain-of-wind-king` | `create_modifier` | `COST_PAYMENT`, `INTERACTION`, `MODIFIER`, `POWER`, `LIFECYCLE` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-2` | `sc-artoria-alt-2.low-mana-play-override` | none | `MODIFIER`, `TRIGGER` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-2` | `sc-artoria-alt-2.angra-mainyu-embrace` | `close_source_card` | `CARD_ACTION_SEMANTICS`, `INTERACTION`, `TRIGGER`, `LIFECYCLE` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-2` | `sc-artoria-alt-2.forbid-noble-phantasm-when-low-mana` | none | `CARD_ACTION_SEMANTICS`, `COST_PAYMENT`, `MODIFIER`, `MOVEMENT`, `TRIGGER`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-3` | `sc-artoria-alt-3.noble-bloom` | `adjust_victory_points` | `RESOURCE_NUMERIC`, `INTERACTION`, `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE`, `BATTLE_RESULT` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-3` | `sc-artoria-alt-3.noble-bloom-extra-vp` | `adjust_victory_points` | `RESOURCE_NUMERIC`, `INTERACTION`, `TRIGGER`, `BATTLE_RESULT` |
| `servant.artoria-alt` | `servant.artoria-alt.skill.sc-artoria-alt-3` | `sc-artoria-alt-3.magic-resistance` | none | `INTERACTION`, `MODIFIER`, `POWER`, `MOVEMENT`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-1` | `sc-artoriac-1.true-name-release` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-1` | `sc-artoriac-1.residual-special-power-bonus` | none | `INTERACTION`, `MODIFIER`, `POWER`, `TRIGGER`, `LIFECYCLE` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-1` | `sc-artoriac-1.return-current-round-attack` | `move_card` | `CARD_ZONE`, `TARGET_SELECTION`, `INTERACTION`, `LIFECYCLE`, `HISTORY_USAGE`, `HIDDEN_INFORMATION`, `BATTLE_RESULT` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-2` | `sc-artoriac-2.pay-x-look-x-plus-two` | `look_at_deck_top`, `move_card`, `move_all_remaining` | `CARD_ZONE`, `TARGET_SELECTION`, `COST_PAYMENT`, `INTERACTION`, `LIFECYCLE`, `HIDDEN_INFORMATION` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-3` | `sc-artoriac-3.discard-public-and-power-formula` | `set_zone_visibility` | `INTERACTION`, `MODIFIER`, `TRIGGER`, `LIFECYCLE`, `HIDDEN_INFORMATION` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-3` | `sc-artoriac-3.conditional-true-name-release` | `reveal_information` | `INTERACTION`, `TRIGGER`, `LIFECYCLE`, `HIDDEN_INFORMATION` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-3` | `sc-artoriac-3.shuffle-discard-on-victory` | `shuffle_zone_into_deck` | `CARD_ZONE`, `INTERACTION`, `MODIFIER`, `TRIGGER`, `LIFECYCLE` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-4` | `sc-artoriac-4.unique-passive-luck-on-win` | none | `COST_PAYMENT`, `INTERACTION`, `TRIGGER`, `HISTORY_USAGE`, `BATTLE_RESULT` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-4` | `sc-artoriac-4.recon-gain-vp-and-move` | `adjust_victory_points`, `move_player` | `RESOURCE_NUMERIC`, `TARGET_SELECTION`, `INTERACTION`, `MOVEMENT`, `LIFECYCLE` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-5` | `sc-artoriac-5.unique-passive-luck-on-win` | none | `COST_PAYMENT`, `INTERACTION`, `TRIGGER`, `HISTORY_USAGE`, `BATTLE_RESULT` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-5` | `sc-artoriac-5.gain-mana-or-vp` | `branch` | `INTERACTION`, `LIFECYCLE` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-6` | `sc-artoriac-6.unique-passive-luck-on-win` | none | `COST_PAYMENT`, `INTERACTION`, `TRIGGER`, `HISTORY_USAGE`, `BATTLE_RESULT` |
| `servant.artoriac` | `servant.artoriac.skill.sc-artoriac-6` | `sc-artoriac-6.gain-vp-if-not-sole-winner` | `adjust_victory_points` | `RESOURCE_NUMERIC`, `INTERACTION`, `TRIGGER`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.drake` | `servant.drake.skill.sc-drake-1` | `sc-drake-1.draw` | `draw_cards` | `CARD_ZONE`, `TRIGGER`, `LIFECYCLE` |
| `servant.drake` | `servant.drake.skill.sc-drake-1` | `sc-drake-1.mount-summon` | `play_selected_cards` | `CARD_ACTION_SEMANTICS`, `TARGET_SELECTION`, `INTERACTION`, `POWER`, `LIFECYCLE`, `HIDDEN_INFORMATION` |
| `servant.drake` | `servant.drake.skill.sc-drake-2` | `sc-drake-2.reveal` | `reveal_information` | `TRIGGER`, `LIFECYCLE`, `HIDDEN_INFORMATION` |
| `servant.drake` | `servant.drake.skill.sc-drake-2` | `sc-drake-2.reward-and-move` | `branch`, `move_player` | `TARGET_SELECTION`, `INTERACTION`, `MOVEMENT`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.drake` | `servant.drake.skill.sc-drake-3` | `sc-drake-3.reveal` | `reveal_information` | `TRIGGER`, `LIFECYCLE`, `HIDDEN_INFORMATION` |
| `servant.drake` | `servant.drake.skill.sc-drake-3` | `sc-drake-3.movement-power` | none | `MOVEMENT`, `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE` |
| `servant.drake` | `servant.drake.skill.sc-drake-3` | `sc-drake-3.reverse-dash` | `movement_rule_override` | `MOVEMENT`, `TRIGGER` |
| `servant.drake` | `servant.drake.skill.sc-drake-3` | `sc-drake-3.plunder` | `adjust_victory_points` | `RESOURCE_NUMERIC`, `INTERACTION`, `MOVEMENT`, `LIFECYCLE`, `HISTORY_USAGE`, `BATTLE_RESULT` |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-1` | `sc-ereshkigal-1.battle-continuation` | `move_player` | `TARGET_SELECTION`, `INTERACTION`, `MOVEMENT`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-2` | `sc-ereshkigal-2.netherworld-protection` | `reverse_situation_and_event_power_modifiers` | `INTERACTION`, `MODIFIER`, `POWER`, `MOVEMENT`, `TRIGGER`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-2` | `sc-ereshkigal-2.gain-mana-on-deploy` | `adjust_mana` | `RESOURCE_NUMERIC`, `MOVEMENT`, `TRIGGER`, `BATTLE_RESULT` |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-2` | `sc-ereshkigal-2.self-exempt` | none | `MODIFIER`, `POWER`, `TRIGGER` |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-2` | `sc-ereshkigal-2.return-to-skill-zone` | `move_card` | `CARD_ZONE`, `TRIGGER`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-3` | `sc-ereshkigal-3.true-name-release` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `servant.ereshkigal` | `servant.ereshkigal.skill.sc-ereshkigal-3` | `sc-ereshkigal-3.blooming-netherworld` | `branch` | `INTERACTION`, `POWER`, `MOVEMENT`, `LIFECYCLE` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-1` | `sc-kintoki-1.true-name-release` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-1` | `sc-kintoki-1.ignore-skill-zone-mana-requirement` | none | `CARD_ACTION_SEMANTICS`, `MODIFIER`, `TRIGGER` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-1` | `sc-kintoki-1.ignore-situation-play-forbid` | none | `CARD_ACTION_SEMANTICS`, `MODIFIER`, `TRIGGER` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-1` | `sc-kintoki-1.once-per-game` | none | `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-2` | `sc-kintoki-2.true-name-release` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-2` | `sc-kintoki-2.ignore-skill-zone-mana-requirement` | none | `CARD_ACTION_SEMANTICS`, `MODIFIER`, `TRIGGER` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-2` | `sc-kintoki-2.ignore-situation-play-forbid` | none | `CARD_ACTION_SEMANTICS`, `MODIFIER`, `TRIGGER` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-2` | `sc-kintoki-2.once-per-game` | none | `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-3` | `sc-kintoki-3.true-name-release` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `servant.kintoki` | `servant.kintoki.skill.sc-kintoki-3` | `sc-kintoki-3.golden-eater` | `move_card`, `branch`, `pay_mana`, `move_card`, `branch` | `RESOURCE_NUMERIC`, `CARD_ZONE`, `TARGET_SELECTION`, `COST_PAYMENT`, `INTERACTION`, `RESULT_BINDING`, `MOVEMENT`, `LIFECYCLE`, `HIDDEN_INFORMATION`, `BATTLE_RESULT` |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-1` | `sc-tomoe-1.independent-action` | `adjust_victory_points` | `RESOURCE_NUMERIC`, `INTERACTION`, `LIFECYCLE` |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-1` | `sc-tomoe-1.penalty-on-defeat` | `adjust_victory_points` | `RESOURCE_NUMERIC`, `MODIFIER`, `TRIGGER`, `LIFECYCLE`, `HISTORY_USAGE`, `BATTLE_RESULT` |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-2` | `sc-tomoe-2.inferno-fire` | `create_status` | `INTERACTION`, `MODIFIER`, `POWER`, `MOVEMENT`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-2` | `sc-tomoe-2.double-terrain` | `create_modifier` | `INTERACTION`, `MODIFIER`, `POWER`, `LIFECYCLE`, `BATTLE_RESULT` |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-3` | `sc-tomoe-3.true-name-release` | `reveal_information` | `TRIGGER`, `HIDDEN_INFORMATION` |
| `servant.tomoe` | `servant.tomoe.skill.sc-tomoe-3` | `sc-tomoe-3.rain-of-fire` | `reduce_opponents_power` | `INTERACTION`, `MODIFIER`, `POWER`, `MOVEMENT`, `LIFECYCLE`, `BATTLE_RESULT` |

## Audit Limits

This matrix does not prove:

- full roster migration;
- Battle Winner acceptance;
- Flow Runtime ownership consolidation;
- full hidden information projection;
- modifier/power/lifecycle acceptance;
- Release Ready.

The only permitted direction claim is `PHASE_3_DIRECTION_REBASELINE_CANDIDATE`.
