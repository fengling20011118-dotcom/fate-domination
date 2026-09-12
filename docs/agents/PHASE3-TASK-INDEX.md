# Phase 3 Task Index

- Version: P3-TI-1.4
- Status: ACTIVE
- Scope: task-level startup index for Phase 3 agents
- Authority: subordinate to `docs/agents/PHASE3-AGENT-CONTRACT.md`

This file is the task lookup entry point for Phase 3 agents. Do not read the full `docs/plans/fd-phase-3-parallel-work-queue.md` by default. Read only the assigned task block below, then follow its explicit `Read` list.

## Flow Summary

1. Codex A owns measurement, automation, evidence packets, and taxonomy drift protection.
2. Codex B owns scoped runtime implementation, one hot-file lane at a time.
3. Codex R owns independent acceptance review and must stay read-only.
4. B runtime work may run in parallel with A documentation/tooling work only when B has exclusive ownership of its declared hot files.
5. B may not start the next runtime task until its previous implementation report exists and either R has reviewed it or the coordinator explicitly accepts the risk.

## Phase 3 Objective Coverage Map

This map is the task-level bridge back to the total project goals. It does not promote any runtime, card, flow, or release status. Promotion still requires the acceptance route in `docs/FD-DOCUMENT-ROADMAP.md` and `docs/plans/fd-rules-conformance-and-acceptance.md`.

