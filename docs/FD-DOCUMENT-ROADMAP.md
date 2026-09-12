# FD Document Roadmap

Document Role: GOVERNANCE
Status: ACTIVE
Implementation Status: DOCUMENTATION_GOVERNANCE_ONLY
Acceptance Status: This document does not declare runtime acceptance. It routes readers to the documents that define rule truth, proof requirements, current fact, and historical evidence.
Parent: none
Depends On: `docs/rules/FD-Game-Rules-Final.md`; `docs/plans/fd-rules-conformance-and-acceptance.md`; `docs/plans/fd-card-engine-stabilization-plan.md`; `docs/audits/fd-flow-runtime-inventory.md`; `docs/audits/fd-rule-conformance-matrix.md`; `docs/audits/fd-rule-interaction-matrix.md`; `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`; `docs/plans/fd-effect-result-binding-plan.md`; `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md`; `docs/audits/fd-skill-mechanic-family-matrix.md`
Consumed By: every new implementer, reviewer, handoff agent, and Hermes-style coordinator
Supersedes: ad hoc document discovery by scanning all of `docs/`
Last Verified: 2026-09-08

## 1. Purpose

This is the single navigation entry point for FD project documentation. It defines document authority and reading order only. It does not redefine gameplay rules, implementation design, runtime status, or acceptance truth.

New agents must start here before reading reports or planning implementation. Reports are historical evidence by default and are not authority sources unless this roadmap or the acceptance baseline explicitly consumes them.

## 2. Current Project Status

Current status is documentation-governed but not release-ready:

- Canonical gameplay rules are centralized in `docs/rules/FD-Game-Rules-Final.md`.
- Acceptance governance is centralized in `docs/plans/fd-rules-conformance-and-acceptance.md`.
- Runtime fact audits show useful component evidence, but no core rule is currently `E2E_VERIFIED`.
- Current rule matrix denominator is 63 candidate rule units: 13 `COMPONENT_VERIFIED`, 2 `SCENARIO_VERIFIED`, 4 `IMPLEMENTED_UNVERIFIED`, 44 `NOT_VERIFIED`, and 0 `E2E_VERIFIED`.
- The active mainline is Card Engine Stabilization under the acceptance framework.
- Effect Result Binding is a subplan: Phase 3A infrastructure exists, but production `MatchSession` abilities still use legacy `executeAbility` / `resolveEffect`.
- Current Phase 3 strategy is mechanic-family rollout, not card-by-card pilot expansion.
- `time-alter.action` is `PHASE_3_REFERENCE_VERTICAL_PILOT`: it proves one production browser/server/projection/reconnect path, but it is not a reusable per-card rollout template.
- Current Phase 3 throughput strategy is dependency-DAG driven mechanic-family rollout with a parallel factory model. KPI is Legacy Burn-down plus Mechanic Coverage, not raw migrated card count.

## 3. Current Mainline

CURRENT:

- Preserve `FD-Game-Rules-Final.md` as the only canonical gameplay rule source.
- Use `fd-rules-conformance-and-acceptance.md` as the governance baseline for proof, reviewer gates, and release readiness.
- Treat `fd-card-engine-stabilization-plan.md` as the current active implementation mainline, with the caveat that its full historical body is missing and must be recovered or reintroduced.
- Treat `fd-phase-3-mechanic-family-rollout-plan.md` as the current Phase 3 direction subplan.
- Treat `fd-phase-3-throughput-optimization-plan.md` as the current Phase 3 scheduling and throughput subplan. It does not replace the acceptance baseline or promote any mechanic family.

NEXT:

- Execute the corrected Phase 3 throughput queue in `docs/plans/fd-phase-3-parallel-work-queue.md`: first build taxonomy/coverage automation, run `RESOURCE_NUMERIC_CORE_DIRECT_ACTION` as the low-risk primitive factory only if one runtime hot-file owner is reserved, and write Trigger/Lifecycle/Interaction Gateway specs from the corrected semantic-axis baseline. Trigger/Lifecycle/Interaction runtime migration must wait for independently reviewed gateway contracts.

LATER:

