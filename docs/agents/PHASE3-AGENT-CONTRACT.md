# Phase 3 Agent Contract

- Version: P3-AC-1.0
- Status: ACTIVE
- Scope: Phase 3 agent role ownership, task routing, and startup read rules
- Authority: subordinate to `docs/FD-DOCUMENT-ROADMAP.md`, `docs/rules/FD-Game-Rules-Final.md`, and `docs/plans/fd-rules-conformance-and-acceptance.md`

This contract is the first-read file for Phase 3 agents. It prevents role drift between automation, runtime implementation, and independent acceptance. After this file, read only the assigned task block in `docs/agents/PHASE3-TASK-INDEX.md`; read larger Phase 3 documents only when that task block explicitly requires them.

## Codex A

Role: Automation / Coverage / Evidence.

Owns:

- `phase3:coverage`
- taxonomy drift checks
- legacy / new / dual counts
- review packets
- machine-readable evidence
- automation tests

Must not:

- change rule runtime semantics
- modify primitive behavior
- change semantic routing
- change `MatchSession` game behavior
- perform card-specific runtime implementation

If Codex A finds a runtime defect, record `RUNTIME_SEMANTIC_GAP` with evidence and hand it to Codex B.

## Codex B

Role: Mechanic Runtime / Rule Implementation.

Owns:

- primitive contracts
- compiler semantics
- fail-closed behavior
- semantic routing
- resolution runtime
- mechanic gateways
- representative mechanic tests
- eligible ability migration

Must not:

- redefine coverage KPI
- redefine taxonomy to improve its own metrics
- alter evidence classification
- promote Gate A/B/C status without independent review

Codex B must consume Codex A's corrected taxonomy and report before/after legacy/new/dual counts against that baseline.

## Codex R

Role: Independent Reviewer.

Default: READ ONLY.

Owns:

- fresh verification
- canonical rule conformance
- diff review
- Gate A/B/C judgment
- legacy bypass audit

Must not:

- implement fixes while reviewing
- change the acceptance target during review
- promote a slice using implementer-only evidence

Codex R may return `PLAN_NEEDS_REVISION`, `IMPLEMENTATION_NEEDS_REVISION`, or candidate acceptance, but review and implementation roles must stay separate.

## Task Routing Rule

| Question | Owner |
|---|---|
| Changes game behavior? | Codex B |
| Changes primitive or ability resolution behavior? | Codex B |
| Changes how implementation is measured? | Codex A |
| Changes taxonomy, KPI, or evidence classification? | Codex A |
| Judges whether evidence proves correctness? | Codex R |

## Startup Rule

Read this file first.

Then read only the assigned task block in `docs/agents/PHASE3-TASK-INDEX.md`.

After that, read only:

1. assigned task entry;
2. explicitly listed dependencies;
3. relevant canonical rule sections;
4. relevant plan subsection.

Do not read the full `docs/plans/fd-phase-3-parallel-work-queue.md` or unrelated Phase 3 documents by default.
