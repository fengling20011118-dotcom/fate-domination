import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

// 批次 012：由 tools/refactor-remaining-skills.py 按牌面原文批量生成（全句覆盖校验）。
// 确定性条款 → automatic（effect DSL 精确表达）；其余 → host_adjudicated + allowedOperations。
// FULL 仅授予整卡所有能力可自动执行且无未建模行的技能。
export const structuredBatch012Overrides: Record<string, ConfirmedSkillOverride> = {
  "servant.kinggil.skill.sc-kinggil-2": {
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "行动阶段：弃置你的所有手牌，然后令此牌获得被弃置牌的所有属性",
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
          "printedClause": "战斗阶段：此牌威力翻倍",
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
  "servant.kinggil.skill.sc-kinggil-3": {
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
          "printedClause": "开炮！开炮！-你需关闭你激活的【阵地作成】才可打出此牌",
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
          "printedClause": "下个回合，你于准备阶段抽牌后额外抽2张牌且于进行常规出牌时可以追加打出1张牌",
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
  "servant.kinghassan.skill.sc-kinghassan-1": {
    "activation": "play",
    "windows": [
      "combat",
    ],
    "standardAppend": true,
    "requiresActiveCard": true,
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
          "printedClause": "晚钟-战斗阶段：与你交战的所有对手分别投掷一次六面骰，若掷出6，令其【败北】",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "你可以弃置一张【幸运】令一名对手进行一次重骰",
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
  "servant.kinghassan.skill.sc-kinghassan-2": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
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
          "printedClause": "斩断命运-战斗阶段：【杀死】一名你交战对手的从者并令其【败北】",
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
          "printedClause": "回合结束时，该对手随机抽取一名新的从者",
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
          "printedClause": "（杀死：将被杀死的从者的所有牌移除游戏",
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
  "servant.kinghassan.skill.sc-kinghassan-3": {
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
          "printedClause": "每有一名处于【败北】状态或被淘汰的对手，此牌获得威力+1",
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
          "printedClause": "晚钟-战斗阶段：与你交战的所有对手分别投掷一次骰子",
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
          "printedClause": "若掷出5或6，令其【败北】",
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
          "printedClause": "你可以弃置一张【幸运】令一名对手进行重骰",
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
  "servant.kingprotea.skill.sc-kingprotea-1": {
    "activation": "play",
    "windows": [
      "outpost",
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
          "printedClause": "【真名解放】被动/前哨阶段：支付2X点魔力，本回合你不会因幼儿退行关闭攻击且无法使用【渴爱之眠】",
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
          "printedClause": "X为1+你激活的攻击数量",
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
  "servant.kingprotea.skill.sc-kingprotea-2": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "requiresEightMana": false,
    "singleCardPlay": true,
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
          "printedClause": "此牌不能同其他牌一同打出",
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
          "printedClause": "行动阶段：你的至多2张非特殊基础攻击获得“残留”至本回合结束",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "本回合你每关闭一张基础攻击，获得1点魔力",
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
  "servant.kingprotea.skill.sc-kingprotea-3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：当你打出基础攻击时，你的所有基础攻击获得“残留”至本回合结束",
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
          "printedClause": "幼儿退行-被动：当你在你战斗阶段的任何时候，合计威力超过21时，关闭你的所有攻击",
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
  "servant.kiritsugu.skill.sc-kiritsugu-2": {
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
          "printedClause": "行动阶段：与你位于同一战场的其他玩家选择自己失去3点战果或者于本回合中不能使用魔力",
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
  "servant.kiritsugu.skill.sc-kiritsugu-3": {
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
          "printedClause": "行动阶段：计算你的合计威力（不计算未触发的战斗阶段能力加成）",
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
          "printedClause": "如果超过12，获得你所在战场上的一张事件牌的战果，然后弃置该事件牌",
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
  "servant.kiyohime.skill.sc-kiyohime-1": {
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
          "printedClause": "炽热抱拥-被动/行动阶段：清姬的魔术攻击获得+3威力和力量属性",
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
          "printedClause": "下回合你进行部署时，仅可部署于魔术工房且无法离开，若你无法部署在魔术工房，则不进行部署，下回合你可以不打出任何牌",
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
  "servant.kiyohime.skill.sc-kiyohime-2": {
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
          "printedClause": "被动/行动阶段：花费1点魔力",
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
          "printedClause": "询问一名对手，他是否会赢得一场战斗",
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
          "printedClause": "若其回答错误，他将失去一枚令咒，你获得2点战果",
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
          "printedClause": "他可以选择在战斗阶段开始时使自己【败北】",
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
  "servant.kiyohime.skill.sc-kiyohime-3": {
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
          "printedClause": "【真名解放】双生烈焰-打出时：你可以花费3点魔力，若如此做，本回合你的魔术攻击威力无法被减少且此牌持续激活至下回合结束",
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
          "printedClause": "*魔术攻击威力不会被减少仅持续至本回合结束",
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
  "servant.kotarou.skill.sc-kotarou-2": {
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
          "printedClause": "风声鹤唳-残留：若你于本回合使用了【气息遮断】的卡牌文字效果，战斗阶段结束后，【真名解放】并关闭此牌",
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
          "printedClause": "草木皆兵-战斗阶段：花费2点魔力，激活你的一张暗置攻击，使用至多两次其【行动阶段】效果",
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
  "servant.kotarou.skill.sc-kotarou-3": {
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
          "printedClause": "被动/行动阶段：按回合顺位，每名玩家可以暗置打出一张手牌作为【策】",
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
          "printedClause": "战斗阶段：激活你战斗中所有的【策】，偷取所有【策】的威力（若没有【策】，视为0）低于你的【策】其他玩家的2点战果，然后弃置所有【策】",
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
  "servant.koyanskaya.skill.sc-koyanskaya-2": {
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
          "printedClause": "被动/前哨阶段：从手中将两张牌背面向上设置在战场上，作为【货箱】",
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
          "printedClause": "当一名玩家进入有【货箱】的地点时，其从此处的【货箱】中随机加入一张牌至其攻击中",
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
          "printedClause": "战斗阶段结束后所有被获取的【货箱】返回高扬斯卡娅的弃牌堆",
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
  "servant.koyanskaya.skill.sc-koyanskaya-3": {
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
          "printedClause": "战斗阶段：对手可以关闭他们从【货箱】获得的牌",
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
          "printedClause": "每有一名未如此做的获胜者，你获得2点战果",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "反转/战斗阶段：获得任意张对手从【货箱】获得的攻击的控制权且令它们获得反转效果",
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
  "servant.koyanskaya.skill.sc-koyanskaya-4": {
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
          "printedClause": "本轮少打出一张攻击",
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
          "printedClause": "（不论是你即将打出攻击时已经控制此牌，或者是你即将将此牌作为攻击中的一张打出时，此效果都生效",
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
          "printedClause": "反转/战斗阶段：创造并激活3张临时的威力为2的迅捷攻击",
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
  "servant.koyanskaya.skill.sc-koyanskaya-5": {
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
          "printedClause": "当你获得此牌而不将之打出时，失去3点魔力",
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
          "printedClause": "反转/战斗阶段：无视【固有结界】，移动至任意地点",
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
  "servant.koyanskaya.skill.sc-koyanskaya-6": {
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
          "printedClause": "当你从【货箱】中获得此牌时，你【败北】",
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
          "printedClause": "反转/战斗阶段：战力结算后，如果与你位于同一战场的对手有两名及以上，威力高于你的玩家中不包含战力不同的，使他们【败北】",
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
  "servant.koyo.skill.sc-koyo-1": {
    "activation": "passive",
    "windows": [
      "action",
      "outpost",
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
          "printedClause": "被动/行动阶段：若你未激活【变化（恐龙）】，从手牌将一张魔术或特殊牌放置于此牌上",
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
          "printedClause": "局势牌不会禁止此效果的使用",
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
          "printedClause": "被动/前哨阶段：【真名解放】",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "弃置2张【红叶狩】上的牌，将【变化（恐龙）】加入攻击",
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
  "servant.koyo.skill.sc-koyo-2": {
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
          "printedClause": "残留：准备阶段，弃置一张【红叶狩】上的牌，否则关闭此牌",
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
          "printedClause": "你无法打出基础魔术攻击",
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
          "printedClause": "行动阶段：弃置一张【红叶狩】上的牌，你的基础力量攻击+4威力",
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
  "servant.koyo.skill.sc-koyo-3": {
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
          "printedClause": "若【变化（恐龙）】处于激活状态，此攻击魔力消耗+5且威力+6",
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
          "printedClause": "体温调节-被动/行动阶段：展示你的手牌",
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
          "printedClause": "若你展示了3张或以上的力量牌，弃置它们并获得+5合计威力，然后抽一张牌",
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
  "servant.kriemhild.skill.sc-kriemhild-1": {
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
          "printedClause": "【真名解放】遗弃之爱-战斗阶段：回合结束时，从任意处（包括游戏外）令【流离魔剑·圣妃失坠】返回你的技能区",
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
          "printedClause": "若【流离魔剑·圣妃失坠】从一名玩家处返回，该名玩家失去3点战果且其于下回合无法使用宝具",
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
  "servant.kriemhild.skill.sc-kriemhild-2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "如果其他控制或于技能区存在【流离魔剑·圣妃失坠】的玩家赢得了你所在的战斗，你同时赢得该战斗（均分战果，无视【败北】）",
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
          "printedClause": "未亡人的请柬-打出时：令所有其他玩家按回合顺位选择是否移动至你所在的战场",
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
  "servant.kriemhild.skill.sc-kriemhild-3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "屠我诅咒-被动：回合结束时，除非你赢得一场战斗，否则失去所有于本回合获得的战果",
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
          "printedClause": "杀我报偿-战斗结束后，选择一名本战斗的胜利者将此牌加入其技能区",
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
          "printedClause": "若你选择自己，克琳希德获得2点战果",
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
  "servant.ladyavalon.skill.sc-ladyavalon-1": {
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
          "kind": "passive",
          "printedClause": "被动：高潮阶段你无法从事件牌中获得战果",
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
          "printedClause": "此效果于阿瓦隆女士不会因任何方式失效且不可被复制",
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
          "printedClause": "战斗阶段：关闭你战斗中所有印刷魔力消耗与【伪装者】的印刷基本威力相同的其他攻击",
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
  "servant.lakshmibai.skill.sc-lakshmibai-1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：若你赢得了一场有战果多于你的其他玩家参与的战斗，在本回合结束时，你不会被淘汰",
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
          "printedClause": "若你于最后一回合获胜且战果数不为第一，以【天之杯】作为局势牌再进行一回合",
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
  "servant.lakshmibai.skill.sc-lakshmibai-2": {
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
          "printedClause": "瓜摩尔的抵抗-被动：当一名对手进入你所在的战场时，你可以打出一张牌并使用其行动阶段能力（该牌基本威力减半，向上取整）",
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
          "printedClause": "如果你以瓜摩尔的抵抗打出了此牌，将一名你所在的战场的对手移动至相邻地点",
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
  "servant.lakshmibai.skill.sc-lakshmibai-4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：当你【败北】时，你可以从手牌弃置此牌，然后你获得3点战果并令所有与你位于同一战场的对手【败北】",
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
          "printedClause": "打出时：抽一张牌，若你战败，将此牌洗回你的牌库",
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
  "servant.lance.skill.sc-lance-1": {
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
          "printedClause": "战斗阶段：如果你并未【败北】或你打出【幸运】来防止此效果，本牌变为任意一张与你同战场的激活的非残留力量或迅捷属性的攻击",
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
          "printedClause": "若你选择的攻击为自己控制的卡牌，此复制威力+3",
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
  "servant.lance.skill.sc-lance-3": {
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
          "printedClause": "行动阶段: 花费一枚令咒",
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
          "printedClause": "直到回合结束前，此牌变为一张已被展示的非<一局游戏限一次>的技能或攻击的复制",
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
  "servant.leonidas.skill.sc-leonidas-1": {
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
          "printedClause": "残留：当你移动时关闭此牌",
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
          "printedClause": "你所在战场的所有玩家每回合只可打出1张正面牌",
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
  "servant.leonidas.skill.sc-leonidas-3": {
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
          "printedClause": "被动：你的【战士的雄叫】可以被暗置打出",
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
          "printedClause": "战斗阶段：花费一张你控制的暗置攻击三倍消耗的魔力将其激活，你可以使用它的行动阶段能力",
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
          "printedClause": "方阵-战斗阶段：若有对手于本回合移动至你所在的战场，你获得3点基础地利（在翻倍等效果之前计算）",
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
  "servant.lionking.skill.sc-lionking-1": {
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
          "kind": "passive",
          "printedClause": "被动：战力结算时，你的【幸运】视为拥有所有属性且它们的威力不能被减少",
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
          "printedClause": "止境的加护-被动/前哨阶段：获得1点魔力和+3合计威力，本回合你无法获得战果",
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
            "phase": "outpost",
          },
        },
      ],
    },
  },
  "servant.lionking.skill.sc-lionking-2": {
    "activation": "phase",
    "windows": [
      "action",
    ],
    "steps": [
      "player-window",
    ],
    "requiresActiveCard": true,
    "abilities": [
      {
        "id": "clause-2",
        "name": "战斗续行",
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
          "kind": "phase_action",
          "printedClause": "你可以改为花费2点战果来打出此牌",
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
          "activation": {
            "phase": "action",
          },
          "printedClause": "战斗续行-行动阶段：移动至一处战场",
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
              "type": "move_player",
              "target": "controller",
              "allowedLocationIds": [
                "mountain",
                "city",
              ],
            },
          ],
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "骑乘-行动阶段：从手牌中追加打出至多3张基本威力3及以下的牌",
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
  "servant.lionking.skill.sc-lionking-3": {
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
          "printedClause": "若你获得胜利，将你所在战场的事件牌移除游戏",
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
          "printedClause": "当你以此效果移除游戏的事件牌印刷战果数总和大于12点时，你获得游戏胜利，此效果不能被任何方法阻止",
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
  "servant.lishuwen.skill.sc-lishuwen-1": {
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
          "printedClause": "暗劲-被动/行动阶段：花费3点魔力，激活该效果并隐藏你的技能区",
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
          "printedClause": "当你于行动阶段打出牌时，你可以改为将其暗置作为劲置于一旁（不需花费）",
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
          "printedClause": "你的战斗阶段，将所有劲分别明置或暗置打出，你可以使用它们的行动阶段能力",
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
          "printedClause": "暗劲持续至你战败",
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
  "servant.lishuwen.skill.sc-lishuwen-2": {
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
          "printedClause": "一击制敌-战斗阶段：移除一张你的，与一名交战对手控制的攻击具有相同属性的暗置攻击并令其【败北】",
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
          "printedClause": "若如此做，此牌威力翻倍",
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
  "servant.lobo.skill.sc-lobo-1": {
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
          "printedClause": "【真名解放】身披死亡之物-战斗阶段：若你控制【恶嚎】，你可以从手牌或攻击区弃置至多2张你的【复仇者】，每弃置一张，你便可以关闭一张你战斗中的【幸运】或令你战斗中的一名玩家【败北】",
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
  "servant.lobo.skill.sc-lobo-2": {
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
          "kind": "passive",
          "printedClause": "被动：被【死缠】的玩家战败时，他失去3点战果",
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
          "printedClause": "被动/行动阶段：花费1点魔力，然后选择一处战场，所有位于此处的对手按回合顺位依次选择移动至一处相邻的地点或被【死缠】至本回合结束",
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
          "printedClause": "若有对手因此效果进行了移动，将此牌加入攻击",
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
  "servant.lobo.skill.sc-lobo-3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：当一名对手移动后，你可以向其移动一步，以此法进行的移动可以忽略目的地的人数上限",
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
          "printedClause": "若你以此法进行了移动，你可以打出一张威力不超过3的攻击，若你打出的是【疾行】，你可以立即使用它的行动阶段能力",
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
  "servant.lubu.skill.sc-lubu-1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：若你本回合没有与任何对手战斗，则你失去X点战果，你可以持续激活X张本回合激活的基础攻击至下回合结束",
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
          "printedClause": "（X至少为1",
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
  "servant.lubu.skill.sc-lubu-2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "反叛-你从事件牌获得战果为0，因令咒和竞争获得的战果翻倍",
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
  "servant.lubu.skill.sc-lubu-3": {
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
          "printedClause": "【真名解放】被动/行动阶段：花费你激活的1张非基础攻击的魔力使其基本威力翻倍并变为<每局游戏限一次>",
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
  "servant.mandricardo.skill.sc-mandricardo-1": {
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "顷刻一击-行动阶段：+5合计威力，战斗结束后，你的战果数每于本回合超过一名对手，便获得1点战果，之后将此牌移除游戏",
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
          "printedClause": "若【不带剑的誓言】因此效果被移除，令曼迪卡尔多的【木剑】获得顷刻一击并更改为“战斗阶段：”直至游戏结束",
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
  "servant.martha.skill.sc-martha-1": {
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
          "printedClause": "若玛尔达拥有【裁决者令咒】，其无法使用圣女之誓",
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
          "printedClause": "圣女之誓-战斗阶段：令你自己获得一枚【裁决者令咒】或将手牌中的一张【幸运】移除游戏，令一名与你位于同一地点的其他玩家获得一枚【裁决者令咒】",
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
          "printedClause": "只有玛尔达可以使用这些【裁决者令咒】",
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
  "servant.martha.skill.sc-martha-2": {
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
          "printedClause": "利维坦之子，化为流星-战斗阶段：花费一枚【令咒】或【裁决者令咒】，【不识爱的悲哀之龙啊】获得+4威力且你的所有交战对手于下回合前哨阶段如若可能，必须部署于魔术工房",
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
  "servant.martha.skill.sc-martha-4": {
    "activation": "passive",
    "windows": [
      "action",
    ],
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "行动阶段：令被束缚者（限一项）：<每局游戏限一次>",
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
          "printedClause": "1.移动至【深山町】或【新都】",
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
          "printedClause": "2.无法移动至本回合结束",
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
          "printedClause": "3.免费打出一张手牌",
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
          "printedClause": "无论其是否打出，若他获胜，你获得2点战果",
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
  "servant.mash.skill.sc-mash-1": {
    "activation": "play",
    "windows": [
      "action",
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
          "printedClause": "【真名解放】行动阶段：选择一名玩家，其获得你所在战场的+2地利",
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
          "printedClause": "随后将他的地利翻倍",
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
  "servant.mash.skill.sc-mash-3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：当你没有令咒时，你的从者真名隐藏",
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
          "printedClause": "你不能再使用【已然遥远的理想之城】或出借【守护】",
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
          "printedClause": "【守护】的基本威力翻倍",
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
  "servant.mash.skill.sc-mash-4": {
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
          "printedClause": "若玛修战败，将【守护】返还于玛修的手牌",
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
          "printedClause": "若玛修未参与此战斗，则将此牌【关闭】",
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
          "printedClause": "你和玛修无视【败北】效果，你们二人各自的合计威力变为你和玛修中合计威力最高的数值",
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
          "printedClause": "行动阶段：玛修将【守护】借给一位对手直到战斗阶段结束",
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
  "servant.maxwell.skill.sc-maxwell-3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "残留：当你要获得魔力时，改为令此牌在关闭前增加相同数量的威力",
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
          "printedClause": "在战斗阶段开始时，你所在地点的玩家失去2点魔力",
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
          "printedClause": "若其中有玩家在失去魔力前其魔力值小于2，关闭此牌",
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
  "servant.mechaeli.skill.sc-mechaeli-1": {
    "activation": "passive",
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
          "kind": "phase_action",
          "printedClause": "你可以追加打出此牌",
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
          "printedClause": "砰！-行动阶段反转：或战斗阶段：将一名与你位于同一战场且其回合顺位在你之后的对手沿箭头移动一个地点",
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
          "printedClause": "你每回合可以使用砰！两次",
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
  "servant.mechaeli.skill.sc-mechaeli-2": {
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
          "printedClause": "每有一名对手进入你所在的战场，你的合计威力便+2",
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
          "printedClause": "战斗阶段：若你在未交战的情况下赢得战斗胜利，获得4点战果",
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
  "servant.medb.skill.sc-medb-2": {
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
          "printedClause": "行动阶段：令一名与你位于同一地点的对手于下回合【迷醉】",
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
          "printedClause": "下个回合结束时，你获得所有【迷醉】的对手本回合获得的等量战果",
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
          "printedClause": "若其获得的战果少于3点，其失去3点战果",
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
  "servant.medb.skill.sc-medb-3": {
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
          "printedClause": "战斗阶段：令一名你战斗中的胜者于下回合【拜服】",
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
          "printedClause": "下个回合前哨阶段，【拜服】者不进行部署，改为在你部署后，部署于你所在的地点，你必须部署在一处至少可供2名玩家部署的地点",
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
  "servant.medusa.skill.sc-medusa-2": {
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
          "printedClause": "行动阶段：在战斗阶段开始前，若与你进行战斗的对手本回合没有打出/加入迅捷属性攻击，则其【败北】",
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
  "servant.medusa.skill.sc-medusa-np": {
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
          "printedClause": "行动阶段：移动到任一地点，若为战场，重新部署于该地点的2个地利，原地利的占领者失去该地利",
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
  "servant.meltryllis.skill.sc-meltryllis-1": {
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
          "printedClause": "吸收-战斗阶段：与你交战的所有对手在其下个回合开始时随机【感染】一张技能区的牌直至回合结束",
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
          "printedClause": "他们不能使用被【感染】的牌",
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
          "printedClause": "反转：下个回合，将所有被【感染】的牌的临时复制加入你的技能区",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "当它们提到一个名字时，视为被提到的是你",
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
  "servant.meltryllis.skill.sc-meltryllis-2": {
    "activation": "passive",
    "windows": [
      "combat",
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
          "printedClause": "每回合仅限使用【弁财天五弦琵琶】上的一项能力",
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
          "printedClause": "战斗阶段：将与你交战的所有对手的力量属性牌威力减至3点",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "反转/行动阶段：从手牌中打出最多三张牌",
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
  "servant.melusine.skill.sc-melusine-1": {
    "activation": "passive",
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：此效果无法被复制或盗用，当梅柳齐娜战败时，展示此牌",
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
          "printedClause": "若她战败时此牌已被展示，将你的从者梅柳齐娜替换为阿尔比恩之骸并【真名解放】（阿尔比恩之骸是一名拥有不同牌库和上述技能的从者）",
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
  "servant.melusine.skill.sc-melusine-2": {
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
          "printedClause": "行动阶段：从手牌中打出至多2张基础攻击",
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
          "printedClause": "若你于本回合进行了移动，你可将此效果更改为“抽一张牌，然后从手牌中打出至多3张基础攻击",
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
  "servant.mephisto.skill.sc-mephisto-2": {
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
          "printedClause": "残留：准备阶段，若你的战果数为第一，你【败北】且梅菲斯托费勒斯偷取你X点战果，之后将此牌从游戏中移除",
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
          "printedClause": "X为此牌的威力",
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
          "printedClause": "行动阶段：偷取梅菲斯托费勒斯的1点魔力",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "若如此做，此攻击威力永久+1",
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
  "servant.mephisto.skill.sc-mephisto-3": {
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
          "printedClause": "不可抗拒的赠礼-行动阶段：将一张你技能区【寄生炸弹虫】的复制加入一名与你位于同一地点的，未控制【寄生炸弹虫】且战果数不为第一的其他玩家的攻击，你与其各获得1点战果",
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
  "servant.merlin.skill.sc-merlin-1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：你在移动之前进行打牌而不是之后",
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
          "printedClause": "当你移动时，无视交战状态",
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
  "servant.merlin.skill.sc-merlin-2": {
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
          "printedClause": "自由选择X",
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
          "printedClause": "若X为0，则失去5点魔力",
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
          "printedClause": "幻术-战斗阶段：将此战场中除此牌以外的所有消耗为X的攻击威力减至0",
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
  "servant.merlin.skill.sc-merlin-3": {
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
          "kind": "passive",
          "printedClause": "被动：从侦察处额外获得1点战果和2点魔力",
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
          "printedClause": "行动阶段：将你所在战场的所有事件牌移除游戏",
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
  "servant.mhx.skill.sc-mhx-1": {
    "activation": "phase",
    "windows": [
      "combat",
    ],
    "steps": [
      "player-window",
    ],
    "limit": "once-per-game",
    "requiresActiveCard": true,
    "abilities": [
      {
        "id": "clause-2",
        "name": "Saber必须死！",
        "activation": "phase",
        "windows": [
          "combat",
        ],
      },
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "activation": {
            "phase": "combat",
          },
          "printedClause": "Saber必须死！-战斗阶段：令一名交战对手【败北】",
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
              "type": "defeat_player",
              "target": {
                "scope": "selected_same_battlefield_player",
              },
            },
          ],
          "targets": [
            {
              "id": "targetPlayerId",
              "type": "player",
              "scope": "same_battlefield_players",
            },
          ],
        },
        {
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "若其战败，偷取其2点战果",
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
          "printedClause": "若其战败且从者为金发或职阶为Saber，改为偷取4点战果",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "若均满足，改为偷取6点战果",
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
  "servant.molay.skill.sc-molay-1": {
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
          "printedClause": "残留：战斗阶段前，若你是降临者，关闭此牌或一张你控制的【领域外生命】",
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
          "printedClause": "战斗阶段：你的战斗中控制非【幸运】特殊攻击的玩家，其合计威力-5",
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
  "servant.molay.skill.sc-molay-2": {
    "activation": "passive",
    "windows": [
      "preparation",
    ],
    "revealsTrueNameOnPlay": true,
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "passive",
          "printedClause": "被动：当你作为降临者战败时，你【真名解放】并激活此牌",
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
          "printedClause": "残留：雅克成为女性降临者且她的攻击+3魔力消耗",
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
          "printedClause": "准备阶段：为回合顺位前两位的玩家分别创造并激活一张临时的【领域外生命】",
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
            "phase": "preparation",
          },
        },
      ],
    },
  },
  "servant.molay.skill.sc-molay-3": {
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
          "printedClause": "若你是降临者，你【败北】",
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
          "printedClause": "战斗阶段：【劝诱】你所在地点的所有玩家",
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
          "printedClause": "下回合被【劝诱】的玩家创造并激活一张临时的【领域外生命】，并且雅克在该回合是降临者",
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
  "servant.molay.skill.sc-molay-4": {
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
          "printedClause": "你和降临者各获得合计威力+6",
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
          "printedClause": "将此牌加入降临者的弃牌堆",
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
};
