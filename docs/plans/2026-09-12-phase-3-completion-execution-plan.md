# Phase 3 Completion Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Drive FD Phase 3 from current candidate evidence to reviewed mechanic coverage, explicit runtime ownership, and measurable legacy burn-down without confusing candidate work with accepted release readiness.

**Architecture:** Phase 3 is executed as three coordinated lanes: Codex A owns measurement/evidence, Codex B owns one runtime hot-file lane at a time, and Codex R owns independent acceptance. Runtime migration is allowed only for scoped low-risk or repaired slices; Trigger, Lifecycle, Interaction, Modifier, Power, and Battle work starts with contracts unless a reviewed gate explicitly unlocks implementation.

**Tech Stack:** Markdown governance docs, TypeScript rules runtime, Vitest focused regression tests, Playwright Gate C tests, machine-readable coverage artifacts.

---

## Source Of Truth

Read these first, in order:

1. `docs/FD-DOCUMENT-ROADMAP.md`
2. `docs/agents/PHASE3-AGENT-CONTRACT.md`
3. the assigned task block in `docs/agents/PHASE3-TASK-INDEX.md`
4. `docs/plans/fd-rules-conformance-and-acceptance.md`
5. only the plan/audit/report files explicitly named by the assigned task

Do not use this plan to promote acceptance. It is a dispatcher plan only. Gate promotion remains owned by Codex R using the acceptance baseline.

## Execution Rules

Codex A and Codex B may work in parallel only when B has exclusive ownership of runtime hot files and A is limited to docs, audit scripts, report generation, and machine-readable evidence artifacts.

Codex B must not edit coverage KPI, taxonomy rules, or evidence classification to improve its own status. Codex A must not edit runtime semantics, primitive behavior, semantic routing, `MatchSession` behavior, or card-specific runtime behavior.

Codex R must stay read-only while reviewing. If R finds a defect, it returns findings and a Gate judgment; it does not implement fixes.

## Phase 3 Critical Path

1. Stabilize measurement before broad status claims.
2. Preserve independently accepted runtime baselines before KPI sync.
3. Review-promote or reject existing low-risk direct-action candidates.
4. Lock gateway contracts before high-risk runtime migration.
5. Use A03 after each R judgment, not as a final-only cleanup pass.

Current immediate priority:

1. Preserve the R-accepted P3-B10 runtime baseline at `9fba6d9`.
2. Execute P3-B11 Result Binding Production Bridge from that exact baseline with exclusive runtime hot-file ownership.
3. Run P3-A04/A05 evidence alignment in parallel, limited to automation, reports, and artifacts.
4. Send P3-B11 to P3-R06; Codex B stops after the implementation report.
5. Run A03 synchronization for B11 only after R06 judgment.
6. Review Resource Numeric and Card Zone evidence, then define Trigger, Lifecycle, and Interaction contracts.
7. Fix the Modifier / Power / Battle Result dependency boundary before Phase 4 runtime work.

## Current Dispatch Assignments

| Agent | Start Now | Parallel Safety | Stop Condition |
|---|---|---|---|
| Codex A | P3-A04 B10 classifier alignment and P3-A05 Resource Numeric reviewer packet | May run beside B11 only in automation/report/artifact scope | Do not edit runtime; do not sync B11 before R06 judgment |
| Codex B | P3-B11 Result Binding Production Bridge from `9fba6d9` | Must be the only writer to `interpreter.ts`, `executable-card-pack.ts`, and `resolution-dataflow.ts` | Stop after implementation report; do not update KPI or acceptance status |
| Codex R | P3-R06 after B11 report; Resource Numeric/Card Zone review when packets exist | Read-only only | Return findings and Gate judgment; do not fix |

## Lane A: Automation / Coverage / Evidence

### Task A1: Coverage Schema And Drift Guard

Current state: P3-A01 baseline reviewed and accepted. Keep this section as the invariant for later classifier changes.

**Files:**
- Modify: `docs/audits/*.mjs`
- Modify: `docs/reports/*`
- Modify: `package.json` only if script registration ownership is reserved
- Do not modify runtime files

**Steps:**

1. Read `docs/agents/PHASE3-TASK-INDEX.md` task P3-A01 only.
2. Define the coverage JSON shape: total abilities, routed, legacy, dual, skipped, Gate status, and source evidence paths.
3. Encode taxonomy drift rules so broad `TRIGGER/LIFECYCLE/INTERACTION` buckets cannot replace corrected semantic-axis counts.
4. Add or document the command that produces the baseline.
5. Record output as `AUTOMATION_BASELINE_CANDIDATE`.

**Acceptance:** A output is reproducible and does not make runtime acceptance claims.

### Task A2: Reviewer Packets

Current state: reusable packet infrastructure exists; continue with slice-specific packets without changing runtime or Gate status.

**Files:**
- Create/modify: `docs/reports/*review-packet.md`
- Create/modify: `docs/reports/*checklist.md`
- Do not modify runtime files or tests

**Steps:**

1. Read P3-A02 only.
2. Generate packet templates for Resource Numeric, Card Zone, B10, and B04-B10 follow-up review.
3. For each packet, separate implementer evidence from R acceptance.
4. Include missing evidence, commands, reports, relevant Golden path, and legacy fallback checks.
5. Record output as `REVIEW_PACKET_BASELINE_CANDIDATE`.

**Acceptance:** R can review without rereading unrelated Phase 3 documents.

### Task A3: A03 Burn-Down Sync Loop

**Files:**
- Modify: `docs/reports/*`
- Modify: machine-readable coverage artifacts
- Do not modify runtime files

**Steps:**

