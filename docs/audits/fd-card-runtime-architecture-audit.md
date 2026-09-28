# FD Card Runtime Architecture Audit

- Audit date: 2026-09-06
- Scope: authoring JSON, content compilation, MatchSession, ability runtime, LegalAction projection, client interaction, unit/integration/E2E evidence
- Repository baseline: `D:\fd` is not a Git worktree. Branch and HEAD are therefore `UNKNOWN`. Four nested reference/workspace repositories exist, but none owns the audited root tree.
- Method: source trace, runtime probes, existing test suites, Playwright runs. No production implementation was changed.

## Executive Answers

### A. Why does “backend implemented” become unusable in the frontend?

The primary cause is not a single frontend click bug. The system has no single executable content pipeline and no verification stage that proves a structured card is playable end to end.

Three competing paths currently coexist:

1. Formal matches load authoring archives directly in `packages/rules/src/match-session.ts`, merge them with `loadAuthoringJson`, and initialize `AbilityRuntime`.
2. The playtest compiler creates `data/generated/fd-playtest-v1.content-library.json`; the client imports this artifact for content/display, but the compiler drops authoring abilities, conditions, targets, costs, and effects from named cards and marks them `HOST_ADJUDICATED`.
3. The older `ContentLibraryIndex` bridge in `packages/rules/src/tools/content-bridge.ts` creates a seeded state with different zone assumptions and does not initialize the formal ability runtime.

Consequently, “JSON validates”, “compiler recognizes the fields”, “runtime has a handler”, and “the UI exposes a usable action” are four different claims. Current status fields and reports conflate them.

The most damaging reproduced runtime defect is systemic: `entersAttackArea()` classifies powered servant skill cards as attacks, while `attackPlayAllowance()` allows only one attack-area card per round. After one such skill is played, the backend removes every second powered skill from `getLegalActions()` and rejects direct dispatch with `attack_play_limit_reached`. This reproduced Caster, Kintoki, Ereshkigal, and Tomoe failures and explains why fixing one card does not fix another card with the same apparent behavior.

### B. Is there a unified LegalAction/Legality system?

Classification: **B - an authoritative core exists, but the contract is distributed and incomplete**.

For the formal MatchSession path, `getLegalActions()` and `dispatch()` in `packages/rules/src/ability/interpreter.ts` are server-authoritative. Dispatch recomputes legality, validates targets against current candidates, and rejects stale or illegal commands. This is the correct ownership model.

It is not unified across the product:

- `packages/rules/src/ability/types.ts` defines the formal ability `LegalAction` union.
- `packages/game-contracts/src/index.ts` defines an older, narrower `AvailableAction` model.
- `packages/rules/src/projection/player-match-view.ts` synthesizes broad hand-card and movement actions without consulting the formal interpreter.
- The client separately maps formal actions in `seven-authoring-smoke-fixture.ts` and `remote-room-fixture.ts` and invents unstable index-based action IDs.
- The contract contains legal actions only. It has no stable action ID, disabled reason, requirements, normalized cost quote, or complete required-input schema.

This is enough for a happy-path button, but not enough to explain why a card is unavailable or to guarantee every interaction shape is representable.

### C. Is this a primitive engine or per-card patching?

It is a hybrid, trending toward per-card patching.

There is a genuine primitive interpreter for conditions, targets, costs, effects, response windows, usage limits, and ongoing modifiers. However, `extended-effects.ts` is a second large switch containing domain/card-shaped operations, untyped state writes, incomplete assumptions, and a fail-open default. Character-specific setup and fallback behavior also exists in `match-session.ts`, the content loader hardcodes named deck mappings, and the client has content-specific display overrides.

The important distinction is that many patches are named as “effect types” rather than explicit `if (cardId)` branches. That does not make them reusable primitives. A primitive is reusable only when its semantics, validation, state mutation, lifecycle, and tests are independent of a specific printed clause.

### D. Is `EffectDescriptor` sufficient for complex skills?

No. `packages/rules/src/schema/effect.ts` supports an ID, timing, handler, three battle-only conditions, and an untyped payload. Its resolver handles only mana gain, combat modifiers, and replacement handlers. The formal authoring runtime does not use this handler-string model; it dispatches `RuleNode.type` in `ability/interpreter.ts` and `extended-effects.ts`.

