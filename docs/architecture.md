# 重构版技术架构

> 本文件保留核心原则摘要。完整且最新的正式架构基线见 `rules-engine-architecture-v2.md`。

## 目标

重构版不是旧 `index.html` 的换皮，也不依赖旧 `SkillLib.js` 执行规则。所有玩法必须通过结构化命令进入规则引擎，生成事件和效果，最终修改一份可序列化的游戏状态。

```text
UI / AI / 联机客户端
        |
        v
    Command
        |
        v
   RuleEngine ---- getLegalActions()
        |
        v
 EffectQueue <--> ChoiceManager
        |
        v
    Domain Events
        |
        v
  Serializable GameState
```

## 模块边界

- `core/`：状态、命令校验、阶段、事件总线、效果队列、选择和随机数。
- `content/`：御主、从者、卡牌、事件、局势和模式配置。只包含结构化数据。
- `skills/`：技能注册及具体规则处理器。技能描述不参与逻辑判断。
- `combat/`：攻击、威力、地利、胜负、战果、淘汰。
- `network/`：房主权威命令、快照、重连、修订号和幂等命令。
- `save/`：单机存档格式及版本迁移。
- `ui/`：读取视图模型并发出命令，不自行解释规则。
- `map/`：地图图像、地点坐标和地图交互。原地图视觉与地点关系保持不变。

## 不可破坏的约束

1. 不使用显示名称作为技能、角色或卡牌的程序标识。
2. 不从中文描述中解析阶段、被动、费用或触发条件。
3. 不允许 UI 直接修改游戏状态。
4. 不允许技能处理器直接弹出浏览器弹窗。
5. 所有随机结果由 `RandomService` 产生，并可根据种子重放。
6. 所有等待玩家决定的流程必须进入 `pendingChoice`，取消也必须生成明确结果。
7. 联机只同步命令、事件或完整快照，不同步 DOM。
8. `GameState` 必须能够完整 JSON 序列化。

## 标准技能模型

```js
{
  id: "master.tiamat.sea_of_life",
  ownerType: "master",
  activation: {
    kind: "active",
    windows: ["action"]
  },
  text: "用于界面显示的原始卡面描述",
  handler: "master.tiamat.sea_of_life"
}
```

`被动/前哨阶段`应表示为可选触发：

```js
{
  kind: "optional-trigger",
  event: "phase.player-window.opened",
  windows: ["outpost"]
}
```

这与强制执行的 `passive` 不同，也与行动阶段主动能力不同。

## 联机原则

- 房主保存权威状态并执行合法性判断。
- 每局拥有新的 `gameInstanceId`，旧房间快照不能进入新房间。
- 每条命令拥有唯一 `commandId`，重复发送只结算一次。
- 状态带递增 `revision`，客户端只能接受更新版本。
- 重连先校验游戏实例，再获取完整快照和未完成选择。
- 随机数仅由房主推进，客户端展示已确认结果。
