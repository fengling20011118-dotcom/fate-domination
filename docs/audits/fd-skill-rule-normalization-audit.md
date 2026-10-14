# FD Skill Rule Normalization Audit

Date: 2026-09-08

Scope: independent review of current authoring skill normalization for 7 Masters and 7 Servants in `data/authoring`, and the directly related compiler/runtime normalization path.

This audit did not modify production runtime code or card JSON. It did not run broad static tests. The only directed executable check was `npm run content:validate`.

## Executive Summary

Current Skill JSON has not yet formed a fully general Rule DSL. It has formed a useful authoring schema plus a permissive scanner/loader that can currently load 92 abilities with 0 loader `unsupported` entries, and the content pack validates with 7 Masters, 7 Servants, 20 Events, and 0 blocking issues.

That is not equivalent to semantic normalization. Most real abilities still execute through the legacy `executeAbility -> resolveEffect` void-mutation path or through `extended-effects.ts`, whose file header explicitly scopes it as "Extended effect handlers for 5 servants". The current runtime therefore still depends heavily on card-shaped handler names, loose `modeState`, untyped `as any` side state, and partial primitive semantics.

P0 update: `reduce_opponents_power` for Tomoe previously contained a direct semantic simplification that assumed the opponent had no terrain. The 2026-09-08 minimal repair slice now checks canonical `modeState.terrainAssignments`, fails closed on corrupt terrain assignment state, and has a focused positive/negative regression. This remains a compatibility-runtime implementation, not a roster-wide Phase 3 migration.

Biggest P1: only one observed real ability uses the Phase 3A result-binding graph shape (`sc-kintoki-3.golden-eater`). The other 91 abilities are not migrated to typed result envelopes, so effects that should bind to actual prior results mostly rely on mutation side effects, re-query, or host/directive state.

Conclusion: not ready for bulk roster migration under the acceptance standard in `docs/plans/fd-rules-conformance-and-acceptance.md`.

## Audit Inputs

