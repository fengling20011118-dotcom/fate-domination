# FD Phase 3 Direction Rebaseline Report

- Document Role: REPORT
- Status: REBASELINE_CANDIDATE
- Date: 2026-09-08
- Scope: Phase 3 planning direction only
- Implementation Status: DOCUMENTATION_ONLY
- Acceptance Status: No runtime, card, flow, phase, or release acceptance is promoted by this report.

## Inputs Reviewed

- `docs/FD-DOCUMENT-ROADMAP.md`
- `docs/rules/FD-Game-Rules-Final.md`
- `docs/plans/fd-rules-conformance-and-acceptance.md`
- `docs/plans/fd-card-engine-stabilization-plan.md`
- `docs/plans/fd-effect-result-binding-plan.md`
- `docs/plans/fd-golden-card-and-flow-acceptance-plan.md`
- `docs/audits/fd-flow-runtime-inventory.md`
- `docs/audits/fd-rule-conformance-matrix.md`
- `docs/audits/fd-rule-interaction-matrix.md`
- `docs/audits/fd-skill-rule-normalization-audit.md`
- `docs/audits/fd-skill-primitive-conformance-matrix.md`
- 2026-09-08 Phase 3A core primitive, Time Alter, Conversion Magic, Golden Eater, Golden Flow 1, Golden Flow 2, Artoria Caster, and Tomoe reports where relevant
- current `data/authoring/masters/*.json`
- current `data/authoring/servants/*.json`

## Current Fact Baseline

Current real skill pool contains 14 archives, 46 cards, and 92 abilities.

Current normalization evidence is mixed:

- 1 ability is observed in full Phase 3A result-binding graph shape: `sc-kintoki-3.golden-eater`.
- 3 abilities are transitional pilots: `conversion-magic.preparation`, `time-alter.action`, `command-spell.gain-mana`.
- Time Alter and Conversion Magic have browser Gate C candidate evidence.
- Command spell has no Gate C candidate evidence.
- Most abilities still depend on legacy `executeAbility` / `resolveEffect`, `extended-effects`, `modeState`, or other shared transitional owners.

## Compared Gaps

| Gap | Severity | Phase 3 Meaning |
|---|---|---|
| Battle Winner FAILED / pending independent review | High | Important Golden Flow blocker, but not the best next Phase 3 mechanic batch because battle result depends on power, trigger, scoring, and flow ownership. |
| Flow Runtime structural gaps | High | Phase 4/5 architecture blocker. Must inform Gate C, but should not block a lower-risk primitive family from shrinking legacy consumers. |
| Multiple runtime owners | High | Direct reason to move from card pilots to mechanic-family migration. |
| Secondary runtime paths | High | Must be measured and reduced by batch. Green tests without legacy-count reduction are insufficient. |
| Result Binding Gate B/C pending independent review | High | Cross-cutting dependency; keep Golden Eater as proof candidate, but do not block simple resource mutations. |
| Power Pipeline gaps | High | Needs modifier/lifecycle/source/power-layer design; too complex as the first rebaselined batch. |
| Trigger/Lifecycle gaps | High | Broadest family; should be decomposed after smaller primitive routing proves the batch model. |
| Golden Flow gaps | High | Acceptance blockers, but Flow evidence validates production paths rather than replacing Phase 3 mechanic-family rollout. |

## Decision

Rebaseline Phase 3 from card-by-card pilots to mechanic-family rollout.

The next Phase 3 slice should be:

`NEXT_MECHANIC_BATCH: RESOURCE_NUMERIC_CORE_DIRECT_ACTION`

This batch should cover:

- `adjust_mana`
- `pay_mana`
- `adjust_command_seals`
- `adjust_victory_points`
- numeric expression helpers needed by those primitives
- semantic-form routing
- removal of ability-id routing for the command spell pilot
- measurable reduction of direct-action legacy resource/VP/seal consumers

## Why Not Another Card Pilot

`time-alter.action` should remain the `PHASE_3_REFERENCE_VERTICAL_PILOT`.

It proves that a real browser/server/reconnect path can execute typed primitives and shared playBatch behavior. Repeating the same pattern card by card would leave the architecture with an expanding allowlist and no guarantee that similar semantics share the same primitive owner.

## Why Resource Numeric First

Resource/Numeric has the strongest first-batch profile:

- strict Resource/Numeric family coverage: 18 abilities across 12 cards;
- first-batch direct-action target set: 3 abilities across 3 cards;
- existing primitive work: `adjust_mana`, `pay_mana`, `adjust_command_seals`, `adjust_victory_points`;
- manageable semantic complexity compared with battle, lifecycle, hidden information, or modifier/power;
- immediate anti-dual-runtime value: command spell and simple direct resource/VP abilities can leave legacy routing;
- future dependency value: later card-zone, cost/payment, result-binding, power, and battle-result work all consume numeric/resource result envelopes.

The first batch explicitly excludes `drain-command.enter-miyama`, `clown.lose-command-seal`, deployment-trigger mana, battle-trigger VP, movement-history VP, Golden Eater result-binding, and Conversion Magic card-zone result binding.

## Required Deliverables Created

- `docs/plans/fd-phase-3-mechanic-family-rollout-plan.md`
- `docs/audits/fd-skill-mechanic-family-matrix.md`
- `docs/reports/fd-phase-3-direction-rebaseline-report.md`

## Required Governance Updates

The roadmap and active stabilization plan should now state:

- Current Phase 3 Strategy: Mechanic-family rollout.
- `time-alter.action`: `PHASE_3_REFERENCE_VERTICAL_PILOT`, not a per-card implementation template.
- Pilot allowlist: transitional migration mechanism with exit criteria.
- Gate C validates representative production mechanic paths, not every bulk-migrated card.
- Normalization status and runtime acceptance remain separate.

## Non-Claims

This report does not claim:

- `PLAN_ACCEPTED`;
- `Phase 3 PASS`;
- `Roster Migration PASS`;
- `Release Ready`;
- Battle Winner accepted;
- Flow Runtime accepted;
- Power Pipeline accepted;
- Trigger/Lifecycle accepted;
- Golden Flow accepted.

## Final Status

`PHASE_3_DIRECTION_REBASELINE_CANDIDATE`
