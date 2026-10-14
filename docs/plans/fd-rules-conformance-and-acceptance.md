# FD Rules Conformance & Acceptance

> **文档性质**：Fate/Domination 数字版规则一致性与验收基线  
> **建议路径**：`D:\fd\docs\plans\fd-rules-conformance-and-acceptance.md`  
> **适用项目**：`D:\fd`  
> **目标**：定义“什么叫规则实现完成、如何证明实现正确、谁有资格宣布通过”。  
> **规则来源**：游戏规则以 `FD-Game-Rules-Final.md` 为准；本文不重新定义游戏规则，只定义 Runtime 的验证方式。

---

## 1. 文档目标

FD 项目必须严格区分：

```text
游戏规则是什么
        ↓
程序如何实现
        ↓
如何证明实现正确
```

推荐关系：

```text
FD-Game-Rules-Final.md
        │
        │ 定义 WHAT
        ▼
Canonical Rule IDs
        │
        ▼
Rules Runtime
        │
        ▼
fd-rules-conformance-and-acceptance.md
        │
        │ 定义 HOW TO PROVE
        ▼
Evidence
        │
   ┌────┼────┐
   ▼    ▼    ▼
 Gate A Gate B Gate C
   │    │    │
   └────┴────┘
        ↓
 E2E_VERIFIED
```

本文的核心目的不是增加测试数量，而是确保：

- 每条重要规则都有明确 Runtime Owner。
- 每张卡牌都能追踪到完整执行链。
- 每个流程状态都能证明允许/禁止行为正确。
- 每个持续效果都能证明创建、作用、结束正确。
- 每个多人同步场景都能证明服务器状态和玩家视图一致。
- Agent 不能仅凭“代码已写”“测试全绿”宣布完成。

---

## 2. 完成状态定义

项目内不得继续使用模糊的 `FULL / DONE / COMPLETE / AUTOMATIC / SUPPORTED` 作为最终验收结论。

统一使用：

| 状态 | 含义 |
|---|---|
| `DEFINED` | 已有规则或设计定义 |
| `IMPLEMENTED_UNVERIFIED` | 已存在代码，但未完成验收 |
| `COMPONENT_VERIFIED` | Gate A 通过 |
| `SCENARIO_VERIFIED` | Gate A + Gate B 通过 |
| `E2E_VERIFIED` | Gate A + Gate B + Gate C 通过 |
| `FAILED` | 已存在明确反例，证明实现错误 |
| `BLOCKED` | 被前置条件阻挡，当前无法验收 |
| `NOT_VERIFIED` | 证据不足，不能判断通过 |

必须坚持：

```text
IMPLEMENTED ≠ VERIFIED
NOT_VERIFIED ≠ PASS
```

开发 Agent 最多可以声明：

```text
IMPLEMENTATION_COMPLETE_CANDIDATE
```

最终 Gate PASS 必须由独立 Reviewer 基于证据判定。

---

## 3. 统一规则证据链

任何 Canonical Rule、流程能力或卡牌技能，要声明“已正确实现”，必须尽可能证明：

```text
Canonical Rule / Card Text
        ↓
Normalized Runtime Contract
        ↓
Executable Definition / Flow Definition
        ↓
Runtime Owner
        ↓
Legality
        ↓
Command
        ↓
Resolution
        ↓
State Delta
        ↓
Domain Events
        ↓
Trigger / Modifier / Lifecycle
        ↓
Projection
        ↓
Scenario Evidence
        ↓
E2E Evidence
```

任何关键环节无法证明，则为 `NOT_VERIFIED`。

---

## 4. Rule Conformance Record

每条重要 Canonical Rule 应建立一份规则一致性记录。

