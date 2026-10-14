# FD Golden Card and Flow Acceptance Plan

- Document Role: SUBPLAN
- Status: ACTIVE
- Implementation Status: GOLDEN_FLOW_1_IMPLEMENTATION_COMPLETE_CANDIDATE / GOLDEN_FLOW_2_IMPLEMENTATION_COMPLETE_CANDIDATE / GOLDEN_EATER_GATE_C_IMPLEMENTATION_COMPLETE_CANDIDATE / OTHER_FLOWS_CONTRACTS_DEFINED
- Acceptance Status: No Golden Flow or Golden Card is `E2E_VERIFIED`; Golden Flow 1, Golden Flow 2, and the complete Golden Eater candidate have implementer-supplied Gate C evidence pending independent review.
- Parent: `docs/plans/fd-card-engine-stabilization-plan.md`
- Depends On: `docs/rules/FD-Game-Rules-Final.md`; `docs/plans/fd-rules-conformance-and-acceptance.md`; `docs/audits/fd-rule-conformance-matrix.md`; `docs/audits/fd-rule-interaction-matrix.md`
- Consumed By: implementers and independent reviewers selecting Golden Card / Golden Flow slices
- Supersedes: none
- Last Verified: 2026-09-07

- Date: 2026-09-07
- Acceptance baseline: `docs/plans/fd-rules-conformance-and-acceptance.md`
- Canonical rules: `docs/rules/FD-Game-Rules-Final.md`
- Rule matrix: `docs/audits/fd-rule-conformance-matrix.md`
- Interaction matrix: `docs/audits/fd-rule-interaction-matrix.md`

This plan defines candidates and contracts only. It does not promote any card or flow to `E2E_VERIFIED`.

## Phase 3 Mechanic-Family Acceptance Note

Phase 3 Golden evidence now serves the mechanic-family rollout in `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md`.

Gate C validates representative production mechanic paths, not every bulk-migrated card. A bulk-migrated ability may inherit a representative Gate C only when it uses the same accepted executable semantic form and does not introduce new interaction, hidden information, reconnect, lifecycle, source-close, domain-action, battle-power, battle-winner, or result-dependent semantics.

Historical note: `time-alter.action` was previously classified as `PHASE_3_REFERENCE_VERTICAL_PILOT`. As of the 2026-09-08 `CARD_ZONE_CORE_DIRECT_ACTION` implementation candidate, it exits ability-id pilot routing and is governed by exact semantic-form routing for `play_selected_cards` plus `draw_cards`.

## Golden Card Candidates

