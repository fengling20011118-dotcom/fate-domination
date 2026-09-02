# 前端接入合同

状态：V2 前后端联调契约（2026-09-01）。

前端只通过应用门面提交命令和读取玩家投影，不直接操作权威状态。

## 六项稳定契约

统一类型入口为 `src/application/integration-contract.ts`。

1. `MatchView`：当前接收者可见的完整对局投影；不含 RNG、权威事件日志、他人私有牌或隐藏选择。
2. `AvailableAction`：规则引擎根据权威状态计算的可用意图及候选/数量边界。前端只能从这里生成操作入口，但提交后仍由后端最终校验。
3. `GameCommand`：前端意图信封。前端提交“打出哪些实例、以何种明暗方式”，不提交费用、触发结果、战力或胜者。
4. `CommandResult`：成功时返回新 `MatchView`、下一组动作、权威事件和计算明细；失败时返回不变投影及结构化拒绝。不会返回 `GameState`。
5. `CardDefinition`：静态卡面及结构化规则元数据。卡牌所在区域、明暗、激活状态属于 `MatchView` 中的卡牌实例，不属于定义。
6. `HostAdjudicationRequest`：仅开发/测试房用于 `PARTIAL`、`MANUAL` 或未解析条款；它是受限裁定请求，不允许前端或房主提交任意状态对象。

核心职责固定为：

```text
前端：我想打出这两张牌（实例 ID + 明暗选择）
后端：校验时点/归属/组合/费用 → 原子扣费 → 触发响应 → 计算最终威力
前端：只展示 CommandResult 的投影、事件与 calculation lines
```

`GameApplication.dispatchFor(viewerId, command)` 是面向 UI/传输的入口；旧 `dispatch()` 返回权威状态，仅供后端内部和既有规则测试使用，不得暴露给客户端。

## 稳定入口

示例：

    import { GameApplication } from "./src/application/game-application.ts";
    import { CommandType } from "./src/match-engine/commands.ts";

    const app = GameApplication.create({
      gameInstanceId: crypto.randomUUID(),
      players: [{ id: "player-1", name: "玩家1" }],
      seed: 12345,
      content,
    });

    const result = app.dispatchFor("player-1", {
      commandId: crypto.randomUUID(),
      gameInstanceId: app.state.gameInstanceId,
      actorId: "player-1",
      expectedRevision: app.state.revision,
      type: CommandType.CompletePlayerWindow,
      payload: {},
    });

    if (!result.ok) showError(result.rejection.code);
    else render(result.view, result.availableActions, result.events, result.calculations);

每次返回的 state.revision 用作下一条命令的 expectedRevision，每次点击生成新的 commandId。重复发送同一个 commandId 是幂等的。

## 可依赖数据

- PublicGameState：当前阶段、回合、地图、公开卡牌和玩家公开信息；
- PublicPlayerState：自己的私有投影与其他玩家的公开字段；
- pendingDecision：当前玩家需要确认的选择窗口；
- CommandResult.events：已经确认发生的事件，用于日志、音效和动画；
- CommandResult.calculations：后端提供的费用、战力、奖励、限制和触发明细；
- 内容包中的角色名、卡牌名、展示文字和图片路径。

隐藏信息由后端过滤。前端不要接收完整 GameState 后自行隐藏。

## 命令与决策

使用 CommandType 提交移动、出牌、技能、攻击、阶段完成和决策操作。确认使用 ResolveDecision，取消使用 CancelDecision；取消会走规则引擎的 fallback 或无效果继续路径，不能只关闭弹窗。

前端不要重算费用、战力、阶段资格、技能条件、随机结果或抽牌结果。命令失败时保留当前 UI，并展示错误代码。

## 事件驱动显示

events 是权威事实，可驱动卡牌区域变化、资源变化、战斗响应、败北、侦察、回合结束和宝具动画。普通技能不要求强制动画；宝具动画由事件类型决定。

## 禁止事项

- 不直接修改 GameState、玩家、卡牌或牌堆；
- 不接回旧开发版 State、Engine、SkillLib.js；
- 不解析技能中文描述决定按钮、费用或合法性；
- 不把 PARTIAL、MANUAL 当作完整能力；
- 不在 UI 内实现战斗、移动、随机、抽牌或隐藏信息逻辑；
- 不缓存跨房间的权威状态，每局使用新的 gameInstanceId。

## 当前边界

标准/3X 通用流程、命令信封、决策恢复、投影和快照接口已可对接。角色技能仍有 PARTIAL，正式联机重连、旧存档兼容和新 UI 规范尚未完成。

检查命令：npm test、npm run validate、npm run audit:skills。
