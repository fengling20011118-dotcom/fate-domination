# FD Rule Conformance Matrix

- Date: 2026-09-07
- Acceptance baseline: `docs/plans/fd-rules-conformance-and-acceptance.md`
- Canonical rules: `docs/rules/FD-Game-Rules-Final.md`
- Runtime inventory source: `docs/audits/fd-flow-runtime-inventory.md`
- Git baseline last verified 2026-09-07: `D:\fd` is a Git worktree on `main` at short HEAD `1dc6196`.

## Status Vocabulary

Only these statuses are valid in this matrix:

`IMPLEMENTED_UNVERIFIED`, `COMPONENT_VERIFIED`, `SCENARIO_VERIFIED`, `E2E_VERIFIED`, `FAILED`, `BLOCKED`, `NOT_VERIFIED`.

Implementation metadata such as `FULL`, `PARTIAL`, `HOST_ADJUDICATED`, `automatic`, `supported`, `complete`, or `Production Ready` is not an acceptance status.

## Document Roles

| Document | Role | Boundary |
|---|---|---|
| `docs/rules/FD-Game-Rules-Final.md` | WHAT: canonical gameplay requirements | Does not define proof, implementation phase status, or release readiness. |
| `docs/plans/fd-rules-conformance-and-acceptance.md` | HOW TO PROVE: Rule/Card/Flow acceptance baseline | Does not change gameplay rules. |
| `docs/plans/fd-card-engine-stabilization-plan.md` | HOW TO MIGRATE: stabilization implementation plan | Must reference the acceptance baseline instead of redefining rule truth. |

## Current Governance Answers

| Question | Current answer |
|---|---|
| How is "implementation complete" currently defined? | Inconsistently. `docs/spec/engine-capability-matrix.md`, content metadata, and reports use `FULL`, `PARTIAL`, `HOST_ADJUDICATED`, `automatic`, `unsupported`, `complete`, and `Production Ready`. `docs/audits/fd-card-runtime-architecture-audit.md` already warns that parse/handler coverage is not behavioral proof. |
| Who can announce PASS? | The new acceptance baseline requires an independent Reviewer. Older reports sometimes self-report `PASS`; those are test or slice outcomes, not final acceptance. |
| Do green tests automatically mean complete? | No. Existing `verify:stabilization` aggregates test suites, but it has no Rule ID coverage matrix and cannot by itself imply release readiness. |
| Is there Rule -> Test mapping? | Partial and informal. Tests exist for phase, movement, play, combat, scoring, projection, replay, and complex skills, but they are not mapped to canonical Rule IDs. |
| Is there a Card Acceptance Contract? | Yes as a baseline in `fd-rules-conformance-and-acceptance.md`; legacy card reports do not consistently apply it. |
| Is there a Flow Acceptance Contract? | Yes as a baseline in `fd-rules-conformance-and-acceptance.md`; existing flow tests are not yet organized as Golden Flow contracts. |
| Are Golden Card / Golden Flow definitions present? | Golden Card candidates exist in `docs/audits/fd-card-runtime-architecture-audit.md`; Golden Flow contracts were not formalized before this integration. |
| Is there a Reviewer Gate? | Yes in the new acceptance baseline; old scripts do not enforce independent review. |
| Are there conflicting old completion definitions? | Yes: `FULL`, `automatic`, `complete`, `supported`, `Production Ready`, and report-local `PASS` claims conflict when used as final acceptance. |

## Runtime Owner Map

