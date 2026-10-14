# FD Rule Interaction Matrix

- Date: 2026-09-07
- Acceptance baseline: `docs/plans/fd-rules-conformance-and-acceptance.md`
- Canonical rules: `docs/rules/FD-Game-Rules-Final.md`
- Related rule matrix: `docs/audits/fd-rule-conformance-matrix.md`

## Required Interaction Checks

| Interaction | Canonical Risk | Runtime Owners | Existing Evidence | Status | Required Acceptance |
|---|---|---|---|---|---|
| Residual x Close | Residual attacks remain until closed; close destination differs for skill, non-skill, temporary, once-per-game. | Ability Interpreter, MatchSession cleanup | Artoria Caster residual tests; limited close assertion in golden-card pipeline | `IMPLEMENTED_UNVERIFIED` | Gate B test with residual skill, residual non-skill, temporary attack, source close, round cleanup. |
| Residual x Power | Residual attacks count as added attacks every round and their modifiers apply immediately. | Ability Interpreter, Combat Resolver | Caster residual, Tomoe/Kintoki residual power regressions | `COMPONENT_VERIFIED` | Gate B must include power trace by layer and next-round persistence. |
| Residual x Noble Phantasm Ban | Ban prevents playing/using noble phantasm but does not close already active residual noble attacks. | Ability Interpreter, Lifecycle | Artoria Alter tests mention low-mana noble forbid | `IMPLEMENTED_UNVERIFIED` | Gate B negative: active residual noble still contributes power, but phase ability/play is blocked. |
| Defeat x Play | Defeated player cannot play cards. | Ability Interpreter | scattered status checks only | `NOT_VERIFIED` | Dedicated negative dispatch through legal actions and direct command. |
| Defeat x Ability | Defeated player may still use legal abilities. | Ability Interpreter | not isolated | `NOT_VERIFIED` | Positive ability use while defeated plus negative play in same state. |
| Move x Enter Trigger | Moving into a location can trigger enter/location effects and movement counters. | Movement, Ability Interpreter, Event/Trigger | Drake movement counters; Shinji enter-miyama tests | `COMPONENT_VERIFIED` | Gate B with normal move, effect move, bypass/no-enter-through intermediate location. |
| Move x Redeploy | Deployment is not movement; board removal and later redeploy must not count as move. | MatchSession, Movement | deployment terrain regression | `IMPLEMENTED_UNVERIFIED` | Scenario for deploy reward, later move no reward, redeploy no movement trigger unless card says so. |
| Play Batch x Extra Play | Additional play joins batch/pay timing but does not count toward normal two-card quantity; effect play is not normal play. | PlayBatch Runtime, Ability Interpreter | Drake effect-play counter regression | `COMPONENT_VERIFIED` | Gate B batch with two regular plus extra; negative insertion/payment mutation. |
| Hidden Card x Passive | Hidden passive affects game only when condition met and reveals at the correct moment. | Trigger Engine, Projection | projection redaction; hidden passive tests not complete | `NOT_VERIFIED` | Scenario with hidden passive in hand/skill, opponent projection before/after reveal. |
| True Name x Projection | True Name release updates servant overview and skill visibility for all authorized viewers. | Ability Interpreter, Projection | true-name authoring tests; projection tests separate | `IMPLEMENTED_UNVERIFIED` | Integration and E2E with before/after projections for all players. |
| Modifier x Source Closed | Effects lasting while source active stop when source leaves; effects saying they do not expire must remain. | Ability Interpreter, Combat Resolver, Lifecycle | limited ongoing cleanup tests | `IMPLEMENTED_UNVERIFIED` | Gate B with source close before battle calculation and explicit non-expiring exception. |

## Additional High-Risk Rule Combinations From Current Card Pool

