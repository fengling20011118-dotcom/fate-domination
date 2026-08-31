# 前端接入合同

状态：后端规则引擎协作基线（2026-08-31）。

前端只通过应用门面提交命令和读取玩家投影，不直接操作权威状态。

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

    const result = app.dispatch({
      commandId: crypto.randomUUID(),
      gameInstanceId: app.state.gameInstanceId,
      actorId: "player-1",
      expectedRevision: app.state.revision,
      type: CommandType.CompletePlayerWindow,
      payload: {},
    });

    const view = app.viewFor("player-1");

每次返回的 state.revision 用作下一条命令的 expectedRevision，每次点击生成新的 commandId。重复发送同一个 commandId 是幂等的。

## 可依赖数据

- PublicGameState：当前阶段、回合、地图、公开卡牌和玩家公开信息；
- PublicPlayerState：自己的私有投影与其他玩家的公开字段；
- pendingDecision：当前玩家需要确认的选择窗口；
- DispatchResult.events：已经确认发生的事件，用于日志、音效和动画；
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