| Rule Area | Runtime Owner | Entry Point | Call Path | Owner Risk |
|---|---|---|---|---|
| Global flow | `packages/rules/src/core/phase-machine.ts::getNextPhase`, `packages/rules/src/core/game-loop.ts::stepGameLoop`, `packages/rules/src/match-session.ts::advanceAutomatedFlow` | `stepGameLoop`, `MatchSession.dispatchPlayerAction` | test/sim -> `stepGameLoop`; production room -> `MatchRoom.dispatchCommand` -> `MatchSession.dispatchPlayerCommand` | `MULTIPLE_RUNTIME_OWNERS`; `SECONDARY_RUNTIME_PATH` |
| Player order | `phase-machine.ts::getEligibleActionSeats`, `match-session.ts` priority orchestration | `getEligibleActionSeats`, `projectToClientState` | state priority -> legal actions/projection | `MULTIPLE_RUNTIME_OWNERS` |
| Action ability windows | `ability/interpreter.ts::getLegalActions`, `dispatchAbilityCommand`, `processEvent` | `MatchSession.getPlayerView`, `dispatchPlayerAction` | room/server/client -> MatchSession -> ability interpreter | Legacy mutation path retained |
| Normal move | `ability/interpreter.ts` plus `core/movement.ts::movePlayer` | `dispatchAbilityCommand`, `movePlayer` | formal ability command or seeded game-loop action | `MULTIPLE_RUNTIME_OWNERS`; `SECONDARY_RUNTIME_PATH` |
| Normal play batch | `ability/interpreter.ts::playBatch`, `getLegalActions`, `playAbilityCardBatch`; `core/card-play.ts` legacy pair play | `dispatchAbilityCommand`, `playAbilityCardBatch`, `playServantCardPair` | MatchSession -> interpreter; seeded/core tests -> card-play/game-loop | `SECONDARY_RUNTIME_PATH` |
| Passive / trigger | `ability/interpreter.ts::processEvent`, `collectTriggeredAbilities` | `processAbilityEvent`, `advanceAbilityPhase`, combat resolver events | committed events -> scan abilities -> response/effect execution | Open string event bus; no closed registry |
| Unique / once limits | `ability/interpreter.ts::abilityLimitReached`, `perGamePlayLimit` | `getLegalActions`, `dispatchAbilityCommand` | legal action query and dispatch revalidation | Implemented but key semantics vary by card/ability |
| Residual / lifecycle | `ability/interpreter.ts::installOngoing`, `cleanupOngoing`; `match-session.ts` cleanup logic; `extended-effects.ts` ad hoc state | `executeAbility`, `advanceAbilityPhase`, `advanceAutomatedFlow` | ability resolution -> ongoingEffects/card zones/modeState | `MULTIPLE_RUNTIME_OWNERS`; lifecycle fragmented |
| Defeat | `combat-resolver.ts::cannotWinBattleThisRound`; `ability/interpreter.ts` active status checks | `resolveBattlefield`, `getLegalActions` | battle resolver excludes winners; legality checks status | Partial; canonical VP-timeline defeat expiry not fully proven |
| Power layers | `ability/interpreter.ts::calculateCardPower`, `combat-resolver.ts::buildParticipantBreakdown`, event/situation modifier helpers, Tomoe `reduce_opponents_power` terrain predicate | `resolveBattlefield` | card power + terrain + modifiers -> participant breakdown | `MULTIPLE_RUNTIME_OWNERS`; source/lifecycle fragmentation; Tomoe P0 no-terrain predicate repaired but still compatibility-owned |
| Battle winner | `combat-resolver.ts::resolveBattlefield`, `buildBattleResult` | `resolveBattlefield` | MatchSession battle auto-flow -> combat resolver -> ability events | Canonical `winnerPlayerIds` now exists; legacy `winnerPlayerId` remains as compatibility/display field |
| VP / scoring | `combat-resolver.ts::buildDefaultVpAdjustments`, `scoring-resolver.ts::applyBattleScoring` | `resolveBattlefield`, `applyBattleScoring` | battle result -> scoring pass -> player VP/reasons | `MULTIPLE_RUNTIME_OWNERS`; some canonical round 8/9/10 VP elimination not proven |
| Round cleanup | `match-session.ts::advanceAutomatedFlow`, `ability/interpreter.ts::cleanupOngoing`, `core/game-loop.ts::runCleanupPhase` | `advanceAbilityPhase`, `stepGameLoop` | phase advance -> cleanup/scoring/discard | `MULTIPLE_RUNTIME_OWNERS`; `SECONDARY_RUNTIME_PATH` |
| Hidden information | `ability/interpreter.ts::projectAbilityState`, `match-session.ts::projectToClientState`, `projection/player-match-view.ts::projectPlayerMatchView` | player projection APIs | state -> player/spectator view | `MULTIPLE_RUNTIME_OWNERS`; projection paths differ |
| Projection | `MatchSession.projectToClientState`, `projectAbilityState`, `projectPlayerMatchView`, client `engine-bridge.ts` | room/server projections and local client fixtures | server -> websocket -> client; local fixture bridge | `MULTIPLE_RUNTIME_OWNERS`; `SECONDARY_RUNTIME_PATH` |
| Reconnect | `match-room.ts::reconnect`, `match-room-hub.ts::reconnect`, `apps/server/src/match-server.ts` websocket path | websocket connect with reconnect token | browser/server -> hub -> room -> projection | Transport verified narrowly; active-flow restore not proven |
| Effect result binding | `ability/resolution-dataflow.ts::validateResolutionDataFlow`, `executeResolution`; compiler integration in `ability/executable-card-pack.ts` | `compileExecutableCardPack`, `executeResolution` | content compile -> data-flow validator; synthetic runtime -> primitive registry | Infrastructure only; production interpreter not migrated |

## Rule Conformance Matrix

Rule IDs marked `CANDIDATE` are stable core requirements derived from `FD-Game-Rules-Final.md`; the canonical rules file does not yet define a full `FD-*` ID system.

## Coverage Denominator

The status counts include rules not yet represented as full matrix rows. This prevents `NOT_VERIFIED = 0` from meaning only "no mapped row is unverified."

- Canonical candidate rule units: 63
- Matrix-covered rule units: 19
- Not yet mapped rule units: 44
- Coverage: 19 / 63

Current status counts across the full denominator:

| Status | Count |
|---|---:|
| `E2E_VERIFIED` | 0 |
| `SCENARIO_VERIFIED` | 2 |
| `COMPONENT_VERIFIED` | 13 |
| `IMPLEMENTED_UNVERIFIED` | 4 |
| `FAILED` | 0 |
| `BLOCKED` | 0 |
| `NOT_VERIFIED` | 44 |

These 63 units are candidate acceptance units derived from stable canonical rule sections and current runtime surface. They are not a substitute for adding formal IDs to `FD-Game-Rules-Final.md`.

| Area | Candidate Units | Matrix-Covered | Not Yet Mapped |
|---|---:|---:|---:|
| Flow / phase / round structure | 12 | 1 | 11 |
| Player order / simultaneous order | 4 | 1 | 3 |
| Ability windows / decisions / costs | 7 | 1 | 6 |
| Movement | 4 | 1 | 3 |
| Normal play / play batch | 5 | 1 | 4 |
| Passive / trigger / unique | 5 | 2 | 3 |
| Residual / close / lifecycle | 7 | 3 | 4 |
| Defeat | 3 | 1 | 2 |
| Power / battle / VP | 8 | 3 | 5 |
| Hidden information / projection / reconnect / true name | 6 | 4 | 2 |
| Effect result binding | 2 | 1 | 1 |
| **Total** | **63** | **19** | **44** |

