# Golden Flow 1 Action Phase Result

- Date: 2026-09-08
- Phase: Golden Flow 1 complete Action Phase slice
- Claim: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Reviewer status: independent review required before any `E2E_VERIFIED` promotion

## Scope

This slice implements a scoped strict Action Phase flow candidate for:

`ABILITY WINDOW -> MOVE/PASS MOVE -> ABILITY WINDOW -> PLAY BATCH -> ABILITY WINDOW -> next priority player`.

The scope is intentionally limited to `modeState.strictActionFlow === true`. Existing non-strict MatchSession and core game-loop action paths remain transitional legacy paths.

## Runtime Evidence

- `AbilityRuntime.actionTurn` records the current strict action sub-step, controller, round, move resolution, and play resolution.
- `getLegalActions` exposes only the commands legal for the current strict sub-step.
- `normal_move` and `pass_move` are server commands and are not reconstructed by the client.
- `normal_move` delegates to `core/movement.ts::movePlayer` for phase, engagement, path, cost, and occupancy legality.
- Regular hand-card attack play in strict flow is exposed through staged attack actions and `confirm_staged_attack`, which calls `playBatch`.
- `passPriority` advances strict action sub-steps and rejects play-step pass with `play_required` while playable hand cards remain. Skill-zone cards are not counted as normal hand-play obligations unless a future card-specific rule explicitly grants that permission.
- The hand-card shortage matrix is explicit: zero playable hand cards may pass; one playable hand card may confirm a one-card staged batch; two or more playable hand cards require a two-card staged batch up to the normal attack allowance; skill-zone cards do not increase the normal hand-play obligation.

## Gate A Candidate Evidence

`packages/rules/tests/regression/golden-flow-1-action-phase.test.ts` covers:

- before-move ability window legal action exposure;
- no move/play exposure during ability windows;
- normal move/pass exposure only at the move step;
- movement cost paid once and location updated;
- two-card staged hand batch commit;
- one-card staged hand batch commit when only one playable hand card exists;
- zero-hand pass through the play step;
- staged batch clears after commit;
- next-priority handoff after post-play window;
- play-before-move rejection;
- second normal move rejection;
- engaged normal move rejection;
- voluntary play skip rejection while playable hand cards remain;
- skill-zone attack card non-obligation;
- two-card hand obligation rejects confirming after only one staged card;
- third attack rejection.

## Gate B Candidate Evidence

The same regression test uses `MatchSession` directly and verifies:

- `MatchSession -> syncActionTurnFlow -> projectAbilityState`;
- `MatchSession -> dispatchAbilityCommand -> movePlayer`;
- `MatchSession -> dispatchAbilityCommand -> playBatch`;
- `MatchSession.passPriority` as the strict action-window advancement owner;
- `AbilityRuntime.actionTurn` survives across dispatches and advances to the next priority player.

## Gate C Candidate Evidence

`e2e/fd-golden-flow-1-action-phase.spec.ts` covers:

- restored seven-player remote room;
- browser-visible action ability window;
- browser `client:end_turn` with `expectedRevision`;
- browser `normal_move` command and server projection of mana/location delta;
- reconnect after movement;
- browser card inspection and two staged attack commands;
- browser `confirm_staged_attack`;
- stale revision rejection without duplicate card movement;
- final browser `client:end_turn` handoff to player 2;
- browser fail-closed `play_required` rejection when trying to skip playable hand cards;
- browser proof that a skill-zone card does not expose staged normal play and does not block play-step pass.
- browser proof that zero-hand, one-hand, and two-hand shortage cases follow server legal actions, including no early confirm after staging only one of two hand cards.

## Secondary Runtime Paths

The following paths remain intentionally retained and are not promoted by this report:

- non-strict action-phase `getLegalActions` still exposes legacy `play_card`, `stage_attack_card`, and `activate_ability` in one priority window;
- `core/game-loop.ts` still has separate action `move` / `play` inputs outside the MatchSession strict flow;
- `core/card-play.ts` remains a separate older play path;
- full always-on `FlowState` has not replaced `modeState.strictActionFlow`.

## Verification

Fresh verification must be recorded in the final handoff for this slice.
