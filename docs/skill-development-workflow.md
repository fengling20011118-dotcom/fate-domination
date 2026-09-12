# 技能批量迁移工作索引

## V2 标准化强制流程

本文以《卡牌技能标准化文档》与 `docs/rules-engine-architecture-v2.md` 为上位基线。新迁移的卡牌/技能默认执行以下流水线：

```text
规则原文 / FQA / 卡图
→ src/content/authoring/cards.json（人工维护）
→ tools/compile-authoring-content.mjs
→ canonical rules + adapter report + generated runtime override
→ rules-core 通用能力 / 必要时 content handler
→ 场景测试 / 可见性 / 回放 / 全量回归
→ FULL
```

约束：
1. 每张卡完整原文保留在 `printedText`，每个能力放在 `abilities[]` 并保留 `printedClause`。
2. 禁止/无视/改写基础规则优先写 `ability.ruleModifiers[]`；持续与清理写 `ability.lifecycle`；动态数值只使用受控 formula AST/metric。
3. `match-engine` 不包含具体角色名或角色 ID 分支；它只负责命令、事件、效果队列、决策和事务编排。
4. 不能稳定自动建模的原文进 `ambiguities` / `unmodeledClauses` / `host_adjudicated`，不得为提升 FULL 数量猜测实现。
5. `confirmed-skill-overrides.ts` 保留为主仓兼容合并层；已进入 authoring 的卡牌由生成 override 最后覆盖旧迁移快照。


## 数据与实现入口

| 工作 | 入口 |
| --- | --- |
| 开发版技能文本及 canonical ID | `src/content/generated/legacy-content.json` |
| 开发版卡图索引 | `src/content/generated/development-image-sources.json` |
| 人工维护格式定义与适配 | `src/content/authoring/types.ts`、`adapter.ts` |
| 已确认配置 | `src/content/confirmed-skill-overrides.ts` |
| 可组合触发模板 | `src/content/authoring/ability-templates.ts` |
| 通用效果、条件、选择与被动注册 | `src/rules-core/skill-handlers.ts` |
| 生命周期调度 | `src/rules-core/scheduled-effects.ts` |
| 原文检索 | `npm run search:rules -- 关键词` |
| 既有规则结论和冲突 | `docs/rule-audit.md`、`docs/rule-conflicts.md` |

规则来源按开发版文本、卡图、基础规则【墨水修订1版】、FQA、桌游问题解答、玩家回合流程和关键词、3X模式规则依次核对。复用已确认结论时保留其来源；遇到矛盾重新核对原文。

## 执行节奏

1. 集中读取待迁移条款，汇总执行器缺口；自动生成的骨架保留待实现状态。
2. 核心维护者负责执行器；迁移者负责不重叠的配置文件；检查者核对条款与代表行为。共享文件由单一维护者合入。
3. 可以混合不同机制的技能组成批次。复用结构化片段，保留每个小技能原文和条件、目标、代价、时序。
4. 改执行器时跑相关机制测试；配置修改先检查格式、引用和条款覆盖，批次结束跑代表行为测试。
5. 最终执行 validate、完整测试、内容校验和技能审计。FULL 必须有实际执行语义；无未解析是最终验收条件，骨架或 handler 标签不能代替验收。

## 已接入的模板

只读缺口查询：`npm run gaps:skills -- --skill <技能ID>`，或加 `--reason lifecycle` 按原因筛选，`--json` 输出机器可读结果。读取当前运行时，避免旧队列统计干扰；原因分类仅作线索，不自动认定执行器缺少对应能力。

批量骨架生成：`npm run scaffold:skills -- --id <技能ID1>,<技能ID2> --out <新文件.json>`。输出路径相对项目根目录，父目录须已存在，拒绝覆盖已有文件。草稿保留原文，候选分段仍需核对，全部未实现条款会显式记录。

- `onOwnFaceUpPlay`：补齐本人、本牌、正面打出的事件过滤，允许附加条件与任意已有效果。
- `onActiveCombatWin`：补齐战斗结算、来源激活和本人获胜条件，允许附加条件与任意已有效果。

模板仅展开为既有 DSL，不自动确认执行状态，也不替代运行时注册、费用或限制字段。其他时点、非激活来源、不同触发主体需按原文显式表达。

## 已测性能调整

被动注册曾对完整目录调用 `registry.list()` 55 次，每次都会深拷贝目录。现改为每次注册取一次局部快照，仍保留注册表对外副本隔离，不跨引擎缓存。

同机同命令 `node --test test/content.test.js test/skill-batch-015.test.js` 的单次对比：76 项全部通过，优化前 53.63 秒，优化后 8.26 秒。该数据仅代表这组检查，不代表整体迁移速度提升比例。