### Not Yet Mapped Rule IDs

| Rule ID | Reason Not Yet Mapped |
|---|---|
| FD-FLOW-002-CANDIDATE | Setup/start-player contract not yet traced to runtime owner and evidence. |
| FD-FLOW-003-CANDIDATE | Preparation mana and command setup require separate Gate A/B mapping. |
| FD-FLOW-004-CANDIDATE | Advance situation draw/application needs positive, negative, and replay evidence. |
| FD-FLOW-005-CANDIDATE | Action turn boundary and handoff between players is only indirectly covered. |
| FD-FLOW-006-CANDIDATE | Battle declaration selection and skipped battlefields need a dedicated contract. |
| FD-FLOW-007-CANDIDATE | Cleanup scoring order needs one ordered event-trace contract. |
| FD-FLOW-008-CANDIDATE | Round-end threshold/final transition needs canonical Gate B/E2E evidence. |
| FD-FLOW-009-CANDIDATE | Direction vote and first-player rotation are not mapped. |
| FD-FLOW-010-CANDIDATE | Optional/disabled location and Moon Holy Grail threshold behavior need mapping. |
| FD-FLOW-011-CANDIDATE | Event placement, discard, and recycle flow is not mapped as a rule. |
| FD-FLOW-012-CANDIDATE | Phase-transition event trace and causation identity are not mapped. |
| FD-ORDER-002-CANDIDATE | Simultaneous/tied ordering semantics are not separated from general order tests. |
| FD-ORDER-003-CANDIDATE | Response-window player order needs its own proof contract. |
| FD-ORDER-004-CANDIDATE | Eliminated-player skip across projections and reconnect is not mapped. |
| FD-ABILITY-002-CANDIDATE | Wrong-phase fail-closed behavior is tested in fragments, not mapped as a rule. |
| FD-ABILITY-003-CANDIDATE | Source active/closed legality is not mapped across play, trigger, and projection. |
| FD-ABILITY-004-CANDIDATE | Cost/target atomicity needs a cross-primitive rule row. |
| FD-ABILITY-005-CANDIDATE | Pending-decision transaction segmentation is not mapped. |
| FD-ABILITY-006-CANDIDATE | Optional response pass/decline behavior is not mapped across all window kinds. |
| FD-ABILITY-007-CANDIDATE | Unsupported/host-adjudicated capability status is metadata, not acceptance evidence. |
| FD-MOVE-002-CANDIDATE | Occupancy and capacity rules need dedicated positive/negative evidence. |
| FD-MOVE-003-CANDIDATE | Redeploy movement semantics are not mapped. |
| FD-MOVE-004-CANDIDATE | Move-enter trigger interactions are not mapped. |
| FD-PLAY-002-CANDIDATE | Exact two-card simultaneous batch proof is not mapped to a full scenario. |
| FD-PLAY-003-CANDIDATE | Face-down play cost/effect/damage rules need a standalone contract. |
| FD-PLAY-004-CANDIDATE | Extra play and add-to-attack effects are not mapped. |
| FD-PLAY-005-CANDIDATE | Insufficient hand and pass-while-playable negatives are not mapped. |
| FD-PASSIVE-002-CANDIDATE | Hidden passive reveal timing lacks Gate B/C mapping. |
| FD-PASSIVE-003-CANDIDATE | Forced-vs-optional trigger ordering is not mapped. |
| FD-TRIGGER-001-CANDIDATE | Trigger de-duplication/idempotency is not mapped as a rule. |
| FD-RESIDUAL-002-CANDIDATE | Residual attack contribution across later rounds is not mapped separately. |
| FD-RESIDUAL-003-CANDIDATE | Source-close protection for residual effects is not mapped. |
| FD-CLOSE-002-CANDIDATE | Skill/non-skill/temporary close destinations are not mapped as one contract. |
| FD-LIFECYCLE-001-CANDIDATE | Duration expiry by phase/round/source state is not mapped. |
| FD-DEFEAT-002-CANDIDATE | Defeated players may still use legal abilities; play-vs-ability split needs mapping. |
| FD-DEFEAT-003-CANDIDATE | Defeat expiry and VP-timing semantics are not mapped. |
| FD-POWER-002-CANDIDATE | Source closed -> modifier removed is not mapped across stores. |
| FD-POWER-003-CANDIDATE | Full canonical power layer order needs an event trace. |
| FD-BATTLE-002-CANDIDATE | Military result for ties, ignored losses, and excluded players is not mapped. |
| FD-VP-002-CANDIDATE | Round 8/9/10 VP and final scoring thresholds are not mapped. |
| FD-VP-003-CANDIDATE | Personal rewards, non-sole winner rewards, and reward source audit need mapping. |
| FD-HIDDEN-002-CANDIDATE | Servant identity and true-name projection matrix is not mapped end to end. |
| FD-RECONNECT-002-CANDIDATE | Reconnect during active pending flow is not mapped. |
| FD-RESULT-BINDING-002-CANDIDATE | Real-card result binding migration is not mapped beyond infrastructure. |