```yaml
ruleId: FD-PLAY-001

title: Normal Play Batch

canonicalRequirement:
  玩家常规出牌时通常同时打出正好两张攻击。

runtimeOwner:
  module: PlayBatchEngine
  entryPoint: commitNormalPlayBatch

dependencies:
  - FD-PLAY-002
  - FD-COST-001
  - FD-ACTIVATION-001

legality:
  owner: LegalActionEngine
  actionType: COMMIT_PLAY_BATCH

positiveEvidence:
  - exactly-two-valid-attacks
  - hand-plus-skill-card
  - simultaneous-cost-payment

negativeEvidence:
  - one-card-when-two-available
  - three-normal-attacks
  - insufficient-total-mana
  - illegal-skill-zone-play
  - ability-inserted-between-batch

events:
  - PLAY_BATCH_COMMITTED
  - PLAY_BATCH_RESOLVED

stateEffects:
  - mana
  - card zones
  - activation state

scenarioTests:
  - normal-battlefield-play
  - mixed-hand-skill-play

e2e:
  - real-client-normal-play

status: E2E_VERIFIED
```

---

## 5. Rule → Runtime → Test Matrix

项目应维护一张规则覆盖矩阵：

| Rule ID | Canonical Rule | Runtime Owner | Unit | Negative | Integration | Scenario | E2E | Status |
|---|---|---|---|---|---|---|---|---|
| FD-FLOW-001 | 回合阶段顺序 | FlowEngine | PASS | PASS | PASS | PASS | PASS | E2E_VERIFIED |
| FD-PLAY-001 | 同时常规出牌 | PlayBatchEngine | PASS | PASS | PASS | PASS | PASS | E2E_VERIFIED |
| FD-ABILITY-001 | 被动强制 | TriggerEngine | PASS | PASS | PASS | PASS | PASS | E2E_VERIFIED |
| FD-POWER-001 | 威力层级 | PowerEngine | PASS | PASS | PASS | PASS | PASS | E2E_VERIFIED |
| FD-LIFECYCLE-001 | 回合结束清理 | LifecycleEngine | PASS | PASS | PASS | PASS | PASS | E2E_VERIFIED |

Release Gate 不应只问“总共有多少测试通过”，而应问“所有必须覆盖的 Rule IDs 是否拥有足够证据”。

---

## 6. Primitive Acceptance Contract

Primitive 是可复用规则组件，例如：

```text
remove_advantage_position
gain_mana
close_attack
move_player
apply_modifier
reveal_true_name
```

Primitive 测试不应绑定具体卡牌 ID。

每个 Primitive 至少验证：

### 6.1 正常情况

```text
目标满足条件
→ 正确执行
→ 返回结构化结果
```

### 6.2 No-op

```text
目标不具备可变化状态
→ 不发生非法 mutation
→ result.status = no_effect
```

### 6.3 多目标实际结果

```text
P2 有地利
P3 无地利
P4 有地利

targets = [P2, P3, P4]

实际：
affected = [P2, P4]
affectedCount = 2
```

禁止用 `targets.length` 代替实际 affected 数量。

### 6.4 Invalid Input

不存在目标、非法实体类型、非法参数、不支持的 Primitive 类型必须 fail closed。

---

## 7. Card Acceptance Contract

每张正式卡牌或技能至少记录：

| 项目 | 内容 |
|---|---|
| Source | 原始卡牌文字 |
| Canonical Semantics | 规范化后的语义 |
| Trigger | 触发事件 |
| Requirements | 发动条件 |
| Cost | 支付 |
| Targets | 目标 |
| Effects | 效果序列 |
| Result Binding | 前置效果实际结果引用 |
| History / Limit | 首次、每回合、每局等 |
| Modifier | 持续规则修改 |
| Lifecycle | 结束时点 |
| Events | 产生的事件 |
| Negative Cases | 不能发动的场景 |
| Projection | 玩家可见信息 |
| Scenario | 真实卡牌场景测试 |
| E2E | 浏览器全链测试 |

卡牌不得仅以“存在 handler”或“JSON 可编译”判定完成。

---

## 8. Result Binding 验收

对于：

```text
Effect A
↓
返回 Resolution Result
↓
Effect B 引用 Effect A 的结果
```

必须验证实际结果，而不是重新查询并猜测。

