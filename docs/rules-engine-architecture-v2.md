# Fate/Domination 重构版规则引擎架构

> 评审日期：2026-08-30  
> 状态：重构版正式架构基线  
> 来源：综合外部架构提案、现有规则资料、旧版缺陷与当前重构版实现。

## 1. 最终决策

重构版采用：

```text
独立 V2 工程
+ TypeScript 领域模型
+ 房主权威的确定性规则引擎
+ 命令 / 事件 / 效果队列
+ 可序列化决策窗口与恢复点
+ 版本化结构化内容包
+ 玩家可见状态投影
+ 可替换联机传输层
+ 静态网页构建产物
```

旧开发版保持可玩且只读。V2 可以按里程碑开发，但最终运行时不得出现“部分流程走新引擎、部分流程回调旧 `Engine` 或 `SkillLib`”的混合状态。

正式普通对局只允许使用规则支持等级为 `FULL` 的角色。`PARTIAL` 与 `MANUAL` 仅用于开发测试房，不能成为完成全量重构的替代方案。

## 2. 相对原提案的关键优化

### 2.1 独立重写，而非旧页面渐进替换

原提案建议让旧界面逐项改为提交新命令。该方式适合不停服产品，但本项目旧页面已经高度耦合，容易长期保留两套规则来源。

重构版采用平行开发：

```text
旧版：继续提供当前可玩版本，不再承担新架构试验
V2：从开局、回合、出牌、结算到技能均只调用新引擎
切换：全量规则与联机验收通过后再发布 V2
```

旧版数据、卡图与地图仅通过迁移工具读取，不在运行时加载旧脚本。

### 2.2 行动阶段不是固定的“移动 → 出牌 → 能力”

规则允许玩家在自己的行动阶段合法时点使用行动阶段能力，包括常规移动前后以及常规出牌完成后。只有原子操作内部不能插入其他能力。

行动个人回合使用以下微状态：

```text
ACTION_OPEN
→ 可使用当前合法的行动阶段能力
→ MOVE_DECISION（移动或明确不移动，原子操作）
→ 可使用当前合法的行动阶段能力
→ PLAY_BATCH_DRAFT
→ PLAY_BATCH_COMMIT（两张同时确认、统一支付，原子操作）
→ 可使用新激活牌及其他合法行动阶段能力
→ ACTION_CLOSE
```

战斗阶段在确定战力后，如果存在“战力结算后”能力，必须先进入可序列化的
`post-power-response` 响应步骤；所有响应完成后才能结算败北、战果和侦察奖励。
没有合法响应者时可以直接进入最终结算，但不得在 `combat.resolved` 之后补算会改变胜负的能力。

角色能力可以显式跳过、替换或增加其中某个步骤，但不能靠 UI 顺序隐式实现。

### 2.3 人工裁定是开发工具，不是正式规则路径

房主不能直接修改整个状态对象。开发测试房中的裁定只能提交受限管理命令，例如：

- 调整指定玩家的魔力或战果；
- 在合法区域间移动指定卡牌实例；
- 创建有来源说明的临时状态；
- 跳过一个已经明确标记为 `MANUAL` 的能力；
- 修复被确认的流程阻塞。

每条裁定必须包含操作者、原因、前置修订号、公开日志及实际状态差异。正式普通对局关闭人工裁定入口。

### 2.4 命令协议必须从第一天支持幂等和房间隔离

每条命令至少包含：

```ts
interface GameCommand<TPayload> {
  commandId: string;
  gameInstanceId: string;
  actorId: string;
  expectedRevision: number;
  type: string;
  payload: TPayload;
}
```

处理顺序固定为：

1. 校验命令格式、操作者和 `gameInstanceId`；
2. 检查 `commandId` 是否已经处理，重复命令直接返回原结果；
3. 校验 `expectedRevision`；
4. 在临时状态副本上完成整条命令；
5. 所有效果成功后一次性提交状态和事件；
6. 任一步失败均不修改权威状态。

这可以直接防止重复点击、网络重发、上个房间状态串入和一条命令结算两次。

### 2.5 决策窗口必须保存流程恢复点

任何需要玩家选择的能力都不能依赖回调函数、DOM 弹窗或内存闭包。决策必须完整写入状态：

```ts
interface PendingDecision {
  decisionId: string;
  ownerPlayerId: string;
  chooserPlayerIds: string[];
  kind: string;
  optionsByPlayer: Record<string, DecisionOption[]>;
  min: number;
  max: number;
  allowCancel: boolean;
  visibility: "private" | "sealed" | "public";
  submissions: Record<string, DecisionSubmission>;
  continuationEffectId: string;
  fallbackEffectId?: string;
}
```