Complex skills need at least typed activation, play legality, costs, target queries, ordered effects, event context, response windows, limits, visibility, modifier layers, duration, cleanup, and deterministic choices. The richer `AuthoringAbility` model contains most of these shapes, but its nodes remain weakly typed and its runtime coverage is not proven by schema validation.

`EffectDescriptor` should be treated as a legacy battle/effect-stack DTO, not expanded into the main skill language.

### E. Should the team fix cards or stabilize the engine first?

Stabilize the rules engine and executable contract first, then migrate cards in golden-card cohorts. Continuing card-by-card fixes will preserve the current failure pattern because shared legality, zones, event semantics, lifecycle, and interaction contracts remain unstable.

The immediate order should be:

1. Repair and specify global card-play/attack-area legality.
2. Establish one production content pipeline and one LegalAction contract.
3. Make unknown/unimplemented mechanics fail closed.
4. Lock reusable primitives with contract tests.
5. Promote representative golden cards through explicit maturity gates.
6. Only then scale conversion to the remaining roster.

## Severity Summary

| Severity | Finding | User-visible consequence |
|---|---|---|
| P0 | Powered servant skills are classified as attack cards and share a one-card quota | Valid second cards disappear from actions or are rejected |
| P0 | Content has multiple production-adjacent pipelines with different schemas and zone semantics | Backend claims and frontend data can refer to different representations |
| P0 | Capability/implementation status is inferred from parse coverage, not behavioral proof | “complete/automatic” cards can be unusable |
| P1 | Extended effects can silently no-op and write untyped side-state | Skills appear to resolve while rules are not applied |
| P1 | LegalAction is authoritative only on one path and lacks reason/input metadata | UI cannot explain unavailable cards and mappings are duplicated |
| P1 | Event, duration, and cleanup semantics are fragmented | Triggered and persistent effects vary by integration point |
| P1 | Release-level tests are red and browser coverage does not exercise complex skills | Regressions reach formal testing despite green local slices |
| P1 | Audited root has no Git baseline | Changes, generated drift, and reproducibility cannot be attributed safely |
| P2 | Starter deck loaders silently pad/truncate and infer unknown cards | Invalid content becomes plausible but incorrect runtime data |
| P2 | Legacy battle and projection paths remain available | New code can accidentally bind to obsolete semantics |

## End-to-End Call Chain

### Authoring and compilation path

`data/packs/fd-playtest-v1/pack.json`

→ `packages/content/src/playtest-pack-loader.ts::loadPlaytestContentPack`

→ `scripts/compile-playtest-content-pack.ts::compilePlaytestContentPack`

→ `data/generated/fd-playtest-v1.content-library.json`, fixture, evidence report

→ imported by `apps/client/src/state/playtest-fixture-loader.ts` and, for event data, by `packages/rules/src/match-session.ts`.

This compiled library is not the formal ability runtime source. `toNamedCard()` preserves display fields but does not carry authoring abilities/effects/targets/conditions/cost nodes into the generated named card. It hardcodes `HOST_ADJUDICATED`. `startingDeckFromAuthoring()` pads short decks to 12 and truncates long decks; `mapDeckCard()` guesses unknown entries. Validation can therefore pass after semantic data has been discarded or fabricated.

### Formal match runtime path

Static authoring archive imports in `packages/rules/src/match-session.ts`

→ `buildInitialState()`

→ `mergePacks(archives.map(loadAuthoringJson))`

→ create card instances with `startingZone()` and `starterDeckFromArchive()`

→ `initializeAbilityRuntime(state, pack)`

→ `MatchRoom.dispatchClientCommand()`

→ `MatchSession.dispatchPlayerCommand()`

→ `dispatchAbilityCommand()` / interpreter `dispatch()`

→ `getLegalActions()` revalidation

→ `playBatch()`, `executeAbility()`, target decisions, response windows, `processEvent()`

→ `MatchSession.projectToClientState()`

→ client action mapping

→ `MatchTable` selection and `AvailableActionBar` buttons.

This path is authoritative, but its initial content is not the generated content library that the client also displays.

### Legacy seeded bridge

Uploaded `ContentLibraryIndex`

→ `apps/client/src/state/content-library-loader.ts`

→ `packages/rules/src/tools/seeded-state.ts`

→ `packages/rules/src/tools/content-bridge.ts`

→ generic `GameState` card instances.

This path assigns cards and zones with older assumptions and does not initialize `AbilityRuntime`. It cannot be considered equivalent to a formal MatchSession.