- Run Golden Flow 1 complete action phase and other Golden Flow contracts.
- Integrate Effect Result Binding into a real production ability path after the first reviewed Golden Flow slice is stable.
- Add formal canonical rule IDs if the project wants stable long-term rule-to-test traceability.

BLOCKED:

- Release readiness is blocked by missing Gate B/C evidence, multiple runtime owners, no complete browser/reconnect proof for core flows, and no production result-binding migration.
- The full historical body of `fd-card-engine-stabilization-plan.md` is missing.

DONE:

- Canonical rule baseline exists.
- Acceptance baseline exists.
- Flow runtime inventory exists.
- Rule conformance and rule interaction matrices exist.
- Golden Card / Golden Flow acceptance plan exists.
- Effect Result Binding subplan exists and is explicitly scoped as infrastructure-first / production-pending.

## 4. Document Authority Hierarchy

1. `docs/rules/FD-Game-Rules-Final.md` defines WHAT the game rules are.
2. `docs/plans/fd-rules-conformance-and-acceptance.md` defines HOW TO PROVE rule, card, flow, projection, reconnect, and release claims.
3. `docs/audits/fd-flow-runtime-inventory.md`, `docs/audits/fd-rule-conformance-matrix.md`, `docs/audits/fd-rule-interaction-matrix.md`, and `docs/audits/fd-card-runtime-architecture-audit.md` record CURRENT FACT at an audit time.
4. `docs/plans/fd-card-engine-stabilization-plan.md` defines HOW TO IMPLEMENT / MIGRATE the active mainline, subject to the acceptance baseline.
5. `docs/plans/fd-golden-card-and-flow-acceptance-plan.md` and `docs/plans/fd-effect-result-binding-plan.md` are specialized subplans under the active mainline.
6. `docs/reports/*` record HISTORICAL RESULT. They may provide evidence but must not be treated as current plans or final acceptance.
7. Older `docs/spec/*`, raw rule source files, product proposals, and duplicated documents may inform context only when they do not conflict with the hierarchy above.

## 5. Active Documents

CANONICAL:

- `docs/rules/FD-Game-Rules-Final.md` - the only current canonical gameplay rules source.

GOVERNANCE:

- `docs/FD-DOCUMENT-ROADMAP.md` - this navigation and authority map.
- `docs/agents/PHASE3-AGENT-CONTRACT.md` - short first-read role and startup contract for Phase 3 agents.
- `docs/agents/PHASE3-TASK-INDEX.md` - task-block startup index for Phase 3 agents; agents read only their assigned block by default.
- `docs/plans/fd-rules-conformance-and-acceptance.md` - acceptance and release gate baseline.
- `docs/product/FD本地化游戏PRD.md` - product target proposal; not runtime proof.
- `docs/spec/guardrail-policy.md` - content pipeline guardrail policy, subordinate to the acceptance baseline.
- `docs/spec/servant-recognition-workflow.md` - source extraction workflow, subordinate to canonical rules and acceptance governance.
- `docs/spec/adjudication-log.md` - adjudication decision log, subordinate to canonical rules.
- `docs/spec/location-policy.md` - location behavior policy for older implementation slices, subordinate to canonical rules.

ACTIVE_PLAN:

- `docs/plans/fd-card-engine-stabilization-plan.md` - current mainline stabilization plan, currently body-incomplete but still the active migration anchor.

SUBPLAN:

- `docs/plans/fd-golden-card-and-flow-acceptance-plan.md` - Golden Card / Golden Flow contracts.
- `docs/plans/fd-effect-result-binding-plan.md` - Effect Result Binding Phase 3A / production integration subplan.
- `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md` - Phase 3 mechanic-family rollout and pilot-bridge exit subplan.
- `docs/plans/fd-phase-3-throughput-optimization-plan.md` - Phase 3 dependency-DAG, gateway primitive, parallel factory, automation, and legacy burn-down scheduling subplan.
- `docs/plans/fd-phase-3-parallel-work-queue.md` - Phase 3 dispatch queue derived from the throughput optimization plan.
- `docs/plans/2026-09-12-phase-3-completion-execution-plan.md` - concrete Phase 3 completion execution plan for A/B/R sequencing, the accepted B10 baseline, current B11 production bridge, seven-domain review/spec work, A03 sync, and release-readiness blockers.

