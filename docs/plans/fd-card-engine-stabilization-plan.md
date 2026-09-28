# FD Card Engine Stabilization Plan

- Document Role: ACTIVE_PLAN
- Status: ACTIVE / BODY_INCOMPLETE
- Implementation Status: MAINLINE_DEFINED_BY_ACCEPTANCE_REFERENCE_ONLY
- Acceptance Status: No stabilization phase may be promoted without independent Gate A/B/C review.
- Parent: none
- Depends On: `docs/rules/FD-Game-Rules-Final.md`; `docs/plans/fd-rules-conformance-and-acceptance.md`; current audit facts in `docs/audits/`
- Consumed By: all card/runtime implementers
- Supersedes: older undocumented stabilization sequencing, if recovered later
- Last Verified: 2026-09-08

> Integration note, 2026-09-07: the original stabilization plan body is not present in this workspace. This file records the required Acceptance Reference so future stabilization phases do not redefine rule truth or release readiness locally.

## Acceptance Reference

Acceptance for every stabilization phase is governed by `docs/plans/fd-rules-conformance-and-acceptance.md`.

Document responsibilities:

| Document | Responsibility |
|---|---|
| `docs/rules/FD-Game-Rules-Final.md` | WHAT: canonical gameplay rules. |
| `docs/plans/fd-rules-conformance-and-acceptance.md` | HOW TO PROVE: Gate A, Gate B, Gate C, Reviewer workflow, release gate. |
| `docs/plans/fd-card-engine-stabilization-plan.md` | HOW TO MIGRATE / IMPLEMENT: stabilization sequencing only. |

