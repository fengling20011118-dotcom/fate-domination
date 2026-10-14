# P3-B11 Result Binding Production Bridge Handoff

- Document Role: RUNTIME_HANDOFF
- Owner: Codex B
- Task: `P3-B11`
- Branch: `codex/b-p3-b11-result-binding-production-bridge`
- Base: `codex/b-p3-b10-setup-create-to-skill` at `9fba6d9`
- Status: `READY`
- Allowed Completion Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`

## Scope

Implement the production reuse boundary for typed result binding using only:

- Irisviel `conversion-magic.preparation`
- Kintoki `sc-kintoki-3.golden-eater`

Conversion Magic is the already migrated no-interaction control. Golden Eater is the staged interaction consumer to migrate. They share typed binding infrastructure, not an exact card classifier or automatic Gate inheritance.

## Required Behavior

1. Route by compiler-validated semantic graph, never card or ability id.
2. Consume primitive result fields from server-derived typed envelopes.
3. Preserve Golden Eater's private, server-owned two-stage target flow and optional payment branch.
4. Treat each dispatch as a transaction, with stage-local rollback across pending decisions.
5. Fail closed as `resolution_failed` on invalid bindings, invalid result fields, bad target references, and runtime invariant failures.
6. Once eligible, never execute or retry through legacy `resolveEffect`.
7. Keep every other card and unsupported result-binding/interaction shape unchanged and explicitly skipped.

## Acceptance Evidence Boundary

- Gate A candidate: compiler/data-flow schema and negative tests.
- Gate B candidate: real executable pack through `MatchSession.dispatchPlayerAction` for both representatives, including rollback and legacy-bypass proof.
- Gate C candidate: only each representative's real production pattern. Do not manufacture a pending flow for Conversion Magic. Golden Eater must cover interaction continuation, reconnect/projection, stale replay, and insufficient payment.
- No implementer may promote Gate A/B/C, Phase 3, or Release status.

## Required Counts

The implementation report must include:

```text
legacyResolveEffect: before -> after
newRuntimeSemanticRouted: before -> after
dualRuntime: before -> after
local result-binding eligible/migrated/skipped: before -> after
unchanged skipped ability list
```

Use Codex A's accepted baseline. If A's classifier has not yet learned B11, report the global counters as unchanged plus a clearly labeled local runtime transition; do not modify the classifier.

## Historical Evidence Warning

Historical Golden Eater tests exist in Git stash objects but are absent from the active baseline. They may be read as candidate test design only. Restored tests must be revalidated against the B10 production runtime, current revision protocol, and current Gate C rules; `/restore`-only setup cannot by itself prove a natural production flow.

## Stop Conditions

Stop and report a narrow blocker if implementation requires:

- broad Target/Interaction gateway changes;
- Trigger, Lifecycle, Battle, Modifier, or Hidden Information runtime expansion;
- client-authored binding values;
- card-id routing;
- coverage/taxonomy edits; or
- changes to cards outside the two representatives.