| Candidate | Cards / Content | Rules Combined | Risk | Current Status |
|---|---|---|---|---|
| Caster `选定之杖` | `servant.artoriac.skill.sc-artoriac-2` | X payment x private target x result count x hidden projection | Private choice and rollback can diverge across projection/runtime. | `COMPONENT_VERIFIED` |
| Caster `选王剑 + 巡礼` | `servant.artoriac.skill.sc-artoriac-1`, deck cards 4/5/6 | residual x unique optional trigger x card return x play batch | Tests cover pieces; no browser chain with unique window and cleanup. | `COMPONENT_VERIFIED` |
| Caster `真圆集结誓约之星` | `servant.artoriac.skill.sc-artoriac-3` | residual x dynamic power formula x conditional true name x victory shuffle | Formula, event trigger, hidden reveal, and deck mutation interact. | `COMPONENT_VERIFIED` |
| Drake `骑乘` | `servant.drake.skill.sc-drake-1` | forced draw x batch membership x effect play x low-power target | Batch/effect counters are fragile and can consume normal allowance incorrectly. | `COMPONENT_VERIFIED` |
| Drake `黄金鹿与暴风夜` | `servant.drake.skill.sc-drake-2` | no-op opponent check x event VP x discard events x free move | Event reward and subsequent movement must be atomic and independent. | `COMPONENT_VERIFIED` |
| Drake `暴风雨的航海家` | `servant.drake.skill.sc-drake-3` | movement counters x reverse movement x plunder VP | Movement history and location legality are secondary state. | `COMPONENT_VERIFIED` |
| Achilles `勇者的不凋花` | `servant.achilles.skill.sc-achilles-1` | defeat x hidden true name x random discard x total power set | Defeat and hidden identity change happen during battle outcome. | `IMPLEMENTED_UNVERIFIED` |
| Achilles `包围苍天的小世界` | `servant.achilles.skill.sc-achilles-2` | option choice x discard x skill forbid x hide true name | Option branches need fail-closed target/cost behavior. | `COMPONENT_VERIFIED` |
| Achilles `驰骋天际星之枪尖` | `servant.achilles.skill.sc-achilles-3` | battlefield lock x movement forbid x terrain immunity x external source immunity | Several owners can disagree about movement and power. | `COMPONENT_VERIFIED` |
| Artoria Alter `黑化诅咒` | `servant.artoria-alt.skill.sc-artoria-alt-2` | residual x noble phantasm ban x low mana exception x self close | Ban and residual contribution must not collapse into one state. | `COMPONENT_VERIFIED` |
| Artoria Alter `对魔力` | `servant.artoria-alt.skill.sc-artoria-alt-3` | optional trigger x noble cost history x magic power set | Requires event trace of played noble cost and power-layer final set. | `COMPONENT_VERIFIED` |
| Ereshkigal `冥界佑护` | `servant.ereshkigal.skill.sc-ereshkigal-2` | residual x situation/event modifier reversal x self exemption x battle-end return | Source and exception scopes can leak through `modeState`. | `COMPONENT_VERIFIED` |
| Tomoe `鬼种之魔` | `servant.tomoe.skill.sc-tomoe-2` | inferno status x deploy-before cost x terrain double | Persistent status and terrain multiplier have separate stores. | `COMPONENT_VERIFIED` |
| Tomoe `真言·圣观世音菩萨` | `servant.tomoe.skill.sc-tomoe-3` | true-name x opponent terrain predicate x power reduction | Earlier audit found terrain predicate approximation risk. | `COMPONENT_VERIFIED` |
| Kayneth `月灵髓液` | `master.kayneth.deck.volumen-hydrargyrum` | response window x extra play x slash modifier x independent deck | Response ownership and private deck state require projection/reconnect proof. | `COMPONENT_VERIFIED` |
| Olga-Marie `迦勒底亚斯` | `master.olga-marie.skill.chaldeas` | passive peek x optional swap before resolve x hidden bottom cards | Hidden bottom-card information must stay owner-only during pending response. | `COMPONENT_VERIFIED` |

## Release Policy

Any row marked `NOT_VERIFIED` or `IMPLEMENTED_UNVERIFIED` cannot be used as `E2E_VERIFIED` evidence. A row marked `COMPONENT_VERIFIED` has useful component evidence, but still needs a Gate B interaction contract before it can support scenario acceptance. Golden Flow Gate C must select representative rows from this matrix and prove server command, event trace, projection, browser update, cleanup, and reconnect where applicable.