Stabilization work may only declare `IMPLEMENTATION_COMPLETE_CANDIDATE`. Independent review is required before any phase, card cohort, flow, or release target is marked `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, or `E2E_VERIFIED`.

Phase-specific examples:

- Primitive registry work must satisfy relevant Gate A component conformance, not merely prove that a registry exists.
- Real card migration must satisfy Gate B scenario conformance for the selected Golden Card or rule combination.
- Frontend/runtime work must satisfy Gate C using the real client, server command, state mutation, event/projection path, and reconnect where relevant.
- Green regression tests are required evidence, but never sufficient by themselves for Release Ready.

## Phase Ownership

| Phase | Parent Plan | Required Subplan / Audit | Primary Acceptance Vehicle |
|---|---|---|---|
| Phase 3A | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/plans/fd-effect-result-binding-plan.md` | Golden Result-Binding Card |
| Phase 3B | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md` + `docs/audits/fd-skill-mechanic-family-matrix.md` | Mechanic Batch Gate A/B/C + representative Golden Cards |
| Phase 4A | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/audits/fd-flow-runtime-inventory.md` | Golden Flow 2 / Golden Flow 5 |
| Phase 4B/C | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/audits/fd-rule-interaction-matrix.md` | Golden Flow 3 / Golden Flow 5 |
| Phase 5 | `docs/plans/fd-card-engine-stabilization-plan.md` | Flow Inventory + ActionOffer design | Golden Flow 1 |

Phase labels define ownership and acceptance vehicle only. They do not declare phase completion.

## Current Phase 3 Direction

Phase 3 is rebaselined as a mechanic-family rollout, not a card-by-card pilot sequence.

Execution unit:

`Mechanic Family -> Primitive Contracts -> Compiler Support -> Runtime Registry -> Representative Cards -> Bulk Migration`

The controlling subplan is `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md`. The controlling family inventory is `docs/audits/fd-skill-mechanic-family-matrix.md`.

Previous selected batch:

`NEXT_MECHANIC_BATCH: RESOURCE_NUMERIC_CORE_DIRECT_ACTION`

Required scope:

- typed `adjust_mana`, `adjust_command_seals`, `adjust_victory_points` for the direct-action subset, with `pay_mana` limited to component-contract coverage unless a later Cost/Interaction batch selects it;
- numeric expression/result-envelope contract;
- compiler fail-closed schema;
- runtime primitive registry and semantic-form routing;
- 3-5 representative cards;
- one command spell browser Gate C path;
- reported reduction in direct-action legacy resource/seal/VP consumers.

`time-alter.action` is now `PHASE_3_REFERENCE_VERTICAL_PILOT`. It proves the production browser/server/projection/reconnect path for a typed mechanic route, but it must not become a permanent ability-id rollout pattern.

The remaining pilot allowlist is transitional only. As of the 2026-09-08 `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` implementation candidate, `command-spell.gain-mana` exited the allowlist and routed by executable semantic form. As of the 2026-09-08 `CARD_ZONE_CORE_DIRECT_ACTION` implementation candidate, `conversion-magic.preparation` and `time-alter.action` also exited ability-id pilot routing. The Phase 3 reference pilot allowlist is currently empty.

Current implementation-candidate evidence, 2026-09-08:

- Scope: `command-spell.gain-mana` on Gatou/Olga command spell cards plus Tomoe `sc-tomoe-1.independent-action`; no trigger, battle-result, hidden-choice, pending-payment, card-movement, lifecycle, modifier, or power-dependent resource abilities migrated.
- Authoring inventory: `docs/audits/fd-resource-numeric-core-direct-action-inventory.mjs` reports 18 RESOURCE_NUMERIC abilities from `data/authoring`, 3 eligible, 15 skipped with explicit skip reasons.
- Routing: `command-spell.gain-mana` no longer requires ability-id pilot routing; direct resources route by executable semantic form plus `phase_action` metadata. After the subsequent `CARD_ZONE_CORE_DIRECT_ACTION` implementation candidate, no Phase 3 reference vertical pilot allowlist entry remains.
- Gate A: implementer evidence covers primitive registration, direct positive/negative deltas, reviewer event envelope, invalid controller, invalid result field, command-seal underflow fail-closed, VP clamp behavior, rollback, unknown primitive, and bad numeric expression.
- Gate B: implementer evidence covers real `MatchSession.dispatchPlayerAction` for `command-spell.gain-mana` and Tomoe `sc-tomoe-1.independent-action`, with typed resource events and `effect_resolved` payloads that distinguish data-flow runtime from legacy `resolveEffect`.
- Gate C: implementer evidence covers command spell browser activation, WebSocket `expectedRevision`, server revalidation, state mutation, projection log envelope, reconnect, and stale replay rejection in `e2e/fd-command-spell-resource-core.spec.ts`.
- Metrics: direct-action legacy resource consumers 3 -> 0; new-runtime semantic-routed direct resource consumers 0 -> 3; dual-compatible migrated consumers 1 -> 0; skipped resource abilities remain 15.
- Evidence report: `docs/reports/2026-09-08-resource-numeric-core-direct-action-result.md`.

Current selected batch:

`NEXT_MECHANIC_BATCH: CARD_ZONE_CORE_DIRECT_ACTION`

Required scope:

- typed `move_all_remaining` and `play_selected_cards` for the two exact direct-action semantic matches below; `draw_cards` is covered only as the paired Time Alter companion effect;
- `conversion-magic.preparation` as the `move_all_remaining -> adjust_mana` Result Binding representative;
- `time-alter.action` as the `play_selected_cards -> draw_cards` migration exit from the reference vertical pilot;
- no `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, trigger, hidden/private look, pending payment, lifecycle, modifier, or full roster migration;
- standalone `draw_cards` direct action and standalone `move_card` direct action remain `NOT_VERIFIED` and are not routed by this slice;
- one representative browser Gate C path is sufficient for this batch.

Current implementation-candidate evidence, 2026-09-08:

- Authoring inventory: `docs/audits/fd-card-zone-core-direct-action-inventory.mjs` reports 8 card-zone abilities from `data/authoring`, 2 eligible, and 6 skipped with explicit skip reasons.
- Routing: `conversion-magic.preparation` and `time-alter.action` no longer require ability-id pilot routing; they route by executable semantic form. The Phase 3 reference pilot allowlist is empty after this slice.
- Gate A: implementer evidence covers primitive registration, exact semantic classifier positives, trigger/private/add/activate/close/bad-binding/direct-draw/direct-zone-move negatives, hookless `play_selected_cards` fail-closed, invalid result-field validation, and runtime rollback through the existing data-flow transaction.
- Gate B: implementer evidence covers real `MatchSession.dispatchPlayerAction` for Irisviel `conversion-magic.preparation` and Kiritsugu `time-alter.action`, both compiled from canonical authoring through the executable pack and resolved through data-flow without legacy fallback.
- Gate C: implementer evidence reuses one representative browser path for the batch: Kiritsugu `time-alter.action` in `e2e/fd-time-alter-core-primitive.spec.ts`, including browser activation, WebSocket `expectedRevision`, pending target reconnect, shared play batch placement, draw projection, and stale replay rejection. Irisviel Conversion Magic browser evidence remains supporting evidence but is not required as a second Gate C for the batch.
- Metrics: card-zone pilot ability-id routes 2 -> 0; exact direct card-zone legacy consumers 2 -> 0; new-runtime semantic-routed card-zone consumers 0 -> 2; dual-compatible migrated consumers 2 -> 0; skipped card-zone abilities remain 6.
- Evidence report: `docs/reports/2026-09-08-card-zone-core-direct-action-result.md`.

