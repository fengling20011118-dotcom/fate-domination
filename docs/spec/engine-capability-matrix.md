# FD Engine Capability Matrix v1

This matrix is the deterministic baseline that Guardrail uses before a structured card can enter the content library.

## Purpose

- define what the current engine slice can safely execute
- separate engine-supported effects from review-only interpretations
- give Guardrail a stable reason to approve, review, or reject

## Capability Version

- Version: `fd-engine-capability-v1`

## Supported Timing Windows

- `round_start`
- `preparation`
- `advance`
- `action`
- `battle`
- `after_battle`
- `cleanup`
- `round_end`

## Supported Deterministic Engine Features

### State and Topology

- 7-player-capable match state; the current first-playable fixture uses 5 normal seats
- elimination-aware phase progression
- optional `Moon Holy Grail` enablement through map config
- location-defined movement adjacency
- location-defined event visibility policy

### Situation and Event Handling

- round-start Situation application
- shared mana reward from Situation cards
- remaining-player threshold gating for climax-style Situation cards
- public Event insertion
- hidden Event insertion through location policy
- reveal of hidden Events through explicit battle resolution input
- deterministic battlefield synergy modifiers that add fixed power when attacks share an attribute

### Resolver Coverage

- timing-window filtering in effect resolution
- explicit gain_mana handler that credits the controlling player using payload.amount and records a deterministic mana_gained log entry
- explicit `swap_master_identity` / `swap_servant_identity` handlers with deterministic capability assessment: requires `target.type = "self_player"` and `effect.args.newCardId` to be non-empty, enabling precise approval of explicit identity swaps even when the card carries `replacement` tag
- transferred generated-card source carry-over and `owner_only` visibility normalization during identity replacement
- battle-level reveal transitions for hidden Events
- remaining-player threshold logging during scoring checkpoints
- deterministic round/phase transition logs

## Supported Visibility Modes

- `public`
- `owner_only`
- `battlefield_only`
- `hidden_until_trigger`
- `revealed_after_declaration`

## Review-Required Features

These may be representable in structured JSON, but they must not auto-approve unless the concrete card is already covered by a tested handler.

- transformation chains such as flip, rewrite, reincarnation, or container swap
- generated cards that require ownership/control reassignment or non-owner visibility inheritance
- conditional event insertion into `Moon Holy Grail`
- asymmetric or effect-driven occupancy overrides for `Recon` and `Magic Workshop`
- multi-clause replacement effects that alter default timing order
- hidden True Name reveals triggered by non-battle text

## Reject-By-Default Features

These are outside the current engine slice and should be rejected until a dedicated handler exists.

- free-form arithmetic that depends on unresolved rule text
- effects that require simultaneous elimination ordering to be finalized
- effects that assume undocumented map locations or extra seat counts
- clauses that merge two incompatible target interpretations into one effect

## Guardrail Usage

- `engine_ok = true` only when every mapped effect is covered by this matrix or by an explicitly tested deterministic handler
- `engine_ok = false` when any required effect falls into review-only or reject-only territory without an approved fallback
- `simulation_failed` cards must be demoted from `integrated` back to `review_required` until the scenario divergence is resolved

## FD Playtest v1 Coverage

The first playable pack uses three explicit capability levels. A capability label describes engine execution coverage, not confidence in the reviewed source image.

| Level | Current coverage | Client/host behavior |
|---|---|---|
| `FULL` | Schema validation, pack/reference/image validation, 12-card deck arithmetic, 5-player normal first-playable fixture creation, public/private projection, priority-gated actions, deterministic compile output. Kayneth's `skill_mana_eligibility` override is the only character-specific FULL dimension. | The rules service may generate and validate an action. The player still chooses the action. |
| `PARTIAL` | Kayneth as a complete master with only `skill_mana_eligibility` executed deterministically. Printed reward, battlefield applicability and structured effect intent are retained for cards, but most character/event branches do not yet have resolvers. | Supported dimensions are validated. Any uncovered branch creates a host-ruling request; it is never silently accepted or rejected. |
| `HOST_ADJUDICATED` | All five active servant skill suites, all seven master suites except Kayneth's explicit FULL dimension, the Waxing Moon Ritual event set, linked/generated/replacement card lifecycles, cross-player responses, conditional movement rewards and multi-step card movement effects. | The client displays the reviewed card and a host-ruling affordance. Proxy action requires an explicit `ProxyConsentRecord`; there is no automatic timeout. |

Privacy and command coverage is independent of card-effect coverage: owner, opponent and spectator projections are deterministic for every capability level, and clients only render commands present in `availableActions`.
