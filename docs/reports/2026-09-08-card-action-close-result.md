# CARD_ACTION_SEMANTICS_MINIMAL_CLOSE Result

- Phase: Phase 3 / CARD_ACTION_SEMANTICS_MINIMAL
- Contract: scoped `CLOSE`
- Claimed Acceptance: `IMPLEMENTATION_COMPLETE_CANDIDATE`
- Promotion: independent reviewer required before `SCENARIO_VERIFIED` or scoped `E2E_VERIFIED`

## Scope

This slice promotes only the exact Artoria Alter `sc-artoria-alt-2.angra-mainyu-embrace` semantic form:

- `residual`;
- `activation.trigger = on_card_played`;
- source card condition requires active board zone via `source_card_in_zone(field)`;
- triggering played card condition requires visible controller-owned `宝具`;
- no targets, no cost, and no creates;
- one `close_source_card` effect;
- source card must exist, be controlled by the ability controller, be active face-up in `field` or `attack_area`, and have a compiled definition.

It does not migrate targeted close, Kiritsugu close-then-activate, normal `PLAY`, `PLAY_SOURCE_CARD_WITH_COST_RESPONSE`, `ADD_TO_ATTACK`, `CREATE_AND_ACTIVATE`, `ACTIVATE`, response-window close, hidden/private close, face-down attribute proof, variable/pending payment, modifier/power follow-up, temporary dissolve, non-skill destination matrix, once-per-game removal, full cleanup ordering, or roster-wide JSON.

## Inventory

Command:

```text
node docs/audits/fd-card-action-close-inventory.mjs
```

Fresh output:

```text
CARD_ACTION_SEMANTICS_MINIMAL CLOSE inventory
sourceFiles=14
cardActionSemanticAbilities=7
eligible=1
skipped=6

Eligible abilities
servant.artoria-alt	servant.artoria-alt.skill.sc-artoria-alt-2	sc-artoria-alt-2.angra-mainyu-embrace	close_source_card
```

Skipped abilities remain outside CLOSE inheritance:

```text
master.kayneth volumen.extra-play out_of_scope:play_source_card_response_semantics
master.kiritsugu time-alter.action out_of_scope:play_semantics
master.maiya military.attach-support-shot out_of_scope:add_to_attack_semantics
master.maiya support-shot.append-only out_of_scope:append_only_rule_marker
master.olga-marie astronomical-science.first-loss out_of_scope:activate_semantics
servant.drake sc-drake-1.mount-summon out_of_scope:play_semantics
```

## Gate A Evidence

- `close_source_card` is a registered typed primitive with `closedCount` result schema.
- `closedCount` is consumable by runtime binding evaluators.
- `isCloseSourceCardOnPlayedTrigger` routes by exact semantic form, not ability id.
- Negative coverage rejects wrong kind, wrong trigger, missing source-zone condition, missing played-card attribute condition, target additions, costs, creates, and extra effects.
- Runtime corruption coverage rejects missing/off-board/inactive/face-down/wrong-controller source state before mutation.

## Gate B Evidence

- `packages/rules/tests/regression/card-action-close.test.ts` dispatches a real `MatchSession` play of Artoria Alter's compiled canonical noble phantasm.
- The compiled residual trigger closes `黑化诅咒` from active attack area to skill, marks it inactive face-up, emits `source_card_closed`, and records `effect_resolved(close_source_card)`.
- Non-noble play does not close the source.
- Off-board/inactive source cases do not mutate authoritative state.

## Gate C Evidence

- `e2e/fd-artoria-alt-close-card-action.spec.ts` restores a browser remote room with `黑化诅咒` active and Artoria Alter's noble phantasm in hand.
- Browser-side WS sends `client:dispatch_command` with `expectedRevision` to play the noble phantasm.
- Server revalidation resolves the `on_card_played` trigger through data-flow, closes the source card, and projects both the played noble phantasm and closed source state.
- Reconnect preserves the closed source state.
- Stale WS replay with the pre-close revision is rejected and cannot close/move the source a second time.

## Verification

Fresh commands run on 2026-09-08:

```text
node docs/audits/fd-card-action-close-inventory.mjs
PASS: sourceFiles=14, cardActionSemanticAbilities=7, eligible=1, skipped=6
```

```text
npx vitest run packages/rules/tests/regression/card-action-close.test.ts packages/rules/tests/regression/resolution-dataflow.test.ts packages/rules/tests/regression/complex-skills-regression.test.ts
PASS: 3 test files, 58 tests
```

```text
npm run typecheck
PASS
```

```text
npx playwright test e2e/fd-artoria-alt-close-card-action.spec.ts --project=chromium
PASS: 1 test
```

## Before / After

- Scoped legacy close consumer count: 1 -> 0 for Artoria Alter exact source-close.
- New-runtime semantic-routed CLOSE count: 0 -> 1.
- Dual-compatible CLOSE count: 1 -> 0.
- Remaining skipped card-action semantic abilities: 6.

## Known Boundaries

- Legacy `resolveEffect(close_source_card)` remains only as transitional compatibility for non-migrated shapes.
- General cleanup, temporary attacks, non-skill close destination, once-per-game residual removal, and close-trigger ordering are not promoted by this slice.
- This is implementation evidence only; independent reviewer promotion is still required.