AUDIT:

- `docs/audits/fd-flow-runtime-inventory.md`
- `docs/audits/fd-rule-conformance-matrix.md`
- `docs/audits/fd-rule-interaction-matrix.md`
- `docs/audits/fd-skill-mechanic-family-matrix.md`
- `docs/audits/fd-skill-semantic-axis-matrix.md`
- `docs/audits/fd-skill-rule-normalization-audit.md`
- `docs/audits/fd-skill-primitive-conformance-matrix.md`
- `docs/audits/fd-card-runtime-architecture-audit.md`
- `docs/audits/FD-Online-Repository-Rule-Compliance-Audit.md`

## 6. Phase Ownership

| Phase | Parent Plan | Required Subplan / Audit | Primary Acceptance Vehicle |
|---|---|---|---|
| Phase 3A | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/plans/fd-effect-result-binding-plan.md` | Golden Result-Binding Card |
| Phase 3B | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md` + `docs/audits/fd-skill-mechanic-family-matrix.md` + `docs/audits/fd-skill-semantic-axis-matrix.md` | Mechanic Batch Gate A/B/C + representative Golden Cards |
| Phase 4A | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/audits/fd-flow-runtime-inventory.md` | Golden Flow 2 / Golden Flow 5 |
| Phase 4B/C | `docs/plans/fd-card-engine-stabilization-plan.md` | `docs/audits/fd-rule-interaction-matrix.md` | Golden Flow 3 / Golden Flow 5 |
| Phase 5 | `docs/plans/fd-card-engine-stabilization-plan.md` | Flow Inventory + ActionOffer design | Golden Flow 1 |

Phase labels are planning ownership labels. They do not declare implementation or acceptance status by themselves.

## 7. Mandatory Inputs Before Executing Any Phase

Every phase implementer or reviewer must read these inputs before making implementation or acceptance claims:

1. `docs/FD-DOCUMENT-ROADMAP.md`
2. `docs/agents/PHASE3-AGENT-CONTRACT.md` before Phase 3 agent dispatch
3. assigned task block in `docs/agents/PHASE3-TASK-INDEX.md` before reading broader Phase 3 plans
4. `docs/rules/FD-Game-Rules-Final.md`
5. `docs/plans/fd-rules-conformance-and-acceptance.md`
6. `docs/plans/fd-card-engine-stabilization-plan.md`
7. Current phase related subplan
8. Current phase latest related audit
9. Current phase corrected semantic-axis audit when the phase touches Trigger, Lifecycle, Interaction, Pending, Resource, or Gateway priority
10. Current phase Golden Acceptance Contract

Historical reports may be read after these inputs for provenance only.

## 8. Document Dependency Graph

`docs/rules/FD-Game-Rules-Final.md`
-> governs WHAT for all rule, card, flow, audit, plan, and report documents.

`docs/plans/fd-rules-conformance-and-acceptance.md`
-> governs HOW TO PROVE implementation, scenario, E2E, reviewer, and release claims.

`docs/audits/fd-flow-runtime-inventory.md`
-> provides current runtime facts to `fd-rule-conformance-matrix.md`, `fd-card-engine-stabilization-plan.md`, and implementation slices.

`docs/audits/fd-rule-conformance-matrix.md`
-> maps canonical candidate rule areas to owners, evidence, status, and gaps.

`docs/audits/fd-rule-interaction-matrix.md`
-> provides high-risk interaction facts to Golden Card / Golden Flow selection.

`docs/plans/fd-card-engine-stabilization-plan.md`
-> governs active migration sequencing and consumes the acceptance baseline.

`docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
-> subplan of `fd-card-engine-stabilization-plan.md`; provides proof contracts for Gate B/C slices.

`docs/plans/fd-effect-result-binding-plan.md`
-> subplan of `fd-card-engine-stabilization-plan.md`; provides the production-pending result-binding migration path.

