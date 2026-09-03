# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS, and JavaScript. The prototype must run without a framework or build step so the reference repository author can inspect and transplant it easily.

## Users

- Fate/Domination players completing a seven-seat digital tabletop match on a desktop computer.
- The open-source repository author evaluating a clearer and more attractive frontend direction.

## Product Purpose

Provide a high-fidelity reference for a digital Fate/Domination match surface. Success means a viewer can immediately understand the current round, phase, active player, battlefield state, and required action while the interface preserves the identity and hidden-information structure of the tabletop game.

## Positioning

The interface combines the spatial awareness of a seven-seat tabletop with a focused, system-explained decision console; it does not automate player strategy or flatten the game into a generic card dashboard.

## Operating Context

The first surface represents round 4 during the action phase. It contains seven player seats, four base locations, situation and event cards, a local player's master and servant systems, a dynamic skill zone, a hand, and a current play decision.

## Capabilities and Constraints

- Desktop-first reference at 1440×900 and above.
- Future mobile web must support a complete match through recomposition, not desktop scaling.
- Public and owner-only information remain distinct.
- The skill zone can expand beyond three cards.
- Regular cards, additional cards, and effect-play requests are distinct concepts.
- This prototype demonstrates representative states; it is not a complete rules engine, multiplayer client, or AI implementation.
- Existing files under `D:\fd\references\fate-domination` must remain unchanged.

## Brand Commitments

- Product name: Fate/Domination.
- Preserve recognizable Fate card art, master/servant identity, dark ritual atmosphere, and gold ceremonial accents.
- Operational clarity takes priority over decorative spectacle.

## Evidence on Hand

- Final rules: `D:\fd\docs\rules\FD-Game-Rules-Final.md`.
- Existing reference UI and art: `D:\fd\references\fate-domination`.
- Approved design brief: `D:\fd\docs\plans\2026-08-31-fd-desktop-ui-reference-design.md`.
- Demonstration values are illustrative and must not be presented as a fully simulated match.

## Product Principles

- Show the current decision before secondary information.
- Preserve component ownership and information visibility.
- Keep the battlefield spatially legible.
- Let players choose; explain and validate rather than play for them.
- Make exceptional rules possible without turning every screen into an exception editor.

## Accessibility & Inclusion

Primary controls must be keyboard accessible, have visible focus, meet WCAG AA contrast targets, avoid color-only state communication, and respect reduced-motion preferences.