| Category | Candidate | Why It Is Suitable | Rule IDs Covered | Key Primitives / Owners | Required Evidence |
|---|---|---|---|---|---|
| A. Multi Effect + Result Binding | Kintoki `servant.kintoki.skill.sc-kintoki-3` Golden Eater complete canonical candidate | Both card moves bind actual `movedCount`; the optional second branch binds typed 7-mana payment and settles in a separate server target stage. | FD-RESULT-BINDING-001, FD-ABILITY-001, FD-VP-001 | Resolution Data-flow, Executable Compiler, transitional Ability Interpreter bridge | Gate A typed results/compiler negatives; Gate B complete MatchSession branches and rollback; Gate C browser activation/selection, pending reconnect, payment, projection, insufficient-payment and stale-replay evidence; independent review required. |
| B. Modifier + Lifecycle | Artoria Caster `servant.artoriac.skill.sc-artoriac-1` `选王剑` implementation-complete candidate | Residual modifier lasts across current and next round, then cleanup matters. | FD-RESIDUAL-001, FD-CLOSE-001, FD-POWER-001, FD-ROUND-CLEANUP-001 | Ability Interpreter `installOngoing`, `cleanupOngoing`, Combat Resolver, MatchSession projection/log bridge | Gate A lifecycle/modifier semantic survival and compiler negatives; Gate B MatchSession residual/power/source-close/cleanup; Gate C browser play, expectedRevision, stale rejection, battle power projection, cleanup, reconnect; independent review required. |
| C. Multi-target / Interaction | Artoria Caster `servant.artoriac.skill.sc-artoriac-2` `选定之杖` | X cost, private look, target choice, and pending decision make it a strong interaction contract. | FD-ABILITY-001, FD-HIDDEN-001, FD-PROJECTION-001, FD-RESULT-BINDING-001 | Ability Interpreter target/payment runtime, Projection | Gate A target/payment negatives; Gate B MatchSession private choice; Gate C browser payment, target, stale/replay rejection, reconnect. |
| D. Residual + Power | Tomoe `servant.tomoe.skill.sc-tomoe-2` / `sc-tomoe-3` | Terrain doubling and opponent power reduction stress power layers and source duration. | FD-POWER-001, FD-RESIDUAL-001, FD-BATTLE-001 | Ability Interpreter, Extended Effects, Combat Resolver | Gate A power layer trace; Gate B battle scenario; Gate C browser combat settlement. |
| E. Passive + Hidden Information | Achilles `servant.achilles.skill.sc-achilles-1` | Hidden true-name state and defeat-triggered reveal interact with battle result and projection. | FD-PASSIVE-001, FD-DEFEAT-001, FD-TRUENAME-001, FD-HIDDEN-001 | Trigger Engine, Combat Resolver, Projection | Gate A trigger/reveal negatives; Gate B battle defeat scenario; Gate C browser before/after projections. |
| F. Special Play / Add-to-attack / Create-and-activate | Drake `servant.drake.skill.sc-drake-1` `骑乘` and Artoria Alter `servant.artoria-alt.skill.sc-artoria-alt-2` `黑化诅咒` | Covers effect play not consuming normal batch, low-mana play override, residual close on noble use. | FD-PLAY-001, FD-ABILITY-001, FD-RESIDUAL-001, FD-CLOSE-001 | PlayBatch Runtime, Ability Interpreter, Lifecycle | Gate A play counter tests; Gate B two-card/effect-play scenario; Gate C browser batch with negative direct command. |

## Golden Flow 1: Complete Action Phase

Current slice status:

- Gate A component evidence exists in `packages/rules/tests/regression/golden-flow-1-action-phase.test.ts` for strict Action Phase sub-state sequencing, legal action windows, normal movement exposure, two-card staged batch commit, zero/one/two hand-card shortage matrix, hand-scoped normal play obligation, and negative cases.
- Gate B MatchSession evidence exists in the same regression test: `MatchSession -> syncActionTurnFlow -> getLegalActions -> dispatchAbilityCommand -> movePlayer/playBatch -> passPriority -> next priority player`.
- Gate C browser/server evidence exists in `e2e/fd-golden-flow-1-action-phase.spec.ts`: restored seven-player room, browser action-window decline via `client:end_turn` with `expectedRevision`, browser `normal_move`, reconnect after movement, browser staged two-card batch, zero/one/two hand-card shortage matrix, server stale-revision rejection without duplicate card movement, hand-scoped play obligation that does not count skill-zone cards as normal hand plays, final action-window pass, and projection handoff to the next priority player.
- Scope is intentionally limited to `modeState.strictActionFlow === true`; legacy unscoped action-phase paths still exist and are not promoted by this evidence.
- Independent Reviewer promotion is required before Golden Flow 1 may be marked `E2E_VERIFIED`.

Initial state:

- Seven-player standard match.
- Active player is in action phase with legal action ability, legal normal move or pass move, legal two-card batch or shortage batch, and a post-play ability.
- At least one opponent is at a battlefield to test engaged movement denial in a negative branch.

Commands:

1. Query action ability window.
2. Use or decline one legal action ability.
3. Execute `MOVE` or `PASS_MOVE`.
4. Query action ability window again.
5. Commit normal `PLAY_BATCH`.
6. Query action ability window again.
7. End action turn.

Expected flow transitions:

- `ACTION_BEFORE_MOVE_ABILITY_WINDOW -> NORMAL_MOVE_OR_PASS -> ACTION_AFTER_MOVE_ABILITY_WINDOW -> PLAY_BATCH_DRAFT/COMMIT -> ACTION_AFTER_PLAY_ABILITY_WINDOW -> next player/phase`.

Expected events:

- ability declared/resolved or declined, movement event, play batch committed/resolved, action-turn completed.

Expected state delta:

- Movement cost paid once, player location changed or pass recorded, exactly legal hand cards moved to attack area, costs paid atomically, no movement after play. Zero playable hand cards may pass, one playable hand card may confirm a one-card batch, and two or more playable hand cards require a two-card staged batch up to normal allowance. Skill-zone cards are not counted as normal hand-play obligations unless a later card-specific rule explicitly creates that permission.

Expected projections:

- Active player sees legal commands and private card choices; others see waiting/public deltas only.

Cleanup:

- No unresolved pending decision; staged batch cleared.

Negative cases:

- ability in wrong phase, second normal move, move while engaged, play before resolving pending target, voluntary pass with playable hand cards, two-hand early confirm after one staged card, skill-zone card does not block normal play pass, three-card normal batch, stale command.

## Golden Flow 2: Combat + Power + Winner + VP

Current slice status:

- Gate A component evidence exists for tied highest winners via `packages/rules/tests/core/combat-resolver.test.ts`.
- Gate A scoring evidence exists for multi-winner VP consumption via `packages/rules/tests/core/scoring-resolver.test.ts`.
- Gate A projection bridge evidence exists via `apps/client/src/state/engine-bridge.test.ts`.
- Gate B scenario evidence exists via `packages/rules/tests/regression/battle-winner-conformance.test.ts` and `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts` for tied eligible winners, defeated high-power exclusion, solo battlefield, VP source split, recon VP, event trace, scoring consumption, and replay summary.
- Production path evidence exists via `packages/rules/tests/match-session.test.ts`, proving `MatchSession -> resolveBattlePhase -> resolveBattlefield -> applyBattleScoring -> projectToClientState`.
- Server command-chain/reconnect evidence exists via `apps/server/src/match-server.test.ts`: the test installs a deterministic battle-pre state, then resolves through `client:end_turn -> expectedRevision check -> MatchRoom.endClientTurn -> MatchSession.passPriority -> resolveBattlePhase`.
- Browser Gate C candidate evidence exists via `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts`: it restores only battle-pre state, clicks the real remote end-turn UI, verifies settlement projection, sends a stale revision command, and reconnects P2.
- Independent Reviewer promotion is still required before `E2E_VERIFIED`.

Initial state:

- Two battlefields with public/hidden event coverage.
- At least one tied highest case, one defeated high-power player, one solo battlefield, one recon player.

Commands:

1. Enter battle phase.
2. Resolve battle abilities.
3. Resolve all battlefield combats.
4. Apply scoring.

Expected flow transitions:

- battle ability windows finish for all eligible players, then scoring starts once per battlefield.

Expected events:

- hidden event reveal, battle resolved, power trace emitted, VP source adjustments, battle scored, after-win/after-loss triggers.

Expected state delta:

- Tied winners represented as all winners, defeated players excluded from winner set, event VP plus competition VP split with ceil, personal rewards separate, recon +2 applied once.

Expected projections:

- Public battle result and filtered calculations; no hidden hands/deck order exposed.

Cleanup:

- Battle results consumed exactly once by scoring.

Negative cases:

- duplicate battle resolution, defeated player highest power, no opponent competition reward, tie split, hidden event not revealed before battle request.

## Golden Flow 3: Round End + Cleanup + Lifecycle

Initial state:

- Active residual skill, temporary attack, non-skill active attack, used once-per-game attack, face-down attack, defeat status, round-end effect.

Commands:

1. Finish scoring.
2. Advance to round end.
3. Run cleanup/lifecycle.
4. Rotate first player or run elimination/final if applicable.