Current selected batch:

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_ADD_TO_ATTACK`

Required scope:

- typed `attach_card_to_player_attack` primitive for the exact Maiya `military.attach-support-shot` semantic form only;
- no normal `PLAY`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, broad Card Action migration, or roster JSON changes;
- the support card must exist before activation is legal, target selection must remain server-projected, and stale target replay must not duplicate the attachment.

Current implementation-candidate evidence, 2026-09-08:

- Authoring inventory: `docs/audits/fd-card-action-add-to-attack-inventory.mjs` reports 7 card-action semantic abilities from `data/authoring`, 1 eligible, and 6 skipped with explicit skip reasons.
- Routing: Maiya `military.attach-support-shot` routes by executable semantic form through `isAddToAttackDirectAction`; it does not use an ability-id pilot route. The Phase 3 reference pilot allowlist remains empty.
- Gate A: implementer evidence covers primitive registration, exact semantic classifier positive, wrong-cost/wrong-phase/self-target/missing-return/wrong-status/play/append-only negatives, required support-card activation fail-closed, and typed `attack_added` result/event payload.
- Gate B: implementer evidence covers real `MatchSession.dispatchPlayerAction` activation from compiled canonical authoring, pending target revalidation, support card movement to `attack_area`, `modeState.supportShotAttachments`, cannot-win status, and event/projection trace.
- Gate C: implementer evidence covers browser activation, WebSocket `expectedRevision`, pending target reconnect, server target selection, projection of the attached attack, stale replay rejection, and reconnect consistency in `e2e/fd-add-to-attack-card-action.spec.ts`.
- Metrics: legacy add-to-attack consumer count 1 -> 0 for the migrated exact representative; new-runtime semantic-routed add-to-attack count 0 -> 1; dual-compatible migrated add-to-attack count 1 -> 0; skipped card-action abilities remain 6.
- Evidence report: `docs/reports/2026-09-08-card-action-add-to-attack-result.md`.

Current selected batch:

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_PLAY`

Required scope:

- scoped PLAY contract for the exact Kiritsugu `time-alter.action` semantic form only: select one controller hand attack, play it face-down through shared `playBatch`, then draw one card;
- no `play_source_card`, variable/pending cost play, response-window play, Drake hidden/power/lifecycle play, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, `CLOSE`, or roster JSON changes;
- mandatory target availability must be checked before activation is offered, so a no-legal-hand-attack case fails closed before opening a target window.

Current implementation-candidate evidence, 2026-09-08:

- Authoring inventory: `docs/audits/fd-card-action-play-inventory.mjs` reports 7 card-action semantic abilities from `data/authoring`, 1 eligible, and 6 skipped with explicit skip reasons. Kayneth `volumen.extra-play` is counted as `separate_contract:play_source_card_response`, not as PLAY inheritance.
- Routing: Kiritsugu `time-alter.action` routes by executable semantic form through `isPlayActionDirectAction`; it does not use an ability-id pilot route. The Phase 3 reference pilot allowlist remains empty.
- Gate A: implementer evidence covers exact semantic classifier positives, wrong-phase/costed-play/missing-draw/face-up/hidden-target/non-hand/non-attack/play-source/add/activate/close negatives for Time Alter; `play_selected_cards` remains hook-fail-closed.
- Gate B: implementer evidence covers real `MatchSession.dispatchPlayerAction` activation from compiled canonical authoring for Time Alter, including mandatory hand-attack target availability, shared playBatch face-down attack placement, typed result events, draw companion, and no-legal-hand-attack fail-closed.
- Gate C: implementer evidence exists in `e2e/fd-time-alter-core-primitive.spec.ts`, covering browser activation, WebSocket `expectedRevision`, server revalidation, pending target reconnect, projection, reconnect consistency, and stale replay rejection.
- Metrics: scoped legacy play consumer count 1 -> 0 for the migrated exact representative; new-runtime semantic-routed PLAY count 0 -> 1; dual-compatible migrated PLAY count 1 -> 0; skipped card-action abilities remain 6.
- Evidence report: `docs/reports/2026-09-08-card-action-play-result.md`. Kayneth response-play evidence remains in `docs/reports/2026-09-08-card-action-play-source-response-result.md` under its separate contract.

