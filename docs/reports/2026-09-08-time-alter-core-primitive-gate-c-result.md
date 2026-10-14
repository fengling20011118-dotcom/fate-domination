# Time Alter Core Primitive Gate C Result

- Date: 2026-09-08
- Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Scope: Kiritsugu `master.kiritsugu.skill.time-alter` ability `time-alter.action` only
- Parent slice: Phase 3A Core Primitive Pilot
- Gate C status: candidate evidence added; independent review required before any promotion

## Implemented

- Added a deterministic remote-room fixture for `time-alter.action` that restores a real `MatchSession` with Kiritsugu, the compiled Time Alter skill, one legal hand attack card, and one deck card to draw.
- Added browser/server coverage that starts from the real skill activation button, sends WebSocket commands with `expectedRevision`, keeps the pending hand-card target window across reconnect, resolves through server revalidation, and checks the authoritative projection after resolution.

## Evidence

- `e2e/support/build-time-alter-snapshot.ts`
  - creates the fixture from `createMatchSession` and the executable pack, then restores it through the server room restore path
  - exposes stable instance IDs only for test-side state assertions; the browser still consumes the projected UI

- `e2e/fd-time-alter-core-primitive.spec.ts`
  - activates `固有时制御` from the browser skill window
  - verifies activation uses the current `expectedRevision`
  - verifies pending target candidates contain the hand card before and after reconnect
  - chooses the projected hand card in the browser
  - verifies `play_selected_cards` moved that card face-down to `attack_area`
  - verifies `draw_cards` moved the deck top card to hand
  - sends the same command with a stale revision and verifies rejection without duplicate movement or draw

## Boundary

- This report does not claim Gate C for `command-spell.gain-mana`; Irisviel `conversion-magic.preparation` has a separate Gate C candidate report.
- This report does not migrate any additional cards or primitives.
- This report does not promote Time Alter, Phase 3A, or any primitive to `E2E_VERIFIED`.
- The `play_selected_cards` primitive remains intentionally server-owned through the shared play batch hook.