Expected flow transitions:

- scoring -> round end effects -> cleanup -> expiration -> elimination/final -> next round.

Expected events:

- attack closed, residual preserved, temporary dissolved, face-down discarded, status expired, elimination/final checked.

Expected state delta:

- Skill cards return to skill zone; non-skill cards discard or removed-from-game by limit; residual remains if legal; defeat expires after battle-end/round-end effects.

Expected projections:

- Owners see private discard/skill zones; opponents see only public state changes.

Cleanup:

- No ad hoc modifier survives without a lifecycle owner.

Negative cases:

- source-closed modifier still applying, temporary card entering discard, defeat expiring before battle-after triggers, once-per-game residual wrong destination.

## Golden Flow 4: Reconnect During Active Flow

Initial state:

- Remote room running with two browser clients.
- Active player has a pending payment or target decision; another player is waiting.

Commands:

1. Open pending decision.
2. Disconnect active player.
3. Reconnect with valid token.
4. Submit selected decision.
5. Try stale/duplicate command from old revision.

Expected flow transitions:

- Pending decision remains unchanged across reconnect; valid command resumes; stale command rejected.

Expected events:

- client disconnected, client reconnected, projection emitted, command accepted/rejected.

Expected state delta:

- No duplicate cost/payment; no skipped decision; revision increments only on accepted command.

Expected projections:

- Reconnected player receives private pending candidates; others do not.

Cleanup:

- Socket and room state remain consistent after command.

Negative cases:

- invalid reconnect token, wrong client command, stale revision, unauthorized replay restore.

## Golden Flow 5: Optional Trigger / Interaction Chain

Initial state:

- Multiple optional triggers are eligible in turn order; at least one `唯一` group and one forced trigger are also eligible.

Commands:

1. Resolve forced trigger.
2. Offer optional response windows.
3. Decline one window.
4. Accept another window.
5. Resolve nested event if produced.

Expected flow transitions:

- Forced triggers do not wait for player opt-in; optional windows pause and resume deterministically.

Expected events:

- trigger collected, response window opened, declined/accepted, ability resolved, nested event queued.

Expected state delta:

- Declining one window does not consume future eligibility unless rule says so; unique group creates only one effective choice.

Expected projections:

- Eligible player sees choices; non-eligible players see public wait reason only.

Cleanup:

- Response windows clear after resolution and do not replay.

Negative cases:

- wrong responder, duplicate response, response after window closed, optional trigger with hidden source leaking to non-owner.

## First Golden Result-Binding Card Contract

### Source and scope

- Card ID: `servant.kintoki.skill.sc-kintoki-3`
- Ability ID: `sc-kintoki-3.golden-eater`
- Printed behavior: move one removed `黄金冲击` to the controller's skill zone; optionally pay 7 mana to move the other; while at a battlefield, gain 2 VP for each card actually added.
- Slice form: the complete canonical card definition from `data/authoring/servants/servant.kintoki.json`, compiled by `compileExecutableCardPack` and installed as an executable definition in a real `MatchSession`.

This single-card migration includes the mandatory first card, the optional second card, the 7-mana payment, and the battlefield VP formula for each card actually moved. It does not imply broader roster migration or Phase 3 acceptance.

### Runtime contract

```text
private server target: one controller-owned Golden Impact in removed_from_game
-> move_card(target=firstGoldenImpact, to=skill)
-> bind firstGoldenImpactAdded.movedCount
-> if controller_at_battlefield: add firstGoldenImpactAdded.movedCount * 2 VP
-> optional private server target: the other Golden Impact, only when 7 mana is available
-> pay_mana(amount=7, selection=secondGoldenImpact)
-> move_card(target=secondGoldenImpact, to=skill)
-> bind secondGoldenImpactAdded.movedCount
-> if controller_at_battlefield: add secondGoldenImpactAdded.movedCount * 2 VP
```