1. Wait for an R judgment on a specific slice.
2. Read P3-A03 only plus the relevant B report and R report.
3. Update that slice's status as accepted, rejected, or needs revision.
4. Update before/after legacy, semantic, dual, skipped, and Gate status counts.
5. If R rejected the slice, keep it out of accepted burn-down.

**Acceptance:** A03 runs repeatedly after each R judgment. It does not wait for B09/B10 or all seven domains to complete.

### Task A4: P3-B10 Coverage Alignment

1. Read TASK P3-A04 only and consume the accepted B10 commit `9fba6d9` plus its reviewer packet.
2. Classify the exact accepted semantic shape without card or ability ids.
3. Reconcile B06-B08 classifier coverage required by the cumulative baseline.
4. Publish global legacy/new/dual counts and automation regressions.
5. Stop at `AUTOMATION_BASELINE_CANDIDATE`; do not alter B10 runtime acceptance.

### Task A5: Resource Numeric Review Packet

1. Read TASK P3-A05 only and consume the existing Resource Numeric implementation evidence.
2. Publish eligible/skipped inventory, fallback boundary, and Gate evidence locations.
3. Reconcile counts against the accepted A baseline.
4. Hand the packet to Codex R and record runtime defects as `RUNTIME_SEMANTIC_GAP` without fixing them.

## Lane B: Runtime Implementation

### Task B1: P3-B10 Accepted Runtime Baseline

P3-B10 is complete for downstream baseline purposes. Its R-accepted runtime commit is `9fba6d9`. Do not reopen or rewrite it during B11; any newly discovered B10 regression becomes a separate reviewer finding and repair task.

### Task B2: P3-B11 Result Binding Production Bridge

**Files:**
- Follow: `docs/agents/PHASE3-TASK-INDEX.md` TASK P3-B11
- Follow: `docs/plans/2026-09-12-p3-b11-result-binding-production-bridge-implementation-plan.md`
- Base: `codex/b-p3-b10-setup-create-to-skill` at `9fba6d9`
- Branch: `codex/b-p3-b11-result-binding-production-bridge`

**Steps:**

1. Confirm the branch descends from `9fba6d9` and reserve all declared hot files for Codex B.
2. Keep scope to Golden Eater and Conversion Magic.
3. Prove semantic graph routing, typed result consumption, pending continuation, transaction rollback, and no legacy fallback.
4. Produce focused Gate A/B and relevant Gate C candidate evidence.
5. Write the B11 implementation report and stop for P3-R06.

**Acceptance:** B11 may claim only `IMPLEMENTATION_COMPLETE_CANDIDATE`; P3-R06 owns acceptance.

### Task B3: Existing Direct-Action Candidate Fixes

**Files:**
- Runtime files only if R review requires fixes
- Focused tests
- Scoped implementation reports

**Steps:**

1. Do not start while B11 owns the same hot files.
2. For Resource Numeric and Card Zone, fix only R-confirmed blockers.
3. Preserve semantic-form routing and fail-closed behavior.
4. Produce focused test output and before/after route evidence.

**Acceptance:** Each slice returns to R as a separate candidate.

### Task B4: Gateway-Backed Runtime Slices

**Files:**
- Runtime hot files declared by the accepted gateway contract
- Focused tests
- Gate C only when server/client/projection/reconnect behavior changes

**Steps:**

1. Wait for accepted Target/Interaction, Trigger, or Lifecycle contract.
2. Reserve runtime hot-file ownership.
3. Implement one representative mechanic only.
4. Add fail-closed negatives and no-legacy-fallback proof.
5. Write implementation report and stop for R.

**Acceptance:** One reviewed runtime slice at a time. No broad migration without A/R evidence.

## Seven Domain Plan

| Domain | Owner Start | B Runtime Allowed Now | A Work Allowed Now | R Gate |
|---|---|---:|---:|---|
| Resource Numeric Core | R/A | Only R-required fixes | Yes | Review candidate, then A03 burn-down |
| Card Zone Core | R/A | Only R-required fixes | Yes | Review candidate, then A03 burn-down |
| Result Binding | B now, R next | P3-B11 only; no broader migration | Yes, packet/gap tracking | P3-R06 production reuse review |
| Target / Interaction | A/R spec, B later | No | Yes | Contract review before runtime |
| Trigger Gateway | A/R spec, B later | No | Yes | Contract review before runtime |
| Lifecycle Gateway | A/R spec, B later | No | Yes | Contract review before runtime |
| Modifier / Power / Battle Result Envelope | A/R boundary, B later | No | Yes | Boundary review before Phase 4 runtime |

## B10 Relationship To The Seven Domains

B10 is not an eighth domain. It is an accepted setup create-to-skill runtime slice inside the Card Zone area and the fixed baseline for B11.

B11 is the current Result Binding domain slice. A may work in parallel on P3-A04/A05, but only R06 may judge B11 and only A may synchronize the resulting coverage status.

## Done Criteria For Phase 3

Phase 3 is not done when B09, B10, or B11 completes. Phase 3 is done only when:

1. A coverage command or accepted equivalent reports corrected semantic-axis coverage.
2. Resource Numeric and Card Zone candidates are independently accepted or explicitly rejected with next repairs.
3. B10 remains fixed at its accepted runtime baseline and its coverage classification is synchronized by A.
4. B11 receives an independent production-reuse decision, not only implementer or historical Golden Eater evidence.
5. Target/Interaction, Trigger, and Lifecycle gateway contracts are reviewed.
6. Modifier/Power/Battle dependency boundaries are fixed for Phase 4 / Golden Flow.
7. A03 has synced accepted/rejected status and burn-down after each R judgment.
8. Roadmap release readiness blockers are updated without claiming release readiness early.
