# P3-B11 Result Binding Production Bridge Design

- Document Role: IMPLEMENTATION_DESIGN
- Owner: Codex B
- Task: `P3-B11`
- Runtime Baseline: `codex/b-p3-b10-setup-create-to-skill` at `9fba6d9`
- Acceptance Boundary: implementer candidate only; independent review is required

## Objective

P3-B11 turns the existing typed result-envelope infrastructure into a production bridge demonstrated by two existing representatives. Conversion Magic is the non-interactive control. Golden Eater is the staged-interaction representative. The task does not migrate additional cards or define a broad interaction gateway.

## Chosen Approach

Use one semantic bridge for compiler-validated result-binding graphs whose complete node and interaction requirements are already supported. Do not add an ability-id allowlist and do not classify every graph containing `resultVar` as eligible.

Two narrower alternatives were rejected:

1. A Golden Eater-only route would prove one card but not production reuse.
2. A broad all-result-binding migration would mix unsupported interaction, battle, hidden-information, and lifecycle semantics into this slice.

## Production Data Flow

Conversion Magic executes in one server dispatch:

```text
move_all_remaining -> typed movedCount binding -> adjust_mana
```

Golden Eater executes as server-owned stages:

```text
activate -> pending first target
choose first target -> move -> typed movedCount -> VP branch -> pending optional second target
choose/decline second target -> optional pay_mana(7) -> move -> typed movedCount -> VP branch
```

The server derives bindings from primitive results. The client supplies only command intent and selected ids. Any continuation persisted for a pending decision contains validated server state, never client-authored binding values.

## Transaction Model

Each `MatchSession.dispatchPlayerAction` call is one transaction.

- A failure before the first target stage settles leaves state, events, and revision unchanged.
- The successful first Golden Eater stage is committed before the second pending decision is exposed.
- A failure in the second dispatch preserves the first committed stage but rolls back all second-stage payment, movement, VP, events, and revision changes.
- A stale or replayed command cannot duplicate either stage.

## Fail-Closed And Legacy Boundary

The executable compiler rejects unknown bindings, invalid result fields, invalid target references, and unsupported node combinations. Runtime binding or invariant failures become `resolution_failed`. Once an ability qualifies for the production bridge, success and failure paths must never invoke legacy `resolveEffect`.

Unsupported result-binding shapes remain on their existing route and are reported as skipped. P3-B11 does not change the coverage classifier or promote acceptance status.

## Verification

Gate A candidate evidence covers typed result schemas, dependency validation, invalid binding fields, target references, and unsupported graph rejection. Gate B candidate evidence uses real executable packs and `MatchSession.dispatchPlayerAction` for both representatives, including rollback and explicit legacy-bypass proof. Gate C candidate evidence is limited to the real production patterns: Conversion Magic's existing browser/WS path and Golden Eater's interaction, reconnect/projection, stale replay, and insufficient-payment branches.