## Reproduced Runtime Evidence

A narrow server-side probe used real authoring archives and the formal interpreter:

| Scenario | Result |
|---|---|
| Caster: play `选王剑`, then `巡礼` | First succeeds; legal actions become empty for the second; dispatch rejects `attack_play_limit_reached` |
| Kintoki: play first then second `黄金冲击` instance | Second physical copy rejected by the same global attack quota |
| Ereshkigal: continuation play/activate/target, then protection | First flow succeeds; second card rejected by the same quota |
| Tomoe: solo play/activate, then inferno | Second card rejected by the same quota |
| Caster: `选定之杖` alone, activate X=1, choose target | Server-side play, variable payment, pending target, and target resolution succeed |

The code path is explicit:

- `entersAttackArea()` returns true for a card with positive/formula power and attributes, regardless of `servant_skill` type.
- `attackPlayAllowance()` returns `1 + extraAttackPlayAllowance`.
- `playFailure()` returns `attack_play_limit_reached` before an action is emitted.
- `getLegalActions()` emits only actions without failures.
- `playBatch()` independently enforces the same quota and says “Only one attack can be played this round”.

This is backend legality behavior. The client cannot render a button it never receives.

## Representative Skill Traces

### 1. Caster: 选定之杖

- Data: authoring JSON contains variable mana, activation, target, and effects.
- Load: `loadAuthoringJson()` accepts the nodes as automatic when all recognized fields pass its allowlists.
- Legality: play requirements and mana are checked by `playFailure()`; activation appears via `canActivate()`.
- Interaction: `activate_ability` carries a variable range; resolution creates a pending target decision; `choose_target` candidates are server-derived and revalidated.
- Mutation: core interpreter effects execute transactionally through `dispatchAbilityCommand()` cloning.
- UI: client maps the variable action and target decision, but there is no real-browser test for this card.
- Current maturity: **INTERACTION_COMPLETE in integration evidence, not E2E_VERIFIED**.

### 2. Caster: 选王剑 + 巡礼

- Data: conditions, target references, and lifecycle are structured.
- Load: fields are accepted as automatic.
- Legality defect: both are pulled into attack-area semantics by generic power/attribute heuristics.
- Runtime: the first card consumes the global quota; the second never becomes legal.
- Consequence: duration/effect correctness of the intended sequence cannot even be reached in normal play.
- Current maturity: **STRUCTURED**, blocked before reliable legality.

### 3. Drake: 黄金鹿与暴风夜 / 暴风航海者

- Data: movement and movement-counter mechanics are structured.
- Runtime: isolated target movement can execute; multi-card regression fails at the shared play quota.
- State: movement counters live in `AbilityRuntime`, while related mode-specific state is also stored through ad hoc `modeState` structures.
- Tests: Drake authoring and complex regression tests are red.
- Current maturity: **ENGINE_EXECUTABLE in isolated paths, not LEGALITY_COMPLETE**.

### 4. Kintoki: two copies of 黄金冲击

- Data: physical copies and per-game limitations are represented.
- Runtime: usage keys are instance-based, so two copies can be distinguished by the limit tracker.
- Legality defect: the unrelated global attack quota blocks the second copy first.
- Architectural lesson: a correct local primitive does not make the card playable when an upstream global classifier is wrong.
- Current maturity: **ENGINE_EXECUTABLE, not LEGALITY_COMPLETE**.

### 5. Tomoe: terrain/rain/power reduction

- Data: terrain-dependent conditions and persistent combat effects are represented as extended nodes.
- Runtime: `reduce_opponents_power` explicitly treats `opponent_has_no_terrain` as true without checking terrain and writes `powerModifiers` onto card objects through `as any`.
- Cleanup: the modifier uses a string duration but is outside the typed ongoing-effect lifecycle.
- Tests: both action/inferno and terrain/rain regressions are red; multi-card flows also hit the global quota.
- Current maturity: **STRUCTURED/PARTIALLY_EXECUTABLE**, with known incorrect condition semantics.

## Legal Action Audit

### What is authoritative today

The formal interpreter correctly follows the server-authoritative pattern:

- eligibility is recomputed at command dispatch;
- ownership, zone, phase, priority, status, face-down rules, forbids, quotas, requirements, and printed mana are checked;
- ability limits and once-per-phase use are checked;
- target cardinality, uniqueness, and candidate membership are checked at resolution;
- failed dispatch returns a rejection without committing the cloned state.