示例：

```text
P2：有地利
P3：无地利
P4：有地利

Effect A：移除所有目标地利

期望：
affected = [P2, P4]
removedCount = 2

Effect B：读取 removedCount
最终后续数值 = 2
```

至少增加：

```text
unknown binding
future binding
duplicate binding
invalid result field
wrong expression type
unsafe branch binding
```

这些错误应尽可能在 compile-time fail closed。

---

## 9. Flow Acceptance Contract

每个 Flow State 应定义：

```text
State
Preconditions
Allowed Commands
Forbidden Commands
Transition
Events
Postconditions
```

示例：

```text
Current State:
ACTION
activePlayer = P2
step = AFTER_MOVE_ABILITY_WINDOW

Allowed:
- legal action-phase abilities
- command seal if legal
- continue to normal play

Forbidden:
- second normal move
- combat ability
- battle resolution
- another player's normal action

On Ability:
resolve ability
→ stay in AFTER_MOVE_ABILITY_WINDOW

On Continue:
→ PLAY_BATCH_DRAFT
```

必须证明 Server 真正拒绝 Forbidden Commands，UI 不能自行推进正式流程。

---

## 10. Flow Transition Acceptance

每个重要转换记录：

```text
Precondition
Command
Transition
Postcondition
Events
Illegal transitions
```

例如：

```text
ACTION_BEFORE_MOVE
      ↓
NORMAL_MOVE
      ↓
ACTION_AFTER_MOVE
```

还必须验证：移动成本、位置、`PLAYER_MOVED`、相关 Trigger、Ability Window 重算、第二次 Normal Move 消失、Projection 同步。

---

## 11. Event / Trigger Acceptance

每个正式 Domain Event 至少定义：

```text
事件何时产生
payload
事件前/后状态语义
哪些能力可以监听
同时 Trigger 如何排序
Trigger 能否产生新 Event
Optional Trigger 如何暂停并询问
是否允许重入
```

禁止核心流程通过 `if (cardId === ...)` / `if (skillId === ...)` 实现具体卡牌响应。

卡牌为什么触发必须可以从 Event Trace 中解释。

---

## 12. Effect Resolution Acceptance

Effect 应尽量返回结构化结果：

```json
{
  "effectType": "remove_advantage_position",
  "status": "partially_resolved",
  "affectedEntities": ["P2", "P4"],
  "payload": {
    "removedCount": 2
  }
}
```

需要能解释：目标、实际影响对象、未受影响对象、State Delta、Events、后续 Binding。

---

## 13. Modifier / Lifecycle Acceptance

持续效果至少验证完整生命周期：

```text
creation
↓
application
↓
interaction
↓
expiration
↓
cleanup
```

例如“本回合不能使用行动阶段能力”必须验证创建前合法、创建后非法、正确 reason、回合结束移除、下一回合重新合法。

不得由各卡牌散落地负责 cleanup。

---

## 14. Power Trace Acceptance

复杂威力测试不得只断言最终数字。

示例：

```text
P2 Power Trace

Attack A printed      3
Attack A base set     5
Attack A modifier    +2
Attack B printed      4
Activated attacks    11
Terrain base          3
Terrain add          +1
Terrain multiply     ×2
Terrain result        8
Aggregate            19
Total modifier       -2
Final set            none
FINAL POWER          17
```

涉及多层 Power Modifier 的 Golden Scenario 应验证过程层。

---

## 15. Battle Result Acceptance

建议结构化：

```ts
BattleResolutionResult {
  battlefieldId,
  participants,
  excludedByDefeat,
  powerByPlayer,
  highestEligiblePower,
  winners,
  tied,
  eventVpPool,
  competitiveVpPool,
  baseVpPerWinner,
  personalRewards
}
```

至少验证参与者、败北排除、并列、无人交战、竞争战果、事件 VP、个人奖励以及后续胜负触发。

---

## 16. Multiplayer / Projection Acceptance

多人验收必须同时检查：

