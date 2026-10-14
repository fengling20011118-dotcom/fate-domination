# Phase 3B Artoria Caster Sword Modifier Lifecycle Result

- Date: 2026-09-08
- Scope: Artoria Caster `servant.artoriac.skill.sc-artoriac-1` `选王剑`
- Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Acceptance source: `docs/plans/fd-rules-conformance-and-acceptance.md`
- Reviewer status: independent review required before any Gate promotion

## Canonical Contract

`选王剑` is treated as the Phase 3B Modifier + Lifecycle Golden Card candidate.

Covered rules:

- `FD-RESIDUAL-001`
- `FD-POWER-001`
- `FD-CLOSE-001`
- `FD-ROUND-CLEANUP-001`

Runtime path:

```text
canonical authoring JSON
-> compiled executable definition
-> MatchSession legal play_card
-> playBatch / on_card_played
-> installOngoing
-> calculateCardPower / resolveBattlefield
-> cleanupOngoing
-> projection / websocket reconnect
```

## Evidence

Gate A implementer evidence:

- `packages/rules/tests/regression/artoriac-sword-modifier-lifecycle.test.ts`
- Validates semantic survival for lifecycle and rule modifier fields.
- Rejects invalid modifier `sourceCard`, unsupported modifier rule, and invalid `round_count` lifecycle data.
- Proves source-closed and expiration negatives stop modifier application.

Gate B implementer evidence:

- `packages/rules/tests/regression/artoriac-sword-modifier-lifecycle.test.ts`
- Plays `选王剑` through `MatchSession`.
- Installs an ongoing modifier with source identity, duration, cleanup, and modifier count.
- Applies +2 to another special attack and keeps `选王剑` itself excluded by `not_source_card`.
- Produces a battle participant power trace with modified power.
- Exercises the battle-stage return ability and duration cleanup.

Gate C implementer evidence:

- `e2e/fd-artoriac-sword-modifier-lifecycle.spec.ts`
- Browser plays `选王剑` through the real remote UI.
- WebSocket command carries `expectedRevision`.
- Server rejects stale replay without installing a duplicate modifier.
- Browser plays another special attack, ends the action, and receives battle power projection.
- Reconnect preserves ongoing modifier projection after battle.
- Browser-driven cleanup returns expired `选王剑` to skill and reconnect preserves the expired state.

## Secondary Runtime Paths

The candidate still uses transitional shared runtime owners:

- `executeAbility`
- `installOngoing`
- `cleanupOngoing`
- `calculateCardPower`
- `MatchSession` cleanup/projection/log bridge

Known secondary paths intentionally retained:

- Extended Effects compatibility runtime.
- Card-level `powerModifiers`.
- `modeState` transient rule data.
- `core/game-loop` cleanup path.

These are not release evidence for the Golden Card and remain audit risks.

## Result

Implementation candidate evidence exists for Gate A / Gate B / Gate C.

Final status remains `IMPLEMENTED_UNVERIFIED` until independent review.