| Objective | Total Goal Reference | Implementation Path | Concrete Tasks | Current Status | Acceptance Vehicle | Remaining Gap |
|---|---|---|---|---|---|---|
| Agent ownership and read minimization | `docs/FD-DOCUMENT-ROADMAP.md` Mandatory Inputs; `docs/agents/PHASE3-AGENT-CONTRACT.md` | Agents read the contract first, then only the assigned task block and explicit dependencies. | All P3-A/P3-B/P3-R tasks | ACTIVE | Coordinator enforcement plus R review of role drift | Keep future task blocks small and explicit. |
| Automation / coverage / evidence baseline | Roadmap NEXT; throughput plan Sections 13-15 | Build reproducible coverage schema, taxonomy drift checks, legacy/new/dual counters, and reviewer packet inputs. | P3-A01 | REVIEW_ACCEPTED | Automation output plus reviewer-readable baseline candidate | Continue slice-specific classifier alignment without changing runtime semantics. |
| Reviewer packet generation | Acceptance route Gate A/B/C; Golden acceptance plan | Convert implementation claims into checklists and missing-evidence packets without changing runtime behavior. | P3-A02, P3-A04, P3-A05 | ACTIVE | R-consumable packets and machine-readable evidence | B10 alignment is a candidate; Resource Numeric packet is the next independent review input. |
| Legacy burn-down sync | Roadmap KPI: Legacy Burn-down plus Mechanic Coverage | Update metrics only after R judgment; preserve rejected/candidate/accepted separation. | P3-A03 | READY_AFTER_REVIEW | Coverage report with before/after legacy, semantic, dual, skipped, and Gate status counts | Waits for R review result and accepted measurement method. |
| Resource Numeric Core direct action | Stabilization plan Phase 3B; throughput plan first low-risk factory slice | Route command-spell style direct resource effects by executable semantic form with fail-closed validation. | P3-TO-08; A evidence support through P3-A01/A03 | IMPLEMENTATION_COMPLETE_CANDIDATE in current docs | Gate A/B/C evidence for representative direct-resource cards | Independent review and coverage sync still required before promotion. |
| Card Zone Core direct action | Stabilization plan Phase 3B; primitive conformance matrix | Route direct zone/draw movement by executable semantic form and remove ability-id pilot fallback. | P3-TO-09; R follow-up as needed | PENDING_REVIEW / candidate evidence recorded | Gate A/B/C representative card-zone evidence | Needs R judgment and burn-down sync. |
| Card Action semantic split | Roadmap Phase 3B; mechanic family and primitive matrices; `docs/plans/2026-09-12-phase-3-completion-execution-plan.md` | Keep `PLAY`, `PLAY_SOURCE_RESPONSE`, `ADD_TO_ATTACK`, `ACTIVATE`, `CLOSE`, `CREATE_AND_ACTIVATE`, and setup create-to-skill routing as separate contracts with only shared helpers underneath. | P3-B04 through P3-B10; P3-R04/P3-R05 | B10 REVIEW_ACCEPTED at `9fba6d9`; other slices retain their recorded judgments | Separate Gate A/B/C judgment per action contract | B09/B10 do not finish Phase 3; accepted slices still require A-owned coverage synchronization. |
| Result Binding | Roadmap Phase 3A; `docs/plans/fd-effect-result-binding-plan.md` | Bind multi-step effect results to subsequent costs, awards, events, rollback, and production path. | P3-B11; independent R review after implementation | READY_FOR_PRODUCTION_BRIDGE | Golden Eater plus Conversion Magic Gate B/C | B11 must prove reusable production routing, staged rollback, interaction continuation, and no legacy bypass without expanding the card pool. |
| Target / Interaction Gateway | Roadmap NEXT; corrected semantic-axis matrix | Define target selection and pending interaction templates before broad runtime migration. | P3-TO-05; later B runtime task after spec review | SPEC_READY_NEXT / runtime waiting | Gateway contract review, then representative Gate B/C | Runtime implementation must wait for accepted gateway contract. |
| Trigger Gateway | Roadmap NEXT; corrected semantic-axis matrix | Define event payload, source ability/card identity, ordering, optional/forced handling, and projection rules. | P3-TO-03; P3-B07 only after trigger spec or explicit override | SPEC_READY_NEXT / B07 WAIT_TRIGGER_SPEC_OR_EXPLICIT_OVERRIDE | Gateway contract review, then representative trigger Gate B/C | Runtime migration blocked until spec is accepted. |
| Lifecycle Gateway | Roadmap NEXT; corrected semantic-axis matrix | Define source-close, reset, persistence, cleanup, and duration ownership before broad migration. | P3-TO-04; P3-B08 only after lifecycle spec or explicit override | SPEC_READY_NEXT / B08 WAIT_LIFECYCLE_SPEC_OR_EXPLICIT_OVERRIDE | Gateway contract review, then representative lifecycle Gate B/C | Runtime migration blocked until lifecycle owner contract is accepted. |
| Modifier / Power / Battle Result Envelope | Roadmap blockers; stabilization plan current Phase 3B note | Keep high-risk battle and power behavior behind reviewed owner contracts; do not treat card-action success as battle readiness. | P3-TO-14; P3-TO-15; future B tasks | WAIT_REVIEW / WAIT_GATEWAY | Representative modifier, power, and battle Gate A/B/C | Needs envelope design, owner decision, and legacy bypass audit. |
| Golden Flow coverage | Roadmap release blockers; Golden acceptance plan | Prove browser/server/projection/reconnect paths for named flows, not raw card count. | Existing Golden Flow reports plus future R review | IMPLEMENTER_EVIDENCE_RECORDED / independent review pending | Golden Flow Gate B/C | Release readiness remains blocked until R promotes required flows. |
| Release readiness | Roadmap Current Project Status and Acceptance Route | Close named Gate A/B/C gaps, eliminate conflicting runtime owners, and prove production paths. | Aggregate of A/B/R tasks | BLOCKED | Roadmap acceptance route plus independent release gate review | B09 alone cannot complete Phase 3 or release readiness. |

## TASK P3-A01

Owner: Codex A
Status: REVIEW_ACCEPTED
Branch: `codex/a-p3-a01-coverage-automation`

Goal:

Phase 3 coverage and evidence automation baseline.

Depends on:

- Phase 3 taxonomy remediation candidate reviewed or explicitly accepted for automation baseline.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- `docs/plans/fd-phase-3-throughput-optimization-plan.md` Sections 13-15
- `docs/reports/fd-phase-3-throughput-baseline.md`
- `docs/audits/fd-skill-semantic-axis-matrix.md`

May touch:

- `docs/audits/*.mjs`
- `docs/reports/*`
- machine-readable evidence artifacts
- `package.json` only for script registration, if script ownership is reserved