`docs/plans/fd-phase-3-mechanic-family-rollout-plan.md`
-> subplan of `fd-card-engine-stabilization-plan.md`; rebaselines Phase 3 from card pilots to Mechanic Family -> Primitive Contracts -> Compiler Support -> Runtime Registry -> Representative Cards -> Bulk Migration.

`docs/plans/fd-phase-3-throughput-optimization-plan.md`
-> subplan of `fd-card-engine-stabilization-plan.md`; schedules Phase 3 by dependency DAG, gateway primitive contracts, parallel-safe work queues, automated evidence, and legacy burn-down metrics. It consumes the mechanic-family rollout plan and does not change acceptance status.

`docs/plans/fd-phase-3-parallel-work-queue.md`
-> dispatch document derived from the throughput optimization plan; coordinates future tasks by dependencies, hot-file conflicts, and Gate expectations.

`docs/plans/2026-09-12-phase-3-completion-execution-plan.md`
-> executable coordination plan for remaining Phase 3 work; records B10 commit `9fba6d9` as the accepted runtime baseline, B11 as the current Result Binding runtime lane, A synchronization after R judgments, and the seven target domains as a dependency plan rather than a linear post-B09 queue.

`docs/reports/2026-09-12-phase-3-current-work-brief.md`
-> maintainer-facing summary of the current objective, verified baseline, A/B/R ownership, P3-B11 scope, remaining seven-domain path, and Phase 3 completion criteria.

`docs/audits/fd-skill-mechanic-family-matrix.md`
-> provides current real-skill family coverage, reuse, complexity, and next-batch selection evidence for Phase 3.

`docs/reports/2026-09-07-effect-result-binding-design-result.md`
-> historical evidence only for Phase 3A infrastructure; does not prove production integration.

`docs/reports/fd-acceptance-framework-integration-report.md`
-> historical evidence only for acceptance framework integration and Battle Winner component work; does not supersede the roadmap or baseline.

No dependency cycle is currently required for the active authority chain. Historical reports may reference plans they generated, but those references are evidence provenance, not governance cycles.

## 9. Current Implementation Route

1. Canonical Rules: read `FD-Game-Rules-Final.md`.
2. Acceptance Framework: read `fd-rules-conformance-and-acceptance.md`.
3. Current Runtime Fact Audits: read `fd-flow-runtime-inventory.md`, then `fd-rule-conformance-matrix.md`, then `fd-rule-interaction-matrix.md`.
4. Active Stabilization: read `fd-card-engine-stabilization-plan.md`.
5. Specialized Subplans: read only the subplan relevant to the task.
6. Implementation Slice: implement the smallest slice that closes a named Gate A/B/C gap.
7. Independent Acceptance: report evidence using the acceptance baseline format and require independent review before promotion.

## 10. Acceptance Route

Acceptance claims must follow this order:

1. Canonical rule or card text identified.
2. Runtime owner identified.
3. Positive and negative evidence mapped.
4. Gate A component proof passed.
5. Gate B scenario proof passed for a named Golden Card / Golden Flow or equivalent contract.
6. Gate C production path proof passed through server/client/projection/reconnect where relevant.
7. Independent reviewer records PASS / FAILED / NOT VERIFIED.

Green tests, implementation reports, content metadata, `FULL`, `COMPLETE`, `automatic`, and report-local `PASS` are not final acceptance statuses.

## 11. Completed Milestones

- Canonical rules consolidated into `docs/rules/FD-Game-Rules-Final.md`.
- Acceptance baseline created under `docs/plans/fd-rules-conformance-and-acceptance.md`.
- Flow runtime inventory created.
- Rule conformance matrix created.
- Rule interaction matrix created.
- Golden Card / Golden Flow plan created.
- Effect Result Binding Phase 3A infrastructure implemented and documented as production-pending.
- Documentation roadmap and document architecture audit added in this pass.

## 12. Current Blockers

