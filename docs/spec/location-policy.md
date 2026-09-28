# FD Location Policy

This document defines must-have engine behavior for each location in the first rules-core slice.

## Shared Policy Fields

Each location definition must carry:

- `locationId`
- `displayName`
- `enabledByDefault`
- `occupancyMode`
- `eventPolicy`
- `movementLinks`
- `rewardHooks`
- `visibilityHooks`
- `tags`

## Miyama Town

- Purpose: primary public battlefield and event-bearing hotspot
- Occupancy: multi-player contested battlefield
- Event policy: public Event insertion allowed by default
- Rewards: supports battle result and location reward hooks
- Notes: baseline comparison point for other battle locations

## Shinto

- Purpose: primary battlefield with hidden-information pressure
- Occupancy: multi-player contested battlefield
- Event policy: hidden Event insertion by default
- Rewards: supports battle result and location reward hooks
- Visibility: hidden Event state must be modeled by policy, not inferred by UI

## Magic Workshop

- Purpose: support location with configuration-sensitive occupancy limits
- Occupancy: policy-defined; default phase-one maps set `occupancyLimit = 1`
- Event policy: none by default unless enabled by specific cards or later adjudication
- Rewards: supports setup, resource, or engine hook style benefits rather than default battle scoring
- Notes: location-specific restrictions must not leak into generic movement code

## Recon

- Purpose: information and setup support location
- Occupancy: policy-defined; default phase-one maps set `occupancyLimit = 1`
- Event policy: none by default
- Rewards: supports scouting or information-gain hooks rather than standard battle rewards
- Notes: asymmetric occupancy or reveal-side consequences remain adjudication-sensitive

## Moon Holy Grail

- Purpose: optional Moon Cancer-aligned location present in architecture from day one
- Enabled by: match config or content hook
- Occupancy: contested location with its own policy record; do not assume it copies another site
- Event policy: unresolved; schema must allow `none`, `public`, `hidden`, or `custom`
- Rewards: allow unique scoring or trigger hooks without branching the whole engine
- Notes: this location is a topology extension, not a one-off map swap

## Engine Requirements

- map configuration must serialize with or without Moon Holy Grail
- movement legality must consult adjacency plus destination policy
- event insertion must consult `eventPolicy`
- occupancy checks must consult `occupancyMode`
- scoring and effect systems must receive location tags and hooks instead of hardcoded names

## Must-Have vs Deferred

Must-have now:

- data-defined movement links
- explicit occupancy metadata
- explicit event insertion metadata
- optional-location enable/disable support
- hook surface for scoring, visibility, and location-specific effects

Deferred:

- final Moon Holy Grail custom event policy
- exhaustive per-location content balance
- full map art or client presentation rules