### Missing contract dimensions

The current `LegalAction` union lacks:

- stable `actionId` generated by the authority;
- `enabled` and machine-readable `disabledReason` for inspectable but unavailable actions;
- normalized cost quote, including fixed, variable, optional, and aggregate costs;
- requirements/eligibility facts useful for UI explanation;
- typed `requiredInput` covering target, option, ordering, distribution, payment, confirmation, and response;
- target labels and public metadata that do not force the client to inspect raw authoring definitions;
- revision/precondition token attached to each action;
- explicit visibility classification for action metadata.

### Frontend duplication

The frontend is not the main legality authority, but it compensates for the thin contract:

- `seven-authoring-smoke-fixture.ts::mapLegalAction` and `remote-room-fixture.ts` duplicate mappings.
- Action IDs are generated from type plus array index and are unstable across projections.
- Target labels and interaction metadata may be reconstructed from `rawCards`.
- Target count and variable ranges are enforced in controls; this is valid UX behavior, but the server must remain authoritative.
- If no mapped action exists, `AvailableActionBar` says the card is inspect-only. It cannot distinguish insufficient mana, wrong phase, consumed limit, missing target, unsupported mechanic, or backend bug.

### Required target contract

Use one server-emitted envelope:

```ts
interface ActionOffer {
  actionId: string;
  revision: number;
  kind: string;
  source?: { cardInstanceId?: string; abilityId?: string };
  availability: { enabled: boolean; reasonCode?: string; facts?: Record<string, unknown> };
  cost: CostQuote[];
  requiredInput: InputSpec[];
  commandTemplate: unknown;
}
```

The client renders and collects input. The server creates offers, evaluates legality, and validates commands.

## Primitive Catalog

The authoring archives use roughly twenty reusable semantic groups. Raw node names are more numerous because card-shaped operations have been added as separate cases.

| Primitive group | Semantics and key parameters | Legality responsibility | State mutation / lifecycle | Approx. reuse | Current implementation | Maturity |
|---|---|---|---|---:|---|---|
| ResourceAdjust | mana, VP, command seals; amount/cap | affordability, gain block, cap | player resources; immediate | high | core + extended | partial |
| PayCost | fixed/variable/optional mana | quote and pre-payment validation | atomic deduction | 4+ | interpreter | usable |
| CardMove | source/target, from/to zone, count/order | ownership, zone, visibility | cards and visibility | 8+ | core + extended | partial |
| CardDraw | count, reshuffle policy | deck availability | deck/hand/discard | 2+ | interpreter | usable |
| CardCreate | definition, owner, zone, copies | creation constraints | card instances/runtime state | 3+ | extended/core split | partial |
| SelectTarget | player/location/card/choice, scope, constraints, min/max | candidate query | pending decision | 7+ | interpreter | usable for current shapes |
| Conditional | and/or/not/comparison/domain predicates | activation/play/effect gates | none | high | core + extended | unsafe fallback |
| Branch | condition and ordered branches | condition evaluation | nested effects | 5 | interpreter | partial |
| Reveal | card/servant/true-name scope and timing | visibility prerequisites | visibility/revealedServants | 11 | interpreter/extended | partial |
| Movement | player, destination, distance, ignore engagement | legal destinations | player location/counters | 3+ | extended + MatchSession | partial |
| PowerModifier | add/set/multiply, scope, layer | applicable participants/cards | ongoing/combat calculation | high | three mechanisms | fragmented |
| RuleModifier | ignore/forbid/replace, rule, priority | play/combat legality | ongoingEffects | 3+ | interpreter | partial |
| UsageLimit | per phase/round/game, uses, key scope | action eligibility | usedAbilities/abilityUsage | widespread | interpreter | partial; key semantics vary |
| Trigger | event type, source state, optional/forced | event match and response owner | response window/effect execution | widespread | scan-all processEvent | partial |
| ResponseWindow | order, eligible responders, pass behavior | response availability | queue/windows | several | interpreter | partial |
| Duration | this action/battle/round/N rounds/while active | modifier applicability | expiry metadata | widespread | interpreter + ad hoc strings | incomplete |
| Cleanup | discard/close/revert/remove generated state | none after expiry | cards/modifiers/side-state | widespread | interpreter + MatchSession + game loop | fragmented |
| CombatOverride | defeat immunity, terrain, attribute, total power | combat participant/context | combat calculation/results | many | combat resolver + extended | partial |
| Replacement/Transform | identity/card/event/deck substitutions | replacement preconditions | definitions/cards/decks | several | replacement pipeline + extended | partial |
| Directive/HostRequest | record manual decision/operation | allowed operation list | hostRequests/directives | 10+ | interpreter/MatchSession | usable only as adjudication fallback |