Current selected batch:

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_ACTIVATE`

Required scope:

- scoped ACTIVATE contract for the exact Olga-Marie `astronomical-science.first-loss` semantic form only: forced trigger from `after_controller_first_loses_battle` marks a pending round-end activation, the formal `round_end` event activates an existing owned `skill`-zone card by `definitionId`, moves it from skill to field, and marks it active face-up;
- no `PLAY`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `CLOSE`, optional response timing, target selection, variable/pending payment, modifier/power follow-up, or roster JSON changes;
- target card must exist and not already be active before activation can resolve.

Current implementation-candidate evidence, 2026-09-08:

- Authoring inventory: `docs/audits/fd-card-action-activate-inventory.mjs` reports 7 card-action semantic abilities from `data/authoring`, 1 eligible, and 6 skipped with explicit skip reasons.
- Routing: Olga-Marie `astronomical-science.first-loss` routes by executable semantic form through `isActivateCardByIdTrigger`; it does not use an ability-id pilot route. The Phase 3 reference pilot allowlist remains empty.
- Gate A: implementer evidence covers primitive registration, exact semantic classifier positive, wrong-kind/wrong-trigger/missing-definition/targeted/costed/creates negatives, missing target fail-closed, already-active fail-closed, and typed `activatedCount` schema consumption.
- Gate B: implementer evidence covers real `processAbilityEvent` from compiled canonical authoring through `MatchSession`: first-loss records pending delayed activation without moving the card; formal `round_end` activates `特里斯墨吉斯忒斯之殇` from skill to field, writes active card state, emits `card_activated`, and records `effect_resolved(activate_card_by_id)`.
- Gate C: implementer evidence exists in `e2e/fd-olga-activate-card-action.spec.ts`, covering browser projection and reconnect after the server trigger has activated the card. There is no WebSocket command/stale replay for this exact trigger path because the activation is event-driven, not client-command-driven.
- Metrics: scoped legacy activate consumer count 1 -> 0 for the migrated exact representative; new-runtime semantic-routed activate count 0 -> 1; dual-compatible migrated activate count 1 -> 0; skipped card-action abilities remain 6.
- Evidence report: `docs/reports/2026-09-08-card-action-activate-result.md`.
- Known semantic dependency: the current authoring trigger remains `after_controller_first_loses_battle`, while runtime now splits the exact Olga ACTIVATE route into first-loss pending plus `round_end` consumption. Broader delayed trigger scheduling remains outside this slice.

Current selected batch:

`NEXT_MECHANIC_BATCH: CARD_ACTION_SEMANTICS_MINIMAL_CLOSE`

Required scope:

- scoped CLOSE contract for the exact Artoria Alter `sc-artoria-alt-2.angra-mainyu-embrace` semantic form only: residual `on_card_played` trigger, source card active face-up on the board, triggering visible played card has `宝具`, no targets/cost/creates, and one `close_source_card` effect;
- no targeted close, close-then-activate, `CREATE_AND_ACTIVATE`, normal `PLAY`, `ADD_TO_ATTACK`, response timing, hidden/private or face-down source identity, variable/pending payment, modifier/power follow-up, temporary dissolve, non-skill close destination, cleanup matrix, or roster JSON changes;
- the source close primitive must fail closed if the source card is missing, controlled by another player, off-board, face-down, inactive, or missing its compiled definition.

Current implementation-candidate evidence, 2026-09-08:

- Authoring inventory: `docs/audits/fd-card-action-close-inventory.mjs` reports 7 card-action semantic abilities from `data/authoring`, 1 eligible, and 6 skipped with explicit skip reasons.
- Routing: Artoria Alter `sc-artoria-alt-2.angra-mainyu-embrace` routes by executable semantic form through `isCloseSourceCardOnPlayedTrigger`; it does not use an ability-id pilot route. The Phase 3 reference pilot allowlist remains empty.
- Gate A: implementer evidence covers primitive registration, typed `closedCount` schema consumption, exact semantic classifier positive, wrong-kind/wrong-trigger/missing-source-zone/missing-played-card-attribute/targeted/costed/creates/extra-effect negatives, and runtime corrupted-source fail-closed.
- Gate B: implementer evidence covers real `MatchSession.dispatchPlayerAction` playing Artoria Alter's compiled canonical noble phantasm, triggering the compiled residual source-close ability, returning `黑化诅咒` from active attack area to skill, marking it inactive face-up, and emitting `source_card_closed` plus `effect_resolved(close_source_card)`.
- Gate C: implementer evidence exists in `e2e/fd-artoria-alt-close-card-action.spec.ts`, covering browser-opened remote room, WebSocket `expectedRevision`, server revalidation after noble play, projection, reconnect consistency, and stale replay rejection.
- Metrics: scoped legacy close consumer count 1 -> 0 for the migrated exact representative; new-runtime semantic-routed CLOSE count 0 -> 1; dual-compatible migrated CLOSE count 1 -> 0; skipped card-action abilities remain 6.
- Evidence report: `docs/reports/2026-09-08-card-action-close-result.md`.

Normalization status and runtime acceptance remain separate:

- `PARTIALLY_NORMALIZED`
- `NORMALIZED_BUT_RUNTIME_UNVERIFIED`
- `COMPONENT_VERIFIED`
- `SCENARIO_VERIFIED`
- `E2E_VERIFIED`

Complete JSON or use of a verified primitive does not automatically promote a card, flow, or family.

## Current Phase 3A Slice

- Scope: transitional production bridge plus the first real-card-text-driven result-binding contract only.
- Implementation claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`.
- Gate A: implementer evidence recorded; independent review pending.
- Gate B: complete canonical Kintoki Golden Eater candidate evidence recorded, including both card moves, optional 7-mana payment, both bound VP awards, insufficient-payment rejection, and staged rollback; independent review pending.
- Gate C: complete Golden Eater candidate evidence recorded in `e2e/fd-golden-eater-result-binding.spec.ts`, including browser activation, both target stages, reconnect while pending, projection, insufficient-payment rejection, and stale replay rejection; independent review pending.
- Legacy boundary: non-Phase-3A abilities continue through `executeAbility` / `resolveEffect`; this is intentionally retained for migration and is not release evidence.
- Evidence inventory: `docs/audits/fd-skill-primitive-conformance-matrix.md`, `packages/rules/tests/regression/production-resolution-bridge.test.ts`, and `e2e/fd-golden-eater-result-binding.spec.ts`.

