# 月之圣杯（Moon Cell）规则层整理

来源：用户提供的中文规则图，以及 Fate/Domination Wiki 的 How to Play / The Moon Cell 章节。

- https://fatedomination.fandom.com/wiki/How_to_Play
- https://fatedomination.fandom.com/wiki/Moon_Cell

## 静态数据

```ts
const moonCellDefinition = {
  id: "moon-cell",
  name: "月之圣杯",
  type: "special-battlefield",
  contestedVictoryPointBonus: 3,
  terrainPowerSlots: [1, 2, 4],
  allowsRegularActionMovementIn: false,
  allowsRegularActionMovementOut: false,
  allowsDirectMovementEffects: true,
};
```

“战果 3”按普通战场的争夺奖励处理：战斗结算时至少存在两名相互争夺的玩家或 NPC，胜者才获得该地点奖励。地利格增加的是威力，不是魔力。

## 对局状态

```ts
type MoonCellState = {
  active: boolean;
  eventCardId: string | null;
  visitedThisRoundPlayerIds: string[];
  moonCancerVisitedThisRound: boolean;
};
```

建议记录“本回合曾到访”，不要只在结算时读取当前位置；MoonCancer 离开后仍然满足本回合的战斗条件。

## 进入游戏

1. 初始状态为 `active = false`，不属于可选地点。
2. 一张明确提及月之圣杯的卡牌被使用并结算时，将它设置为 `active = true`。
3. 英文规则说明目前只有 MoonCancer 从者的卡牌会提及月之圣杯，但规则层应按卡牌效果或标签触发，不要通过从者职阶硬编码开启。

## 准备阶段

当 `active = true` 且 `eventCardId = null` 时：

1. 从事件牌堆取得一张牌。
2. 正面放置于月之圣杯。
3. 保存为 `eventCardId`。

如果已经保留着事件牌，不再补牌。

## 前哨阶段与移动

1. 高潮阶段期间，玩家不能在前哨阶段部署于月之圣杯。
2. 月之圣杯没有普通移动箭头，因此常规行动移动不能进入、离开或途经此处。
3. 明确允许“直接移动至某地点”的能力仍可进出，例如令咒移动。
4. 非高潮阶段是否允许前哨部署，应按中文规则图处理为允许；仍需满足地点已经展开。

## 到访记录与保密信息

玩家进入月之圣杯时：

1. 将玩家加入 `visitedThisRoundPlayerIds`。
2. 若其从者职阶为 MoonCancer，将 `moonCancerVisitedThisRound = true`。
3. 该检查不要求公开从者身份。
4. 战斗阶段询问相关玩家是否为 MoonCancer 时，玩家必须如实回答；回答结果只用于判定，可继续保持真名与卡面隐藏。

## 战斗阶段

```ts
const shouldResolveMoonCellBattle =
  moonCell.active && moonCell.moonCancerVisitedThisRound;
```

### 满足条件

- 按普通战场流程计算威力、败北状态、并列胜者、事件牌战果与争夺奖励。
- 地利格分别提供 `+1 / +2 / +4` 威力。
- 战果 3 只在构成争夺战时加入奖励。
- 战斗完成后，事件牌按普通已结算事件处理。

### 不满足条件

- 此处不发生战斗，不判定胜者。
- 当前位于月之圣杯的每名玩家获得 2 点魔力。
- 此处的事件牌不弃置，保留到后续回合。

## 回合结束

1. 清空 `visitedThisRoundPlayerIds`。
2. 将 `moonCancerVisitedThisRound` 重置为 `false`。
3. 若本回合没有发生月之圣杯战斗，保留 `eventCardId`。
4. 月之圣杯一旦展开，默认继续留在场上；只有明确卡牌效果才能令其离场。

## 建议事件

```ts
MoonCellActivated
MoonCellEventPlaced
PlayerVisitedMoonCell
MoonCancerVisitRegistered
MoonCellBattleStarted
MoonCellBattleSkipped
MoonCellNoBattleManaGranted
MoonCellEventRetained
```

## 仍需规则层确认

- 月之圣杯发生战斗后，事件牌进入普通事件弃牌堆的准确时点。
- 直接移动到地利格时是否可以占用地利，取决于直接移动效果是否视为“部署”。英文通则把地利选择绑定在部署，默认不应自动获得。