选择确认、取消、断线重连、房主代理和密封提交最终都生成事件，然后恢复同一条效果队列。取消必须走明确的 `fallbackEffectId` 或“无效果并继续”，不能只关闭弹窗。

### 2.6 卡牌定义与卡牌实例分离

一张卡的规则定义不能同时充当牌堆中的实体。每张实际卡牌拥有独立实例 ID：

```ts
interface CardInstance {
  instanceId: string;
  definitionId: string;
  ownerPlayerId: string | null;
  controllerPlayerId: string | null;
  zone: CardZone;
  face: "up" | "down";
  active: boolean;
  residual: boolean;
  temporary: boolean;
  paymentReceiptId?: string;
  createdByEffectId?: string;
  modifiers: ModifierInstance[];
}
```

卡牌区域、明暗、是否激活、是否付费、是否残留和是否计算威力分别保存。由此才能正确处理暗置、延迟激活、复制、控制权变化、游戏外衍生牌和回合结束去向。

### 2.7 隐藏信息不仅过滤状态，也过滤命令结果和错误

权威状态只存在于房主。发送给客户端的是玩家投影，必须同时过滤：

- 状态字段；
- 事件载荷；
- 操作日志；
- 合法选项；
- 错误详情；
- 随机数种子及 RNG 内部状态。

客户端不能收到可推算牌库顺序的随机种子。完整种子和权威事件记录只能在游戏结束后的回放文件中公开。

## 3. 模块边界

```text
client-ui
    ↓ commands / projections
application
    ↓
match-engine ─────→ projection
    ↓
rules-core ───────→ content-package
    ↓
domain-state

transport-adapters → application
save-adapters      → match-engine
```

建议目录：

```text
src/
├─ domain/
│  ├─ state/
│  ├─ cards/
│  ├─ players/
│  ├─ board/
│  └─ identifiers/
├─ rules-core/
│  ├─ legality/
│  ├─ costs/
│  ├─ movement/
│  ├─ card-play/
│  ├─ combat/
│  ├─ scoring/
│  ├─ visibility/
│  └─ effects/
├─ match-engine/
│  ├─ commands/
│  ├─ events/
│  ├─ phases/
│  ├─ decisions/
│  ├─ effect-queue/
│  ├─ random/
│  └─ snapshots/
├─ content/
│  ├─ definitions/
│  ├─ skills/
│  ├─ handlers/
│  ├─ schemas/
│  └─ packages/
├─ projection/
├─ transport/
│  ├─ local/
│  └─ peerjs/
├─ save/
├─ ui/
└─ tests/
```

### 3.1 模式扩展层

新模式不能通过在通用引擎中不断增加 `if (mode === ...)` 实现。每个模式注册一个不可变的模式规则包，通用引擎只负责调用模式接口。

```ts
interface GameModeDefinition {
  id: string;
  version: string;
  playerLimits: { min: number; max: number };
  setup(state: GameState, context: ModeContext): void;
  getPhasePlan(state: GameState): PhasePlan;
  getLegalActions(state: GameState, playerId: string): GameAction[];
  onEvent(event: GameEvent, state: GameState, context: ModeContext): EffectFrame[];
  getVictoryStatus(state: GameState): VictoryStatus;
  projectPublicState(state: GameState): PublicModeState;
}
```

标准模式和3X模式都实现同一个接口。新增模式通常只需增加模式 ID 与版本、开局流程、牌组与事件池、阶段计划、模式资源、胜利和淘汰判定、公开投影以及场景测试。

模式专属状态放在 `state.modeState`，并随规则包版本绑定到存档和回放。模式不能直接修改 UI、传输层或普通卡牌规则。

只改变开局选人、牌池或胜利条件的内容属于模式包；增加资源或计分维度时扩展模式状态和评分组件；改变行动顺序时返回新的 `PhasePlan`，仍复用命令、决策、效果队列和投影。

普通技能和卡牌不得读取具体模式名称，而应调用模式能力接口，例如“本模式是否允许额外出牌”或“本模式当前淘汰阈值”。这样新增模式不会迫使所有角色处理器重新分支。

依赖规则：

- `domain` 不依赖其他项目模块；
- `rules-core` 只依赖 `domain` 与只读内容接口；
- `match-engine` 负责编排，但不能包含具体角色名称分支；
- `content/handlers` 可调用规则核心公开能力，不能直接修改状态或访问 DOM；
- `projection` 只读取权威状态；
- `transport` 不解释游戏规则；
- `ui` 不通过描述文本判断合法性。

## 4. 权威状态模型

权威状态至少包含：