| Rule ID | Canonical Requirement | Runtime Owner | Runtime Entry Point | Positive Evidence | Negative Evidence | Integration Evidence | Scenario Evidence | E2E Evidence | Current Status | Known Gaps |
|---|---|---|---|---|---|---|---|---|---|---|
| FD-FLOW-001-CANDIDATE | Round order is preparation -> advance -> action -> battle -> scoring -> round end -> elimination/final -> player order rotation; action phase sub-order is ability window -> normal move/pass -> ability window -> play batch -> ability window -> next player. | Flow Engine / MatchSession | `stepGameLoop`; `advanceAbilityPhase`; `MatchSession.advanceAutomatedFlow`; `syncActionTurnFlow` strict path | `packages/rules/tests/core/phase-machine.test.ts`; replay timeline tests; Golden Flow 1 component scenario | eliminated players excluded in phase-machine tests; Golden Flow 1 rejects play-before-move, second move, skipped playable batch, third attack | `packages/rules/tests/regression/replay.test.ts`; `packages/rules/tests/regression/golden-flow-1-action-phase.test.ts` | Golden Flow 1 MatchSession candidate covers action-turn sub-order and next priority handoff | `e2e/fd-golden-flow-1-action-phase.spec.ts` proves restored remote browser action phase with expectedRevision, reconnect, and stale rejection | `COMPONENT_VERIFIED` | Golden Flow 1 evidence is implementer-supplied and scoped to `strictActionFlow`; no 11-round canonical run; multiple owners remain. |
| FD-ORDER-001-CANDIDATE | Current first player and direction determine per-phase player order; eliminated players are skipped. | Phase Machine / MatchSession | `getEligibleActionSeats`; `projectToClientState` | phase-machine eligible seat tests | eliminated seat negative tests | MatchSession priority projection tests | complex regressions use priority seat | none proving order across browsers | `COMPONENT_VERIFIED` | Direction vote/rotation not proven; no browser order contract. |
| FD-ABILITY-001-CANDIDATE | Action phase abilities may be used before move, after move, and after play; phase abilities require correct phase and source activation unless passive. | Ability Interpreter | `getLegalActions`; `dispatchAbilityCommand`; `canActivate`; `syncActionTurnFlow` strict path | authoring interpreter phase tests; complex skill regressions; Golden Flow 1 window sequencing | wrong-phase rejection in attack-play classifier tests; Golden Flow 1 does not expose move/play during ability windows | MatchSession dispatch tests; Golden Flow 1 regression | Golden Flow 1 MatchSession candidate covers before-move, after-move, and after-play windows by decline path | `e2e/fd-golden-flow-1-action-phase.spec.ts` opens browser ability window and advances through real `client:end_turn` expectedRevision commands | `COMPONENT_VERIFIED` | Golden Flow 1 ability evidence is decline-path only; not all real cards migrated; broader Gate B ability contract remains incomplete. |
| FD-MOVE-001-CANDIDATE | Normal move is once per action turn, forward along arrows, pays total path cost, cannot move while engaged; effect move has separate semantics. | Movement Runtime / Ability Interpreter | `movePlayer`; `getReachableLocationsAlongArrows`; `dispatchAbilityCommand` `normal_move` strict path | `packages/rules/tests/core/movement.test.ts`; Golden Flow 1 movement action exposure and mana deduction | engaged normal move blocked; unreachable destinations rejected in authoring tests; Golden Flow 1 second normal move and engaged movement rejected | MatchSession regressions for dash/recon; Golden Flow 1 strict MatchSession flow | Golden Flow 1 scenario covers normal move from workshop to Miyama and pass-move branch | `e2e/fd-golden-flow-1-action-phase.spec.ts` clicks browser `normal_move`, verifies projection after reconnect, and rejects stale replay | `COMPONENT_VERIFIED` | Evidence is scoped to `strictActionFlow`; `core/movement.ts` and interpreter movement helpers both remain; capacity/redeploy combinations incomplete. |
| FD-PLAY-001-CANDIDATE | Normal play is a simultaneous hand-card batch, usually exactly two attacks; insufficient hand cards play all legal hand cards; no voluntary pass while playable hand cards remain. Skill-zone cards are not normal hand-play obligations unless a specific rule grants that permission. | PlayBatch Runtime | `playBatch`; `playAbilityCardBatch`; `getLegalActions`; staged batch strict path | attack-play classifier; game-loop action-play tests; Golden Flow 1 staged two-card batch, zero/one/two hand-card shortage matrix, and skill-zone non-obligation test | third attack rejected; wrong phase/insufficient mana aligned; Golden Flow 1 rejects play-before-move, voluntary play skip with playable hand cards, and two-hand early confirm after one staged card; skill-zone card does not block pass | Phase 2 golden-card content pipeline; Golden Flow 1 MatchSession flow | Golden Flow 1 scenario commits two basic attacks through staged batch and clears staged state; shortage scenarios prove zero hand can pass, one hand can confirm one staged card, two hands require two staged cards; skill-only scenario advances play step without moving skill card | `e2e/fd-golden-flow-1-action-phase.spec.ts` browser-clicks two staged attack actions, confirms batch, verifies stale replay does not duplicate movement/cards, and verifies skill-zone plus zero/one/two-hand shortage cases through server projection | `COMPONENT_VERIFIED` | Evidence is scoped to `strictActionFlow`; seeded core still has older `core/card-play.ts`; default action path is not migrated. |
| FD-PASSIVE-001-CANDIDATE | Passive and forced trigger effects apply when conditions are met, including hidden passive reveal when actually affecting game. | Trigger Engine / Projection | `processEvent`; `collectTriggeredAbilities`; `projectAbilityState` | ability interaction projection; authoring interpreter trigger tests | hidden redaction tests; unsupported action not offered | complex skill forced/optional trigger regressions | Caster/Kayneth/Shinji/Olga tests exist but are not yet Rule ID Gate B contracts | no browser hidden-passive chain | `COMPONENT_VERIFIED` | Event bus is open string; no canonical trigger ordering registry; hidden passive full Gate C absent. |
| FD-UNIQUE-001-CANDIDATE | `唯一` means only one same rule text applies or one active choice window for matching optional effects. | Ability Interpreter | `collectTriggeredAbilities`; response window handling | Caster pilgrim unique tests | replay/decline/reopen tests | complex-skill regression | Caster pilgrim scenario exists but is not yet Golden Flow evidence | no browser multi-response unique window | `COMPONENT_VERIFIED` | Rule text equivalence and cross-copy identity not globally specified. |
| FD-RESIDUAL-001-CANDIDATE | Residual attacks remain across rounds until closed and count as added attacks each round; lifecycle and cleanup must be explicit. | Lifecycle / Ability Interpreter / MatchSession | `installOngoing`; `cleanupOngoing`; cleanup flow | authoring interpreter residual tests; golden-card pipeline; `packages/rules/tests/regression/artoriac-sword-modifier-lifecycle.test.ts` semantic survival and source-close negative | source-close/round cleanup partial tests; Artoria Caster compiler invalid source/rule/round-count negatives | complex skill residual tests | Artoria Caster `选王剑` MatchSession candidate covers residual install, other-special power, battle-stage return, source-close removal, and expiration cleanup | `e2e/fd-artoriac-sword-modifier-lifecycle.spec.ts` candidate covers browser play, projection, stale rejection, reconnect, and cleanup expiration | `COMPONENT_VERIFIED` | Phase 3B candidate evidence is implementer-supplied and awaits independent review; multiple cleanup owners, `modeState`, Extended Effects, and card `powerModifiers` remain secondary paths. |
| FD-CLOSE-001-CANDIDATE | Closing attacks returns skill cards to skill zone, discards non-skills, dissolves temporary attacks, and respects residual once-per-game removal. | Lifecycle / MatchSession | `cleanupOngoing`; `advanceAutomatedFlow` | limited golden-card pipeline close assertion; Artoria Caster `选王剑` skill source returns to skill on duration expiration | Artoria Caster source-closed modifier removal negative | isolated MatchSession cleanup behavior | Artoria Caster `选王剑` MatchSession candidate covers battle-stage return of a non-skill attack to hand and residual skill-card cleanup to skill | `e2e/fd-artoriac-sword-modifier-lifecycle.spec.ts` candidate covers browser cleanup returning source to skill and reconnect persistence | `IMPLEMENTED_UNVERIFIED` | Candidate evidence is implementer-supplied only; comprehensive skill/non-skill/temporary/residual/once-per-game close matrix still missing. |
| FD-DEFEAT-001-CANDIDATE | Defeated players cannot play cards, can use legal abilities, cannot win, are ignored in winner selection, expire at round end. | Combat Resolver / Ability Interpreter | `cannotWinBattleThisRound`; `getLegalActions` | Tomoe and Achilles complex tests mention defeat | no broad defeat x play/ability negatives | battle resolver winner exclusion partial | complex skill tests | none | `IMPLEMENTED_UNVERIFIED` | Canonical defeat semantics not mapped to a dedicated status/lifecycle owner. |
| FD-POWER-001-CANDIDATE | Power calculation follows canonical layers: base set, current modifiers, terrain add/multiply/set, total add/subtract, final set. | Power Engine / Combat Resolver | `calculateCardPower`; `resolveBattlefield`; Tomoe `reduce_opponents_power` compatibility handler | combat resolver breakdown; MatchTable power display test; Artoria Caster `选王剑` component asserts modifier line and value; Tomoe no-terrain predicate regression | invalid modifier throws in interpreter; Artoria Caster invalid modifier rule/source reference compiler negatives; Tomoe opponent-with-terrain negative | complex skill modifier source logs; Tomoe battle breakdown records skill source | Artoria Caster `选王剑` MatchSession candidate proves residual modifier changes another special attack from 2 to 4; Tomoe focused regression proves same-battlefield no-terrain opponent -5 only | `e2e/fd-artoriac-sword-modifier-lifecycle.spec.ts` candidate displays server battle power projection after browser play | `COMPONENT_VERIFIED` | Phase 3B candidate evidence is not independent promotion; Tomoe P0 mismatch repaired without Phase 3 migration; full canonical layer trace and multiple modifier stores remain open. |
| FD-BATTLE-001-CANDIDATE | Battlefield winner is highest eligible power; tied highest players are all winners; defeated players are ignored; solo player can win non-competition battle. | Battle Resolver | `resolveBattlefield`; `deriveBattleParticipantsFromState` | `packages/rules/tests/core/combat-resolver.test.ts` tied highest winner regression; `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts` | hidden cards ignored; servants skills ignored as attacks; defeated high-power participant excluded | MatchSession battle auto-flow calls resolver; ability event receives `winnerPlayerIds`; `packages/rules/tests/match-session.test.ts` Golden Flow 2 production-path case | Golden Flow 2 scenario covers tied eligible winners, defeated high-power exclusion, solo battlefield, event trace, and scoring consumption | `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts` proves battle-pre restore -> remote end-turn command -> server revision check -> battle settlement -> projection -> stale rejection -> reconnect | `SCENARIO_VERIFIED` | Gate C candidate evidence exists and awaits independent review; legacy `winnerPlayerId` remains as compatibility display field; direct `controller_loses_battle` condition remains a legacy-risk branch if used outside derived loss events. |
| FD-VP-001-CANDIDATE | Battle VP pool equals event VP plus competition VP if opponent exists; tied winners receive ceil split; personal rewards are separate; recon grants 2 VP. | Battle Resolver / Scoring Resolver | `buildDefaultVpAdjustments`; `applyBattleScoring` | scoring source separation test; tied winner scoring regression; recon reward tests; `packages/rules/tests/regression/golden-flow-2-combat-power-winner-vp.test.ts` | no-overmerge source regression; solo battlefield no competition VP; stale revision command rejected without second scoring | MatchSession battle -> scoring flow; `apps/server/src/match-server.test.ts` command-chain/reconnect preserves battle/scoring facts | Golden Flow 2 scenario covers event VP, competition VP, ceil split, recon VP, and one-time battle result consumption | `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts` proves VP facts after real remote end-turn and checks stale command does not double VP | `SCENARIO_VERIFIED` | Gate C candidate evidence exists and awaits independent review. |
| FD-ROUND-CLEANUP-001-CANDIDATE | Round end order removes masters, discards situation/events, preserves residual, closes attacks, discards face-down, runs end effects, expires statuses, then elimination/final. | MatchSession / GameLoop / Ability Interpreter | `advanceAutomatedFlow`; `runCleanupPhase`; `cleanupOngoing` | limited cleanup tests; Artoria Caster `选王剑` expiration cleanup component evidence | Artoria Caster source-closed and expired modifier removal negatives | replay timeline includes cleanup snapshots | Artoria Caster `选王剑` MatchSession candidate covers residual preservation before expiration and source card return to skill at expiration | `e2e/fd-artoriac-sword-modifier-lifecycle.spec.ts` candidate covers browser-driven cleanup expiration, stale end-turn rejection, and reconnect after cleanup | `IMPLEMENTED_UNVERIFIED` | Candidate evidence is implementer-supplied only; full ordered cleanup across residual, temporary, face-down, defeat, and elimination remains unverified; owner split remains. |
| FD-HIDDEN-001-CANDIDATE | Hidden hands, decks, face-down cards, servant identities, and hidden Shinto events remain private until a rule reveals them. | Projection Layer | `projectAbilityState`; `projectToClientState`; `projectPlayerMatchView` | projection tests; content verification private leak checks | opponent/spectator redaction assertions | server websocket projection test | hidden event replay scenario exists but not across all projection owners | remote sync checks private hands, not full hidden card abilities | `COMPONENT_VERIFIED` | Multiple projection APIs; no hidden passive/true-name browser gate. |
| FD-TRUENAME-001-CANDIDATE | True Name release reveals servant overview and skills on use of True Name release card/ability; pure passive does not trigger it. | Ability Interpreter / Projection | `reveal`; `resolveEffect`; `processEvent` | authoring and complex true-name tests | passive/non-use negative not complete | MatchSession with real authoring cards | Kintoki/Artoria/Drake/Ereshkigal scenarios exist but no full projection contract | no browser true-name reveal gate | `COMPONENT_VERIFIED` | Projection and event trace not fully linked. |
| FD-PROJECTION-001-CANDIDATE | Player-specific view must expose only authorized information and only server-supplied available actions. | Projection / MatchSession / MatchRoom | `projectToClientState`; `projectAbilityState`; `MatchRoom.getProjection` | projection and client tests; `apps/client/src/state/engine-bridge.test.ts`; Golden Flow 1/2 projection evidence | non-priority actions hidden; private identity redacted; Golden Flow 1/2 stale replay and safe projection checks | websocket server test; remote room fixture displays server-supplied action/battle facts after real commands | Golden Flow 1 projection scenario covers legal action transitions and card-zone mutation; Golden Flow 2 projection scenario covers battle/scoring facts | `e2e/fd-golden-flow-1-action-phase.spec.ts`; `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts` | `COMPONENT_VERIFIED` | Local fixture/client bridge can still synthesize display/actions; Golden Flow 1 uses scoped strict flow; reconnect during pending response window remains incomplete. |
| FD-RECONNECT-001-CANDIDATE | Reconnect restores viewer identity, safe projection, active player, pending interaction, revision, and does not leak authority state. | WebSocket Runtime / MatchRoom | `MatchRoom.reconnect`; `MatchRoomHub.reconnect`; `createMatchServer` | websocket test reconnects P2 and checks viewer | invalid replay restore permission negative; Golden Flow 1/2 stale revision commands rejected | room projection after reconnect; `apps/server/src/match-server.test.ts` Golden Flow 2 command-chain reconnect case | Golden Flow 1 reconnect preserves action sub-step and movement projection; Golden Flow 2 reconnect preserves battle/scoring projection after remote command settlement | `e2e/fd-golden-flow-1-action-phase.spec.ts`; `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts` | `COMPONENT_VERIFIED` | Reconnect during unresolved response window remains incomplete; Golden Flow 1 reconnect is between action substeps, not pending target. |
| FD-RESULT-BINDING-001-CANDIDATE | Effect result binding must use actual structured primitive results and fail closed for invalid references. | Resolution Data-flow / Executable Compiler / transitional Ability Interpreter bridge | `validateResolutionDataFlow`; `executeResolution`; `compileExecutableCardPack`; `executeEffects` | resolution-dataflow tests; compiler fixtures; production bridge test | unknown/future/duplicate/invalid/wrong/unsafe branch tests; payment target/field tests; runtime corruption and staged rollback | executable pack compiler and MatchSession dispatch | Complete canonical Kintoki Golden Eater is a Gate B candidate covering both moves, optional payment, VP bindings, insufficient mana, and staged rollback | `e2e/fd-golden-eater-result-binding.spec.ts` covers browser activation, two target stages, pending reconnect, payment, server revalidation, projection, insufficient mana, and stale replay | `IMPLEMENTED_UNVERIFIED` | Gate A/B/C evidence is implementer-supplied only; activation and target-window ownership remain transitional legacy/shared runtime. |

