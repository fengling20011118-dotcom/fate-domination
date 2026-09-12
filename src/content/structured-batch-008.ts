import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

// 批次 008：由 tools/refactor-remaining-skills.py 按牌面原文批量生成（全句覆盖校验）。
// 确定性条款 → automatic（effect DSL 精确表达）；其余 → host_adjudicated + allowedOperations。
// FULL 仅授予整卡所有能力可自动执行且无未建模行的技能。
export const structuredBatch008Overrides: Record<string, ConfirmedSkillOverride> = {
  "master.ophelia.skill.s5": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【北欧事件牌】战果4，数量2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "力量属性于此战场威力+4",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "迅捷属性于此战场威力-2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ophelia.skill.s6": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【北欧事件牌】战果4，数量2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "迅捷属性于此战场威力+4",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "魔术属性于此战场威力-2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ophelia.skill.s7": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【北欧事件牌】战果4，数量2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "魔术属性于此战场威力+4",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "力量属性于此战场威力-2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.peperoncino.skill.ascension": {
    "activation": "passive",
    "windows": [
      "outpost",
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的对手不会受到印度事件牌的影响",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "虚空论-前哨阶段：移除【时代轮回】的一张事件牌，获得2点魔力且合计威力+3",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "outpost",
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "强制扩张-行动阶段：花费7点魔力，使印度异闻带的【尺寸】永久+1",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
      ],
    },
  },
  "master.peperoncino.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "扩张-从【时代轮回】中随机选择一张事件牌加入你所在的战场",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "战斗结束后，若你未获得该事件的胜利将该事件牌移除游戏",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "当你本回合进行扩张的事件牌进入弃牌堆时，此异闻带的【尺寸】永久+1",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.peperoncino.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的准备阶段将【时代】改为适合当前回合的",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "神明裁判-每回合第一次，佩佩隆奇诺进入任一战场时，他进行【扩张】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "回合结束时，若你未进行扩张，移除除此牌上的一张的事件牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "【圆满时代】回合1-4：印度事件牌的X为4",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "若可能将莲池、猎场、实地考察、神之空岩各一张放于时代轮回上",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-6",
          "kind": "phase_action",
          "printedClause": "【三分时代】回合5-7：印度事件牌的X为3",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-7",
          "kind": "phase_action",
          "printedClause": "若可能将莲池、猎场、实地考察各一张放于时代轮回上",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-8",
          "kind": "phase_action",
          "printedClause": "【二分时代】回合8-9：印度事件牌的X为2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-9",
          "kind": "phase_action",
          "printedClause": "若可能将凋零的平原和衰落的城镇放于时代轮回上",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-10",
          "kind": "phase_action",
          "printedClause": "【争斗时代】回合10：印度事件牌的X为1",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-11",
          "kind": "phase_action",
          "printedClause": "若可能将乳海放于时代轮回上",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-12",
          "kind": "phase_action",
          "printedClause": "【审判时代】回合11：印度事件牌的X为印度的【尺寸】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-13",
          "kind": "phase_action",
          "printedClause": "异闻带尺寸0-1：佩佩隆奇诺合计威力-10",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-14",
          "kind": "phase_action",
          "printedClause": "异闻带尺寸3+：佩佩隆奇诺从剩余的事件牌库中选择一张放置于深山町",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-15",
          "kind": "phase_action",
          "printedClause": "异闻带尺寸5+：佩佩隆奇诺合计威力+5",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.peperoncino.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【莲池】战果1，数量2：若此事件牌未因扩张出场，抽取另一张事件牌放置于此战场",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "本回合从手牌打出的力量攻击于此战场获得威力+X（效果打出的无效）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "【猎场】战果1，数量2：若此事件牌未因扩张出场，抽取另一张事件牌放置于此战场",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "本回合从手牌打出的迅捷攻击于此战场获得威力+X（效果打出的无效）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "【实地考察】战果1，数量2：若此事件牌未因扩张出场，抽取另一张事件牌放置于此战场",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-6",
          "kind": "phase_action",
          "printedClause": "本回合从手牌打出的魔术攻击于此战场获得威力+X（效果打出的无效）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-7",
          "kind": "phase_action",
          "printedClause": "【神之空岩】战果0，数量1：当此牌因扩张出场时，改为将此牌与你所在地点的一张事件牌一起移除游戏",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-8",
          "kind": "phase_action",
          "printedClause": "在任何【时代】更改前，你可以令因【神之空岩】被移除的事件牌战果翻倍并替换【时代轮回】中的一张事件牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-9",
          "kind": "phase_action",
          "printedClause": "【衰败的城镇】战果X，数量1：若佩佩隆奇诺部署于此，其获得地利+X",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-10",
          "kind": "phase_action",
          "printedClause": "他不能从此地点离开",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-11",
          "kind": "phase_action",
          "printedClause": "【凋零的平原】战果X，数量1：若佩佩隆奇诺赢得另一处战场的胜利或回合结束时位于侦查，此牌进入弃牌堆，而不会被移除游戏",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-12",
          "kind": "phase_action",
          "printedClause": "【乳海】战果2，数量1：行动阶段结束时，此战场所有未使用宝具的玩家【败北】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.rani.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "解锁此技能后立刻获得数值等同于回合数的二倍减去当前存活玩家数的战果，并重新决定你的【预言】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "在高潮回合，你从剩余的事件牌堆中选择放置新的事件牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.rani.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你可以查看被弃置的局势牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "当一张非高潮局势牌将要生效时，将其弃置",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "然后你放置一张被弃置的局势牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "在第四回合结束后，获得两张【预言】并立即使用",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.rani.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "选择你的一名对手",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "每次该玩家从淘汰中幸存，你得到2战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.rani.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "选择一位对手，如果他是第一轮被淘汰的玩家，你获得6点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.reines.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（将此牌加入你的技能区",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "沸腾吧，我的血液-被动：所有【特里姆玛乌】获得力量属性，你每于本局游戏打出一张【特里姆玛乌】，你的所有【特里姆玛乌】获得+1威力至游戏结束",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
      "unmodeledClauses": [
        "（将此牌加入你的技能区。）",
      ],
    },
  },
  "master.reines.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你获胜并计算战果后，从你的战斗中的一名下次淘汰结算时会被淘汰的败者处偷取1点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "当你战败时，弃置所有手牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.reines.skill.s2": {
    "activation": "passive",
    "windows": [
      "action",
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "斩击-行动阶段：打出一张攻击",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "被动/战斗阶段：若此牌在你的手牌中，获得+2合计威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.reines.skill.s3": {
    "activation": "passive",
    "windows": [
      "action",
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "汝之骨血，化为羽翼-行动阶段：逆着箭头移动一步",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "被动/战斗阶段：若此牌在你的手牌中，沿着箭头移动一步",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.reines.skill.s4": {
    "activation": "passive",
    "windows": [
      "action",
      "combat",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "指令：告解-行动阶段：查看一名与你位于同一地点的对手的技能区，若你使用此效果时其已【真名解放】，你改为获得+4合计威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "被动/战斗阶段：若此牌在你的手牌中，获得1点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.rin.skill.ascension": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "passive",
          "printedClause": "被动：你的魔术基础牌和【阴炁弹】的威力+2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "行动阶段：获得本回合所有玩家花费的魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "战斗结束后，将此牌移除游戏",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
      "unmodeledClauses": [
        "（升华技，将此牌加入你的技能区）",
      ],
    },
  },
  "master.rin.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时，你获得10枚【宝石】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "高潮阶段时你可以在【宝石】上选择相同的选项，每个选项至多3次(共计9次)",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.rin.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你必须于第一回合使用一枚令咒",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "否则于该回合结束失去一枚令咒",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "若你以该令咒获得了魔力，战斗阶段结束后，你失去4点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ritsuka-f.skill.ascension": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "行动阶段：如果你打出两张具有相同属性的卡牌，根据相同的属性激活以下其中一种效果：",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "力量：合计威力+3",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "迅捷：下一回合，合计威力+5",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "魔术：获得2点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ritsuka-f.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时你抽取2名从者",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "将二者的牌堆组合在一起，分配一名从者为【战士】，一名从者为【替补】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "【替补】从者的技能牌从游戏中移除",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ritsuka-f.skill.s1a": {
    "activation": "phase",
    "windows": [
      "outpost",
    ],
    "steps": [
      "player-window",
    ],
    "abilities": [
      {
        "id": "clause-1",
        "name": "前哨阶段：弃置所有手",
        "activation": "phase",
        "windows": [
          "outpost",
        ],
      },
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "activation": {
            "phase": "outpost",
          },
          "printedClause": "前哨阶段：弃置所有手牌，抽3张牌",
          "execution": {
            "mode": "automatic",
          },
          "conditions": [],
          "effects": [
            {
              "type": "discard_all_hand",
            },
            {
              "type": "draw_cards",
              "amount": 3,
            },
          ],
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "将【战士】与【替补】进行替换",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ritsuka-m.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "立刻将此牌加入你的攻击",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "永无止境-残留：此牌不会关闭",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "悲惨、绝望已经战胜一切痛苦的决心-每当你获得【麻婆豆腐】时，此牌的威力永久翻倍",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ritsuka-m.skill.s1": {
    "activation": "passive",
    "windows": [
      "outpost",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "抽取从者后，从15张【精品】中移除3张",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "前哨阶段：花费X点魔力，洗混【精品】并抽X+1张，然后选择其中一张于本回合获得相应效果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "outpost",
          },
        },
      ],
    },
  },
  "master.ritsuka-m.skill.s2": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【破坏】你的力量攻击获得威力+2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "你的其他属性攻击威力-1",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "【集中】你的迅捷攻击获得威力+2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "【技巧】你的魔术攻击获得威力+2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-7",
          "kind": "phase_action",
          "printedClause": "【闪光】你的技能牌获得威力+3",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-8",
          "kind": "phase_action",
          "printedClause": "你的基础牌威力-1",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-9",
          "kind": "phase_action",
          "printedClause": "【斗争】你不能获得魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-10",
          "kind": "phase_action",
          "printedClause": "每有一名交战对手，合计威力便+1",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-11",
          "kind": "phase_action",
          "printedClause": "【暗澹】你所在地点的所有特殊属性基础牌的能力禁止使用",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-12",
          "kind": "phase_action",
          "printedClause": "【断绝】将你的地利变为2倍",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-13",
          "kind": "phase_action",
          "printedClause": "你不可于自己的回合中移动",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-14",
          "kind": "phase_action",
          "printedClause": "【先制】若你赢得一场战斗，获得2点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-15",
          "kind": "phase_action",
          "printedClause": "若没有赢得战斗，则失去1点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-16",
          "kind": "phase_action",
          "printedClause": "【麻婆豆腐】你的合计威力-2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-17",
          "kind": "phase_action",
          "printedClause": "本回合从侦察处获得的战果+2",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-18",
          "kind": "phase_action",
          "printedClause": "【顽强】你的合计威力-3",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-19",
          "kind": "phase_action",
          "printedClause": "你可无视【败北】效果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-20",
          "kind": "phase_action",
          "printedClause": "【龙脉】获得3点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-21",
          "kind": "phase_action",
          "printedClause": "所有其他玩家获得1点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-22",
          "kind": "phase_action",
          "printedClause": "【冥想】获得1点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-23",
          "kind": "phase_action",
          "printedClause": "从可获得的【精品】池中永久移除一张牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-24",
          "kind": "phase_action",
          "printedClause": "【欺瞒】战斗阶段：激活你的一张暗置牌（支付其魔力消耗）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
        {
          "id": "clause-25",
          "kind": "phase_action",
          "printedClause": "【良机】额外抽1张【精品】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-26",
          "kind": "phase_action",
          "printedClause": "你选择发动该牌两次",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-27",
          "kind": "phase_action",
          "printedClause": "【连锁】你下次使用【扭蛋奴隶】时，可以选择其中2张获得其效果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.roche.skill.ascension": {
    "activation": "passive",
    "standardAppend": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "若你本局游戏未因【变节】败北：失去巨测指导、天真和你的所有令咒",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "每失去一枚令咒，【变节】获得+3威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "【变节】同时获得魔术属性和\"此牌需追加打出\"并失去主从争斗",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.roche.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的手牌保持展示，你改为于整个行动阶段开始时而不是准备阶段开始时抽牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.roche.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：当你抽到此牌时，再抽一张牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "主从争斗-唯一/被动：当罗榭的手牌中拥有3张或更多【变节】时，他立即失去6点战果，然后他可以花费一枚令咒并将所有【变节】洗回牌堆",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "若他不花费，其立即【败北】并将所有【变节】弃置",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.ryuunosuke.skill.ascension": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "行动阶段：花费2X点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "弃置一张你所在战场战果为X的事件牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "之后在该战场的对手于战斗阶段失去地利和X点战果且合计威力-2X",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
      "unmodeledClauses": [
        "（升华技，解锁后将此牌加入你的技能区）",
      ],
    },
  },
  "master.sakura.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你只能在游戏的前四回合中解锁此牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "每局游戏限一次，当一名玩家被淘汰且【被污染的圣杯】处于激活状态，你可将其拥有的任意张从者技能牌加入你的技能区",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sakura.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "回合结束时，若你的战果低于所有其他玩家且你的第一名御主不是【间桐慎二】，激活【黑泥】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-nanaya.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "解锁此牌时，立即将你剩余的【闪走】和/或【闪鞘】洗入牌库",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "在你的战斗阶段，若你与被捕捉的对手战斗，抽一张牌并将其打出",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "若此牌不是基础攻击，你受到1点【损伤】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-nanaya.skill.s1b": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时，将你牌库的至多4张牌替换为【闪走】和/或【闪鞘】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "（【闪走】和【闪鞘】分别各有3张）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-nanaya.skill.s2": {
    "activation": "passive",
    "windows": [
      "outpost",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "直面死亡-第9和第11回合开始时，你失去等同于你【损伤】数的战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "捕捉-前哨阶段：受到1点【损伤】，然后选择一名本局游戏未被捕捉过的玩家查看其牌库顶的3张牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "outpost",
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "你可以将其中任意张弃置，然后将剩余的牌以任意顺序放回其牌堆顶",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "【闪鞘】与【闪走】为牌库替换牌（见【退魔者】），抽到手牌后于战斗时打出",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-ryougi.skill.ascension": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的敏捷攻击获得威力+2和\"战斗阶段：弃置一张你战斗中的一名玩家牌堆底的牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.shiki-ryougi.skill.s1b": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你可以查看所有玩家牌库底部的牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "战力结算时，你所在的战斗中所有牌库没有牌的玩家【败北】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-ryougi.skill.s2": {
    "activation": "play",
    "windows": [
      "combat",
    ],
    "standardAppend": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "play_trigger",
          "printedClause": "此牌需追加打出",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "若此牌与【死・紧握】一同打出，其+2魔力消耗",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "战斗阶段：选择一张你战斗中的非技能攻击，若其印刷威力与其所有者牌库底部的牌相同，弃置这两张牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.shiki-tohno.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "得不偿失-解锁此牌的下个回合开始时，获得等同于你【控制权】数量的战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "然后，你的合计威力视为0且无法被增加直至游戏结束",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-tohno.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你因能力外的方式获得战果时，获得等量的【控制权】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "当你的战果数第一次达到或超过13点时，若你拥有13点及以上的【控制权】，你转变为【魔】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "否则，你转变为【蛇】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-tohno.skill.s2": {
    "activation": "play",
    "windows": [
      "combat",
    ],
    "standardAppend": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "play_trigger",
          "printedClause": "此牌需追加打出",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "血滴-你需花费1点战果来打出此牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "共融-战斗阶段：随机展示一名你交战对手弃牌堆的至多3张牌，你可以选择其中的一张基础牌与你控制或手牌的一张基础牌交换",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.shiki-tohno.skill.s3": {
    "activation": "passive",
    "requiresEightMana": false,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你无法再获得【控制权】或使用共融",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "阿卡夏之蛇-【侵蚀】获得魔术属性且你拥有的魔力少于8点也可以打出此牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shiki-tohno.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "复仇之灵-血滴不再需要花费战果，当你与一名战果点数多于你的对手共融时，偷取其2点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shinji.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "此牌在第八回合结束后，并且莎士比亚是你的从者时生效",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "你失去【伪臣之书】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "若莎士比亚是你的第一名从者，你位于深山町时合计威力+12，当你获得X点战果时，所有位于深山町的对手失去X点战果；若莎士比亚并非你的第一名从者，你获得8点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shinji.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当间桐樱在场时：当你第一次失去所有令咒时，在该回合结束时，将从者替换为一个随机的，未被使用的从者",
          "effects": [
            { "type": "schedule_effect", "abilityId": "shinji-pseudo-servant-replace", "triggerEventType": "round.ended", "once": true }
          ],
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "重新获得3令咒",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "当间桐樱不在场时：当你第一次失去所有令咒时，在该回合结束时，将你的御主替换为【间桐樱】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "重置你的魔力，获得2令咒，保持战果不变",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shirou-meal.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（此牌加入你的技能区）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "此牌需弃置一份【食物】来打出",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "passive",
          "printedClause": "被动：你每有一份【食物】，你对应属性的基础攻击便+1威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "回合结束时，弃置你牌堆顶的一张牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
      "unmodeledClauses": [
        "（此牌加入你的技能区）",
      ],
    },
  },
  "master.shirou-meal.skill.s1": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "行动阶段：若你位于地利位置，你所在地点的事件牌和激活的局势牌上每具有一种非特殊或宝具的属性，你便获得一份相应的【食物】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "（每种属性每回合仅提供一份食物——力量-肉，迅捷-蔬菜，魔术-鱼）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "【食物】用于制作【卫宫家今天的饭】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shirou-meal.skill.s2": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "饕餮-当你因效果以外将弃牌堆洗回牌库时失去3点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "行动阶段：弃置3份【食物】，下次洗牌你不会因饕餮失去战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "若你弃置了3种相同的【食物】，+6合计威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "若你弃置了3种不同的【食物】，获得4点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shishigou.skill.ascension": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你所有的的基础牌得到效果：\"行动阶段：花费3点魔力，根据此牌属性激活【死灵魔术】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
      ],
    },
  },
  "master.shishigou.skill.s1": {
    "activation": "passive",
    "windows": [
      "action",
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "行动阶段：展示一张以尸体冷藏移除的暗置牌（展示后该暗置牌不再暗置且不可再被展示），根据被展示牌的属性，使用一种属性符合的【死灵魔术】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "战斗阶段：若你位于魔术工房，将一张你控制的暗置攻击移除游戏（不展示）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.shishigou.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "力量属性-心脏手雷-移动至一处战场并获得2点地利",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "迅捷属性-魔术指弹-打出你牌库顶的牌（支付其消耗）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.shishigou.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "魔术属性-猫头鹰的眼球-将你的地利变为2倍",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "特殊属性-海德拉剧毒-将你的1张力量或迅捷牌基本威力变为2倍",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sieg.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当位于你所在地点的一名对手花费了4点或更多的魔力时，你恢复一枚令咒",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "【同调】状态时，你的力量基础攻击获得威力+3",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sieg.skill.s2": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "菩提之叶-你可以免费打出此牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "若如此做，与你位于同一战场的对手获得：\"行动阶段：关闭一张你控制的，基本威力大于等于5的敏捷攻击，然后令齐格【败北】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
      ],
    },
  },
  "master.sion.skill.s1": {
    "activation": "passive",
    "windows": [
      "preparation",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时，以3张【迦勒底】技能分别覆盖你的从者技能",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "被覆盖的技能无法使用且失去所有卡牌文字效果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "准备阶段：移除任意张你的【迦勒底】技能，然后激活其训练效果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "preparation",
          },
        },
      ],
    },
  },
  "master.sion.skill.s11": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "requiresEightMana": false,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你拥有的魔力少于8点也可使用此牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "狂化-行动阶段：以背面朝上抽取至多三张牌并将其移除（以此方法被移除的牌不触发任何卡牌效果），你每以此法抽一张牌，此牌+4威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
      ],
    },
  },
  "master.sion.skill.s12": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "残留：当你将一张牌放置入场时，你可以支付3点魔力以使其获得反转效果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "此效果每回合仅对一张牌生效",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sion.skill.s13": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "滔天怨焰-被动/行动阶段：花费2点战果，从你的弃牌堆打出一张牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
      ],
    },
  },
  "master.sion.skill.s14": {
    "activation": "passive",
    "windows": [
      "outpost",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "神圣敕条-被动/前哨阶段：令一名其他玩家获得一枚临时的【裁决者令咒】直至回合结束",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "outpost",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "你不能在三回合之内选择同一名玩家",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sion.skill.s15": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "当此牌因训练被展示后，改为获得被覆盖的技能而非替换",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "重启-被动/战斗阶段：依轮次顺序，所有位于【月之圣杯】的玩家重新部署，然后弃置【月之圣杯】上的所有事件牌并将其从游戏中移除（可以再被开启）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
      ],
    },
  },
  "master.sion.skill.s17": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "此牌需花费1枚令咒打出",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "以太湮灭-战斗阶段：关闭你战斗中所有的【幸运】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "所有与你交战的对手抽2张牌并展示所有手牌和暗置攻击，然后令展示了【幸运】的所有对手【败北】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sion.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：当一名与你位于同一地点的对手首次真名解放时，你获得1点战果并将1枚【经验】放置于此牌上",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "训练：此牌上每有2枚【经验】，便永久减少此牌覆盖的技能的1点魔力消耗",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sion.skill.s3": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "被动/战斗阶段：令所有与你位于同一地点的玩家获得1点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "target",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "combat",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "若有对手获得，将1枚【经验】放置于此牌上",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "训练：若此牌上有2枚及以上的【经验】，你可以将覆盖的技能替换为游戏外的暗置的，你从者职阶的【EX技能】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "【EX技能】在卡名上同时视为原技能",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sion.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：你的基础攻击获得+1威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "当你进行了一场争夺战后，将1枚【经验】放置于此牌上",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "训练：此牌上每有2枚经验，便永久增加此牌覆盖的技能的1点威力或将一张基础力量或敏捷，5威力的攻击加入你的手牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.sion.skill.s8": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "延时召唤-残留",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "行动阶段：从手牌中追加打出至多3张基本威力3及以下的牌，在你使用此效果的回合结束关闭此牌",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
      ],
    },
  },
  "master.sion.skill.s9": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "领域扩张-残留：当你部署于魔术工房时，获得X点合计威力和战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "X初始为0，每当你赢得一场战斗，X永久增加1点",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.taiga.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（将此牌加入你的技能区）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "家里的屠杀-魔术工房变为战场",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "（交战规则适用，不添加任何事件牌）",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "魔术工房的竞争战果等于当前局势牌的魔力值",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
      "unmodeledClauses": [
        "（将此牌加入你的技能区）",
      ],
    },
  },
  "master.taiga.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你赢得一场战斗时，每位因此战败的玩家获得一枚【老虎】标记",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "你每分发一枚【老虎】标记便获得1点战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "每有1枚【老虎】标记合计威力+1，至多+3",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.tiamat.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你不能进入魔术工房",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "无视阻碍你打出牌的卡牌效果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "你的基础攻击费用+3且威力+5",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "你可以选择暗置打出2张牌作为攻击，若如此，将【生命之海】加入你的攻击",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.tiamat.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你没有令咒",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "将【生命之海】加入你的技能区",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "当你获得令咒时，改为将一张【魔兽】加入攻击",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.tokiomi.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【火炎弹】+2魔力消耗与威力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "【燃烧】印记更改为-3合计威力且移除时需额外花费2点魔力",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.tokiomi.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "将4件【道具】加入游戏",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "custom",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "回合顺位倒数两位的玩家可以在他们的回合使用1件【道具】",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "choice",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "远坂时臣使用【道具】时无法获得战果",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.twice.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你在游戏中拥有最少的战果时，合计威力+12",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "当你即将被淘汰时，将此牌移除游戏取代淘汰",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
  "master.twice.skill.s1": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "准备阶段和行动阶段：当你于第10回合前，行动阶段时使用此能力需要支付一枚令咒",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "condition",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
          "activation": {
            "phase": "action",
          },
        },
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "将桌面上两张事件牌交换位置（不将它们翻开），或将桌面上一张正面表示的事件牌洗回事件牌库，抽一张新的事件牌代替它的位置",
          "execution": {
            "mode": "host_adjudicated",
            "reason": "lifecycle",
            "allowedOperations": [
              "adjust-mana",
              "adjust-victory-points",
              "move-card",
              "create-status",
              "skip-ability",
            ],
          },
        },
      ],
    },
  },
};