Do not touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/match-session.ts`
- runtime semantics
- primitive behavior
- semantic routing
- card-specific runtime behavior

Required output:

- coverage command or command design
- machine-readable schema
- taxonomy drift rule
- legacy / new / dual counter definition
- reviewer packet format

Completion status allowed:

- `AUTOMATION_BASELINE_CANDIDATE`

Runtime defect handling:

- Record `RUNTIME_SEMANTIC_GAP` with evidence and hand to Codex B.
- Do not fix runtime behavior.

## TASK P3-A02

Owner: Codex A
Status: READY
Branch: `codex/a-p3-a02-review-packets`

Goal:

Generate reviewer packet templates and per-slice evidence checklists for current Card Action candidates.

Depends on:

- P3-A01 completed or an explicit reviewer-packet schema accepted by coordinator.
- B04 implementation report available for the first packet.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-A02 only
- `docs/reports/2026-09-08-card-action-play-result.md`
- `docs/audits/fd-skill-primitive-conformance-matrix.md` relevant card-action rows only
- `docs/plans/fd-golden-card-and-flow-acceptance-plan.md` relevant Gate C evidence section only

May touch:

- `docs/reports/*checklist.md`
- `docs/reports/*review-packet.md`
- `docs/audits/*.mjs` only for packet generation

Do not touch:

- runtime files
- tests
- taxonomy KPI rules unless P3-A01 explicitly left them incomplete

Required output:

- B04 reviewer packet
- B10 reviewer packet when B10 report is available
- reusable packet template for B05-B10
- explicit missing-evidence list for R

Completion status allowed:

- `REVIEW_PACKET_BASELINE_CANDIDATE`

## TASK P3-A03

Owner: Codex A
Status: READY
Branch: `codex/a-p3-a03-burndown-sync`

Goal:

Update coverage and legacy burn-down records after R reviews B04 or later B tasks.

Depends on:

- R review result for the relevant B task.
- A coverage command or manual baseline accepted for the task.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-A03 only
- relevant R review report
- relevant B implementation report
- `docs/reports/fd-phase-3-throughput-baseline.md`

May touch:

- coverage output artifacts
- `docs/reports/fd-phase-3-throughput-baseline.md`
- relevant `docs/reports/*`

Do not touch:

- runtime files
- implementation tests
- evidence classification rules beyond recording R's result

Required output:

- updated legacy / new / dual count
- explicit accepted / rejected / pending status
- named next task dependency changes if needed

Completion status allowed:

- `COVERAGE_SYNC_CANDIDATE`

## TASK P3-A04

Owner: Codex A
Status: AUTOMATION_BASELINE_CANDIDATE
Branch: `codex/a-p3-a01-coverage-automation`

Goal:

Align Phase 3 coverage automation with the independently accepted P3-B10 `SETUP_CARD_CREATION_MINIMAL:CREATE_TO_SKILL` contract and reconcile the accepted B06-B08 classifier baseline.

Depends on:

- P3-B10 accepted at runtime commit `9fba6d9`.
- P3-A03 B10 reviewer packet available.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-A04 only
- P3-A03 B10 reviewer packet from Codex A evidence commit `e7f7908`
- P3-B10 final implementation report at `9fba6d9`
- current `phase3-skill-coverage` output from Codex A's workspace as generated evidence only

May touch:

- `scripts/phase3-coverage.ts`
- `scripts/tests/phase3-coverage.test.ts`
- reports and machine-readable evidence artifacts

Must not touch:

- rule runtime semantics, primitive behavior, semantic routing, or `MatchSession`
- card authoring JSON
- Gate A/B/C promotion

Required output:

- semantic-shape classifier for B10 without card or ability ids
- cumulative B06-B08 classifier alignment
- positive, negative, and id-independence automation tests
- global legacy/new/dual counts and B10 synchronization report

Completion status allowed:

- `AUTOMATION_BASELINE_CANDIDATE`

## TASK P3-A05

Owner: Codex A
Status: AUTOMATION_BASELINE_CANDIDATE
Branch: `codex/a-p3-a01-coverage-automation`

Goal:

Package `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` as independently reviewable evidence and reconcile its semantic consumers with the accepted coverage baseline.

Depends on:

- P3-A04 coverage alignment candidate exists.
- Resource Numeric implementation candidate and reviewer checklist exist.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-A05 only
- `docs/reports/2026-09-08-resource-numeric-core-direct-action-result.md`
- `docs/reports/2026-09-08-resource-numeric-core-direct-action-review-checklist.md`
- current generated coverage and automation-audit artifacts from Codex A's workspace

May touch:

- reports and machine-readable evidence artifacts
- coverage/evidence automation tests only when an evidence-classification defect blocks the packet

Must not touch:

- runtime semantics, primitive behavior, semantic routing, `MatchSession`, or card authoring
- Gate A/B/C promotion

Required output:

- eligible/skipped inventory with reasons
- semantic-route and legacy-fallback boundary
- Gate A/B/C evidence-location checklist
- current legacy/new/dual counts
- reviewer-ready report and machine-readable packet

Completion status allowed:

- `AUTOMATION_BASELINE_CANDIDATE`

## TASK P3-R04

Owner: Codex R
Status: READY_AFTER_P3_B04
Branch: `codex/r-p3-r04-card-action-play-review`

Goal:

Independent review of `CARD_ACTION_SEMANTICS_MINIMAL_PLAY`.

Depends on:

- B04 implementation report and diff available.
- B04 test command output available.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-R04 only
- `docs/rules/FD-Game-Rules-Final.md` card play semantics only
- B04 implementation report
- B04 diff
- B04 focused test output
- `docs/audits/fd-skill-mechanic-family-matrix.md` relevant `CARD_ACTION_SEMANTICS_MINIMAL_PLAY` rows only
- `docs/audits/fd-skill-primitive-conformance-matrix.md` relevant `play_selected_cards` row only

May inspect:

- runtime implementation diff
- focused tests
- evidence reports
- relevant source files touched by B04

Must not:

- implement fixes
- modify runtime
- modify tests
- redefine B04 scope
- promote based on implementer-only claims without fresh verification

Required output:

- findings ordered by severity
- rule conformance judgment
- secondary runtime path audit
- legacy fallback audit
- Gate A/B/C judgment or blocker list

Completion status allowed:

- `GATE_A_B_CANDIDATE_ACCEPTED`
- `IMPLEMENTATION_NEEDS_REVISION`
- `REJECTED`

## TASK P3-B04

Owner: Codex B
Status: READY_RUNTIME_OWNER
Branch: `codex/b-p3-b04-card-action-play`

Goal:

`CARD_ACTION_SEMANTICS_MINIMAL_PLAY`.

Depends on:

- `CARD_ZONE` review accepted.
- Runtime hot-file ownership reserved.
- Relevant taxonomy baseline consumed as read-only input.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B04 only
- `docs/rules/FD-Game-Rules-Final.md` card play semantics only
- `docs/plans/fd-card-engine-stabilization-plan.md` Phase 3 only
- `docs/audits/fd-skill-mechanic-family-matrix.md` relevant `CARD_ACTION_SEMANTICS_MINIMAL_PLAY` rows only
- `docs/audits/fd-skill-semantic-axis-matrix.md` relevant ability rows only

May touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/ability/types.ts` only if the primitive contract requires it
- focused mechanic tests
- scoped implementation report

Must not touch:

- coverage KPI
- taxonomy classifier rules
- evidence classification
- unrelated card-action contracts
- Trigger runtime
- Lifecycle runtime
- Interaction runtime
- Hidden projection runtime
- Battle runtime

Hot files:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`

Concurrent conflicts:

- any other runtime task touching hot files

Required output:

- before/after legacy route count
- semantic routing proof
- fail-closed proof
- focused tests
- implementation report

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

Evidence rule:

- Codex B may produce implementer evidence only.
- Codex R must independently judge Gate A/B/C promotion.

## TASK P3-B05

Owner: Codex B
Status: READY_AFTER_P3_R04
Branch: `codex/b-p3-b05-play-source-response`

Goal:

`CARD_ACTION_SEMANTICS_MINIMAL_PLAY_SOURCE_CARD_WITH_COST_RESPONSE`.

Depends on:

- P3-R04 accepts or clears B04 `PLAY` contract boundaries.
- Runtime hot-file ownership reserved.
- Fixed response-window source-card play representative selected.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B05 only
- `docs/rules/FD-Game-Rules-Final.md` response and card play semantics only
- `docs/reports/2026-09-08-card-action-play-source-response-result.md`
- `docs/audits/fd-skill-mechanic-family-matrix.md` relevant Volumen / play-source row only
- `docs/audits/fd-skill-primitive-conformance-matrix.md` `play_source_card` row only

May touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- focused response-play tests
- scoped implementation report

Must not touch:

- normal `PLAY` acceptance rules except shared helper fixes needed by B05
- `ADD_TO_ATTACK`
- `CREATE_AND_ACTIVATE`
- `ACTIVATE`
- `CLOSE`
- Trigger/Lifecycle/Interaction/Battle runtime beyond the exact response-play contract
- coverage KPI or taxonomy rules

Hot files:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`

Concurrent conflicts:

- any runtime task touching hot files

Required output:

- fixed cost payment proof
- source-card-in-hand revalidation proof
- response-window legality proof
- before/after legacy route count
- focused tests and implementation report

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

## TASK P3-B06

Owner: Codex B
Status: READY_AFTER_P3_R04_OR_COORDINATOR
Branch: `codex/b-p3-b06-add-to-attack`

Goal:

`CARD_ACTION_SEMANTICS_MINIMAL_ADD_TO_ATTACK`.

Depends on:

- B04 `PLAY` boundary understood, so ADD_TO_ATTACK cannot inherit normal play counters.
- Runtime hot-file ownership reserved.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B06 only
- `docs/rules/FD-Game-Rules-Final.md` attack/add/support card semantics only
- `docs/reports/2026-09-08-card-action-add-to-attack-result.md`
- `docs/audits/fd-card-action-add-to-attack-inventory.mjs`
- `docs/audits/fd-skill-mechanic-family-matrix.md` relevant ADD_TO_ATTACK row only

May touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- focused add-to-attack tests
- scoped implementation report

Must not touch:

- normal `PLAY` counters except tests proving ADD_TO_ATTACK does not consume them
- `PLAY_SOURCE_CARD_WITH_COST_RESPONSE`
- `CREATE_AND_ACTIVATE`
- `ACTIVATE`
- `CLOSE`
- Trigger/Lifecycle/Battle runtime beyond exact add-to-attack representative requirements
- coverage KPI or taxonomy rules

Hot files:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`

Concurrent conflicts:

- P3-B05, P3-B07, P3-B08, P3-B09, P3-B10, or any runtime task touching hot files

Required output:

- attach-to-existing-attack proof
- proof normal play counters are not consumed unless rule text says so
- target validation proof
- before/after legacy route count
- focused tests and implementation report

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

## TASK P3-B07

Owner: Codex B
Status: WAIT_TRIGGER_SPEC_OR_EXPLICIT_OVERRIDE
Branch: `codex/b-p3-b07-activate`

Goal:

`CARD_ACTION_SEMANTICS_MINIMAL_ACTIVATE`.

Depends on:

- Trigger/Event gateway spec reviewed if the activate representative depends on trigger timing.
- Runtime hot-file ownership reserved.
- Existing inactive target card activation scope confirmed.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B07 only
- `docs/reports/2026-09-08-card-action-activate-result.md`
- `docs/audits/fd-skill-mechanic-family-matrix.md` relevant ACTIVATE row only
- `docs/audits/fd-skill-semantic-axis-matrix.md` relevant activation ability rows only

May touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/match-session.ts` only if the reviewed ACTIVATE contract explicitly requires scheduler or round-end ownership
- focused activate tests
- scoped implementation report

Must not touch:

- normal `PLAY`
- `ADD_TO_ATTACK`
- `CREATE_AND_ACTIVATE`
- `CLOSE`
- broad Trigger runtime
- broad Lifecycle runtime
- coverage KPI or taxonomy rules

Hot files:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/match-session.ts` if reserved

Concurrent conflicts:

- any runtime task touching hot files

Required output:

- existing-card activation proof
- duplicate activation rejection
- trigger/scheduler dependency proof or explicit non-dependency
- before/after legacy route count
- focused tests and implementation report

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

## TASK P3-B08

Owner: Codex B
Status: WAIT_LIFECYCLE_SPEC_OR_EXPLICIT_OVERRIDE
Branch: `codex/b-p3-b08-close`

Goal:

`CARD_ACTION_SEMANTICS_MINIMAL_CLOSE`.

Depends on:

- Lifecycle/source-close cleanup boundary reviewed if close affects active source cleanup.
- Runtime hot-file ownership reserved.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B08 only
- `docs/reports/2026-09-08-card-action-close-result.md`
- `docs/audits/fd-skill-mechanic-family-matrix.md` relevant CLOSE row only
- `docs/audits/fd-skill-semantic-axis-matrix.md` relevant close/source lifecycle rows only

May touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/match-session.ts` only if reviewed lifecycle cleanup requires it
- focused close tests
- scoped implementation report

Must not touch:

- targeted close
- close-then-activate
- `CREATE_AND_ACTIVATE`
- normal `PLAY`
- `ADD_TO_ATTACK`
- response-window close
- broad lifecycle cleanup matrix
- coverage KPI or taxonomy rules

Hot files:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/match-session.ts` if reserved

Concurrent conflicts:

- any runtime task touching hot files

Required output:

- source-close proof
- destination / active-state cleanup proof
- stale duplicate rejection proof
- before/after legacy route count
- focused tests and implementation report

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

## TASK P3-B09

Owner: Codex B
Status: WAIT_INVENTORY_AND_GATEWAY_SPECS
Branch: `codex/b-p3-b09-create-and-activate`

Goal:

`CARD_ACTION_SEMANTICS_MINIMAL_CREATE_AND_ACTIVATE`.

Depends on:

- dedicated create-and-activate inventory proves one exact representative and skip reasons.
- Card Zone create contract reviewed.
- ACTIVATE boundary reviewed.
- Lifecycle/source identity boundary reviewed.
- Runtime hot-file ownership reserved.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B09 only
- relevant future create-and-activate inventory
- `docs/audits/fd-skill-mechanic-family-matrix.md` relevant CREATE_AND_ACTIVATE rows only
- `docs/audits/fd-skill-semantic-axis-matrix.md` relevant create/activate/lifecycle rows only

May touch:

- runtime hot files only after all dependencies are cleared
- focused create-and-activate tests
- scoped implementation report

Must not touch:

- broad create-card semantics
- broad activate semantics
- normal `PLAY`
- `ADD_TO_ATTACK`
- `CLOSE`
- hidden/private create flows
- special subsystem create flows
- coverage KPI or taxonomy rules

Hot files:

- to be declared by the future inventory before implementation starts

Concurrent conflicts:

- any runtime task touching declared hot files

Required output:

- inventory with exact representative and skip reasons
- create identity proof
- immediate activation proof
- lifecycle/source ownership proof
- before/after legacy route count
- focused tests and implementation report

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

## TASK P3-B10

Owner: Codex B
Status: REVIEW_ACCEPTED
Branch: `codex/b-p3-b10-setup-create-to-skill`

Goal:

Historical completed task: repair `SETUP_CREATE_TO_SKILL` semantic-form routing and duplicate-created-card provenance handling after failed independent review. The accepted runtime baseline is commit `9fba6d9`.

Depends on:

- Historical failed-review findings `CARD_SPECIFIC_SEMANTIC_EXCLUSION` and `EXISTING_CARD_PROVENANCE_ADOPTION`.
- Runtime hot-file ownership was reserved for the repair.
- The repair and focused evidence were accepted for downstream baseline use at `9fba6d9`.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B10 only
- relevant B10 failed review report or reviewer findings
- `docs/audits/fd-skill-semantic-axis-matrix.md` relevant setup/create-to-skill rows only
- relevant canonical setup/create card rule sections

May touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- focused setup/create-to-skill tests
- scoped B10 implementation report

Must not touch:

- coverage KPI or taxonomy rules
- reviewer packet classification
- unrelated card-action contracts
- trigger gateway runtime
- lifecycle gateway runtime
- broad special subsystem behavior

Hot files:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`

Concurrent conflicts:

- do not reopen the accepted B10 hot files from this historical task while B11 is active
- B10 coverage classification remains A-owned

Required repair:

- remove card-id-specific semantic exclusion such as `cardId !== 'card.luck'`
- prove routing is based on semantic axes, not definition id
- add a positive case showing an arbitrary valid card id with the same legal shape can route
- keep Artoria Caster excluded by its non-matching semantic form, not by its card id
- allow duplicate no-op only when the existing card was already generated by the same `sourceCardId`
- fail closed with `duplicate_created_card` when existing card provenance is missing or different
- prove fail-closed duplicate rejection leaves state, events, and revision unchanged

Required output:

- focused failing tests for both review blockers
- runtime repair
- focused passing test output
- B10 implementation report with before/after evidence
- explicit note that `phase3:coverage` still belongs to Codex A after R accepts the repair

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

Recorded outcome:

- Runtime baseline accepted for downstream work: `9fba6d9`.
- Coverage synchronization remains Codex A-owned and does not alter the runtime acceptance baseline.

## TASK P3-B11

Owner: Codex B
Status: READY
Branch: `codex/b-p3-b11-result-binding-production-bridge`

Goal:

Implement `RESULT_BINDING_PRODUCTION_BRIDGE` for the existing Golden Eater and Conversion Magic representatives only. Prove that validated typed results can be consumed by later nodes through the production `MatchSession` path, including staged interaction continuation and transactional rollback, without any legacy `resolveEffect` bypass.

Depends on:

- P3-B10 accepted by R05 at runtime baseline commit `9fba6d9`.
- P3-A03/A04 B10 automation sync may run in parallel and does not block B11.
- No outstanding R-required Resource Numeric or Card Zone runtime blocker.
- Codex B has exclusive ownership of the runtime hot files listed below.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-B11 only
- `docs/reports/2026-09-12-p3-b11-result-binding-production-bridge-handoff.md`
- `artifacts/phase3-b11-result-binding-production-bridge-handoff.json`
- `docs/plans/fd-effect-result-binding-plan.md` only for result-envelope, rollback, and production-bridge requirements
- canonical Golden Eater and Conversion Magic authoring definitions only

May touch:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`
- focused result-binding and production-bridge tests
- `e2e/fd-golden-eater-result-binding.spec.ts`
- `e2e/fd-conversion-magic-core-primitive.spec.ts` only for regression assertions required by this task
- scoped B11 implementation report

Must not touch:

- cards or abilities outside Golden Eater and Conversion Magic
- coverage KPI, taxonomy, classifier, or evidence-promotion rules
- broad Target/Interaction, Trigger, Lifecycle, Battle, Modifier, or Hidden Information runtime
- card- or ability-id fallback routing
- unrelated client/server behavior
- Gate A/B/C status promotion

Hot files:

- `packages/rules/src/ability/interpreter.ts`
- `packages/rules/src/ability/executable-card-pack.ts`
- `packages/rules/src/ability/resolution-dataflow.ts`

Concurrent conflicts:

- any runtime task touching the same hot files
- any attempt by Codex A or R to edit runtime while B11 is active

Required implementation contract:

- route only a compiler-validated, fully supported result-binding graph; routing eligibility must be semantic and must not depend on Golden Eater or Conversion Magic ids
- retain Conversion Magic as the no-interaction control for `move_all_remaining -> movedCount -> adjust_mana`
- migrate Golden Eater through the same typed binding infrastructure while preserving its two server-owned target stages and optional 7-mana branch
- persist only the minimum validated continuation data needed across pending interaction stages; never accept client-supplied binding values
- use dispatch transaction boundaries: a failed first stage commits nothing; a failed second stage preserves the already committed first stage but rolls back payment, movement, VP, events, and revision from the failing dispatch
- reject compiler, binding, target-reference, and runtime invariant failures as `resolution_failed` without calling legacy `resolveEffect`
- leave unsupported result-binding or interaction shapes on their existing route and report them as skipped; do not broaden eligibility to improve counts

Required output:

- focused compiler and runtime negative tests written before implementation
- real `MatchSession.dispatchPlayerAction` proof for both representatives
- interaction continuation, reconnect/projection, stale replay, and rollback evidence appropriate to Golden Eater
- regression proof that Conversion Magic still settles mana from actual `movedCount`
- explicit legacy-bypass instrumentation or equivalent proof for eligible success and failure paths
- B11 implementation report with before/after `legacyResolveEffect`, `newRuntimeSemanticRouted`, `dualRuntime`, local eligible/migrated/skipped counts, and unchanged skipped abilities
- explicit note that global KPI/classifier synchronization belongs to Codex A after R judgment

Completion status allowed:

- `IMPLEMENTATION_COMPLETE_CANDIDATE`

## TASK P3-R05

Owner: Codex R
Status: READY_AFTER_EACH_B_TASK
Branch: `codex/r-p3-card-action-followup-review`

Goal:

Independent review for B05-B10 Card Action follow-up slices.

Depends on:

- corresponding B implementation report and diff.
- corresponding A reviewer packet when available.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-R05 only
- relevant B task block
- relevant B implementation report
- relevant focused test output
- relevant canonical rule sections listed by the B task
- relevant mechanic matrix rows listed by the B task

May inspect:

- implementation diff
- focused tests
- generated evidence packet
- secondary runtime paths named by the task

Must not:

- implement fixes
- rewrite task scope
- merge independent card-action contracts
- accept inheritance across `PLAY`, `PLAY_SOURCE`, `ADD_TO_ATTACK`, `ACTIVATE`, `CLOSE`, and `CREATE_AND_ACTIVATE`

Required output:

- findings ordered by severity
- accepted evidence
- rejected evidence
- missing tests or residual risk
- Gate A/B/C judgment

Completion status allowed:

- `GATE_A_B_CANDIDATE_ACCEPTED`
- `IMPLEMENTATION_NEEDS_REVISION`
- `REJECTED`

## TASK P3-R06

Owner: Codex R
Status: READY_AFTER_P3_B11
Branch: reviewer-selected read-only workspace

Goal:

Independently review P3-B11 Result Binding Production Bridge without implementing fixes or inheriting acceptance from B10, Conversion Magic, or historical Golden Eater evidence.

Depends on:

- P3-B11 implementation report and clean diff.
- Focused Gate A/B evidence and relevant Gate C production-path evidence.
- Codex A packet when available; absence of classifier support must be reported, not repaired by R.

Read:

- `docs/agents/PHASE3-AGENT-CONTRACT.md`
- TASK P3-R06 only
- TASK P3-B11
- P3-B11 handoff, implementation report, focused test output, and diff
- `docs/plans/fd-effect-result-binding-plan.md` relevant acceptance sections only
- canonical Golden Eater and Conversion Magic definitions

Must not:

- implement fixes
- broaden P3-B11 to other cards or gateway families
- accept client-authored result bindings
- infer Gate C from unit tests or historical candidate reports
- change coverage KPI or classifier behavior

Required output:

- findings ordered by severity
- semantic-routing and no-legacy-bypass judgment
- transaction/rollback and interaction-continuation judgment
- Gate A/B/C judgment per representative
- explicit residual risks and A synchronization input

Completion status allowed:

- `GATE_A_B_CANDIDATE_ACCEPTED`
- `IMPLEMENTATION_NEEDS_REVISION`
- `REJECTED`

## Prompt Templates

Codex A startup prompt:

```text
You are Codex A for FD Phase 3.

Read docs/agents/PHASE3-AGENT-CONTRACT.md first.
Then read only your assigned TASK block from docs/agents/PHASE3-TASK-INDEX.md.
Do not read the full parallel work queue unless your TASK block explicitly tells you to.
Do not modify files outside your TASK block's May touch list.
If you find a runtime semantic defect, record RUNTIME_SEMANTIC_GAP and stop; do not fix it.
Final status must be one of the statuses allowed by your TASK block.
```

Codex B startup prompt:

```text
You are Codex B for FD Phase 3.

Read docs/agents/PHASE3-AGENT-CONTRACT.md first.
Then read only your assigned TASK block from docs/agents/PHASE3-TASK-INDEX.md.
Do not read the full parallel work queue unless your TASK block explicitly tells you to.
You own runtime implementation only for this task's declared hot files.
Do not redefine taxonomy, KPI, or evidence classification.
Do not expand scope into Trigger, Lifecycle, Interaction, Hidden, or Battle runtime unless your TASK block explicitly permits that exact dependency.
Final status must be one of the statuses allowed by your TASK block.
```

Codex R startup prompt:

```text
You are Codex R for FD Phase 3.

Read docs/agents/PHASE3-AGENT-CONTRACT.md first.
Then read only your assigned TASK block from docs/agents/PHASE3-TASK-INDEX.md.
Default to READ ONLY.
Do not implement fixes while reviewing.
Do not merge independent card-action contracts for acceptance.
Return findings first, then Gate judgment.
Final status must be one of the statuses allowed by your TASK block.
```
