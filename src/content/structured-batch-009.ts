import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

// 批次 009：由 tools/refactor-remaining-skills.py 按牌面原文批量生成（全句覆盖校验）。
// 确定性条款 → automatic（effect DSL 精确表达）；其余 → host_adjudicated + allowedOperations。
// FULL 仅授予整卡所有能力可自动执行且无未建模行的技能。
export const structuredBatch009Overrides: Record<string, ConfirmedSkillOverride> = {
  "master.wallachia.skill.ascension": {
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
          "printedClause": "（此牌加入你的技能区",
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
          "printedClause": "）此牌需追加打出",
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
          "printedClause": "唯一/打出时：将你技能区其他所有的【不休梦魇】移除游戏",
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
          "printedClause": "打出时：将一张此牌的复制加入你的技能区",
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
  "master.wallachia.skill.s1": {
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
          "printedClause": "当你于每回合第一次进入战场时，在此战场加入一张临时的【塔塔利】事件牌",
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
          "printedClause": "行动阶段：花费3点魔力并选择一名对手，当其位于【塔塔利】所在的地点时，你于本回合打出的攻击获得其从者恐惧的属性",
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
  "master.wallachia.skill.s2": {
    "activation": "passive",
    "passiveEventTypes": [
      "combat.resolved",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "其他对手的从者恐惧力量、敏捷或魔术属性——根据他们游戏开始时牌库中上述三种属性的牌最少的一个",
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
          "printedClause": "若相同，则为基本威力之和最少的一种",
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
          "printedClause": "若仍相同，则以魔术>力量>迅捷的顺序排列",
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
          "printedClause": "你知晓其他从者恐惧的属性",
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
  "master.wallachia.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【塔塔利事件牌】战果：X（X=被加入【恶化】数量的一半，向上取整）",
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
          "printedClause": "永恒梦魇-瓦拉几亚于此处获胜时，将一张【恶化】永久加入【塔塔利】",
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
          "printedClause": "被诅咒的固有结界-除非玩家花费X点魔力，否则他们无法离开此处",
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
  "master.wallachia.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（恶化）每名此战场玩家恐惧的属性令其他玩家相应属性的攻击获得+1威力",
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
  "master.wallachia.skill.s5": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（恶化）所有玩家除非花费X点魔力或弃置一张他们恐惧的牌，否则他们无法于他们的回合进入此地点",
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
  "master.wallachia.skill.s6": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（恶化）若此战场的胜者控制败者恐惧的攻击，令相应的败者失去X点战果",
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
  "master.wallachia.skill.s7": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（恶化）此战场的玩家手牌和技能区中，其恐惧属性的攻击+X魔力消耗",
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
  "master.wallachia.skill.s8": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（恶化）令X增加1",
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
          "printedClause": "当瓦拉几亚离开此地点时，弃置【塔塔利】",
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
  "master.waver.skill.ascension": {
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
          "printedClause": "前哨阶段：预测每个游戏内的战场的胜者，战斗阶段结束时，你每预测正确一个，便获得1点战果",
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "你本回合无法从侦查获得战果",
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
          "printedClause": "前哨阶段：花费5点魔力，本阶段结束时，你所在地点的所有玩家均随机弃置2张手牌",
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
      ],
    },
  },
  "master.wodime.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你每赢得一场战斗即可额外秘密写入一个回合数以触发【人理保障天球】",
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
  "master.wodime.skill.s1": {
    "activation": "phase",
    "windows": [
      "action",
    ],
    "passiveEventTypes": [
      "game.started",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你负责【亚特兰蒂斯】和【奥林匹斯】异闻带",
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
          "printedClause": "游戏开始时，扩张【亚特兰蒂斯】",
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
          "printedClause": "行动阶段：支付5个【神之遗产】，扩张【奥林匹斯】",
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
  "master.wodime.skill.s1a": {
    "activation": "passive",
    "passiveEventTypes": [
      "game.started",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "秘密记录两个回合数并将【人理保障天球】加入你的技能区",
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
  "master.wodime.skill.s2": {
    "activation": "phase",
    "windows": [
      "combat",
    ],
    "requiresEightMana": false,
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "星体回路-被动/战斗阶段：若你以天体学记录了本回合，打出此牌（你拥有的魔力少于8点也可打出），战力结算时，忽略你其他攻击的威力",
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
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "此牌不能通过其他任何方式入场",
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
  "master.wodime.skill.s3": {
    "activation": "phase",
    "windows": [
      "action",
    ],
    "passiveEventTypes": [
      "player.deployed",
      "combat.resolved",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【神之遗产】在【沃戴姆】被淘汰后将持续存在",
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
          "printedClause": "当一名玩家从有【神之遗产】的地点移动时，他将带走等同于其地利位置数的【神之遗产】",
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
          "printedClause": "当玩家在有【神之遗产】的地点是唯一的获胜者时，他将获得所有余下的【神之遗产】",
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
          "printedClause": "拥有【神之遗产】的玩家获得：行动阶段：支付3X个【神之遗产】，获得X点合计威力（X最大为3）",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "行动阶段：支付4X个【神之遗产】，获得X点魔力",
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
  "master.wodime.skill.s4": {
    "activation": "passive",
    "passiveEventTypes": [
      "game.started",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当【亚特兰蒂斯】事件牌被揭示时，如果在战场上，则结算其效果并将之移出游戏，否则将其洗回牌库",
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
          "printedClause": "无论以上哪种情况，抽取一张新的事件牌置于它所在的位置",
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
          "printedClause": "扩张-将所有【亚特兰蒂斯】事件牌洗入牌库",
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
  "master.wodime.skill.s5": {
    "activation": "passive",
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "扩张-抽取并展示2张事件牌",
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
          "printedClause": "你可以将其中一张替换为游戏外的【奥林匹斯】事件牌（替换时为正面），然后将它们洗回事件牌堆",
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
          "printedClause": "同时满足扩张条件的玩家需要同步执行扩张",
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
  "master.wodime.skill.s6": {
    "activation": "passive",
    "passiveEventTypes": [
      "game.started",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【亚特兰蒂斯事件牌】战果0，数量6",
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
          "printedClause": "将3个【神之遗产】放置于此地点",
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
          "printedClause": "所有玩家获得1个【神之遗产】",
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
  "master.wodime.skill.s7": {
    "activation": "passive",
    "passiveEventTypes": [
      "combat.resolved",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【奥林匹斯事件牌】战果5，数量2",
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
          "printedClause": "【沃戴姆】的对手位于此战场时不能无视【败北】效果",
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
          "printedClause": "计算战力后，使此处战力未达到21的所有人【败北】",
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
  "master.wodime.skill.s8": {
    "activation": "passive",
    "passiveEventTypes": [
      "combat.resolved",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【奥林匹斯事件牌】战果4，数量2",
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
          "printedClause": "战力计算后，此处本回合所有未使用令咒的沃戴姆的对手【败北】",
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
  "master.wodime.skill.s9": {
    "activation": "passive",
    "passiveEventTypes": [
      "combat.resolved",
    ],
    "handlerId": "core.wodime-lostbelt-system",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【奥林匹斯事件牌】战果3，数量2",
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
          "printedClause": "战力计算后，于前哨阶段部署于此处的沃戴姆的对手【败北】",
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
  "master.zouken.skill.ascension": {
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
          "printedClause": "当你移动时，可以无视交战状态",
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
          "printedClause": "移除【刻印虫】\"如果你赢得一场战斗\"的触发条件",
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
          "printedClause": "行动阶段：花费6点魔力，使与你处于同一战场的对手失去一枚令咒",
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
  "master.zouken.skill.s3": {
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
          "printedClause": "每当你获得令咒时，改为获得4点魔力；当你因其他能力需要花费令咒时，改为花费4点魔力",
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
          "printedClause": "行动阶段：花费2X魔力，获得X点合计威力，若你于本回合赢得战斗，获得X点战果",
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
      ],
    },
  },
  "master.zouken.skill.s4": {
    "activation": "phase",
    "windows": [
      "combat",
    ],
    "steps": [
      "player-window",
    ],
    "abilities": [
      {
        "id": "clause-3",
        "name": "虫之身",
        "activation": "phase",
        "windows": [
          "combat",
        ],
        "abilityCost": 7,
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
          "printedClause": "回合结束时，若你本回合获得的魔力少于3点，失去2点战果",
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
          "printedClause": "刻印虫-战斗阶段：战斗阶段结束后，如果你赢得一场战斗，从该战斗的一名败者处吸取至多3点魔力；若该战斗没有其他玩家或你位于侦查，你获得3点魔力",
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
        {
          "id": "clause-3",
          "kind": "phase_action",
          "activation": {
            "phase": "combat",
          },
          "printedClause": "虫之身-战斗阶段：花费7点魔力，移动至一处地点",
          "execution": {
            "mode": "automatic",
          },
          "conditions": [],
          "effects": [
            {
              "type": "move_player",
              "target": "controller",
            },
          ],
        },
      ],
    },
  },
  "servant.abigail.skill.sc-abigail-1": {
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
          "printedClause": "X为你本局游戏以理智丧失分发的【领域外生命】数",
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
          "printedClause": "打出时：若X为12，你获得游戏胜利",
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
          "printedClause": "理智丧失-行动阶段：令所有与你位于同一地点的对手将游戏外的一张【领域外生命】加入手牌",
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
  "servant.abigail.skill.sc-abigail-2": {
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
          "printedClause": "银之钥-战斗阶段：隐藏真名，令交战对手随机弃置一张手牌后展示弃牌堆，因银之钥展示了最多【领域外生命】（至少1张）的交战对手【败北】",
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "然后你将所有因银之钥展示的【领域外生命】加入你的弃牌堆",
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
  "servant.abigail.skill.sc-abigail-3": {
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
          "printedClause": "被动/行动阶段：移除手牌的一张【领域外生命】",
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
          "printedClause": "若如此，获得2点魔力",
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
          "printedClause": "行动阶段：将你的弃牌堆中任意数量的【领域外生命】打出，战斗阶段结束后将你所有激活的【领域外生命】洗入牌库",
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
  "servant.achilles.skill.sc-achilles-1": {
    "activation": "passive",
    "windows": [
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
          "printedClause": "阿喀琉斯之踵-被动：当你战败后，你【真名解放】",
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
          "printedClause": "疾风驰骋-被动/战斗阶段：若你真名隐藏，令你的所有交战对手随机弃置一张手牌，然后将未弃置牌或弃置的牌不是【幸运】或敏捷牌的对手的合计威力设为0",
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
  "servant.achilles.skill.sc-achilles-2": {
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
          "printedClause": "湛蓝天空-行动阶段：选择下列一项：",
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
          "printedClause": "1.与你位于同一战场的对手立即随机弃置一张手牌",
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
          "printedClause": "2.与你位于同一战场的对手无法使用技能牌",
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
          "printedClause": "3.花费3点魔力，隐藏你的从者真名直至回合结束",
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
  "servant.achilles.skill.sc-achilles-3": {
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
          "printedClause": "英雄对决-行动阶段：当你所在的战场只有1名对手时，所有人无法进入或离开此战场，同时，你与此对手无法被地利和所有不属于你们的从者或NPC的牌或效果影响",
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
      ],
    },
  },
  "servant.albion.skill.sc-albion-1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "星陨-被动：当你进入侦查时，你可以将此牌加入攻击",
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
          "printedClause": "若如此做，你获得4点魔力与2点战果并移动至除侦查外的任意地点且你于战斗阶段结束后失去8点魔力",
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
  "servant.albion.skill.sc-albion-2": {
    "activation": "passive",
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "passive",
          "printedClause": "被动：当你于每回合第一次进行移动后，此攻击获得等于你移动距离的威力直至游戏结束",
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
  "servant.altera.skill.sc-altera-1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "轨道打击-此牌无法被打出",
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
          "printedClause": "于此牌被放置的回合后，当你于此地点战斗时，于战斗阶段将此牌加入攻击并真名解放，然后于战斗阶段结束后，将此牌移除游戏并为其所在的地点抽取【文明废墟】事件牌代替原本的事件牌直至游戏结束",
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
  "servant.altera.skill.sc-altera-2": {
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
          "printedClause": "被动/行动阶段：阿蒂拉的技能牌减少等于你所在战场正面战果最高的事件牌的战果数的魔力消耗",
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
          "printedClause": "行动阶段：你的攻击无法因其他能力被关闭或减少威力",
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
          "printedClause": "战斗阶段：将【军神之剑·泪之星】放置于你所在的地点",
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
      ],
    },
  },
  "servant.amakusa.skill.sc-amakusa-1": {
    "activation": "play",
    "revealsTrueNameOnPlay": true,
    "limit": "once-per-game",
    "requiresActiveCard": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "play_trigger",
          "printedClause": "【真名解放】<每局游戏限一次>X=以此牌效果移除的事件牌的印刷战果数总和的2倍",
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
          "printedClause": "打出时：将所有正面向上的事件牌移除游戏",
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
  "servant.amakusa.skill.sc-amakusa-2": {
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
          "printedClause": "战斗阶段：花费3点魔力，抽取一位对手牌堆顶的一张牌并将之加入你的攻击",
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
          "printedClause": "【奇术师】获得该牌的属性，且你可以使用该牌的【行动阶段】能力，战斗后将那张牌返回原主的弃牌堆",
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
          "printedClause": "每回合你可使用两次此能力",
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
  "servant.amakusa.skill.sc-amakusa-3": {
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
          "printedClause": "此牌及其效果不可被复制或盗用",
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
          "printedClause": "<每局游戏限三次>神明裁决-行动阶段：令两名其他玩家获得一枚【裁决者令咒】来对其束缚，你仅可束缚本局游戏束缚次数最少的玩家",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "只有进行束缚的裁决者可以于自己的行动阶段对被束缚者使用【裁决者令咒】",
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
  "servant.amor.skill.sc-amor-1": {
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
          "printedClause": "此牌及其效果不可被复制或盗用",
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
          "printedClause": "<每局游戏限三次>神明裁决-行动阶段：令两名其他玩家获得一枚【裁决者令咒】来对其束缚，你仅可束缚本局游戏束缚次数最少的玩家",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "只有进行束缚的裁决者可以于自己的行动阶段对被束缚者使用【裁决者令咒】",
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
  "servant.amor.skill.sc-amor-2": {
    "activation": "play",
    "windows": [
      "combat",
    ],
    "revealsTrueNameOnPlay": true,
    "requiresActiveCard": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "play_trigger",
          "printedClause": "【真名解放】被动：你可以同时使用【裁决者令咒】的两项效果，若你移动其他玩家，你仅可将其移动至你所在的战场",
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
          "printedClause": "战斗阶段：回合结束时，令一名本回合于你的战斗中获胜，且被你使用过【裁决者令咒】的玩家获得一枚【裁决者令咒】",
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
  "servant.amor.skill.sc-amor-3": {
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
          "printedClause": "主之爱-被动：当一名拥有【裁决者令咒】的玩家被淘汰时，令一名对手获得其所有的【裁决者令咒】",
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
          "printedClause": "全然降服-战斗阶段：令所有与你位于同一战场的，拥有3枚或更多【裁决者令咒】的玩家的合计威力降低至0",
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
      ],
    },
  },
  "servant.anastasia.skill.sc-anastasia-2": {
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
          "kind": "passive",
          "printedClause": "被动：当你的【阵地建造】激活时，你所在地点的对手，其非技能的✖特殊攻击失去所有卡牌文字效果",
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
          "printedClause": "战斗阶段：将进行交战的对手，其攻击失去特殊和宝具外的所有属性",
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
      ],
    },
  },
  "servant.anastasia.skill.sc-anastasia-3": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "战斗阶段：将与你交战的对手，其特殊属性攻击的威力设为0",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "你的魔术属性攻击的威力和你的合计威力不能被其他玩家的能力减少",
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
  "servant.andersen.skill.sc-andersen-2": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "X为你的战果除以5（向上取整）",
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
          "printedClause": "残留：你只能从效果获得战果",
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
          "printedClause": "你的基础特殊牌名为幸运且拥有“战斗阶段：你无视【败北】效果",
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
      ],
    },
  },
  "servant.angra.skill.sc-angra-1": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "行动阶段：战斗阶段结束后弃置自己4张牌（若不足4张，则手牌全部弃置）",
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
          "printedClause": "若你战败，每弃置一张【复仇者】，你便可偷取一名击败你的胜利者2点战果",
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
  "servant.angra.skill.sc-angra-2": {
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
          "printedClause": "行动阶段：将你的弃牌堆中的所有【复仇者】加入手牌",
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "如果你于上一回合中战败，则将它们加入攻击",
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
  "servant.arash.skill.sc-arash-2": {
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
          "printedClause": "行动阶段：将你的地利变为2倍",
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
          "printedClause": "战斗阶段：选择你的一张生效的基础攻击，然后弃置牌库顶的牌",
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
          "printedClause": "若弃置的牌与你选择的牌拥有相同的基本威力，则合计威力+3",
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
  "servant.arash.skill.sc-arash-3": {
    "activation": "passive",
    "revealsTrueNameOnPlay": true,
    "limit": "once-per-game",
    "passiveEventTypes": [
      "combat.resolved",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "此牌不能被复制、盗用或无效关闭",
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
          "activation": {
            "eventType": "combat.resolved",
          },
          "printedClause": "若你赢得战斗，获得六点战果",
          "execution": {
            "mode": "automatic",
          },
          "conditions": [
            {
              "type": "event_player_won_combat",
            },
          ],
          "effects": [
            {
              "type": "gain_victory_points",
              "amount": 6,
            },
          ],
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "战斗结束后阿拉什【死亡】",
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
          "printedClause": "他将不再是你的从者",
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
          "id": "clause-6",
          "kind": "phase_action",
          "printedClause": "将【神圣的献身】以外的阿拉什技能移除游戏",
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
  "servant.arcueid.skill.sc-arcueid-1": {
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
          "printedClause": "与腥红之月一同打出的另一张牌的魔力消耗-3",
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
          "printedClause": "战斗阶段：所有未与其他人进行交战的对手失去1点战果，然后移动至你所在的战场",
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
      ],
    },
  },
  "servant.arcueid.skill.sc-arcueid-2": {
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
          "printedClause": "战斗阶段：与你进行交战的对手失去3点魔力，然后将你从版图移除",
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
          "printedClause": "你不可再打出此牌，直到你赢得一场胜利",
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
  "servant.arjuna-archer.skill.sc-arjuna-archer-1": {
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
          "printedClause": "被动/行动阶段：花费1点魔力，选择牌库或弃牌堆中的一张基础牌加入手牌",
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
          "printedClause": "你可以额外花费2点魔力将其打出（支付魔力消耗）",
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
  "servant.arjuna-archer.skill.sc-arjuna-archer-2": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "预言之射-行动阶段：弃置0~3张手牌",
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
          "printedClause": "在你使用此效果后，当一名对手打出了印刷威力等于你手牌印刷威力之和的攻击后，你可以弃置所有手牌（至少一张）并令其【败北】",
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
  "servant.arjuna.skill.sc-arjuna-1": {
    "activation": "play",
    "windows": [
      "action",
    ],
    "steps": [
      "player-window",
    ],
    "revealsTrueNameOnPlay": true,
    "requiresActiveCard": true,
    "abilities": [
      {
        "id": "clause-2",
        "name": "被动/",
        "activation": "phase",
        "windows": [
          "action",
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
          "kind": "play_trigger",
          "printedClause": "【真名解放】被动：当你输掉一场战斗时，将此牌移除游戏",
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
          "activation": {
            "phase": "action",
          },
          "printedClause": "被动/行动阶段：获得5点合计威力",
          "execution": {
            "mode": "automatic",
          },
          "conditions": [
            {
              "type": "source_active",
            },
          ],
          "effects": [
            {
              "type": "combat_power_bonus",
              "amount": 5,
            },
          ],
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "输给你的玩家在你失去此牌前处于【有瑕】状态",
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
  "servant.arjuna.skill.sc-arjuna-2": {
    "activation": "play",
    "windows": [
      "action",
    ],
    "revealsTrueNameOnPlay": true,
    "limit": "once-per-game",
    "requiresActiveCard": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "play_trigger",
          "printedClause": "【真名解放】<每局游戏限一次>世界重启-行动阶段：下一个准备阶段抽取局势牌前，将一张本回合的事件牌增加至深山町或新都，并令一张【至高神】或至多一张【裁定归灭之回剑】返回你的技能区",
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
  "servant.arjuna.skill.sc-arjuna-3": {
    "activation": "play",
    "revealsTrueNameOnPlay": true,
    "requiresActiveCard": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "play_trigger",
          "printedClause": "【真名解放】<每局游戏一次>在战斗阶段开始时，令所有与你战斗的【有瑕】玩家【直接败北】",
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
          "printedClause": "每有一名控制【幸运】的【有瑕】对手，此攻击失去5点威力",
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
  "servant.artoria-alt.skill.sc-artoria-alt-1": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "局势牌无法阻止你打出此牌",
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
          "printedClause": "风王铁锤-行动阶段：花费4点魔力，此牌每被连续打出一回合，便获得+3威力",
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
  "servant.artoria-alt.skill.sc-artoria-alt-2": {
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
          "printedClause": "你拥有的魔力少于8点也可以打出此牌",
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
          "printedClause": "安哥拉曼纽的拥抱-残留：当你使用宝具时，关闭此牌",
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
          "printedClause": "若你的魔力少于8点，与你位于同一战场的对手无法使用宝具",
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
  "servant.artoriac.skill.sc-artoriac-1": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "残留：此卡持续激活两回合",
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
          "printedClause": "你的其他特殊属性攻击威力+2",
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
          "printedClause": "战斗阶段：将一张你本回合打出的非技能卡或背面向上的攻击返回你的手牌",
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
      ],
    },
  },
  "servant.artoriac.skill.sc-artoriac-3": {
    "activation": "passive",
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "残留：你的弃牌堆持续公开，X为你弃牌堆中幸运牌的数量×5（至多为15）",
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
          "printedClause": "当X大于0时，【真名解放】",
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
          "printedClause": "当你获得一场胜利时，将你的弃牌堆洗回牌库，此效果无法被阻止",
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
  "servant.artoriac.skill.sc-artoriac-4": {
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
          "printedClause": "唯一/被动：如果你赢得战斗，你可以从手牌中将此卡移出游戏并将一张[幸运]洗入你的牌库",
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
          "printedClause": "行动阶段：如果你位于侦察，获得2点战果",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "沿着箭头移动至多两个地点",
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
  "servant.artoriac.skill.sc-artoriac-5": {
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
          "printedClause": "唯一/被动：如果你赢得战斗，你可以从手牌中将此卡移出游戏并将一张[幸运]洗入你的牌库",
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
          "printedClause": "行动阶段：获得2点魔力，如果你无法增加魔力则获得2点战果",
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
      ],
    },
  },
  "servant.artoriac.skill.sc-artoriac-6": {
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
          "printedClause": "唯一/被动：如果你赢得战斗，你可以从手牌中将此卡移出游戏并将一张[幸运]洗入你的牌库",
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
          "printedClause": "战斗阶段：如果你赢得战斗且不是单独获胜，获得2点战果",
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
  "servant.ashva.skill.sc-ashva-1": {
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
          "printedClause": "奎师那的诅咒-残留：当你赢得一场战斗后，你需花费1点战果，否则关闭此牌",
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
          "printedClause": "愤怒化身-行动阶段：你因局势牌提升的威力翻倍",
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
          "printedClause": "回合结束时，将所有激活的局势牌移除游戏",
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
  "servant.ashva.skill.sc-ashva-2": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "空无边处天-行动阶段：下个回合在抽取局势牌后，从局势牌弃牌堆中额外选择一张局势牌激活",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "回合结束时，将因此效果激活的局势牌移除游戏",
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
  "servant.ashva.skill.sc-ashva-3": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "此牌的魔力消耗-X，X为你拥有的地利数",
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
          "printedClause": "尘归尘-行动阶段：从局势牌弃牌堆中移除至多3张牌（不可移除激活的局势牌），每以此效果移除一张牌便令此牌威力+2至回合结束",
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
  "servant.astolfo.skill.sc-astolfo-1": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "战斗阶段：与你交战的对手关闭其非残留的牌直至只剩一张为止",
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
  "servant.astolfo.skill.sc-astolfo-2": {
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
          "printedClause": "战斗阶段：将所有与你交战对手的力量和迅捷属性的攻击关闭",
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "每张受此影响的牌，其持有者可以获得其魔力消耗+1的魔力或花费3点魔力防止关闭",
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
  "servant.astolfo.skill.sc-astolfo-3": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "破咒一击-战斗阶段：花费其魔力消耗，选择并关闭一张与你位于同一地点的技能牌",
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
          "printedClause": "你可以令其他自愿的玩家帮助你花费魔力并令其获得1点战果（每名其他玩家最多花费1点）",
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
  "servant.astraea.skill.sc-astraea-2": {
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
          "printedClause": "被动/行动阶段：若你的攻击中不包含被【制约】的属性，合计威力+2",
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
          "printedClause": "战斗阶段：若与你战斗的对手控制的攻击有两张及以上且其中不包含至少一种相同属性，则其合计威力-4",
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
  "servant.astraea.skill.sc-astraea-3": {
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
          "printedClause": "被动/前哨阶段：弃置一张牌，【制约】它的一种属性",
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
          "printedClause": "被【谴责】的玩家从手牌和技能区使用含【制约】属性的攻击时消耗+3（最多+12）",
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
          "printedClause": "你的对手使用含【制约】属性卡牌即视为被【谴责】，直到他们的【谴责】被移除",
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
  "servant.atalanta.skill.sc-atalanta-1": {
    "activation": "passive",
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "残留：你不能再使用单独行动；阿塔兰忒的其他攻击基本威力+4，并将魔力消耗增加其印刷威力数的魔力",
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
  "servant.atalanta.skill.sc-atalanta-2": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "唯一/行动阶段：若你拥有地利，创造并激活一张你本回合打出的其他攻击的临时复制",
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
      ],
    },
  },
  "servant.avicebron.skill.sc-avicebron-1": {
    "activation": "passive",
    "windows": [
      "outpost",
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
          "printedClause": "被动/前哨阶段：弃置2张魔术基础牌或远隔操作以获得2点魔力",
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
          "printedClause": "战斗阶段：本回合你的【魔像】关闭时机改为战斗阶段结束后",
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
  "servant.avicebron.skill.sc-avicebron-2": {
    "activation": "passive",
    "revealsTrueNameOnPlay": true,
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "残留：此牌视为【魔像】，若你于进行的战斗中合计威力不是最高，关闭所有【魔像】",
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
          "printedClause": "若你赢得一场战斗，将一张【魔像】从你的手牌，牌库或弃牌堆加入攻击",
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
};