- `docs/rules/fd-rules-conformance-and-acceptance.md` duplicates the acceptance baseline in the rules directory and must not be treated as a rule source.
- The historical body of `docs/plans/fd-card-engine-stabilization-plan.md` is missing.
- `docs/spec/rules-spec-v0.md` still calls itself a v0 source of truth and is superseded by `FD-Game-Rules-Final.md`.
- Several older documents use `FULL`, `COMPLETE`, `Production Ready`, `automatic`, or local `PASS` language that conflicts with the newer acceptance baseline if read as final proof.
- Current runtime still has multiple owners and secondary paths for flow, movement, play, cleanup, projection, and ability resolution.
- Effect Result Binding production `MatchSession` integration is the active P3-B11 task and is not accepted until P3-R06 reviews it.

## 13. Next Recommended Step

Execute the Phase 3 throughput queue from `docs/plans/fd-phase-3-parallel-work-queue.md`.
Use `docs/plans/2026-09-12-phase-3-completion-execution-plan.md` as the concrete A/B/R coordination plan.

Immediate next work is:

1. Run P3-B11 Result Binding Production Bridge from the R-accepted P3-B10 runtime commit `9fba6d9` with Codex B holding exclusive runtime hot-file ownership.
2. Run P3-A04 B10 coverage alignment and P3-A05 Resource Numeric evidence packaging in parallel without runtime edits.
3. Send the completed B11 candidate to P3-R06, then let Codex A synchronize the judgment.
4. Complete Resource Numeric and Card Zone independent reviews and burn-down sync.
5. Define and review Trigger, Lifecycle, and Interaction gateway contracts.
6. Fix the Modifier / Power / Battle Result dependency boundary before Phase 4 runtime work.

Runtime migration should resume only after the next gateway-backed slice has explicit dependencies, hot-file ownership, Gate A/B/C expectations, and legacy burn-down metrics.

## 14. Historical / Report Documents

All files under `docs/reports/` are REPORT documents. They record execution, adapter, test, or handoff results at a point in time. They may contain useful evidence and changed-file lists, but they are not current plans and must not be used to infer that runtime functionality is complete.

Important current reports:

- `docs/reports/fd-acceptance-framework-integration-report.md` - historical acceptance integration result.
- `docs/reports/fd-phase-3-throughput-baseline.md` - current Phase 3 throughput baseline report for mechanic counts, legacy consumers, gateway hotspots, and core/special split.
- `docs/reports/2026-09-07-effect-result-binding-design-result.md` - historical Phase 3A infrastructure result.
- `docs/reports/2026-09-07-attack-play-stabilization-result.md` - historical attack/play stabilization result.
- `docs/reports/2026-09-06-card-runtime-capability-baseline.md` - historical capability baseline.
- `docs/reports/2026-09-03-*` and `docs/reports/2026-09-04-*` - historical content/adapter reports.

## 15. Superseded Documents

These documents remain available for context but should not govern current implementation or acceptance decisions:

- `docs/rules/fd-rules-conformance-and-acceptance.md` - duplicate acceptance baseline in the wrong directory; use `docs/plans/fd-rules-conformance-and-acceptance.md`.
- `docs/spec/rules-spec-v0.md` - v0 prototype source of truth superseded by `FD-Game-Rules-Final.md`.
- `docs/spec/engine-capability-matrix.md` - older deterministic capability baseline superseded for acceptance by the conformance matrix and acceptance baseline.
- `docs/spec/fd-playtest-v1-content-index.md` - content index using legacy capability labels; useful as content inventory only.
- `docs/rules/3X模式规则.txt`, `docs/rules/玩家回合流程和关键词.txt`, and the two rule `.docx` files - source materials consumed by the canonical rulebook; not independent current rule authorities.

## 16. Reading Order For New Agents

1. `docs/FD-DOCUMENT-ROADMAP.md`
2. `docs/rules/FD-Game-Rules-Final.md`
3. `docs/plans/fd-rules-conformance-and-acceptance.md`
4. `docs/plans/fd-card-engine-stabilization-plan.md`
5. The task-specific subplan: usually `fd-golden-card-and-flow-acceptance-plan.md` or `fd-effect-result-binding-plan.md`
6. The latest task-relevant audit: usually `fd-flow-runtime-inventory.md`, `fd-rule-conformance-matrix.md`, or `fd-rule-interaction-matrix.md`
7. Historical reports only when provenance, changed-file history, or prior verification commands are needed

Do not scan all docs and independently infer authority. Use this route first.