## Existing Test -> Acceptance Evidence

| Test / Command | Supports | Gate | Does Not Prove |
|---|---|---|---|
| `packages/rules/tests/core/phase-machine.test.ts` | phase graph, eliminated seat exclusion | Gate A | MatchSession/browser flow, full round cleanup, reconnect |
| `packages/rules/tests/core/movement.test.ts` | normal/effect movement basics and engaged rejection | Gate A | action-window sequencing, capacity edge cases, trigger on enter |
| `packages/rules/tests/core/game-loop-action*.test.ts` | seeded move/play actions, basic card-play constraints | Gate A | production MatchSession legality, real card abilities, browser interaction |
| `packages/rules/tests/regression/attack-play-classifier-regression.test.ts` | two-card batch, third-card rejection, diagnostics/dispatch alignment, rollback classifier | Gate A/B | formal browser two-card batch, all shortage/pass rules, no legacy bypass |
| `packages/rules/tests/regression/battle-winner-conformance.test.ts` | FD-BATTLE-001 and FD-VP-001 tied eligible winners, defeated high-power exclusion, event trace, VP source split, scoring consumption, and real Artoria Caster non-sole-winner trigger | Gate B | browser UI, websocket projection, reconnect, all battle modifiers |
| `packages/rules/tests/regression/golden-card-content-pipeline.test.ts` | compiled content hash and several real-card MatchSession effects/lifecycle | Gate B partial | all Golden Cards, Projection Gate C, reconnect, full card contracts |
| `packages/rules/tests/regression/complex-skills-regression.test.ts` | broad real-card regression matrix | Gate B partial | independent Rule ID closure, browser Gate C, secondary path absence |
| `packages/rules/tests/regression/resolution-dataflow.test.ts` | Phase 3A synthetic result binding, fail-closed validator, rollback | Gate A | production interpreter migration, real card binding scenario, browser path |
| `packages/rules/tests/projection/player-match-view.test.ts` | owner/opponent/spectator projection redaction and basic action offer visibility | Gate A | MatchSession projection equivalence, websocket, reconnect during pending decision |
| `apps/server/src/match-server.test.ts` | websocket room sync, private-hand separation, reconnect viewer identity, unauthorized replay restore rejection | Gate A/C partial for transport | active flow reconnect, pending interaction restore, complex card projection |
| `e2e/fd-match-clickflow.spec.ts` | browser can click payment/target/response/directive/replay widgets and one real local action | Gate C partial UI transport | full canonical flow, real complex card, reconnect, scoring/cleanup |
| `e2e/fd-remote-sync.spec.ts` | two browser pages can select seats/start room | Gate C partial transport | in-match commands, hidden ability windows, replay/active reconnect |
| `e2e/fd-golden-flow-1-action-phase.spec.ts` | Golden Flow 1 browser/server command-chain candidate: action ability window, expectedRevision end-turn, normal move, reconnect after movement, staged two-card hand batch, stale rejection, play-skip rejection for playable hand cards, skill-zone non-obligation, zero/one/two-hand shortage matrix, projection handoff to next priority | Gate C candidate for FD-FLOW-001/FD-ABILITY-001/FD-MOVE-001/FD-PLAY-001/FD-PROJECTION-001/FD-RECONNECT-001 | independent reviewer promotion, always-on FlowEngine migration, pending target/response reconnect |
| `e2e/fd-golden-flow-2-combat-power-winner-vp.spec.ts` | Golden Flow 2 browser/server command-chain candidate: battle-pre restore, real remote end-turn, revision check, tied winners, VP pools, stale rejection, safe projection, reconnect same public result | Gate C candidate for FD-BATTLE-001/FD-VP-001 | independent reviewer promotion, pending-decision reconnect, full power layer ordering |
| `e2e/fd-golden-eater-result-binding.spec.ts` | Complete Golden Eater browser/server candidate: activation, both private target stages, pending reconnect, optional 7-mana payment, 4 VP final projection, insufficient-payment rejection, stale replay rejection | Gate C candidate for FD-RESULT-BINDING-001 | independent reviewer promotion and broader roster/runtime migration |
| `e2e/fd-time-alter-core-primitive.spec.ts` | Time Alter card-zone direct-action browser/server candidate: activation, projected hand-card target, pending reconnect, shared play batch face-down placement, draw projection, stale rejection | Representative Gate C candidate for `CARD_ZONE_CORE_DIRECT_ACTION` exact `play_selected_cards` + `draw_cards` shape only | independent reviewer promotion; no inheritance for hidden/private, trigger, add, activate, close, lifecycle, or battle-dependent card-zone abilities |
| `e2e/fd-conversion-magic-core-primitive.spec.ts` | Conversion Magic card-zone direct-action browser/server supporting evidence: activation, all hand cards discarded, mana gained from actual moved count, reconnect projection, stale rejection | Supporting Gate C candidate for `CARD_ZONE_CORE_DIRECT_ACTION` exact `move_all_remaining` + bound `adjust_mana` shape only | independent reviewer promotion; no inheritance for private look/exclusion, cost, trigger, add, activate, close, lifecycle, or battle-dependent card-zone abilities |
| `e2e/fd-command-spell-resource-core.spec.ts` | Command spell direct resource browser/server candidate: activation, WebSocket expectedRevision, mana +4, command seal -1, resource envelope projection, reconnect, stale rejection | Gate C candidate for `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` command spell representative only | independent reviewer promotion, broader Resource/Numeric trigger/battle/interaction migration |
| `e2e/fd-volumen-extra-play-card-action.spec.ts` | Volumen response-play browser/server candidate: combat response prompt, WebSocket expectedRevision, fixed 2 mana cost, source card played face-up to attack area, projection, reconnect, stale rejection | Gate C candidate for `CARD_ACTION_SEMANTICS_MINIMAL_PLAY_SOURCE_CARD_WITH_COST_RESPONSE` exact shape only | independent reviewer promotion; no inheritance for variable payment, target play, lifecycle, power, or recursive on-play trigger dependencies |
| `e2e/fd-olga-activate-card-action.spec.ts` | Olga activate-card browser candidate: first-loss pending state keeps Trismegistus in skill, WS `client:end_turn` with `expectedRevision` advances server to round end, data-flow activates Trismegistus, projected field card survives reconnect, stale end-turn is rejected | Gate C candidate for `CARD_ACTION_SEMANTICS_MINIMAL_ACTIVATE` exact first-loss pending -> round-end activation shape only | no user command activates the skill directly because this is a forced server-triggered schedule; broader delayed trigger schedules remain unverified |
| `e2e/fd-artoria-alt-close-card-action.spec.ts` | Artoria Alter source-close browser candidate: active `黑化诅咒`, WS `client:dispatch_command` with `expectedRevision` plays a visible 宝具, server `on_card_played` trigger closes the source through data-flow, projection/reconnect preserve closed state, stale replay is rejected | Gate C candidate for `CARD_ACTION_SEMANTICS_MINIMAL_CLOSE` exact residual noble-play source-close shape only | independent reviewer promotion; no inheritance for targeted close, close-then-activate, hidden/face-down proof, temporary dissolve, non-skill destination, or broader cleanup ordering |
| `npm run verify:stabilization` | aggregate regression gate is green when all configured suites pass | Regression evidence | release readiness, Rule ID coverage, Golden Flow completion |