The target catalog should collapse card-shaped effect names into these parameterized groups and reject any node without a registered validator, executor, lifecycle owner, and contract test.

## Trigger and Event Model

`AbilityEvent.type` is effectively an open string. `processEvent()` scans every card and every ability for each event rather than using a typed subscription registry. Existing triggers cover selected phase, declaration, card-played, battle, loss/win, and game-start moments, but there is no canonical closed lifecycle spanning command accepted, card declaring, cost paid, card resolving, card resolved, state changed, modifier expiring, and cleanup completed.

There are also multiple event concepts:

- ability input events;
- projected `SafeEvent` output;
- the event-card placement engine in `core/event-engine.ts`.

These are not one event bus. Trigger order, replacement priority, nested events, idempotency, and response ownership are therefore hard to reason about globally.

Required direction:

1. Define a discriminated canonical domain-event union.
2. Publish events only from committed state transitions.
3. Register trigger matchers by event type and source scope.
4. Define deterministic ordering and nested-event queue behavior.
5. Attach event IDs and causation IDs; deduplicate explicitly.
6. Make response windows and optional triggers first-class queue items.

## Duration, Modifier, and Cleanup Audit

Typed `ongoingEffects` exists, but it is not the only persistence mechanism. Extended effects also write `modeState`, `activeStatuses`, and card-level `powerModifiers` via `as any`. Consumers read these structures ad hoc in combat and match orchestration.

Cleanup is split among:

- `cleanupOngoing()` in the interpreter;
- attack-area discard in `MatchSession`;
- round cleanup in the game loop;
- modifier-specific string durations that may not be registered with any cleanup owner.

This makes “until round end”, “while this card is active”, “for N rounds”, and “until battle ends” implementation-dependent. Every persistent mutation should become a typed modifier/entity with an explicit scope, layer, start event, expiry predicate, and cleanup handler. Direct writes to base card/player objects should be prohibited for temporary effects.

## Fail-Open and Data-Integrity Findings

1. `extended-effects.ts` logs unknown effect types and returns successfully. Unknown mechanics can resolve as no-ops.
2. Extended conditions return a boolean, but the main fallback treats `false` as “unsupported”. A recognized extended condition that is simply unmet can be reported as an unsupported mechanic.
3. Loader acceptance proves that field names and selected values are recognized; it does not prove executable semantics.
4. Card mode is set to automatic when no card-level report exists, even if behavioral coverage is absent.
5. Generated content discards formal abilities yet remains an important client artifact.
6. Both content loaders pad/truncate starter decks; malformed content is normalized instead of rejected.
7. Tomoe's terrain predicate is knowingly approximated as always satisfied for opponents at the location.

Production rules should fail closed: unknown node, unsupported parameter combination, missing lifecycle owner, or missing target query must prevent capability promotion and legal-action emission.

## Test and Browser Evidence

Commands were run from the audited tree on 2026-09-06.

| Command | Result | Interpretation |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript shape consistency only |
| `npm run content:validate` | PASS; 7 masters, 7 servants, 20 events, 0 blocking issues | Content validation does not prove runtime behavior |
| `npm run verify:playtest-v1` | PASS; 84 starting-deck cards, 0 private-view leaks | Fixture/data checks pass |
| `npm run test:complex-skills` | FAIL; 29 passed, 8 failed | Representative skill regressions are red |
| `npm test -- --run` | FAIL; 439 passed, 30 failed; 9 files failed | Rules/content/combat contracts are not stable |
| `apps/client: npm test -- --run` | PASS; 47 tests | Client component/unit slice is green |
| `npm run e2e:fd-remote` | FAIL; 4/4 failed | Browser release path is red |

Root Vitest excludes `apps/client` and E2E. A green package subset cannot serve as a release gate.

The four Playwright failures also show fixture drift:

- a fixture assertion waits for a round-start label that is not exposed as expected;
- `本人操作台` is duplicated in nested accessible labels, causing strict locator failure;
- a phase-transition test expects `结束行动` while the real initial state offers `完成准备`;
- remote synchronization repeats the ambiguous label failure.

No current browser test completes a complex servant skill with real MatchSession data, variable payment, server candidate selection, response, persistent effect, cleanup, and reconnect projection.

## Capability Maturity Model

Replace binary `automatic/complete` claims with evidence-backed stages:

| Stage | Meaning | Required evidence |
|---|---|---|
| DATA_ONLY | Printed/source data captured | schema and source trace |
| STRUCTURED | Clause represented without semantic loss | strict typed-node validation and round-trip review |
| ENGINE_EXECUTABLE | Registered primitives execute or reject deterministically | primitive unit tests and unknown-node fail-closed test |
| LEGALITY_COMPLETE | all legal/illegal contexts and costs are authoritative | action-offer matrix and stale-command tests |
| INTERACTION_COMPLETE | every required choice/payment/response is representable | contract tests through projection and client mapper |
| E2E_VERIFIED | real browser completes the scenario against formal MatchSession/server | named Playwright golden-card test |

Promotion must be monotonic and evidence-linked. `implementationStatus: complete`, `execution.mode: automatic`, and generated `capability.status` must not independently claim a higher stage.

## Golden Card Set

Use a deliberately small set that spans mechanisms:

| Golden card/sequence | Mechanisms covered | Required terminal stage |
|---|---|---|
| Caster `选定之杖` | variable cost, private target, pending decision | E2E_VERIFIED |
| Caster `选王剑 + 巡礼` | two-card play, condition, ongoing modifier, cleanup | E2E_VERIFIED |
| Drake movement pair | location target, movement legality/counters, sequence | E2E_VERIFIED |
| Kintoki two physical copies | per-instance vs per-game limit, repeated card definition | E2E_VERIFIED |
| Tomoe terrain/rain | trigger, terrain predicate, layered power modifier, round cleanup | E2E_VERIFIED |
| Ereshkigal protection | optional/triggered effect, target, persistent protection | INTERACTION_COMPLETE then E2E_VERIFIED |

No roster-wide “supported” claim should be made until this set is green through the same path used by production clients.

## Target Architecture

```text
Authoring JSON
  -> strict versioned schema
  -> semantic compiler (no silent padding, guessing, or field loss)
  -> ExecutableCardPack
       - typed cards/abilities
       - primitive registry references
       - source/evidence metadata
       - capability stage per interaction
  -> RulesKernel
       - command validation
       - ActionOffer query
       - event queue
       - primitive execution
       - modifier/lifecycle registry
  -> MatchSession orchestration
  -> one player projection contract
  -> local or websocket transport
  -> one client action renderer
```

Authority boundaries:

- Content defines data, never executable JavaScript or host behavior.
- The compiler rejects semantic loss.
- The rules kernel owns legality, candidates, costs, effects, events, limits, and cleanup.
- MatchSession owns seating, clocks/turn progression, persistence, transport-facing projection, and orchestration.
- The client owns presentation and input collection only.

## Required Deprecations

- Deprecate `EffectDescriptor` as the general skill model; retain only for explicitly scoped legacy battle effects until migrated.
- Deprecate the generic `ContentLibraryIndex` seeded bridge for formal matches.
- Deprecate projection code that synthesizes actions independently of the rules kernel.
- Deprecate client-side duplicate action mappers; publish one contracts package mapper/view model.
- Deprecate untyped `modeState`, card `powerModifiers`, and `activeStatuses` writes.
- Deprecate silent starter-deck padding/truncation and guessed named-card mappings.
- Deprecate `automatic/complete` as standalone capability evidence.
- Remove or quarantine simplified legacy battle-phase code once callers are enumerated and migrated.

## Final Attribution

The dominant failure is **backend architecture and rules-runtime correctness**, amplified by a weak cross-layer contract and inadequate E2E verification. The frontend has real quality defects and duplicated mapping logic, but for the reported “cannot click/no valid action/limits wrong” cases it is usually displaying the backend's missing or incorrect legal actions.

The current implementation is not empty or beyond repair. It contains a useful authoritative dispatch core, target revalidation, transactional mutation, and a meaningful authoring model. The failure is that these strengths are surrounded by parallel data paths, heuristic classification, partial primitive semantics, and unsupported capability claims. Stabilization should preserve the core and remove ambiguity around it.