```ts
interface GameState {
  schemaVersion: number;
  rulesPackageId: string;
  gameInstanceId: string;
  revision: number;
  status: "lobby" | "setup" | "playing" | "finished";
  mode: "standard" | "three-x";
  modeState: Record<string, unknown>;
  round: number;
  phase: PhaseId;
  step: PhaseStepId;
  activePlayerId: string | null;
  turnOrder: string[];
  players: Record<string, PlayerState>;
  cards: Record<string, CardInstance>;
  board: BoardState;
  effectQueue: EffectFrame[];
  pendingDecision: PendingDecision | null;
  commandJournal: ProcessedCommand[];
  eventLog: GameEvent[];
  rng: HostOnlyRandomState;
}
```

关键不变量：

1. 每张卡牌实例只存在于一个区域；
2. 魔力、令咒和卡牌费用不会被同一支付凭证重复扣除；
3. 非当前决策者不能提交选择；
4. 被【败北】且未受明确例外保护的玩家不能再打出牌；
5. 同一回合的侦察基础战果只结算一次；
6. 同一命令只产生一次状态变化；
7. 客户端投影不包含无权查看的定义 ID、实例 ID或选项；
8. 所有效果队列最终结束、等待决策或产生明确错误，不能静默停滞。

## 5. 命令、事件与效果

三者职责必须分开：

- **命令**：玩家希望做什么，例如移动、提交两张牌、发动技能、确认选择；
- **事件**：系统已经确认发生的事实，例如支付3点魔力、卡牌进入攻击区、玩家进入败北状态；
- **效果**：正在等待规则引擎结算的工作单元，可生成事件、后续效果或决策窗口。

标准流水线：

```text
Command
→ 身份、房间、修订号和时点验证
→ getLegalActions / 目标与费用验证
→ 创建效果帧
→ 效果队列结算
→ 必要时暂停为 PendingDecision
→ 产生领域事件
→ 原子提交新状态
→ 生成各玩家投影
→ 联机广播
```

效果帧只保存可序列化数据和处理器 ID，不保存函数：

```ts
interface EffectFrame {
  effectId: string;
  handlerId: string;
  sourceId: string;
  controllerPlayerId: string | null;
  payload: unknown;
  createdAtRevision: number;
}
```

## 6. 阶段与结算顺序

完整回合：

```text
ROUND_START
→ 抽取并激活局势
→ 所有存活玩家获得局势魔力
→ 深山町放置明置事件
→ 新都放置暗置事件
→ 玩家补充手牌
→ PREPARATION 玩家窗口
→ OUTPOST 玩家窗口（阶段能力 / 部署 / 阶段能力）
→ 展示新都事件
→ ACTION 玩家窗口
→ COMBAT 玩家窗口
→ 战力计算与胜负
→ 事件、战场奖励与侦察战果统一结算
→ ROUND_END 清理、持续效果、淘汰与顺位轮换
```

开局局势牌固定执行：

```text
10张非高潮局势洗牌
→ 暗置移除2张
→ 剩余8张再次洗牌
→ 放置在3张按第9、10、11回合顺序排列的高潮局势上
```

侦察玩家在两处战场获得战果的同一结算检查点获得2点战果，而不是进入侦察时立即获得。

同一检查点发生多个效果时：

1. 先按规则来源层：局势 → 事件 → 玩家控制的牌与能力；
2. 玩家来源按当前回合顺位；
3. 同一玩家控制多个同时效果时创建排序决策；
4. 替代与阻止效果在原事件提交前处理；
5. 不同规则维度分别计算，不用一个模糊的全局优先级数字互相覆盖。

## 7. 出牌事务

常规两张牌必须作为一个事务确认：

```text
建立草稿
→ 检查来源、数量、明暗、区域和角色例外
→ 计算两张明置牌的最终费用
→ 检查开始出牌时的8魔力技能牌门槛
→ 检查总费用可同时支付
→ 一次性支付
→ 一次性移动全部卡牌实例
→ 触发打出时效果
```

任何检查失败都不能留下部分扣费或部分移牌。

普通暗置规则：

- 仍计入本次常规出牌数量；
- 不支付牌面费用；
- 不激活、不计算威力、不使用卡面能力；
- 战场上常规两张中至少一张必须明置；
- 回合结束进入弃牌堆；
- 技能牌默认不能暗置，除非结构化许可明确放行。

“加入攻击”“创造并激活”“打出”是三个不同动作，不能共用一个模糊的 `addCard()`。

## 8. 结构化技能模型

描述只负责展示，运行时不解析中文文本：

