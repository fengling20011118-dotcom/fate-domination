# Conversion Magic Core Primitive Gate C Result

- Date: 2026-09-08
- Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Scope: Irisviel `master.irisviel.skill.conversion-magic` ability `conversion-magic.preparation` only
- Parent slice: Phase 3A Core Primitive Pilot
- Gate C status: candidate evidence added; independent review required before any promotion

## Implemented

- Added a deterministic remote-room fixture for `conversion-magic.preparation` that restores a real `MatchSession` with Irisviel, the compiled Conversion Magic skill, and two controller hand cards.
- Added browser/server coverage that starts from the real skill activation button, sends a WebSocket command with `expectedRevision`, resolves through server revalidation, checks the authoritative projection, reconnects after resolution, and rejects stale replay.

## Evidence

- `e2e/support/build-conversion-magic-snapshot.ts`
  - creates the fixture from `createMatchSession` and the executable pack, then restores it through the server room restore path
  - exposes stable instance IDs only for test-side state assertions; the browser still consumes the projected UI

- `e2e/fd-conversion-magic-core-primitive.spec.ts`
  - activates `转换魔术` from the browser skill window during the advance phase
  - verifies activation uses the current `expectedRevision`
  - verifies both controller hand cards move to `discard`
  - verifies `adjust_mana` applies +2 from the typed `move_all_remaining.movedCount` result
  - reconnects after resolution and verifies projection consistency
  - sends the same activation command with a stale revision and verifies rejection without duplicate discard or mana gain

## Boundary

- This report does not claim Gate C for Kiritsugu beyond the existing Time Alter report, or for `command-spell.gain-mana`.
- This report does not migrate any additional cards or primitives.
- This report does not promote Conversion Magic, Phase 3A, or any primitive to `E2E_VERIFIED`.
- Non-pilot mana and card movement effects remain on the legacy compatibility path.
