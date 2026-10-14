# FD Phase 3 Parallel Work Queue

- Document Role: DISPATCH_PLAN
- Status: ACTIVE / THROUGHPUT_OPTIMIZATION_CANDIDATE
- Implementation Status: DOCUMENTATION_ONLY
- Acceptance Status: No task in this queue is accepted until the relevant Gate A/B/C evidence is independently reviewed.
- Parent: `docs/plans/fd-phase-3-throughput-optimization-plan.md`
- Concrete Execution Plan: `docs/plans/2026-09-12-phase-3-completion-execution-plan.md`
- Last Verified: 2026-09-12

This queue is for dispatching future Phase 3 work without putting multiple agents on the same runtime hot files. Status values here are planning statuses only.

All Phase 3 agents must read `docs/agents/PHASE3-AGENT-CONTRACT.md` first, then read only their assigned task block in `docs/agents/PHASE3-TASK-INDEX.md`. Do not read this full queue during agent startup unless the assigned task block explicitly requires it. Role ownership lives in the contract; this queue is the human scheduling overview. Detailed A/B/R execution blocks live in `docs/agents/PHASE3-TASK-INDEX.md`.

| Task ID | Track | Goal | Dependencies | Expected Unlock | Legacy Reduction Target | Files | Gate | Parallel With | Conflicts With | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| P3-TO-01 | Automation | Design taxonomy validator plus consolidated coverage JSON schema and command contract. | Corrected semantic-axis matrix | Enables all later burn-down reporting without axis contamination. | none | automation design, tests, and reports | Evidence infra | all docs-only gateway work | none | REVIEW_ACCEPTED |
| P3-TO-02 | Automation | Maintain the read-only `phase3:coverage` reporter, legacy/new/dual counter, and docs drift check. | P3-TO-01 | Replaces manual matrix sync. | measurable baseline only | Codex A coverage scripts/tests and generated artifacts | Evidence infra | P3-B11 while A avoids runtime files | any runtime edit or KPI redefinition by B | ACTIVE_ALIGNMENT |
| P3-TO-03 | Gateway Specs | Define Trigger Gateway contracts for strict Domain Event Trigger only. | corrected semantic-axis inventory | Unlocks 37 strict domain-event trigger decomposition. | none yet | `docs/plans`, `docs/audits` | Gate A design | P3-TO-01, P3-TO-04, P3-TO-05, P3-TO-08 | runtime trigger implementation | READY_NEXT |
| P3-TO-04 | Gateway Specs | Define Lifecycle Policy Gateway for explicit duration/persistence/source/reset/cleanup only. | corrected lifecycle/reset inventory | Unlocks 11 explicit lifecycle/reset abilities plus modifier/source cleanup. | none yet | `docs/plans`, `docs/audits` | Gate A design | P3-TO-01, P3-TO-03, P3-TO-05, P3-TO-08 | runtime cleanup implementation | READY_NEXT |
| P3-TO-05 | Gateway Specs | Define Interaction Template contracts for target/response/branch/yes-no/amount/order only. | acceptance baseline, corrected interaction inventory | Unlocks 20 explicit interaction abilities and 11 strict PendingInteraction abilities. | none yet | `docs/plans`, `docs/audits` | Gate A design | P3-TO-01, P3-TO-03, P3-TO-04, P3-TO-08 | runtime pending/response implementation | READY_NEXT |
| P3-TO-06 | Reviewer | Generate reviewer packet template for mechanic batches. | P3-TO-01 optional | Faster independent review. | none | `docs/reports/*checklist.md` | Reviewer | P3-TO-03, P3-TO-04 | none | READY_NEXT |
| P3-TO-07 | Gate C Factory | Design shared Playwright stale/reconnect helpers. | existing E2E patterns | Reduces per-card Gate C cost. | none | `e2e/support/*` | Gate C infra | P3-TO-01, P3-TO-06 | active E2E support edits | READY_NEXT |
| P3-TO-08 | Low-Risk Primitive Factory | Resource Numeric Core direct-action factory candidate: typed resource primitive contract, compiler fail-closed, semantic routing, Gate A, representative Gate B. | corrected semantic-axis inventory; hot-file owner reserved | Validates first production mechanic factory without trigger/battle/hidden/lifecycle contamination. | direct resource ability-id fallback deletion and 3 direct consumers | `interpreter.ts`, `resolution-dataflow.ts`, `executable-card-pack.ts`, focused tests only if implementation authorized | Gate A/B candidate | P3-TO-01, P3-TO-03, P3-TO-04, P3-TO-05 docs-only work | any runtime hot-file task | READY_NEXT_RUNTIME_OWNER |
| P3-TO-09 | Low-Risk Runtime | Review-promote or reject Card Zone direct-action candidate. | reviewer checklist | Confirms pilot allowlist deletion. | no new reduction | docs/tests only unless fixes needed | Reviewer Gate | P3-TO-01 | any runtime edit if fixes required | PENDING_REVIEW |
| P3-TO-10 | Low-Risk Runtime | Review-promote or reject Card Action scoped candidates: PLAY, PLAY_SOURCE, ADD_TO_ATTACK, ACTIVATE, CLOSE. | reviewer packets | Prevents candidate pile-up. | no new reduction | docs/tests only unless fixes needed | Reviewer Gate | P3-TO-01 | any runtime edit if fixes required | PENDING_REVIEW |
| P3-TO-17 | Low-Risk Runtime Repair | P3-B10 setup create-to-skill semantic routing and provenance repair. | completed R review | Supplies the fixed runtime baseline for B11. | local exact contract 3 legacy -> 0; A-owned global sync follows | accepted commit `9fba6d9` and B10 report | R-accepted runtime baseline | P3-A04 evidence sync | reopening runtime during B11 | REVIEW_ACCEPTED |
| P3-TO-18 | Result Binding Runtime | P3-B11 production bridge for Golden Eater and Conversion Magic. | P3-B10 accepted at `9fba6d9`; exclusive runtime hot files | Proves reusable typed result consumption through production `MatchSession`, staged interaction, rollback, and no legacy bypass. | report local eligible/migrated/skipped; A syncs global counts after R06 | `interpreter.ts`, `executable-card-pack.ts`, `resolution-dataflow.ts`, focused tests, scoped E2E, B11 report | Gate A/B/C candidate, then P3-R06 | P3-A04/P3-A05 docs and automation only | any runtime hot-file task | READY_RUNTIME_OWNER |
| P3-TO-11 | Trigger Runtime | First gateway-backed trigger slice: deployment/location resource trigger representative. | P3-TO-03, P3-TO-02 preferred | Starts trigger-family burn-down. | 1-2 abilities | `interpreter.ts`, `resolution-dataflow.ts`, tests, E2E if needed | Gate A/B, C if projection/reconnect changes | P3-TO-06 only | any runtime hot-file task | WAIT_GATEWAY |
| P3-TO-12 | Lifecycle Runtime | First lifecycle policy slice: source-active duration/cleanup representative. | P3-TO-04, P3-TO-02 preferred | Starts lifecycle burn-down. | 1-3 abilities | `interpreter.ts`, `match-session.ts`, `combat-resolver.ts`, tests | Gate A/B/C representative | P3-TO-06 only | P3-TO-11, P3-TO-13 | WAIT_GATEWAY |
| P3-TO-13 | Interaction Runtime | First private/optional target template representative. | P3-TO-05, P3-TO-07 | Starts interaction burn-down. | 1 ability | `interpreter.ts`, `match-session.ts`, client projection, E2E | Gate A/B/C | P3-TO-06 only | P3-TO-11, P3-TO-12 | WAIT_GATEWAY |
| P3-TO-14 | Battle/Resource | Battle-result VP/resource trigger envelope design. | Trigger Gateway, Golden Flow 2 review | Unlocks 39 battle-result abilities later. | none first | docs first, later `combat-resolver.ts`, `scoring-resolver.ts` | Gate A design | P3-TO-01 | runtime battle edits | WAIT_REVIEW |
| P3-TO-15 | Modifier/Power | Modifier source and power trace contract design. | Lifecycle Gateway, existing Artoria/Tomoe evidence | Unlocks 24 modifier / 18 power abilities. | none first | docs first, later power runtime | Gate A design | P3-TO-01 | runtime lifecycle/battle edits | WAIT_GATEWAY |
| P3-TO-16 | Special Isolation | Special subsystem inventory and quarantine/deletion criteria. | P3-TO-02 useful | Prevents special cases from polluting core primitives. | none first | `docs/audits`, `docs/plans` | Planning | P3-TO-03, P3-TO-04 | none | READY_NEXT |

Recommended corrected immediate queue:

1. P3-TO-18 with Codex B as the exclusive runtime owner
2. P3-A04 and P3-A05 in Codex A's automation/evidence lane
3. P3-R06 after the B11 implementation report exists
4. P3-A03 synchronization after each independent review judgment
5. P3-TO-03 Trigger Gateway contract
6. P3-TO-04 Lifecycle Gateway contract
7. P3-TO-05 Interaction Template contract
8. P3-TO-14/P3-TO-15 Phase 4 dependency boundary work

P3-B11 is the current and only runtime hot-file lane. Resource Numeric and Card Zone may receive runtime changes only for new R-confirmed blockers and only after B11 releases those files. Trigger, Lifecycle, Interaction, Battle, Modifier, and Hidden runtime implementation must wait until their corrected gateway specs are independently reviewed.
