# FD Phase 3 Current Work Brief

- Audience: repository owner and maintainers
- Date: 2026-09-12
- Document role: current-work and execution-governance brief
- Documentation PR branch: `codex/phase3-current-work-docs-pr`
- Source planning branch: `codex/phase3-agent-contract`
- Runtime baseline: P3-B10 commit `9fba6d9`
- Current runtime task: P3-B11 Result Binding Production Bridge
- Project status: Phase 3 active; release readiness is not claimed

## Why This Work Exists

FD has a canonical rulebook and a working rules runtime, but passing focused tests does not yet prove that every mechanic follows one production path. The remaining Phase 3 work reduces legacy and secondary runtime ownership while preserving rule semantics, hidden information, transaction boundaries, and reconnect behavior.

The project therefore separates implementation from measurement and acceptance:

- Codex A measures coverage, classifies legacy/new/dual ownership, and prepares evidence.
- Codex B implements one scoped mechanic runtime slice at a time.
- Codex R independently reviews the diff and Gate A/B/C evidence without fixing it.

This separation prevents an implementer from changing the KPI or acceptance rule to make its own work appear complete.

## Current Verified Position

| Area | Current position | Meaning |
|---|---|---|
| Documentation authority | Roadmap, final rules, acceptance baseline, active stabilization plan, then task-specific subplan | Historical reports are evidence, not current authority. |
| P3-B10 setup create-to-skill | R-accepted runtime baseline at `9fba6d9` | B11 must start from this exact accepted commit, not from the earlier failed candidate. |
| P3-B11 Result Binding | `READY` on `codex/b-p3-b11-result-binding-production-bridge` | This is the current exclusive runtime lane. |
| Coverage automation | A baseline accepted; B10 alignment and Resource Numeric packet are active candidates | A may work in parallel with B11 but may not edit runtime. |
| Phase 3 completion | Not complete | B10/B11 success alone cannot close Phase 3. Gateway contracts, independent reviews, burn-down sync, and Phase 4 boundaries remain. |

## Current Runtime Task: P3-B11

P3-B11 proves that result binding is reusable through the production `MatchSession` path rather than existing only as isolated infrastructure or a card-specific implementation.

It is deliberately limited to two existing representatives:

- Irisviel `conversion-magic.preparation`: non-interactive control proving `move_all_remaining -> movedCount -> adjust_mana`.
- Kintoki `sc-kintoki-3.golden-eater`: staged interaction proving server-owned continuation, optional payment, result consumption, rollback, reconnect/projection, and stale replay behavior.

The required production contract is:

```text
canonical authoring
-> compiler-validated semantic graph
-> MatchSession dispatch
-> typed primitive result
-> later node consumes the binding
-> typed events and projection
-> transaction-local rollback on failure
-> no legacy resolveEffect fallback after eligibility
```

P3-B11 must route by semantic form, not by card or ability id. It may not broaden into Trigger, Lifecycle, Battle, Modifier, Hidden Information, or a general interaction gateway. Codex B may finish only as `IMPLEMENTATION_COMPLETE_CANDIDATE`; Codex R task P3-R06 owns the Gate judgment.

## Parallel Ownership

| Role | Work now | May modify | Must not modify |
|---|---|---|---|
| Codex A | P3-A04 B10 classifier alignment; P3-A05 Resource Numeric reviewer packet; later A03 sync after R decisions | coverage scripts/tests, reports, evidence artifacts | runtime semantics, primitive behavior, routing, `MatchSession`, card behavior, Gate promotion |
| Codex B | P3-B11 only | declared rules runtime hot files, focused tests, scoped E2E, implementation report | KPI/taxonomy/evidence classification, unrelated cards, broad gateway runtime, acceptance status |
| Codex R | P3-R06 after B11; review other prepared packets | read-only inspection and review reports | implementation fixes, scope expansion, KPI changes |

Codex A and B should run in parallel because their outputs are independent. They must not share write ownership. During P3-B11, Codex B exclusively owns `interpreter.ts`, `executable-card-pack.ts`, and `resolution-dataflow.ts`. Codex R starts only when the corresponding implementation report and evidence exist.

## Remaining Phase 3 Path

| Domain | Next required outcome | Runtime status |
|---|---|---|
| Resource Numeric Core | Independent review, then A-owned legacy burn-down synchronization | Runtime fixes only for R-confirmed blockers |
| Card Zone Core | Independent review and coverage synchronization | Runtime fixes only for R-confirmed blockers |
| Result Binding | P3-B11 implementation, P3-R06 review, then A03 synchronization | Current runtime lane |
| Target / Interaction | Reviewed target-selection and `PendingInteraction` contract | Broad runtime waiting |
| Trigger Gateway | Reviewed domain-event payload, source identity, ordering, forced/optional, and projection contract | Runtime waiting |
| Lifecycle Gateway | Reviewed duration, source, persistence, cleanup, and reset ownership contract | Runtime waiting |
| Modifier / Power / Battle Result | Owner and dependency envelope fixed for Phase 4 and Golden Flows | Runtime waiting |

These domains are not seven unconditional runtime migrations. The first three can produce reviewed runtime/evidence outcomes; the gateway and Phase 4 boundary domains must first close architecture contracts so that new secondary runtime owners are not created.

## Acceptance And Completion

Every runtime slice follows the same evidence route:

1. Identify canonical rule/card text and the authoritative runtime owner.
2. Prove compiler/schema behavior and fail-closed negatives at Gate A.
3. Prove the named card or flow through the real `MatchSession` path at Gate B.
4. Prove server/client/projection/reconnect/stale-command behavior at Gate C when applicable.
5. Obtain an independent Codex R judgment.
6. Let Codex A synchronize accepted/rejected status and legacy/new/dual counts.

Phase 3 is complete only when Resource Numeric and Card Zone have review outcomes, B11 has a production-reuse judgment, Target/Interaction/Trigger/Lifecycle contracts are reviewed, Modifier/Power/Battle boundaries are fixed, and accepted outcomes are reflected in reproducible coverage evidence. This work does not claim that the project is release ready or that Battle Winner and all Golden Flows are complete.

## Maintainer Reading Route

For project status, read this brief first. For governance, read `docs/agents/PHASE3-AGENT-CONTRACT.md`. For a dispatched agent, read only its block in `docs/agents/PHASE3-TASK-INDEX.md`. The full scheduling view is in `docs/plans/2026-09-12-phase-3-completion-execution-plan.md`; the exact B11 design and steps are in the two P3-B11 plan documents.

## What This Documentation Change Requests

This change asks maintainers to accept the Phase 3 execution contract and current task description into the repository. It does not merge B10 or B11 runtime code, does not promote any unreviewed Gate, and does not declare Phase 3 complete. Runtime branches should be reviewed and integrated separately so their code evidence remains attributable to the corresponding B and R tasks.
