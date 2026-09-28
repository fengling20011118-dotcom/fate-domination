# Fate/Domination 线上仓库规则符合性审计

**审计对象：** `fengling20011118-dotcom/fate-domination`  
**锁定提交：** `64b135106f7bc9c3db06019fdfdb49ec14a8cb55`（2026-08-29，`修复阶段被动与事件交互`）  
**规则基线：** [`FD-Game-Rules-Final.md`](../rules/FD-Game-Rules-Final.md)  
**审计日期：** 2026-08-30  
**审计方式：** 对锁定提交进行静态源码追踪，按“规则条款 → 代码入口 → 状态变化 → 玩家可见结果”建立证据链；未进行完整多人实机回放。

## 1. 结论

该仓库**不能被认定为完整遵循最终规则的实现**。

审计确认：

- 6 项基础流程高优先级不符合；
- 4 项中优先级不符合或能力缺口；
- 另有 1 项覆盖全卡池的系统性高风险近似实现；
- 路径费用、基础战场分池、终局最高 VP/深山町破同分等核心逻辑已有部分正确实现。

最先应修复的是：令咒阶段、侦查结算、淘汰线同分算法、【败北】行为限制、常规移动次数、隐藏信息同步。它们会直接改变基础局胜负，不属于界面差异或可接受的扩展规则。

## 2. 被审计实现的架构

```text
浏览器 UI / PeerJS 客户端
        │
        ├─ index.html
        │   ├─ State：全局可变游戏状态
        │   ├─ Network：P2P 房间与整份 State 同步
        │   ├─ UI：视图、选择器、弹窗
        │   └─ Engine：准备、部署、行动、战斗、结算、淘汰
        │
        ├─ data_core.js：地点、移动、局势、事件
        ├─ data_cards.js：基础攻击牌
        ├─ data_masters.js：御主数据
        ├─ data_servants.js + batch_*.js：从者与技能数据
        └─ SkillLib.js
            ├─ 手工技能处理器
            ├─ 描述文本正则模板
            └─ 无法识别时仅提示“按卡牌文本结算”
```

它是一个无后端裁判服务的静态单页应用。主流程和大量角色逻辑集中在 `index.html`，技能则采用手工、模板解析和提示兜底三种实现并存。该结构可以快速扩充内容，但缺少统一时点队列、统一规则约束器和隐藏信息边界，因而容易在不同代码路径中产生规则漂移。

## 3. 确定不符合项

### FD-AUD-001：所有普通角色都可在战斗阶段使用令咒

**严重度：高**  
**规则：** 最终规则 10.2：令咒通常只能在自己的行动阶段回合使用；只有具体角色或效果明确授权时才可改到其他阶段。  
**证据：** [`index.html:L4945-L4958`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4945-L4958) 对除爱丽丝菲尔外的所有角色统一允许 `State.phase === 3 || State.phase === 4`。  
**实际结果：** 任意普通御主都能在自己的战斗阶段回合使用回魔、强化或传送令咒。  
**判定：** 明确违反。  
**整改：** 通用入口只允许行动阶段；非行动阶段权限必须由角色/效果授予的显式 timing capability 决定，不能按角色反向列例外。

### FD-AUD-002：侦查 2 VP 的时点和条件均错误

**严重度：高**  
**规则：** 最终规则 12.3：战力结算开始时，所有合法位于侦查的玩家获得 2 VP，与战场是否产生 VP 无关。  
**证据：**

- [`index.html:L5200-L5206`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5200-L5206) 按“工房 → 深山町 → 新都 → 侦查”结算；
- [`index.html:L5272-L5286`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5272-L5286) 只有 `State.battlefieldVpGained` 为真才发放侦查 VP；
- [`index.html:L5294-L5296`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5294-L5296) 与 [`index.html:L5964-L5982`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5964-L5982) 仅在战场赢家实际得到正 VP 后设置该标记。

**实际结果：** 两个战场无人获胜、公共池为 0、或战果被其他效果阻止时，侦查玩家错误地得不到 2 VP；发放时点也被推迟到两个战场结算之后。  
**判定：** 明确违反。  
**整改：** 进入战力结算时先独立结算侦查；删除 `battlefieldVpGained` 前置条件。

### FD-AUD-003：淘汰线以下的同分玩家也会被错误豁免

**严重度：高**  
**规则：** 最终规则 14.2：只有**淘汰线同分**者共同存活；低于淘汰线者仍应淘汰。  
**证据：** [`index.html:L6344-L6359`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L6344-L6359) 对任何低于阈值且 `vpCounts[effectiveVP] > 1` 的实体都执行“平局免除”。  
**复现：** 第 8 回合目标前 4，存活者为 `10, 9, 8, 7, 6, 6 VP`。阈值为 7；规则应淘汰两名 6 VP 玩家，当前代码会因两人同为 6 分而让两人全部存活。  
**判定：** 明确违反。  
**整改：** 存活条件应为 `score >= cutoffScore`；不得再对 `score < cutoffScore` 做同分豁免。

