# Card Runtime Capability Baseline

- Date: 2026-09-06
- Workspace: `D:\fd`
- Git branch/HEAD: `UNKNOWN`; the workspace root is not a Git worktree
- Node: `v24.13.1`
- npm: `11.8.0`
- `package-lock.json` SHA-256: `6C8F4C645CA8075187B0B27A706DDDCAC946632A7BCF6DBC2778FE7E84673748`
- Generated artifacts: owned by Content Platform; determinism enforced by `npm run verify:generated-content`

## Evidence Dimensions

Capability is reported independently across these dimensions:

| Dimension | Meaning |
|---|---|
| Parse | JSON and allowed fields load without blocking validation errors |
| Runtime | Effects can execute deterministically in the formal interpreter |
| Legality | Legal and illegal offers agree with direct server dispatch |
| Interaction | Required payment, target, choice, or response is projected |
| E2E | A real browser completes the flow against MatchSession/server |

An authored `implementationStatus`, `execution.mode`, or `FULL` label is not evidence for any higher dimension.

## Baseline and Promotion Status

| Scenario | Parse | Runtime | Legality before this slice | Interaction | E2E | Maximum evidence-backed stage before this slice |
|---|---|---|---|---|---|---|
| Caster sword + pilgrim | pass | partial | fail: unrelated attack quota | partial | absent | STRUCTURED |
| Drake Golden Hind + Voyager | pass | partial | fail: unrelated attack quota | partial | absent | STRUCTURED |
| Ereshkigal continuation + protection | pass | partial | fail: unrelated attack quota | partial | absent | STRUCTURED |
| Kintoki two Golden Impact copies | pass | partial | fail: unrelated attack quota | partial | absent | ENGINE_EXECUTABLE |
| Tomoe Independent Action + Inferno Fire | pass | known semantic gaps | fail: unrelated attack quota | partial | absent | STRUCTURED |

This baseline is intentionally conservative. Passing the classifier regressions removes one legality blocker; it does not promote these cards to `INTERACTION_COMPLETE` or `E2E_VERIFIED`.

## Known Pre-Slice Gates

- Root tests: 30 failures in 9 files.
- Complex-skill regressions: 8 failures.
- Real-server Playwright: 4 failures out of 4 tests.

The aggregate command `npm run verify:stabilization` runs every gate and reports all failing groups instead of stopping at the first failure.