- Required primitives: typed `move_card`, typed `pay_mana`, typed `adjust_victory_points`, numeric `multiply`, and `controller_at_battlefield` condition.
- Required bindings: both move results expose actual `movedCount`; payment exposes typed `amountPaid`.
- Runtime owner: `MatchSession.dispatchPlayerAction -> dispatchAbilityCommand -> activate_ability -> executeEffects production bridge -> executeResolution`.

### Evidence contract

- Gate A required: compiler accepts the valid graph; compiler rejects invalid binding; runtime parser rejects corrupted definitions; later invariant failure rolls back state/events and never falls back to legacy.
- Gate B required: activate and select through `MatchSession.dispatchPlayerAction`; the first stage commits independently; the second stage can pay and resolve or decline; insufficient payment and out-of-candidate selection fail closed; a later second-stage failure rolls back payment/movement without undoing the committed first stage.
- Gate C required: real browser activation and target selection, WebSocket revision checks, server revalidation, reconnect while the optional target is pending, final projection, insufficient-payment rejection, and stale-command rejection.
- Negative cases: unknown/invalid payment bindings, runtime-corrupted binding, missing/illegal selection, insufficient mana, unsupported destination, failure after first or second movement, unauthorized viewer projection, and stale replay.

### Current status

- Gate A: `IMPLEMENTED_UNVERIFIED`; implementer evidence exists, independent review pending.
- Gate B: `IMPLEMENTED_UNVERIFIED`; complete-card MatchSession scenario evidence exists for both branches, insufficient mana, compiler/runtime corruption, and stage-local transaction rollback; independent review pending.
- Gate C: `IMPLEMENTED_UNVERIFIED`; `e2e/fd-golden-eater-result-binding.spec.ts` starts from browser activation, resolves the first card, reconnects while the optional target is pending, pays and resolves the second card, verifies both client projections, rejects insufficient payment, and rejects stale replay without duplicate movement or VP. Independent review is pending.
- Unsupported pieces: broader roster migration, permanent replacement of the transitional target/activation owner, and independent Gate promotion.

## Historical Phase 3A Core Primitive Pilot Contract

### Source and scope

- Historical pilot ability IDs: `conversion-magic.preparation`, `time-alter.action`, `command-spell.gain-mana`.
- Current boundary: `command-spell.gain-mana` has exited ability-id pilot routing and is now governed by the `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` semantic-form contract. `conversion-magic.preparation` is governed by the `CARD_ZONE_CORE_DIRECT_ACTION` exact semantic-form contract. Kiritsugu `time-alter.action` is governed by the scoped `CARD_ACTION_SEMANTICS_MINIMAL_PLAY` exact semantic-form contract while remaining supporting evidence for the prior Card/Zone slice. Maiya `military.attach-support-shot` is governed by the scoped `CARD_ACTION_SEMANTICS_MINIMAL_ADD_TO_ATTACK` exact semantic-form contract. Do not use this historical Phase 3A pilot section to judge current mechanic-family Gate C status.
- Required primitives: typed `adjust_mana`, typed `adjust_command_seals`, typed `draw_cards`, typed `move_all_remaining`, and typed `play_selected_cards`.
- Runtime owner: `MatchSession.dispatchPlayerAction -> dispatchAbilityCommand -> executeEffects -> executeResolution`, with `play_selected_cards` delegated to the shared server `playBatch` hook.
- Slice boundary: explicit data-flow syntax plus current mechanic-family semantic routing. The Phase 3 reference pilot allowlist is empty after the card-zone direct-action implementation candidate. This is not a roster migration.

### Evidence contract

- Gate A required: primitive registry exposes result schemas, every exposed result field can be consumed or rejected by compiler validation, hookless `play_selected_cards` fails closed, and runtime corruption rolls back state.
- Gate B required: each pilot ability executes from compiled content in a real `MatchSession` and mutates authoritative state according to printed text.
- Gate C required before promotion: browser activation/target selection where applicable, WebSocket `expectedRevision`, reconnect/projection consistency, and stale command rejection. Current card-zone candidate evidence uses `time-alter.action` as the single representative browser path for `CARD_ZONE_CORE_DIRECT_ACTION`; `conversion-magic.preparation` remains supporting browser evidence. Command spell Gate C candidate evidence is tracked under `RESOURCE_NUMERIC_CORE_DIRECT_ACTION`.