## Current Phase 3A Core Primitive Pilot Slice

- Scope: minimum shared primitive expansion originally covered `conversion-magic.preparation`, `time-alter.action`, and `command-spell.gain-mana`. As of the 2026-09-08 Resource/Numeric direct-action slice, `command-spell.gain-mana` has migrated out of ability-id pilot routing and is tracked under the Resource/Numeric batch below.
- Implementation claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`.
- Gate A: implementer evidence recorded for typed `adjust_mana`, `adjust_command_seals`, `draw_cards`, `move_all_remaining`, and `play_selected_cards` primitive registration/result schemas, invalid bound field rejection, hookless `play_selected_cards` fail-closed, and runtime rollback after a corrupted later node; independent review pending.
- Gate B: implementer evidence recorded in `packages/rules/tests/regression/phase-3a-core-primitives.test.ts` for canonical source JSON compiled through content-library/executable definitions and executed in real `MatchSession` dispatch for Irisviel, Kiritsugu, and Gatou command spell; independent review pending.
- Gate C: partial implementer evidence recorded for Kiritsugu `time-alter.action` in `e2e/fd-time-alter-core-primitive.spec.ts`, including browser activation, WebSocket `expectedRevision`, pending target reconnect, server-projected state mutation, and stale replay rejection. Partial implementer evidence is also recorded for Irisviel `conversion-magic.preparation` in `e2e/fd-conversion-magic-core-primitive.spec.ts`, including browser activation, WebSocket `expectedRevision`, hand-to-discard movement, mana gain from actual moved count, reconnect consistency, and stale replay rejection. `command-spell.gain-mana` Gate C candidate evidence now belongs to the Resource/Numeric direct-action slice.
- Legacy boundary: the runtime intentionally uses explicit data-flow syntax plus a narrow pilot allowlist. Non-pilot draw/play/mana/seal effects remain on legacy `resolveEffect`; this avoids accidental full-card-pool migration before each card has acceptance coverage.
- Evidence inventory: `packages/rules/tests/regression/phase-3a-core-primitives.test.ts`, `packages/rules/tests/regression/resolution-dataflow.test.ts`, `e2e/support/build-time-alter-snapshot.ts`, `e2e/fd-time-alter-core-primitive.spec.ts`, `docs/reports/2026-09-08-time-alter-core-primitive-gate-c-result.md`, `e2e/support/build-conversion-magic-snapshot.ts`, `e2e/fd-conversion-magic-core-primitive.spec.ts`, and `docs/reports/2026-09-08-conversion-magic-core-primitive-gate-c-result.md`.

## Current Phase 3B Slice

- Scope: second Golden Card candidate only, Artoria Caster `servant.artoriac.skill.sc-artoriac-1` `选王剑`.
- Implementation claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`.
- Gate A: implementer evidence recorded for modifier/lifecycle semantic survival, compiler fail-closed invalid `sourceCard` reference, unsupported modifier rule, invalid round-count lifecycle, source-closed negative, and cleanup/expiration negative; independent review pending.
- Gate B: implementer evidence recorded for MatchSession play of `选王剑`, ongoing modifier installation, power calculation on another special attack, battle participant power trace, battle-stage return target, source-closed removal, and duration cleanup; independent review pending.
- Gate C: implementer evidence recorded in `e2e/fd-artoriac-sword-modifier-lifecycle.spec.ts`, including browser `play_card` with expected revision, server projection of ongoing modifier, stale replay rejection without duplicate modifier, browser battle settlement power projection, reconnect, and browser-driven cleanup expiration; independent review pending.
- Legacy boundary: `选王剑` still uses the transitional `executeAbility` / `installOngoing` / `cleanupOngoing` / `calculateCardPower` shared owner, not the Phase 3A result-binding primitive registry. Extended Effects and card-level `powerModifiers` remain secondary runtime paths for other cards and are not evidence for this Golden Card.
- Evidence inventory: `packages/rules/tests/regression/artoriac-sword-modifier-lifecycle.test.ts`, `e2e/fd-artoriac-sword-modifier-lifecycle.spec.ts`, and `docs/reports/2026-09-08-artoriac-sword-modifier-lifecycle-result.md`.

