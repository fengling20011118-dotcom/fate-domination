# FD Adjudication Log

This file tracks wording gaps that materially affect engine behavior. Each entry must end in either `decided` or `tbd`.

## Status Key

- `decided` - safe to implement in engine
- `tbd` - unresolved; do not hardcode beyond a local placeholder

## Current Entries

### A-001: Simultaneous elimination ordering

- Status: `decided`
- Risk: an implementation tie-breaker would incorrectly eliminate players who must survive an elimination-line tie.
- Decision: determine the VP cutoff for the required minimum survivor count, then retain every player whose VP is at or above that cutoff. Players tied on the cutoff all survive; never use `militaryResult`, seat, player id, randomness, or resolution order to force the survivor count down to exactly 4/3/2.
- Logging policy: implementations may sort log entries deterministically, but presentation order must not change survival.
- Reason: this follows the authoritative elimination rule in `docs/rules/FD-Game-Rules-Final.md`.

### A-002: Climax Situation threshold check timing

- Status: `decided`
- Decision: threshold eligibility is evaluated at round start using the current active-player count before drawing the Situation card.
- Reason: this keeps round setup deterministic and avoids retroactive card validity changes mid-round.

### A-003: Moon Holy Grail event eligibility

- Status: `decided`
- Risk: event deck topology and map serialization depend on whether Moon Holy Grail can host normal Event cards, custom Event cards, or none.
- Decision: model Moon Holy Grail as a `custom` event-policy location that only accepts event cards explicitly allowlisted by location metadata.
- Reason: this keeps eligibility data-defined per location and avoids engine-wide branching while still allowing Moon-specific event content.

### A-004: Recon occupancy policy

- Status: `decided`
- Risk: movement legality and multi-player scouting edge cases are impossible to test cleanly without a stable occupancy rule.
- Decision: keep occupancy configurable per location schema and give `Recon` an explicit default occupancy limit of `1` in phase-one maps.
- Deferred edge: asymmetric scouting or reveal-side consequences remain outside the current slice and must not be inferred from occupancy alone.
- Reason: this makes movement legality testable now without hardcoding `Recon` inside the movement engine and leaves room for richer policy records later.

### A-005: Hidden True Name reveal timing

- Status: `decided`
- Decision: visibility changes are processed by the visibility engine when a reveal trigger is declared, not by the UI and not by battle rendering side effects.
- Reason: replay safety and deterministic logging require reveal to be an explicit state transition.

### A-006: Command Spell commonality vs Master-unique skills

- Status: `decided`
- Decision: Command Spells are shared player resources/components, not cards. They need their own state and common effect resolver; Master skill cards remain content-defined packages. A UI may visually render seals as tiles, but card-only rules must not apply to them unless a specific effect says so.
- Reason: the authoritative rules explicitly state that Command Spells are not cards and each seal is a once-per-game resource.

### A-007: Moon Holy Grail enablement source

- Status: `decided`
- Decision: Moon Holy Grail is enabled by match configuration and role/content hooks, not by map replacement.
- Reason: optional topology must be serializable and testable without rewriting the base map.

### A-008: Face-down event visibility in Shinto

- Status: `decided`
- Decision: location policy owns the default visibility mode for inserted Event cards; Shinto defaults to hidden insertion unless an effect overrides it.
- Reason: deck logic should call policy, not know city-specific behavior.

### A-009: Replacement effects that swap Master or Servant identity

- Status: `decided`
- Risk: high-impact transformation Masters and unusual rewrite effects need a stable ownership and state-carry policy.
- Decision: effect resolver delegates explicit identity-swap handlers to a dedicated replacement pipeline that updates `masterCardId` or `servantCardId` for the targeted player, preserves player-based card ownership/control fields as-is, rewrites `generatedBy` for all generated cards that still point at the replaced identity, and normalizes `owner_only` visibility to the current card owner.
- Deferred edge: ownership/control reassignment, non-owner visibility inheritance, and multi-clause rewrite chains stay outside the current slice.
- Reason: this keeps replay-safe source continuity even after generated cards are transferred, while limiting the new behavior to fields the current schema can represent deterministically.

### A-010: Optional location movement graph

- Status: `decided`
- Decision: movement adjacency is data-defined per map configuration; optional locations such as Moon Holy Grail extend the graph instead of patching movement code.
- Reason: this keeps future extra locations cheap to add.

### A-011: Standard table size

- Status: `decided`
- Decision: the standard game always has exactly seven active player seats. If fewer than seven humans participate, proxy players or AI fill the remaining seats; the current rules do not define a reduced 3–6 seat mode.
- Reason: the authoritative rules use the seven-seat game as the sole current balancing and implementation baseline.

### A-012: Regular movement origin and consumption

- Status: `decided`
- Decision: a player normally may start regular movement only from Magic Workshop, at most once per action turn, choosing and paying for the final destination in one operation. A non-Workshop location becomes a legal regular-movement origin only when location or effect text explicitly says the player there is not engaged; merely having no opponent present is insufficient.
- Reason: this prevents chained regular moves and preserves explicit card/location exceptions.

### A-013: Mandatory play with a short hand

- Status: `decided`
- Decision: regular play is mandatory while any legal attack is available. With one or two cards in hand, every hand card must be included; other legal sources fill the batch toward two. If all legal sources together contain fewer than two attacks, play all of them. Passing is legal only when no attack can legally be played, unless a specific effect changes the requirement.
- Reason: card effects can reduce a hand below two, but that shortage does not create a voluntary pass or permission to retain remaining hand cards.