### Current status

- Gate A: `IMPLEMENTED_UNVERIFIED`; implementer evidence exists in `packages/rules/tests/regression/resolution-dataflow.test.ts` and `packages/rules/tests/regression/phase-3a-core-primitives.test.ts`.
- Gate B: `IMPLEMENTED_UNVERIFIED`; implementer evidence exists for Irisviel hand discard -> mana, Kiritsugu face-down effect play -> draw, and command spell mana/seal mutation through compiled `MatchSession`.
- Gate C: `PARTIAL_IMPLEMENTED_UNVERIFIED`; implementer evidence exists for Kiritsugu `time-alter.action` in `e2e/fd-time-alter-core-primitive.spec.ts`, covering browser activation, target selection, `expectedRevision`, pending reconnect, projection consistency, and stale replay rejection. Implementer evidence also exists for Irisviel `conversion-magic.preparation` in `e2e/fd-conversion-magic-core-primitive.spec.ts`, covering browser activation, `expectedRevision`, hand-to-discard movement, mana gain from actual moved count, reconnect consistency, and stale replay rejection. `command-spell.gain-mana` is no longer a Phase 3A pilot Gate C gap.
- Unsupported pieces: non-exact draw/play/card-zone effects, non-direct resource effects, hidden/private card-zone flows, `CREATE_AND_ACTIVATE`, broad roster migration, and independent Gate promotion. `command-spell.gain-mana` now has separate `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` Gate C candidate evidence; `conversion-magic.preparation` and `time-alter.action` now have `CARD_ZONE_CORE_DIRECT_ACTION` semantic-route candidate evidence; `time-alter.action` also has scoped `PLAY` candidate evidence; Kayneth `volumen.extra-play` has scoped `PLAY_SOURCE_CARD_WITH_COST_RESPONSE` candidate evidence; Maiya `military.attach-support-shot` has scoped `ADD_TO_ATTACK` candidate evidence; Olga `astronomical-science.first-loss` has scoped `ACTIVATE` candidate evidence; Artoria Alter `sc-artoria-alt-2.angra-mainyu-embrace` has scoped `CLOSE` candidate evidence. None of these scoped candidates covers another card-action contract.

## Effect Result Binding Mapping

`docs/plans/fd-effect-result-binding-plan.md` is present and is the active Effect Result Binding subplan. Based on that plan and `docs/reports/2026-09-07-effect-result-binding-design-result.md`, map future Phase 3A acceptance as follows:

| Phase 3A Item | New Acceptance Gate |
|---|---|
| Typed `EffectResultEnvelope` | Gate A |
| Binding positive/negative compiler tests | Gate A |
| Synthetic chained-effect scenario | Gate B only when scenario asserts state delta and rollback, not just direct validator behavior |
| First real Golden Card using bound result | Gate B |
| Browser-complete Result Binding card with projection/reconnect where relevant | Gate C |

Design documents and reports are not verification evidence by themselves.

## Next Minimal Implementation Slice

Before broad roster migration, continue `CARD_ACTION_SEMANTICS_MINIMAL` one contract at a time. The next recommended slice is `CREATE_AND_ACTIVATE`, but only after inventory proves one exact representative and skip reasons for all create/activate hybrids; it must stay separate from Drake's hidden/power/lifecycle `play_selected_cards`, targeted close, `ACTIVATE`, and broader cleanup ordering.

Golden Flow 1, Golden Flow 2, Golden Eater, Time Alter, Conversion Magic, and Artoria Caster `选王剑` remain candidate evidence pending independent review. They should inform representative mechanic acceptance, but none of them authorizes Phase 3 PASS, Roster Migration PASS, or Release Ready.