```ts
interface SkillDefinition {
  id: string;
  ownerDefinitionId: string;
  name: string;
  displayText: string;
  sourceRefs: RuleSourceRef[];
  support: "FULL" | "PARTIAL" | "MANUAL" | "DISABLED";
  activation: {
    kind: "passive" | "optional-trigger" | "active" | "play" | "reaction" | "residual";
    eventTypes?: string[];
    phases?: PhaseId[];
    steps?: PhaseStepId[];
  };
  requirements: RequirementDefinition[];
  costs: CostDefinition[];
  targets: TargetDefinition[];
  limits: UsageLimitDefinition[];
  effects: EffectDefinition[];
  handlerId?: string;
}
```

- `被动`注册为强制事件触发，不生成普通按钮；
- `被动/XX阶段`注册为对应玩家窗口的可选操作；
- 印在攻击或技能牌上的普通阶段能力要求该卡当前明置激活；
- `残留`定义卡牌关闭前持续存在的区域和能力；
- `唯一`通过规则文本组 ID 和使用记录限制，不根据技能名称比较；
- 真正特殊能力使用专属处理器，但仍只能返回标准效果、事件或决策请求。

## 9. 可见状态投影

每个客户端收到不同的 `PlayerProjection`：

```text
公共信息
+ 该玩家自己的私有信息
+ 规则明确授权查看的信息
- 所有其他隐藏字段
```

服务端/房主先生成投影再序列化，不能把完整状态发送后让客户端自己隐藏。

从者真名、技能区、秘密花园、暗置攻击、密封选择、牌库顺序和私有状态分别通过可见性策略控制。宫本武藏【境界】等信息必须先检查真名是否已公开，再进入其他玩家投影。

## 10. 联机与重连

当前首选仍可使用 PeerJS，但 PeerJS 只是传输层：

```text
客户端提交命令
→ 房主验证与结算
→ 房主递增 revision
→ 房主分别生成玩家投影
→ 广播投影和公开事件
```

联机状态必须包含：

- 新房间生成的新 `gameInstanceId`；
- 稳定玩家 ID 与一次性重连凭证；
- `commandId` 幂等记录；
- 状态 `revision`；
- 当前决策及其公开完成状态；
- 房主保存的完整权威快照；
- 客户端只保存自己的投影缓存。

房主退出后的迁移属于后续功能。初版可以明确结束房间，但不能让其他客户端继续使用失去权威来源的旧状态。

## 11. 规则包与版本

每局绑定不可变规则包：

```text
rulesPackageId = 内容版本 + 规则实现版本 + 数据校验摘要
```

存档和回放必须记录该 ID。代码更新后，进行中的对局继续使用创建时的规则包；无法加载对应规则包时明确拒绝恢复，不能静默套用新规则。

开发流程：

```text
规则原文 / FQA / 卡图
→ 登记来源及冲突
→ 人工确认裁定
→ 结构化定义
→ 处理器或通用组件
→ 场景测试
→ 可见性测试
→ 回放测试
→ 标记 FULL
```

规则来源优先级沿用 `docs/rule-precedence.md`。

## 12. 测试门槛

### 通则测试

- 3至7人开局与七个席位；
- 10张非高潮局势随机移除2张并固定高潮顺序；
- 牌堆耗尽后的弃牌重洗；
- 部署容量、地利、单向移动和交战限制；
- 常规两张同时出牌、8魔力技能门槛与统一支付；
- 明暗置、残留、游戏外、追加攻击和延迟激活；
- 败北后禁止继续出牌且已打出的牌保留；
- 事件、战场奖励与侦察2战果只结算一次；
- 第8至11回合淘汰与最终胜者。

### 不变量与属性测试

- 卡牌实例区域唯一；
- 同一支付凭证不重复扣费；
- 同一命令不重复结算；
- 任意取消路径不阻塞效果队列；
- 任意客户端投影不泄露隐藏信息；
- 相同规则包、命令序列和房主 RNG 记录得到相同最终状态。

### 角色测试

每项能力至少覆盖：正常发动、条件不足、费用边界、阶段错误、禁止效果、隐藏信息、取消选择、回合清理及联机重放。

已有玩家反馈场景沿用 `docs/regression-scenarios.md`。

## 13. 实施顺序

```text
M1：TypeScript 状态、命令、事件、效果队列、决策和规则包骨架
M2：无角色能力的完整11回合基础游戏
M3：通用关键词与卡牌区域系统
M4：御主、从者、事件和局势逐项迁移至 FULL
M5：3X、AI代理、存档、回放和玩家投影
M6：PeerJS房主权威联机与重连
M7：全新UI接入，地图保持原3×2布局与原素材
M8：七人模拟、隐藏信息审计和全量回归验收
```

每个里程碑都在 V2 内独立通过测试。正式发布条件是：所有允许抽取的角色均为 `FULL`，基础流程、联机、存档与投影测试全部通过，运行时不依赖旧版规则代码。