```text
Authoritative Server State
Player 1 Projection
Player 2 Projection
Player 3 Projection
...
```

至少验证：自己的隐藏信息可见、他人隐藏信息不可见、真名解放后正确公开、暗置事件正确隐藏。

同时验证：

```text
revision
stale command
duplicate command
reconnect
pending interaction restore
active player restore
```

规则正确但多人状态不同步时，Runtime Gate 仍为 `FAILED`。

---

## 17. 三层 Acceptance Gate

### Gate A — Component Conformance

验证单个规则组件：positive unit、negative unit、boundary test。

通过后：`COMPONENT_VERIFIED`。

### Gate B — Scenario Conformance

验证多个规则组件组合，例如：

```text
技能攻击 × 8魔力门槛
残留 × 宝具禁止
败北 × 已激活技能
两张同时出牌 × Trigger
Modifier × Source Closed
```

通过 A+B：`SCENARIO_VERIFIED`。

### Gate C — Runtime Conformance

完整真实链：

```text
Real Client
→ ActionOffer
→ Command
→ Server Revalidation
→ Interpreter
→ State Mutation
→ Domain Events
→ Trigger
→ Projection
→ WebSocket
→ Client Update
→ Cleanup
→ Reconnect
```

通过 A+B+C：`E2E_VERIFIED`。

---

## 18. Negative Evidence 强制要求

任何规则都不能只证明合法情况能工作。

例如常规出牌至少考虑：1张、3张、魔力不足、技能区门槛不足、非本人卡、败北、错误阶段、重复提交、旧 revision、batch 中插入其他能力。

没有足够 Negative Evidence 时不得 PASS。

---

## 19. Rule Interaction Matrix

建议维护：

| A | B | Combination Test |
|---|---|---|
| Residual | Close | REQUIRED |
| Residual | Power | REQUIRED |
| Residual | Noble Phantasm Ban | REQUIRED |
| Defeat | Play | REQUIRED |
| Defeat | Ability | REQUIRED |
| Move | Enter Trigger | REQUIRED |
| Move | Redeploy | REQUIRED |
| Play Batch | Extra Play | REQUIRED |
| Hidden Card | Passive | REQUIRED |
| True Name | Projection | REQUIRED |
| Modifier | Source Closed | REQUIRED |

---

## 20. Golden Cards

选择代表性复杂卡牌做纵向全链：

```text
Golden Card A：多效果 + Result Binding
Golden Card B：Modifier + Lifecycle
Golden Card C：Multi-target Interaction
Golden Card D：Residual + Power
Golden Card E：Passive + Hidden Information
```

Golden Card 尽量走：

```text
JSON → Compile → Executable Definition → Match Runtime
→ ActionOffer → Client → Command → Resolution
→ Event / Trigger → State → Projection → Cleanup
```

---

## 21. Golden Flows

建议：

```text
Golden Flow 1：完整 Action Phase
Golden Flow 2：完整 Combat + Battle Resolution
Golden Flow 3：完整 Round End / Cleanup
Golden Flow 4：断线重连并恢复当前流程
Golden Flow 5：复杂 Trigger Chain / Optional Interaction
```

Golden Flow 失败时 Release Gate = `BLOCKED`。

---

## 22. System Invariants / Property Tests

长期逐步建立：

```text
CardInstance exactly one zone
mana 不出现非法负数
activePlayer 必须有效且未淘汰
Flow transition 必须合法
只有权威 Server 修改正式 GameState
pending interaction 存在时拒绝无关 command
hidden information 不得泄露
一张实体牌不能同时存在于 hand 和 attack zone
所有需要完成该阶段的玩家完成前不得推进 phase
```

用于 property tests、随机合法命令模拟和 fuzz scenarios。

---

## 23. Reviewer Acceptance Format

独立 Reviewer 建议输出：