### FD-AUD-004：【败北】玩家仍可在之后的行动回合出牌

**严重度：高**  
**规则：** 最终规则 12.6：具有【败北】的玩家不能打出牌，但仍可使用合法能力。  
**证据：**

- [`SkillLib.js:L170-L183`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L170-L183) 的【万符必应破戒】可在行动阶段给尚未行动的目标设置 `ruleBreakerDefeated = true`；
- [`index.html:L4964-L4972`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4964-L4972) 的 `submitAction` 未检查该状态，选牌入口也没有统一的【败北】出牌禁令；
- [`index.html:L5958-L5962`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5958-L5962) 只在决定战斗胜者时排除该玩家。

**实际结果：** 早顺位玩家令晚顺位玩家【败北】后，后者仍可正常提交攻击，只是最终不能获胜。  
**判定：** 明确违反。  
**整改：** 把【败北】建模为统一、可叠层、带到期时点的状态；所有出牌入口统一询问 `canPlayCard`，能力入口单独询问 `canUseAbility`。

### FD-AUD-005：整份 State 广播泄露隐藏信息

**严重度：高**  
**规则：** 最终规则 4.3：手牌、牌库内容、暗置牌、未展示的新都事件为隐藏信息。  
**证据：**

- [`index.html:L1259`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L1259) 的全局 `State` 包含所有玩家、事件和选择状态；
- [`index.html:L1385-L1391`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L1385-L1391) 将整份 `State` 作为 `SYNC_STATE` 发给每个客户端；
- 玩家对象在 [`index.html:L3620`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L3620) 中直接包含 `deck`、`hand`、`discard`。

**实际结果：** 即使 UI 不显示，客户端内存和网络消息仍拥有其他玩家手牌、牌库顺序和暗置事件内容，可通过开发者工具读取。  
**判定：** 明确违反信息边界。  
**整改：** 主机保留权威完整状态；为每个接收者生成脱敏视图，只发送其有权获知的字段。长期方案应使用按命令提交、主机校验、按玩家投影视图的协议。

### FD-AUD-006：常规移动起点和次数均未受正确限制，效果移动也绕过部分容量

**严重度：高**  
**规则：** 最终规则 9.1–9.3：常规移动通常只能从魔术工房发起，每个行动回合至多一次；只有地点或效果明确声明“不处于交战状态”时，才可从非工房地点例外发起。效果移动仍受终点容量和明确进入限制约束。  
**证据：**

- [`index.html:L1782-L1797`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L1782-L1797) 始终重新显示“常规移动”，没有 `hasMoved` 状态；
- [`index.html:L4960-L4962`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4960-L4962) 每次调用都可继续前移，成功后也不记录本回合已移动；
- [`index.html:L4949-L4955`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4949-L4955) 的令咒传送只检查侦查容量和高潮禁入，不检查魔术工房容量；
- [`SkillLib.js:L481-L487`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L481-L487) 的通用效果移动直接写入目的地，没有统一容量/禁入校验。

**实际结果：** 玩家可以直接从深山町或新都继续发起常规移动，也可以在同一行动回合分多次常规移动；若通过令咒或模板技能回到工房，还可能突破工房容量。  
**判定：** 明确违反。  
**整改：** 建立唯一 `moveActor` 规则服务，参数区分 regular/effect/forced；常规移动成功后消耗本回合移动机会，所有路径统一检查终点规则。

### FD-AUD-007：非高潮局势不是“洗混 10 张、烧 2 张、依次使用”

**严重度：中**  
**规则：** 最终规则 5.2：10 张非高潮局势洗混，随机烧毁 2 张，前 8 回合依次使用剩余 8 张。  
**证据：**