- `docs/rules/FD-Game-Rules-Final.md`
- `docs/plans/fd-rules-conformance-and-acceptance.md`
- `docs/plans/fd-card-engine-stabilization-plan.md`
- `docs/plans/fd-effect-result-binding-plan.md`
- `docs/FD-DOCUMENT-ROADMAP.md`
- `docs/audits/fd-card-runtime-architecture-audit.md`
- `docs/audits/fd-rule-conformance-matrix.md`
- `packages/rules/src/ability/loader.ts`
- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/extended-effects.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/match-session.ts`
- `packages/rules/src/core/combat-resolver.ts`
- Current `data/authoring/masters/*.json`
- Current `data/authoring/servants/*.json`

Directed command run:

```text
npm run content:validate
```

Result:

```text
7 masters, 7 servants, 20 events, 0 blocking issues
```

## Skill Source Inventory

Inventoried source files:

| Archive | Cards | Abilities | Raw execution modes |
|---|---:|---:|---|
| `master.gatou.json` | 2 | 5 | automatic 5 |
| `master.irisviel.json` | 2 | 2 | automatic 2 |
| `master.kayneth.json` | 4 | 6 | automatic 6 |
| `master.kiritsugu.json` | 4 | 4 | automatic 4 |
| `master.maiya.json` | 2 | 4 | automatic 4 |
| `master.olga-marie.json` | 4 | 10 | automatic 10 |
| `master.shinji.json` | 4 | 4 | automatic 4 |
| `servant.achilles.json` | 3 | 4 | automatic 4 |
| `servant.artoria-alt.json` | 3 | 9 | automatic 9 |
| `servant.artoriac.json` | 6 | 13 | automatic 13 |
| `servant.drake.json` | 3 | 8 | raw missing 5, automatic 3 |
| `servant.ereshkigal.json` | 3 | 7 | automatic 7 |
| `servant.kintoki.json` | 3 | 10 | automatic 10 |
| `servant.tomoe.json` | 3 | 6 | automatic 6 |

Raw inventory: 14 archives, 46 cards, 92 abilities.

Loader inventory: `loadAuthoringJson` reports 46 cards, 92 abilities, 0 report entries, and normalizes all 92 loaded abilities to `automatic`. Drake's 5 raw missing `execution.mode` entries are defaulted by loader to `automatic`; this is a structural P2 because explicitness is lost at source review time, even though it is not a loader blocker.

## Source→Authoring→Compiler→Runtime Chain

Current chain has four different confidence levels:

| Layer | Finding |
|---|---|
| Source JSON | All 14 target archives are readable. 92 abilities are present. |
| Loader | Scanner allows all current mechanics and reports 0 unsupported entries. |
| Executable content validation | `npm run content:validate` passes with 0 blocking issues. |
| Runtime semantics | Not fully normalized. Most abilities still use legacy void effect resolution or extended handlers. |

The acceptance plan requires canonical card text to survive as executable trigger, requirement, cost, target, effect, modifier, lifecycle, history, event, and result-binding behavior. Current compiler semantic-survival checks preserve fields, but preservation of fields is not proof that the runtime has a general primitive with verified semantics.

## Ability Semantic Model

The authoring model is expressive enough to represent many card texts. The runtime model is still split:

- Core interpreter switch handles common effects such as draw, play selected cards, reveal, move card, move all remaining, adjust mana, command seals, VP, move player, shuffle, create card, and create modifier.
- Phase 3A `resolution-dataflow.ts` supplies typed result envelopes, but only for a small primitive registry.
- `extended-effects.ts` hosts many card-shaped operations for five-servant and master additions.

This is a hybrid model, not yet a unified general Rule DSL.

## Timing/Trigger Findings

`loader.ts` currently uses an open string allowlist for triggers. It includes relevant current triggers such as `on_use_declared`, `on_card_played`, `after_battle_result_determined`, `after_controller_wins_battle`, `after_controller_loses_battle`, `after_battle_ended`, `after_player_deployed_to_battlefield`, `game_start`, `after_controller_first_loses_battle`, and `before_situation_or_event_resolves`.

Risk: trigger existence in the allowlist does not prove canonical ordering, uniqueness arbitration, hidden passive reveal timing, or response-window sequencing. This remains `PARTIALLY_NORMALIZED` unless covered by specific Gate B/C evidence.

## Action Semantic Findings

The interpreter now has an explicit play-rules version path and defaults to `explicit-v1`. This is better than legacy heuristic classification. However, action semantics still include transitional paths:

- normal play, skill-zone play, effect play, and source-card play are not all modeled by one typed action primitive;
- extra play/add-to-attack/directive style abilities are spread across core effects, extended effects, and `modeState`;
- `advanceAbilityPhase` refuses pending decisions/windows, but broad UI/runtime decision completion remains outside this audit.

## Requirement Findings

The loader can scan many requirement nodes, including boolean/formula/resource/location/card-state predicates. Requirements are not currently represented as a closed semantic registry with independent primitive contracts. Some extended conditions return `false` by default in `extended-effects.ts`, while the interpreter fallback can conflate recognized-but-unmet with unsupported in some contexts.

Status: mostly `PARTIALLY_NORMALIZED`.

## Target Findings

Target schema supports `card_instance`, `location`, `choice`, and `player`. Runtime target resolution performs server-side validation and can open pending decisions. This is a useful base.

Remaining gaps:

- target constraints are not a closed canonical registry;
- some target reference resolution uses suffix/id matching;
- many extended operations operate through side state or directives rather than typed target/result envelopes;
- result-sensitive targets are not consistently bound to prior effect results.

## Cost Findings

Core cost support exists for mana payment. Optional effect cost supports only `pay_mana`. Kintoki Golden Eater is the strongest current example because the optional 7 mana branch is in the Phase 3A data-flow shape.

Remaining gap: costs are not consistently typed result-producing primitives across all card texts, especially where a paid cost controls subsequent effects.

## Effect Primitive Registry Findings

Current Phase 3A typed result primitive registry supports:

- `remove_advantage_position`
- `move_card`
- `pay_mana`
- `adjust_victory_points`
- `noop`
- `fail_invariant`

Current real-card effect inventory contains many more effect categories:

- resource and seal mutation: `adjust_mana`, `adjust_command_seals`
- card flow: `draw_cards`, `play_selected_cards`, `play_source_card`, `move_all_remaining`, `shuffle_zone_into_deck`, `create_card`
- information: `reveal_information`, `set_zone_visibility`, `look_at_deck_top`, `look_at_match_deck_bottoms`
- movement and battlefield: `move_player`, `movement_rule_override`, `deployment_rule_override`
- modifiers/status: `create_modifier`, `create_status`, `terrain_multiplier`, `soul_drag_power_bonus`, `reverse_situation_and_event_power_modifiers`
- replacement/directives: `replace_card_in_deck`, `record_master_directive`, `activate_card_by_id`, `false_attendant_book_replacement`
- attachment/ownership/reward: `attach_card_to_player_attack`, `append_only_rule`, `transfer_vp_to_owner`
- branch/control: `branch`, `swap_revealed_with_deck_bottom`, `transform_to_return_silence_on_loss`, `return_silence_battle_start`

Most of these are not in the typed result primitive registry.

## Result Binding Findings

Result Binding required count: at least 91 of 92 abilities still require review/migration before they can be claimed as generally normalized. Only one observed real ability, `sc-kintoki-3.golden-eater`, uses the Phase 3A result-binding/data-flow shape.

This count is intentionally strict:

- `NORMALIZED_BUT_RUNTIME_UNVERIFIED`: 1 ability (`sc-kintoki-3.golden-eater`)
- All other abilities either run through core legacy void effects, extended handlers, or have no independent evidence of typed result envelopes.

The result-binding infrastructure is real and valuable, but current roster content has not broadly adopted it.

## Modifier/Lifecycle Findings

Modifier and lifecycle support exists but is split across:

- ability lifecycle fields;
- `runtime.ongoingEffects`;
- `modeState` stores;
- `activeStatuses`;
- card-level `powerModifiers`;
- combat resolver ad hoc reads.

This is not yet a single lifecycle owner model. Cleanup and source-card closure are implemented in places, but many modifier-like effects still write loose state.

## Power Modifier Findings

Power modification remains one of the highest-risk areas:

- `calculateCardPower` reads card-level `powerModifiers`;
- `combat-resolver.ts` reads `modeState` terrain/status/reversed modifier stores;
- `extended-effects.ts` installs modifiers through `as any`;
- `reduce_opponents_power` now checks terrain assignments for Tomoe's `opponent_has_no_terrain` predicate, but still lives in the Extended Effects compatibility runtime.

Status: one P0 semantic mismatch plus broad `LEGACY_SPECIAL_CASE`/`PARTIALLY_NORMALIZED` coverage.

## Usage/History Findings

The runtime tracks some per-round/per-game usage, played rounds, staged attacks, movement metrics, and consecutive play rounds. However, history is not yet represented as a closed DSL primitive family. Formula variables such as `consecutive_play_rounds` and movement metrics are supported by interpreter-specific server metrics.

Status: `PARTIALLY_NORMALIZED`.

## Hidden Information/True Name Findings

True name reveal/hide has dedicated support in loader visibility defaults and runtime reveal state. Hidden information projections exist, but current architecture documents still identify multiple projection and visibility paths. Hidden passive reveal timing requires more Gate B/C evidence before promotion.

Status: `PARTIALLY_NORMALIZED`.

## Compiler Semantic Preservation Matrix

| Dimension | Current preservation | Runtime semantic proof |
|---|---|---|
| Ability id/kind/printed clause | Preserved by executable compiler checks | Not sufficient alone |
| Activation/trigger | Preserved and scanned | Ordering/window proof incomplete |
| Conditions | Preserved and scanned | Mixed core/extended semantics |
| Targets | Preserved and scanned | Candidate validation exists; not all target semantics typed |
| Effects | Preserved and scanned | Mostly legacy void or extended handlers |
| Rule modifiers | Preserved and scanned | Lifecycle ownership split |
| Creates/lifecycle | Preserved and scanned | Some untyped side state |
| Cost | Preserved and scanned | Pay mana support exists; broad result binding missing |
| Visibility | Preserved and scanned | Hidden projection evidence incomplete |
| Result binding | Validated only when Phase 3A syntax appears | Only one observed real ability uses it |

## Fail-Closed Findings

Positive:

- Core interpreter rejects many unsupported conditions, constraints, formula operations, destinations, costs, and effects.
- `resolution-dataflow.ts` validates unregistered primitives, invalid bindings, future bindings, duplicate bindings, invalid fields, wrong expression types, and unsafe branch bindings.
- Executable compiler rejects loader reports and certain unsupported modifier/lifecycle/reference shapes.

Negative:

- `extended-effects.ts` default logs `Unknown extended effect type` and returns instead of always failing closed.
- Loose `payload` is accepted by loader and merged into master directives.
- Raw `modeState` and `as any` side-state writes bypass typed contracts.

## Card-specific Runtime Hardcodes

Observed runtime/card-shaped dependencies include:

- `extended-effects.ts` file-level scope explicitly for 5 servants.
- Master adapter operations such as `record_master_directive`, `create_independent_deck`, `draw_from_independent_deck`, `activate_card_by_id`, `false_attendant_book_replacement`.
- Runtime identity/card references such as Sakura replacement and fallback servant pool logic.
- Target reference suffix matching in interpreter/executable compilation paths.
- Client-side display overrides for some definitions are out of production rules scope but confirm parallel representation pressure.

The runtime still heavily depends on card-specific or card-shaped handlers.

## Full Skill Structural Audit

Status counts over 92 abilities:

| Status | Count |
|---|---:|
| `NORMALIZED_VERIFIED` | 0 |
| `NORMALIZED_BUT_RUNTIME_UNVERIFIED` | 1 |
| `PARTIALLY_NORMALIZED` | 55 |
| `SEMANTIC_MISMATCH` | 0 |
| `LEGACY_SPECIAL_CASE` | 36 |
| `NOT_VERIFIED` | 0 |

`automatic` is not used as a final audit status. It is only a loader execution mode.

## Deep Semantic Audit

Representative high-risk abilities:

| Ability | Status | Reason |
|---|---|---|
| `sc-tomoe-3.rain-of-fire` | `LEGACY_SPECIAL_CASE` | 2026-09-08 repair checks `opponent_has_no_terrain` against canonical terrain assignment state and records Tomoe as the skill modifier source; still handled by Extended Effects compatibility runtime. |
| `sc-kintoki-3.golden-eater` | `NORMALIZED_BUT_RUNTIME_UNVERIFIED` | Best current result-binding candidate; still implementer-evidence/transitional bridge, not independently promoted here. |
| `sc-achilles-1.gale-advance` | `LEGACY_SPECIAL_CASE` | Uses extended random discard and opponent power zeroing. |
| `chaldeas.swap-before-resolve` | `LEGACY_SPECIAL_CASE` | Uses match-deck bottom swap through extended handler/side state. |
| `false-attendant-book.first-empty-seals` | `LEGACY_SPECIAL_CASE` | Identity replacement is card/data dependent and side-effectful. |
| `support-shot.suppress` | `LEGACY_SPECIAL_CASE` | Uses terrain multiplier and VP transfer extended handlers. |
| `sc-ereshkigal-3.blooming-netherworld` | `LEGACY_SPECIAL_CASE` | Uses card existence plus created power modifier path outside typed result registry. |

## Golden Skill Candidates

Strongest current candidates:

1. `sc-kintoki-3.golden-eater`: best candidate for result binding, optional pay window, staged target selection, and rollback proof.
2. `conversion-magic.preparation`: small candidate for typed `move_all_remaining` plus `adjust_mana`.
3. `time-alter.action`: candidate for `play_selected_cards` plus `draw_cards` as typed result primitives.
4. `sc-artoriac-2.pay-x-look-x-plus-two`: candidate for paid variable cost, look result zone, move selected, and move remaining.
5. `sc-tomoe-3.rain-of-fire`: repaired P0 mismatch candidate; keep as a power-layer regression until it is migrated out of Extended Effects.

## Skill Normalization Status Matrix

Per-archive counts:

| Archive | `NORMALIZED_VERIFIED` | `NORMALIZED_BUT_RUNTIME_UNVERIFIED` | `PARTIALLY_NORMALIZED` | `SEMANTIC_MISMATCH` | `LEGACY_SPECIAL_CASE` |
|---|---:|---:|---:|---:|---:|
| `master.gatou` | 0 | 0 | 1 | 0 | 4 |
| `master.irisviel` | 0 | 0 | 1 | 0 | 1 |
| `master.kayneth` | 0 | 0 | 2 | 0 | 4 |
| `master.kiritsugu` | 0 | 0 | 1 | 0 | 3 |
| `master.maiya` | 0 | 0 | 1 | 0 | 3 |
| `master.olga-marie` | 0 | 0 | 2 | 0 | 8 |
| `master.shinji` | 0 | 0 | 3 | 0 | 1 |
| `servant.achilles` | 0 | 0 | 2 | 0 | 2 |
| `servant.artoria-alt` | 0 | 0 | 7 | 0 | 2 |
| `servant.artoriac` | 0 | 0 | 12 | 0 | 1 |
| `servant.drake` | 0 | 0 | 6 | 0 | 2 |
| `servant.ereshkigal` | 0 | 0 | 5 | 0 | 2 |
| `servant.kintoki` | 0 | 1 | 9 | 0 | 0 |
| `servant.tomoe` | 0 | 0 | 3 | 1 | 2 |

## P0/P1/P2 Issues

### P0

1. No active P0 semantic-loss item is currently recorded in this audit after the 2026-09-08 Tomoe repair. The remaining Tomoe risk is ownership: it still executes through Extended Effects rather than a Phase 3 primitive registry.

### P1

1. Result binding is not generalized. Only one observed real ability uses the Phase 3A data-flow shape; 91 abilities remain outside typed result envelopes.
2. Extended handlers are card-shaped and side-effectful. 35 abilities use effects or conditions that route through extended/card-shaped logic.
3. Modifier/lifecycle ownership is split across `ongoingEffects`, `modeState`, `activeStatuses`, and card-level `powerModifiers`.
4. Fail-closed is inconsistent because extended effects can warn and continue for unknown effect types.

### P2

1. Drake source JSON has 5 abilities without explicit raw `execution.mode`, later defaulted by loader.
2. Loader accepts broad `payload`, which makes structural scanning weaker than semantic validation.
3. Trigger and target registries are string allowlists, not closed executable primitive contracts.
4. Some current evidence remains implementer-supplied and should not be promoted to independent `NORMALIZED_VERIFIED`.

## Missing Primitive Categories

The next missing general primitive categories are:

- typed draw/shuffle/look/move-all result envelopes;
- typed mana and command-seal mutation result envelopes;
- typed play/add-to-attack/source-play primitives;
- typed movement override and deployment override primitives;
- typed event/situation replacement and before-resolve swap primitives;
- typed independent deck creation/draw primitives;
- typed identity replacement primitive with explicit source, target, and fallback failure behavior;
- typed status/modifier lifecycle primitive with one owner model;
- typed terrain and external-effect modifier primitive;
- typed attachment and VP transfer primitives;
- typed random selection primitive using deterministic match RNG;
- typed hidden-information reveal/look projection primitive.

## Recommended Next Normalization Slice

Smallest next slice:

1. Promote `adjust_mana`, `adjust_command_seals`, `draw_cards`, `move_all_remaining`, and `play_selected_cards` into Phase 3A typed result primitives.
2. Migrate one small Master and one small Servant ability using those primitives:
   - `conversion-magic.preparation`
   - `time-alter.action`
   - `command-spell.gain-mana`
4. Add directed component tests only for those primitives and their negative cases.

This slice improves real match readiness without touching the entire roster.

## NOT VERIFIED Items

Not verified in this audit:

- full 11-round browser E2E;
- live UI pending-decision/payment/response window behavior;
- full hidden-information projection chain;
- all battle/scoring interactions with these 92 abilities;
- all lifecycle cleanup ordering;
- all generated client display behavior;
- all historical tests claimed by other agents;
- all non-target roster content outside current 7 Masters and 7 Servants.

## Final Answer To Core Question

Current Skill JSON is not yet a fully general Rule DSL. It is a structurally useful authoring layer with broad loader acceptance, a partial core interpreter, one real result-binding candidate, and many legacy/card-shaped runtime bridges. The system has enough foundation to continue normalization, but it is not ready for bulk roster migration without a focused primitive-by-primitive migration and independent verification.