```text
Acceptance Target:

Canonical Requirement:
PASS / FAILED / NOT VERIFIED

Runtime Owner:
PASS / FAILED / NOT VERIFIED

Positive Evidence:
PASS / FAILED / NOT VERIFIED

Negative Evidence:
PASS / FAILED / NOT VERIFIED

Scenario:
PASS / FAILED / NOT VERIFIED

E2E:
PASS / FAILED / NOT VERIFIED

Alternative Runtime Path:
NONE FOUND / FOUND / NOT VERIFIED

Legacy Bypass:
NONE FOUND / FOUND / NOT VERIFIED

Projection:
PASS / FAILED / NOT VERIFIED

Reconnect:
PASS / FAILED / NOT VERIFIED

Final:
COMPONENT_VERIFIED /
SCENARIO_VERIFIED /
E2E_VERIFIED /
FAILED /
BLOCKED /
NOT_VERIFIED
```

Reviewer 的职责是主动寻找反例，而不是重复 Implementer 的完成声明。

---

## 24. Release Gate

一个 Phase、Rule Set 或卡牌子集进入正式 Release 时，至少检查：

```text
Canonical Rules 已稳定
↓
Runtime Owner 明确
↓
无未授权 secondary runtime path
↓
Gate A 达标
↓
Required Gate B 达标
↓
Required Golden E2E 达标
↓
Projection / reconnect 达标
↓
Known regression suite 全绿
↓
无 P0 / P1 未解决规则偏差
```

“所有测试绿”只是证据之一，不是单独的 Release 判定。

---

## 25. 新规则 / 新卡牌工作流

### 新通用规则

```text
Canonical Rule
↓
Rule ID
↓
Runtime Contract
↓
Runtime Owner
↓
Positive + Negative Component Tests
↓
Scenario
↓
Required E2E
↓
Reviewer
```

### 新卡牌

```text
Card Text
↓
Normalized Semantics
↓
JSON
↓
Compiler Validation
↓
Primitive Composition
↓
Card Acceptance Contract
↓
Scenario Test
↓
必要时 E2E
↓
Reviewer
```

使用已有 Primitive 的新卡牌若仍要求修改多个 Rules Kernel 核心文件，应视为架构异味。

---

## 26. 实施原则

1. 规则决定实现，不允许程序现状反向修改 Canonical Rules。
2. 前端不复制 Rules Engine 的业务判断。
3. Server 是最终 legality authority。
4. Runtime 不允许通过 cardId/skillId 特判替代通用机制。
5. 临时 Resolution Data 不污染长期 GameState。
6. 持续效果通过 Modifier/Lifecycle 管理。
7. Trigger 必须可从 Domain Event 追踪。
8. 正常规则 no-op 与 runtime invariant failure 必须区分。
9. 正式内容加载必须 fail closed。
10. 测试必须证明错误不会发生，而不只是证明正确路径能跑通。

---

## 27. 当前项目接入建议

本文加入项目后，不要求立刻重写 Runtime。

推荐：

```text
1. 将本文作为项目验收规范
2. 对现有 Canonical Rule IDs 建 Rule Matrix
3. 结合 Flow Runtime Inventory 标记现有 Runtime Owner
4. 选少量 Golden Rules / Golden Cards / Golden Flows
5. 对现有测试映射 Evidence
6. 找出 Evidence 缺口
7. 按 Stabilization Plan 分 Slice 补齐
```

第一轮重点是建立“证明系统”，而不是一次性补齐所有规则测试。

---

## 28. 最终成功标准

对任何重要规则或卡牌，都应能够回答：

```text
规则是什么？
Rule ID 是什么？
谁负责实现？
合法性由谁判断？
通过什么 Command 执行？
会产生什么 State Delta？
会产生什么 Domain Events？
哪些 Trigger / Modifier / Lifecycle 会响应？
玩家分别看到什么？
正面测试在哪里？
反面测试在哪里？
组合测试在哪里？
真实 E2E 在哪里？
Reviewer 最终判定是什么？
```

当这些问题能够稳定回答，FD 才真正从“能运行的卡牌游戏”升级为“可证明规则一致性的通用规则引擎”。