## Evidence Gap Register

### P0 Evidence Gaps

| Gap | Affected Rules | Reason |
|---|---|---|
| Multiple runtime owners remain for flow, movement, play, cleanup, projection. | FD-FLOW-001, FD-MOVE-001, FD-PLAY-001, FD-ROUND-CLEANUP-001, FD-PROJECTION-001 | Secondary path can bypass the intended owner. |
| Phase 3A production bridge is transitional while most production abilities remain on legacy `executeAbility` / `resolveEffect`. | FD-RESULT-BINDING-001, FD-ABILITY-001 | The first bound graph can execute through MatchSession, but broad real-card semantics still use legacy void mutation. |
| Hidden information has multiple projection APIs and client fixtures. | FD-HIDDEN-001, FD-PROJECTION-001 | A safe projection in one API does not prove another path. |

### P1 Evidence Gaps

| Gap | Affected Rules | Reason |
|---|---|---|
| Golden Flow 2 Gate C candidate evidence needs independent review before promotion. | FD-BATTLE-001, FD-VP-001, FD-PROJECTION-001, FD-RECONNECT-001 | Browser/server command-chain evidence exists for this named flow, but implementer cannot self-promote it to `E2E_VERIFIED`; pending-decision reconnect remains outside this slice. |
| Golden Flow 1 complete action phase candidate needs independent review and global migration. | FD-FLOW-001, FD-ABILITY-001, FD-MOVE-001, FD-PLAY-001 | Scoped strict-flow evidence exists, including hand-card shortage matrix, but default legacy action flow and older core game-loop play/move owners remain. |
| Reconnect coverage is incomplete across interaction types. | FD-RECONNECT-001, FD-PROJECTION-001 | Golden Eater now restores its unresolved optional target window; response windows and other pending-decision types remain open. |
| Modifier/source-closed lifecycle is fragmented. | FD-POWER-001, FD-RESIDUAL-001, FD-CLOSE-001 | `ongoingEffects`, `modeState`, and card-level `powerModifiers` coexist. |
| Defeat x play/ability contract lacks direct negative coverage. | FD-DEFEAT-001 | Canonical says cannot play but may use legal abilities; no dedicated matrix. |
| Round cleanup canonical order lacks a single event trace. | FD-ROUND-CLEANUP-001 | Existing cleanup tests do not prove ordered sequence with residual, temporary, statuses, and elimination. |
| Card Acceptance Contract is not attached to each promoted card. | All card-driven rules | Existing reports list ability behavior but not Gate A/B/C evidence per card. |

### P2 Evidence Gaps

| Gap | Affected Rules | Reason |
|---|---|---|
| Rule IDs are candidate IDs, not embedded in Canonical Rules. | All matrix rows | Current rulebook uses section numbers; formal Rule ID governance is needed. |
| Browser tests cover Chromium only. | FD-PROJECTION-001, FD-RECONNECT-001 | Other browser engines not checked. |
| Event trace IDs/causation IDs are not universal. | Trigger, cleanup, scoring | Replay exists but not all production events are typed domain events. |
| Package/content status fields remain useful as display metadata but can be misread. | Card acceptance | Needs migration guide and lint/check later. |

## Release Gate Baseline

Release readiness now requires:

1. Canonical Rules stable.
2. Runtime Owner known for every required Rule ID.
3. No unauthorized `SECONDARY_RUNTIME_PATH`.
4. Required Gate A evidence.
5. Required Gate B evidence.
6. Required Golden Gate C evidence.
7. Projection and reconnect evidence.
8. Regression suite green.
9. No open P0/P1 rule mismatch.

All tests green is necessary regression evidence, but it is not sufficient for Release Ready.