- [`data_core.js:L38-L51`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/data_core.js#L38-L51) 定义 10 张非高潮局势；
- [`index.html:L1259`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L1259) 与新局状态没有局势牌堆/烧毁区；
- [`index.html:L4337-L4340`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4337-L4340) 在第 1–8 回合每回合从完整非高潮列表独立随机抽取，抽后不移除。

**实际结果：** 同一非高潮局势可以重复出现，另一些局势可从未出现；不存在“烧毁 2 张”的可验证信息。  
**判定：** 明确违反。  
**整改：** 新局时生成 `situationDeck` 与 `burnedSituations`，第 1–8 回合从牌堆依次取牌。

### FD-AUD-008：第 1 回合起始玩家固定，且不支持方向投票

**严重度：中**  
**规则：** 最终规则 5.1：随机/一致同意确定首位；默认顺时针，可开局投票改逆时针；之后每回合轮转一位。  
**证据：**

- [`index.html:L3612-L3620`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L3612-L3620) 按玩家编号建立固定数组；
- [`index.html:L4036`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4036) 使用 `(day - 1) % players.length`，第 1 回合总从数组第 0 位开始且只按正向轮转；
- 状态中没有方向字段或投票结果。

**实际结果：** 房主/`player_0` 固定取得首回合首位，不能选择逆时针。  
**判定：** 明确违反。  
**整改：** 新局保存 `seatOrder`、`direction`、`roundStartSeat`；首位随机并在开局前完成方向投票。

### FD-AUD-009：手牌不足时只校验出牌数量，没有强制打完现有手牌

**严重度：中**  
**规则：** 最终规则 9.4：玩家通常同时打出正好 2 张；手牌只有 1–2 张时必须将这些手牌全部纳入该批出牌，全部合法来源不足 2 张时打出所有合法牌，只有完全没有合法牌时才可空过。  
**证据：**

- [`index.html:L4991-L4998`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4991-L4998) 用 `Math.min(p.hand.length, 2)` 作为最低常规项数，但没有检查被选中的是否为这些手牌；
- [`index.html:L1788-L1795`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L1788-L1795) UI 也按同一规则开放确认；
- [`index.html:L4607-L4625`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4607-L4625) 的 `normal` 计数还包含技能牌、魔兽和部分御主技能，因此可以由非手牌项目满足最低数量。

**实际结果：** 空手时允许空过与新规则一致；但手牌只有 1–2 张时，玩家可能用技能牌等项目满足数量检查而保留手牌，没有被强制打完。代码也没有统一判断“所有合法来源不足 2 张时必须全部打出”。  
**判定：** 与最终规则不符。  
**整改：** 提交前先建立合法牌集合：手牌为 1–2 张时强制全部选入，再从其他合法来源补足；合法集合为空时才允许空过。

### FD-AUD-010：没有实现最终规则的统一同时效果优先级

**严重度：中**  
**规则：** 最终规则 13.2：同时即时效果按“局势 → 事件 → 玩家卡（回合顺位）”处理；同玩家同类效果由该玩家决定顺序。  
**证据：**

- [`index.html:L5266-L5267`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5266-L5267) 直接按 `participants` 数组遍历技能，再按数组遍历普通牌；
- [`index.html:L5950-L5957`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5950-L5957) 战力计算与最终判定同样按固定循环执行；
- 全仓库不存在承载“来源级别、进入顺序、玩家选择顺序、五级冲突优先级”的统一调度对象。

**实际结果：** 同时效果的实际顺序由部署数组、技能数组和硬编码循环位置决定；同一玩家不能为同类同时效果选择顺序，也无法稳定执行“局势 > 事件 > 玩家卡”的裁定。  
**判定：** 实现缺口；在效果互相改写、阻止或关闭时会产生规则错误。  
**整改：** 将即时效果注册为带 `sourceTier`、`controllerSeat`、`enteredAt`、`conflictLevel` 的 effect records，先排序再逐项结算；同控制者同层冲突时发起选择。

### FD-AUD-011：卡池存在大量“近似替代”和人工结算，不是规则等价实现

**严重度：高（系统性）**  
**规则：** 最终规则 1.2 要求具体卡牌文字与基础规则共同适用；软件若宣称自动结算，就必须执行卡牌的真实状态变化、时点和目标，而不是用固定威力/VP 代替。  
**证据：**

- [`SkillLib.js:L469-L475`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L469-L475) 明确采用“手工表 → 描述正则 → 提示 fallback”；
- [`SkillLib.js:L4646-L4778`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L4646-L4778) 用正则从自然语言推导效果，包含随机选目标、以合计威力近似单牌威力等非等价转换；
- [`SkillLib.js:L4781-L4805`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L4781-L4805) 无法识别的技能只记录“请按卡牌文本结算”，没有阻止游戏继续或确认人工处理完成；
- 静态统计在 `index.html` 与 `SkillLib.js` 中发现 **143 处“近似”**；源码还明确标注“未自动”“未实现”“手动遵守”等路径。

代表性非等价实现：

- [`SkillLib.js:L2547-L2554`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L2547-L2554)：应令同地点玩家【败北】，却近似为各失 2 VP；
- [`SkillLib.js:L2911`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L2911)：应在下一回合开始赋予【败北】，却近似为各失 3 VP；
- [`SkillLib.js:L3012`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/SkillLib.js#L3012)：直接胜利条件被近似为 `+20 VP`；
- [`index.html:L5540-L5557`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5540-L5557)：多项移动限制、魔力上限、卡牌展开和阶段改变被省略或换算成威力。

**实际结果：** 即使基础流程修正，部分角色/从者仍会改变目标选择、资源、状态、持续时间乃至胜利条件。  
**判定：** 系统性不符合，不能按单个小 bug 处理。  
**整改：** 建立卡牌实现清单，状态只允许 `exact / manual-blocking / unsupported` 三种：

1. `exact`：完整自动执行并有测试；
2. `manual-blocking`：暂停状态机，展示原文，由房主确认结算结果后继续；
3. `unsupported`：选角前禁用该内容。

不得继续用无说明的固定威力或 VP 替代不同语义。

## 4. 已确认基本符合的核心项

| 规则项 | 结论 | 主要证据 |
|---|---|---|
| 地图路径与基础费用 `1/2/2` | 符合 | [`data_core.js:L29-L33`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/data_core.js#L29-L33) |
| 工房通常 4 位 | 符合基础容量；若代码另设高潮 1 位，应按最终规则 1.1.0 复核 | [`index.html:L4460-L4465`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4460-L4465)；效果移动例外见 FD-AUD-006 |
| 新都事件在行动阶段开始展示 | 符合 | [`index.html:L4410-L4412`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4410-L4412) |
| 基础游戏支持 3-7 名玩家，少于 3 人时添加 1 名 NPC | 不符合最终规则 1.1.0；旧实现固定人数上限并以 AI 补足 | [`index.html:L3601-L3620`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L3601-L3620) |
| 战场并列最高者共同获胜 | 符合 | [`index.html:L5958-L5964`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5958-L5964) |
| 多人战场公共池为事件 VP + 深山 2/新都 3，并向上取整平分 | 符合 | [`index.html:L5964-L5982`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5964-L5982) |
| 单人战场只得事件 VP、不加竞争 VP | 符合 | [`index.html:L5293-L5296`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L5293-L5296) |
| 令咒三种基础效果数值 | 基本符合 | [`index.html:L4948-L4955`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L4948-L4955)；阶段和容量例外见 FD-AUD-001/006 |
| 第 8/9/10 回合目标人数 4/3/2 | 基本符合 | [`index.html:L6173`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L6173)；低于线同分错误见 FD-AUD-003 |
| 第 11 回合最高 VP，平分时用深山町唯一胜者破同分，否则全败 | 符合 | [`index.html:L6340`](https://github.com/fengling20011118-dotcom/fate-domination/blob/64b135106f7bc9c3db06019fdfdb49ec14a8cb55/index.html#L6340) |

## 5. 建议整改顺序

### 第一批：基础局胜负正确性

1. 修复令咒阶段；
2. 独立并前置侦查 2 VP；
3. 修复淘汰线算法；
4. 统一【败北】状态与出牌禁令；
5. 限制每回合一次常规移动并统一移动校验。

### 第二批：确定性与信息边界

1. 改为按玩家脱敏同步；
2. 建立真实局势牌堆和烧毁区；
3. 实现随机首位、方向投票和稳定座次轮转；
4. 实现“手牌不足时必须打完、完全无合法牌才可空过”的提交校验。

### 第三批：可扩展的规则引擎

1. 建立统一时点/优先级队列；
2. 建立统一 `canPlay / canMove / canUseAbility / canWin` 规则服务；
3. 将所有“近似”卡逐张迁移到 exact handler；
4. 对未精确支持的卡启用阻塞式人工结算或选角前禁用；
5. 为每条最终规则建立表驱动测试，尤其覆盖同分、0 VP、多人同时效果和跨阶段能力。

## 6. 审计限制与可复核性

- 本报告以提交 `64b135106f7bc9c3db06019fdfdb49ec14a8cb55` 为准；后续提交可能改变结论。
- 审计副本关键哈希：
  - `index.html`: `C0DA2A51F83921F885458351E87B65A7AFA1A0195E3EA5866064D18EB1FD7C4A`
  - `SkillLib.js`: `C97F6D86EDBEE895B547A65C0648DDA2BF8CE46CA23E2544DBAF72C11A92FC46`
  - `data_core.js`: `CE3360CC40EEEB9A201964EF73A8962CCAE2101F8911AE88A527C62D936490D3`
- “不存在统一调度器”等结论来自完整静态搜索与调用路径追踪；未通过浏览器自动执行全部角色组合。
- 卡池规模较大，本报告没有逐卡列出 143 处近似实现；FD-AUD-011 是系统性结论。后续若要交付可修复清单，应另建逐卡矩阵，记录卡牌原文、当前 handler、差异、测试和完成状态。
