# Seven Masters Authoring Adapter Summary

Scope: Kenneth, Matou Shinji, Emiya Kiritsugu, Hisau Maiya, Gatou Monji, Irisviel von Einzbern, Olga-Marie Animusphere.

User-scoped exclusion: the card below or after command spells is treated as ascension and excluded from this adapter pass. Excluded ascension cards are recorded in `excludedCards`, but they are not included in `cards` and do not count toward automatic or unsupported totals.

| Master | Cards | Automatic abilities | Unsupported | Report |
| --- | ---: | ---: | ---: | --- |
| 肯尼斯·阿其波卢德 | 4 | 6 | 0 | `artifacts/ability-interpreter/masters/master.kayneth-adapter-report.json` |
| 间桐慎二 | 4 | 4 | 0 | `artifacts/ability-interpreter/masters/master.shinji-adapter-report.json` |
| 卫宫切嗣 | 4 | 4 | 0 | `artifacts/ability-interpreter/masters/master.kiritsugu-adapter-report.json` |
| 久宇舞弥 | 2 | 4 | 0 | `artifacts/ability-interpreter/masters/master.maiya-adapter-report.json` |
| 卧藤门司 | 2 | 5 | 0 | `artifacts/ability-interpreter/masters/master.gatou-adapter-report.json` |
| 爱丽丝菲尔·冯·爱因兹贝伦 | 2 | 2 | 0 | `artifacts/ability-interpreter/masters/master.irisviel-adapter-report.json` |
| 奥尔加玛丽·阿尼姆斯菲亚 | 4 | 9 | 0 | `artifacts/ability-interpreter/masters/master.olga-marie-adapter-report.json` |

Total: 22 authored non-ascension cards, 34 automatic abilities, 0 unsupported.

Targeted verification:

```text
npx vitest run packages/rules/tests/seven-masters-authoring.test.ts
```

Result: 10/10 passed.

Full repository static checks and full test suite were intentionally not run for this pass, per the requested scope limit.
