# FD Guardrail Policy

This document defines the approval contract for Window C.

## Decision Outcomes

- `approve` - safe to enter the content library and eligible for integration tests
- `review` - structurally useful, but needs human adjudication before integration
- `reject` - unsafe or too incomplete for the current pipeline

## Approval Standard

Approve only when all of the following are true:

- schema validation passes
- every source clause is mapped or explicitly marked as non-operative metadata
- mapped effects fit `fd-engine-capability-v1`
- ambiguity level is `low`
- no issue with severity `error` remains
- at least one smoke test suggestion exists

## Review Standard

Return `review` when any of the following holds:

- ambiguity level is `medium`
- timing, target, or location mapping is plausible but not stable enough for auto-integration
- the card touches `Moon Holy Grail`, replacement logic, flip/rewrite logic, or other adjudication-sensitive mechanics
- the card can be represented in schema but depends on a handler the engine does not yet guarantee
- simulation later reports divergence or illegal state

## Reject Standard

Return `reject` when any of the following holds:

- schema validation fails
- one or more core clauses are missing from the structured output
- ambiguity level is `high`
- the structured output contradicts the OCR text
- the card requires behavior outside the current engine slice with no safe fallback

## Ambiguity Severity

### `low`

- minor OCR noise only
- timing, target, and numeric meaning remain stable
- expected path: `approve`

### `medium`

- at least one timing, target, zone, or condition has more than one defensible parse
- the card may still be worth retaining for review and later simulation
- expected path: `review`

### `high`

- stable structure would require guessing
- multiple materially different effect mappings remain possible
- expected path: `reject`

## Smoke Test Requirements

Every non-rejected card should emit smoke test suggestions that cover:

- trigger timing
- primary target or location condition
- visible state change or resource change
- one negative or gated case when the effect should not fire

## Simulation Fallback Policy

- `simulation_failed` is not a terminal success state
- any integrated card that fails a seeded scenario must move back to `review_required`
- the replay log and divergence report become mandatory review artifacts

## Notes for Moon Holy Grail and Climax Situations

- cards that interact with `Moon Holy Grail` are auto-review unless the exact location hook is already covered by deterministic tests
- cards that depend on remaining-player thresholds must be checked against round-start threshold evaluation, not mid-round guesses
