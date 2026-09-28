# FD Rules Spec v0

## Purpose

This document is the rules-core source of truth for the first digital prototype. It separates confirmed rules, prototype assumptions, and deferred work so the engine can be built without mixing product decisions with unresolved text interpretation.

## Scope

Must-have for v0:

- seven-player match flow as the default format
- one Master plus one Servant per player
- location-driven play across Miyama Town, Shinto, Magic Workshop, Recon, and optional Moon Holy Grail
- Situation deck at round start
- Event deck placement and public vs hidden visibility
- battle resolution, military result, VP pacing, elimination, and remaining-player threshold checks
- hidden information as engine state, not UI-only behavior

Deferred from v0:

- polished UI and animation
- full card pool import
- ranked matchmaking or accounts
- advanced AI behavior
- complete commercial balance pass

## Match Assumptions

- A standard match starts with 7 active players.
- Each player has exactly 1 Master and 1 Servant.
- The engine must continue functioning as players are eliminated.
- Remaining-player count can change legality, climax Situation access, and scoring pressure.
- Moon Holy Grail is enabled by match configuration, not by hardcoded special case logic.

## Round Flow

### 1. Round Start

- increment round counter
- recalculate remaining-player thresholds
- draw and reveal the current Situation card
- grant L-based resource reward from the Situation card to all legal recipients
- resolve immediate Situation-driven insertions or map changes

### 2. Preparation

- resolve start-of-round delayed effects
- refresh round-limited flags
- expose legal movement and action windows for non-eliminated players

### 3. Advance

- players deploy, move, or reposition according to location policy
- movement legality is checked against location occupancy and special restrictions
- hidden information remains hidden unless a rule explicitly reveals it

### 4. Action Windows

- players play legal Master, Servant, or generated cards for the current timing window
- additional-play, residual, closure, copy, and replacement effects are registered with the effect resolver
- visibility is updated only when triggered by rule text or declaration timing

### 5. Battle

- resolve each contested battlefield using declared attacks, modifiers, location hooks, Situation modifiers, and Event modifiers
- determine military result and any on-battle / after-battle effects
- apply reveal interactions caused by declaration, resolution, or card text

### 6. Cleanup

- award VP, military result, resource, and location rewards
- process defeat, elimination, and state replacement effects
- expire end-of-round effects and close temporary windows

## Confirmed Rules We Are Building Around

- Situation cards apply a global round context and can immediately award shared resource.
- Event cards are attached to local battlefields and can be public or hidden by location policy.
- Shinto and Miyama Town remain the primary battlefield pressure points.
- Magic Workshop and Recon are support locations with their own movement and occupancy policies.
- Moon Holy Grail is a valid optional location that must exist in architecture and tests from phase one.
- Command Spells are public system-recognized resources distinct from a Master's unique skill package.
- Hidden True Name and face-down state are first-class visibility modes.

## Prototype Assumptions

- Simultaneous hidden decisions are represented as queued intents, then resolved in deterministic seat order when needed.
- Event placement policy can be represented by location metadata instead of special-case code in the round loop.
- Card scripts may start as typed effect descriptors plus small handler registry, not full free-form scripting.
- The first engine slice will use a reduced sample pack for smoke tests, but every subsystem must still assume a 7-player table.

## Deferred Decisions

- whether some card texts override default owner-only visibility before declaration
- the final content policy for duplicate Servant prevention in draft or selection flow
- long-term balance handling for Moon Holy Grail reward hooks

## Temporary Tie-Break Rules

- simultaneous elimination ordering is resolved by the elimination resolver using lower `militaryResult` first, then lower `seat`, then lexicographically by `playerId`

## Rules-Core File Targets

- `docs/spec/adjudication-log.md` - living list of ambiguities and temporary rulings
- `docs/spec/location-policy.md` - location-specific movement, occupancy, event, and hook policy
- `packages/rules/src/schema/*.ts` - source-of-truth TypeScript models
- `packages/rules/src/core/phase-machine.ts` - legal phase progression
- `packages/rules/src/core/game-loop.ts` - round orchestration
- `packages/rules/tests/` - deterministic verification entry points

## Current Implementation Slice

Implemented in the current rules-core batch:

- shared schema for game, card, effect, location, and visibility state
- phase progression and round-loop skeleton
- optional-location map serialization with Moon Holy Grail support
- event placement visibility policy helpers
- remaining-player threshold helper for climax situations
- resolver entry points for effect, combat, and scoring phases

Deferred to the next implementation slice:

- full numeric combat resolution
- VP and military-result settlement rules
- real deck draw/discard flow for Situation and Event cards
- card-specific effect handlers beyond timing-window consumption