## Current Golden Flow 1 Slice

- Scope: complete Action Phase candidate only, from action ability window through normal move/pass, post-move ability window, staged normal hand-card batch including zero/one/two-card shortage matrix, post-play ability window, and next priority handoff.
- Implementation claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`.
- Gate A: implementer evidence recorded for strict Action Phase sub-state sequencing, normal movement command exposure, staged hand-card batch commit, zero/one/two hand-card shortage matrix, movement-after-play denial, play-before-move denial, engaged movement denial, playable-hand-batch skip rejection, two-hand early confirm rejection, skill-zone non-obligation, and third attack rejection; independent review pending.
- Gate B: implementer evidence recorded for MatchSession path `syncActionTurnFlow -> getLegalActions -> dispatchAbilityCommand -> movePlayer/playBatch -> passPriority -> next priority player`; independent review pending.
- Gate C: implementer evidence recorded in `e2e/fd-golden-flow-1-action-phase.spec.ts`, including browser ability-window decline via `client:end_turn` with `expectedRevision`, browser `normal_move`, reconnect after movement, staged two-card hand batch, zero/one/two hand-card shortage matrix through server projection, stale replay rejection without duplicate movement/card placement, play-skip rejection for playable hand cards, skill-zone non-obligation, and final projection handoff to the next priority player; independent review pending.
- Legacy boundary: this is currently scoped by `modeState.strictActionFlow === true`. Non-strict MatchSession/action interpreter behavior, `core/game-loop.ts` action input, and legacy single-card `play_card` flows are intentionally retained until a later global FlowEngine migration.
- Evidence inventory: `packages/rules/tests/regression/golden-flow-1-action-phase.test.ts`, `e2e/support/build-golden-flow-1-snapshot.ts`, `e2e/fd-golden-flow-1-action-phase.spec.ts`, and `docs/reports/2026-09-08-golden-flow-1-action-phase-result.md`.

## Mandatory Inputs Before Executing Any Phase

1. `docs/FD-DOCUMENT-ROADMAP.md`
2. `docs/rules/FD-Game-Rules-Final.md`
3. `docs/plans/fd-rules-conformance-and-acceptance.md`
4. `docs/plans/fd-card-engine-stabilization-plan.md`
5. Current phase related subplan
6. Current phase latest related audit
7. Current phase Golden Acceptance Contract

Open governance gap:

- Recover or reintroduce the full historical stabilization plan body if it exists outside this workspace, then keep this Acceptance Reference section without weakening the baseline above.
