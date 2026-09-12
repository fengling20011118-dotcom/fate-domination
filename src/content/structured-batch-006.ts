import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

// 批次 006：由 tools/refactor-remaining-skills.py 按牌面原文批量生成（全句覆盖校验）。
// 确定性条款 → automatic（effect DSL 精确表达）；其余 → host_adjudicated + allowedOperations。
// FULL 仅授予整卡所有能力可自动执行且无未建模行的技能。
export const structuredBatch006Overrides: Record<string, ConfirmedSkillOverride> = {
  "master.akasha.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "若你在本局游戏已转生为所有【容器】过，你停止转生且同时视为所有【容器】",
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
          "printedClause": "每个高潮回合开始时，将一张临时的【过负荷】放置于一处你选择的战场",
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
  "master.akasha.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "将【过负荷】加入你的技能区，并在每个战场创造一张其临时复制",
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
  "master.akasha.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的首个【容器】是【米切尔·罗亚】",
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
          "printedClause": "当你以5点及以上的战力差距被击败或【败北】时，转生",
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
  "master.akasha.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "在下个回合开始时，根据你以当前【容器】获得的战果数转生为新的【容器】，然后移除所有临时的【过负荷】直至仅剩2张",
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
          "printedClause": "若你转生为相同的【容器】，失去3点战果",
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
  "master.akasha.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "诡计-你作为【罗亚】获得的战果仅在转生时双倍计算",
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
          "printedClause": "神职特权-你从侦查获得的战果+1",
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
      "unmodeledClauses": [
        "【容器：0~5战果】",
      ],
    },
  },
  "master.akasha.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "不稳定凭依-你作为【艾蕾西亚】获得的战果仅在转生时减半计算（向上取整）",
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
          "printedClause": "满月-若你控制【过负荷】，你的技能获得+1威力且-1魔力消耗",
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
        "【容器：6~10战果】",
      ],
    },
  },
  "master.akasha.skill.s5": {
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "奋迅-你拥有的魔力少于8点也可以打出【过负荷】，若如此做，令其+3威力且不关闭",
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
          "printedClause": "见方-行动阶段：花费你激活的【过负荷】魔力消耗的魔力令它们的威力翻倍",
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
      "unmodeledClauses": [
        "【容器：11+战果】",
      ],
    },
  },
  "master.akasha.skill.s6": {
    "activation": "play",
    "standardAppend": true,
    "passiveEventTypes": [
      "card.played",
    ],
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
          "printedClause": "沸腾-被动：当你部署于地利位置时，你可以选择将所有此地点的【过负荷】加入你的攻击或不加入，若加入，令它们获得+2威力",
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
          "kind": "play_trigger",
          "activation": {
            "eventType": "card.played",
          },
          "printedClause": "凝结-打出时：关闭此牌",
          "execution": {
            "mode": "automatic",
          },
          "conditions": [
            {
              "type": "event_player_is_controller",
            },
            {
              "type": "event_definition_is_self",
            },
            {
              "type": "event_face_is",
              "face": "up",
            },
          ],
          "effects": [
            {
              "type": "close_owned_active_cards_by_definition",
              "definitionId": "self",
              "count": 1,
            },
          ],
        },
        {
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "若你关闭，将一张此牌的临时复制放置于你所在的地点",
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
  "master.akiha.skill.ascension": {
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
          "printedClause": "红赤休术-被动：若你是红赤朱，此牌+3魔力消耗且+4威力",
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
          "printedClause": "掠夺-若你是远野秋叶，被你偷取魔力用于打出此牌的玩家-3合计威力",
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
  "master.akiha.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你每回合可以从与你位于同一战场且拥有6点及以上魔力的对手处各花费1点魔力（用于出牌、使用能力等）",
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
  "master.akiha.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "每当你花费魔力时，获得等量的【杀戮冲动】并根据其数量获得相应效果",
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
          "printedClause": "战斗阶段结束后，你随机失去1-3点【杀戮冲动】，若你位于魔术工房则将失去值翻倍",
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
  "master.akiha.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "人格反转-你的【杀戮冲动】永远为15点，你失去所有令咒",
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
          "printedClause": "你获得的战果点数减半（向下取整），获得的魔力翻倍",
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
  "master.akiha.skill.s3": {
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
          "printedClause": "<5：行动阶段：获得1点魔力，+2合计威力和3点【杀戮冲动】，你本回合无法失去【杀戮冲动】",
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
          "printedClause": "5+：你的技能攻击被激活时+1威力",
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
          "printedClause": "10+：你拥有的魔力少于8点也可以打出技能牌",
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
          "printedClause": "15+：回合结束时，将【远野秋叶】转换为【红赤朱】",
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
  "master.alice.skill.ascension": {
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
          "kind": "passive",
          "printedClause": "被动：你于所在地点拥有的地利，为你所在所有地点提供地利",
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
          "printedClause": "行动阶段：将幻影爱丽丝从桌面移除，使所有与她位于同一地点的玩家【败北】",
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
      "unmodeledClauses": [
        "（将此牌加入你的技能区）",
      ],
    },
  },
  "master.alice.skill.s1": {
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
          "printedClause": "前哨阶段：若你未于上一回合输掉战斗，将【幻影爱丽丝】部署于一处战场",
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
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "当一个爱丽丝移动或被移动后，若另一个爱丽丝可移动且未处于交战状态，朝相同方向移动相同的距离",
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
          "printedClause": "你进行打牌后，失去此次打出的所有牌合计魔力消耗一半的魔力（向上取整）",
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
  "master.alice.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "两位爱丽丝代表同一名玩家，她们视为激活了相同的卡牌，但是需要分别计算她们的威力",
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
          "printedClause": "当她们分开时，你需要决定由哪一处的爱丽丝来发动你针对地点或战斗的效果",
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
          "printedClause": "（你不会因此而触发两次你的能力",
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
          "printedClause": "幻影规则：1、爱丽丝和幻影爱丽丝视为\"1个对手\"，\"1名玩家\"，\"你\"",
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
          "id": "clause-6",
          "kind": "phase_action",
          "printedClause": "2、2个爱丽丝共同获得的：被动、牌面描述、合计威力增减、打出时牌的威力增减",
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
          "printedClause": "3、战斗/地点相关：描述中提及交战、地点、战斗、战场视为地点或战斗相关",
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
          "printedClause": "4、爱丽丝/幻影跟随移动受交战状态影响",
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
  "master.amakusa.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "解锁此牌后所有对手立即失去2枚令咒",
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
          "printedClause": "【开演之时已至，此处应有雷鸣般的喝彩】激活时，你的基础牌获得威力+4",
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
  "master.amakusa.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时，你是【红队领袖】，你后置位的那名玩家成为【神仆】",
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
  "master.amakusa.skill.s1a": {
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
          "printedClause": "行动阶段：将一名【神仆】已展示的从者技能的临时复制加入你的技能区直至回合结束",
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "他本回合无法使用你使用了其复制的原技能牌且其不再为【神仆】",
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
  "master.amakusa.skill.s2": {
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
          "printedClause": "臣属-行动阶段：花费X枚令咒，选择一名本局游戏未成为过【神仆】且在你花费令咒前令咒数少于你的玩家，下回合开始时他成为【神仆】，X为1+【神仆】数",
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
  "master.amakusa.skill.s3": {
    "activation": "passive",
    "limit": "once-per-round",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "非高潮回合，你需花费一枚令咒才可进入天草四郎所在的战场",
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
          "printedClause": "每回合限一次，若你与天草四郎同时位于不同的战场，你花费魔力时，可以将天草四郎的1点魔力加入支付",
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
          "printedClause": "若你与天草四郎于同一回合赢得了不同的战斗，你与其各获得1点战果",
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
  "master.araya.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你部署于一处因三重结界拥有5点或更多的地利的位置时，将你所在的地点同时视为魔术工房",
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
          "printedClause": "当你位于魔术工房时，你的对手无法离开你所在的地点且其于常规出牌时必须打出一张暗置攻击",
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
  "master.araya.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你部署于一处地利位置时不获得原本的地利，改为令你位于此地点时获得+1地利直至游戏结束（至多为5）",
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
  "master.araya.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "战斗阶段结束后，将一张你激活的基础攻击洗回牌库，然后你获得该牌印刷魔力消耗两倍的魔力",
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
  "master.arcueid.skill.ascension": {
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
          "printedClause": "只有在你本回合使用了【空想具现化】时，才可打出此牌",
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
          "printedClause": "月之真祖-被动：你的基础攻击受到【血之渴望】效果的双倍影响",
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
      "unmodeledClauses": [
        "（将此牌加入你的技能区）",
      ],
    },
  },
  "master.arcueid.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时你拥有【空想具现化】，每当你使用月姬后，重新获得它",
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
  "master.arcueid.skill.s1a": {
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
          "printedClause": "前哨阶段：获得【血之渴望】直至你赢得一场战斗且当你赢得时，偷取该战斗中一名对手的至多2点魔力",
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
  "master.arcueid.skill.s2": {
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "行动阶段：在你的战斗阶段时，你可以关闭一张你战斗中的基础攻击",
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
          "printedClause": "若如此做，其控制者抽牌直至抽到一张基础攻击后，将其加入攻击，然后你可以重复使用一次此效果",
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
  "master.arcueid.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的基础攻击+1魔力消耗并+2威力",
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
          "printedClause": "你无法使用【空想具现化】，回合结束时，你失去2点战果",
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
  "master.artoira.skill.ascension": {
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
          "printedClause": "（此牌解锁时，将其加入你的技能区）",
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
          "kind": "passive",
          "printedClause": "被动：你可以蓄势此牌",
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
          "printedClause": "剑岂是如此不便之物-战斗阶段：若你获胜且此牌本回合是从你的牌库入场，你立即获得游戏胜利",
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
      "unmodeledClauses": [
        "（此牌解锁时，将其加入你的技能区）",
      ],
    },
  },
  "master.artoira.skill.s1": {
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
          "printedClause": "前哨阶段：选择你技能区一张明置的，属于你从者的技能攻击进行蓄势",
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "（蓄势：将该攻击放置于你牌库顶的第X张[牌库不足则无法放置]，X为其魔力消耗+1，当其因任何原因从你的牌库离开时[被抽取,弃置,移除等]，将其免费加入你的攻击",
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
  "master.bazett.skill.ascension": {
    "activation": "passive",
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【佛拉格拉克】失去<每局游戏限一次>并获得：\"残留：此牌持续激活至你触发先发后至或再启动",
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
  "master.bazett.skill.s1c": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "requiresEightMana": false,
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你拥有的魔力少于8点也可以打出【佛拉格拉克】且其于本回合失去<每局游戏限一次>",
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
          "printedClause": "战斗阶段：若你获胜，获得2点战果",
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
  "master.bazett.skill.s1d": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "若你于本回合获胜，【觉醒】",
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
          "printedClause": "若你于回合结束时未【觉醒】，【再启动】",
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
  "master.bazett.skill.s2": {
    "activation": "passive",
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "先发后至-下一次一名与你位于同一战场的对手使用宝具时，令其【败北】",
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
  "master.caren.skill.ascension": {
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
          "kind": "passive",
          "printedClause": "被动：当此牌加入你的技能区时，获得【抹大拉的圣骸布】",
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
          "printedClause": "爱之印-当任意一名对手获得胜利时，其获得3点战果",
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
      "unmodeledClauses": [
        "（将此牌加入你的技能区）",
      ],
    },
  },
  "master.caren.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时，你拥有【被虐灵媒体质】",
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
          "printedClause": "当你的魔力第一次减至1或更低时，失去【被虐灵媒体质】",
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
  "master.caren.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当一名与你位于同一地点的对手因从者能力、令咒或升华技获得战果时，令其获得的战果减半（向下取整），然后你失去被减少的战果数的魔力",
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
          "printedClause": "你每因此失去1点魔力，获得1点战果",
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
  "master.caren.skill.s3": {
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
          "printedClause": "行动阶段：选择一名与你交战的对手，他无法于自己的回合内移动且合计威力-1至-5（由你选择）",
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
          "printedClause": "若其本回合战败，将此牌移除游戏",
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
  "master.caules-yggdmillennia.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的【绞首刑之雷】更改为：\"打出时：秘密宣言一种属性并于你的战斗阶段开始时展示\"",
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
          "printedClause": "解锁此技能的回合结束后，从牌库、弃牌堆以及手牌移除你的所有牌；并以如下牌组成一副新的牌库使用：力量4x2 力量5x3 魔术4x2 魔术5x3 幸运x1 侦查x1",
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
  "master.caules-yggdmillennia.skill.s3": {
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
          "printedClause": "此牌需追加打出，你需宣言一种本局游戏未宣言过的属性才可打出此牌",
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
          "printedClause": "电气魔术-战斗阶段：将所有与你位于同一战场的对手控制的，具有你宣言属性的基础攻击的威力设为0",
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
          "printedClause": "（Deck变体：力量/迅捷/魔术/特殊/宝具 五种属性各可宣言一次）",
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
  "master.caules.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "将所有【绞首刑之雷】加入你的技能区",
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
          "printedClause": "你无法再过载",
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
          "printedClause": "当你使用【巴格达电池】后，你的魔术攻击+2威力直至回合结束",
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
  "master.caules.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你位于魔术工房时，可以使用【巴格达电池】",
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
          "printedClause": "每回合只可使用【巴格达电池】的一项能力",
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
  "master.caules.skill.s2": {
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
          "printedClause": "若你于前哨阶段部署于魔术工房，可选择下列一项：充电-花费X点战果，获得2×X+1点魔力；检修-花费2点魔力，你无视【败北】状态直至回合结束",
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
          "printedClause": "过载-战斗阶段：将一张游戏外的【绞首刑之雷】暗置且加入你的技能区（不展示）",
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
  "master.caules.skill.s3": {
    "activation": "passive",
    "limit": "once-per-game",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "魔术3耗3需6威",
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
          "printedClause": "五种变体（各限一次）：",
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
          "printedClause": "瘫痪陷阱-与你位于同一地点的力量属性牌上的能力无法被使用",
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
          "printedClause": "静电浪涌-与你位于同一地点的敏捷属性牌上的能力无法被使用",
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
          "printedClause": "神经眩晕-与你位于同一地点的魔术属性牌上的能力无法被使用",
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
          "id": "clause-7",
          "kind": "phase_action",
          "printedClause": "破坏之网-与你位于同一地点的，除【幸运】外的特殊属性牌上的能力无法被使用",
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
          "printedClause": "感官超载-与你位于同一地点的，除令咒外的无属性牌上的能力无法被使用",
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
  "master.celenike.skill.ascension": {
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
          "printedClause": "痛苦钉刺-行动阶段：令【枯萎】的玩家选择花费2点魔力或弃置所有手牌",
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
      "unmodeledClauses": [
        "（将此牌加入你的技能区）",
      ],
    },
  },
  "master.celenike.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你战败时，令此战斗的所有胜者【枯萎】直至你于一回合内获得了4点及以上的战果",
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
          "printedClause": "当你获胜时，偷取该战斗中所有【枯萎】的玩家各2点战果",
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
  "master.chaos.skill.ascension": {
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
          "printedClause": "每回合你都可以于前哨阶段使用任意次兽王之巢",
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
          "printedClause": "行动阶段：花费4点魔力，抽一张【兽】",
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
  "master.chaos.skill.s1": {
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
          "printedClause": "当你获得魔力时，抽取其数值一半数量的【兽】（向下取整）",
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
          "printedClause": "【兽】置于独立的手牌区和弃牌堆",
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
          "printedClause": "你拥有【争夺令咒】，【争夺令咒】不是令咒",
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
          "printedClause": "前哨阶段：打出一张【兽】",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "【兽】的消耗以弃置相应数量的【兽】来支付，【兽】仅可以此方式被打出",
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
  "master.chaos.skill.s11": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "臣服-残留：【争夺令咒】更改为令咒",
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
          "printedClause": "当你使用令咒后，关闭此牌",
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
        "【兽】",
      ],
    },
  },
  "master.chaos.skill.s12": {
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
          "printedClause": "【兽】在1~8内自由选择X",
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
          "printedClause": "突进-行动阶段：沿着箭头移动至多X步",
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
          "printedClause": "此牌获得1+X威力",
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
  "master.chaos.skill.s13": {
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
          "printedClause": "【兽】自由选择X",
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
          "printedClause": "过境-行动阶段：弃置一张你所在战场战果点数为X+2的事件牌",
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
  "master.chaos.skill.s16": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "绝望-打出时：弃置你的所有【兽】手牌，X变为你以绝望弃置的牌数量的2倍（最大为10）",
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
        "【兽】",
      ],
    },
  },
  "master.chaos.skill.s17": {
    "activation": "phase",
    "windows": [
      "action",
    ],
    "steps": [
      "player-window",
    ],
    "limit": "once-per-game",
    "abilities": [
      {
        "id": "clause-5",
        "name": "行动阶段：移动至一处",
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
          "printedClause": "选择下列一项： <每局游戏限一次>",
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
          "printedClause": "行动阶段：再使用一次兽王之巢的前哨阶段效果",
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
          "printedClause": "行动阶段：获得2点魔力（并抽一张【兽】）",
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
          "printedClause": "行动阶段：若你获胜，获得2点战果",
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
          "id": "clause-5",
          "kind": "phase_action",
          "activation": {
            "phase": "action",
          },
          "printedClause": "行动阶段：移动至一处相邻的地点",
          "execution": {
            "mode": "automatic",
          },
          "conditions": [],
          "effects": [
            {
              "type": "move_player",
              "target": "controller",
              "adjacentOnly": true,
            },
          ],
        },
        {
          "id": "clause-6",
          "kind": "phase_action",
          "printedClause": "（注：兽没有魔力消耗，印刷的消耗为其需要弃置的兽数量",
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
  "master.chaos.skill.s3": {
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
          "printedClause": "献身-行动阶段：弃置至多3张【兽】并获得其数量两倍的魔力",
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
          "printedClause": "你无法因此效果抽取【兽】",
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
        "【兽】",
      ],
    },
  },
  "master.chaos.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "无惧-打出时：你于你下个回合的准备阶段抽3张【兽】，然后弃置2张【兽】",
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
        "【兽】",
      ],
    },
  },
  "master.chaos.skill.s5": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "诱捕-进入你所在地点的对手-5合计威力直至回合结束",
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
        "【兽】",
      ],
    },
  },
  "master.chaos.skill.s6": {
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "闭耳-战斗阶段：若你战败，抽2张【兽】",
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
      "unmodeledClauses": [
        "【兽】",
      ],
    },
  },
  "master.ciel.skill.ascension": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "expanded-seventh-scripture-strength",
          "kind": "passive",
          "printedClause": "你的力量攻击获得+4威力和粉碎灵魂。（战斗阶段：你的交战对手若未控制【幸运】，其下回合无法从局势牌获得魔力和威力加成。）",
          "conditions": [
            { "type": "source_owned" },
          ],
          "ruleModifiers": [
            {
              "id": "strength-attack-power-plus-four",
              "operation": "add",
              "rule": "card_power",
              "scope": {
                "subject": "controller",
                "cards": { "attributesAny": ["力量"] },
              },
              "value": 4,
              "lifecycle": { "duration": "permanent" },
            },
          ],
          "transforms": [
            {
              "id": "grant-expanded-soul-crush",
              "type": "card",
              "target": {
                "subject": "controller",
                "cards": { "attributesAny": ["力量"] },
              },
              "grantAbilities": [
                {
                  "id": "expanded-soul-crush",
                  "name": "粉碎灵魂",
                  "activation": { "phase": "combat" },
                  "handlerId": "core.ciel-expanded-soul-crush",
                },
              ],
              "lifecycle": { "duration": "permanent" },
            },
          ],
          "execution": {
            "mode": "automatic",
          },
        },
        {
          "id": "append-funeral-rite",
          "kind": "passive",
          "printedClause": "若你拥有8点及以上的魔力，你可以令【火葬式典】+2魔力消耗将其追加打出。",
          "conditions": [
            { "type": "source_owned" },
            { "type": "mana_at_least", "amount": 8 },
          ],
          "ruleModifiers": [
            {
              "id": "allow-funeral-rite-append",
              "operation": "allow",
              "rule": "standard_append",
              "scope": {
                "subject": "controller",
                "cards": { "definitionIds": ["master.ciel.skill.s2"] },
              },
              "lifecycle": { "duration": "permanent" },
            },
            {
              "id": "funeral-rite-append-surcharge",
              "operation": "add",
              "rule": "standard_append_cost",
              "scope": {
                "subject": "controller",
                "cards": { "definitionIds": ["master.ciel.skill.s2"] },
              },
              "value": 2,
              "lifecycle": { "duration": "permanent" },
            },
          ],
          "execution": {
            "mode": "automatic",
          },
        },
      ],
      "evidence": [
        {
          "kind": "development-image",
          "document": "Fate_Domination-开发版",
          "category": "master",
          "page": "images/masters/希耶尔.png",
          "locator": "master.ciel/希耶尔",
        },
      ],
      "ambiguities": [],
      "unmodeledClauses": [],
    },
  },
  "master.ciel.skill.s1b": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当一名对手于一回合内获得7点及以上的战果时，令【第七圣典】加入或返回你的技能区",
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
  "master.ciel.skill.s2": {
    "activation": "phase",
    "windows": [
      "combat",
    ],
    "steps": [
      "player-window",
    ],
    "requiresEightMana": false,
    "abilities": [
      {
        "id": "clause-3",
        "name": "神职便利",
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
          "printedClause": "驱魔-战斗阶段：若你赢得一场未进行争夺战的战斗，获得等于你地利位置数的战果",
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
          "activation": {
            "phase": "combat",
          },
          "printedClause": "神职便利-战斗阶段：若你位于侦查，获得2点魔力",
          "execution": {
            "mode": "automatic",
          },
          "conditions": [
            {
              "type": "location_is",
              "locationId": "scouting",
            },
          ],
          "effects": [
            {
              "type": "gain_mana",
              "amount": 2,
            },
          ],
        },
      ],
    },
  },
  "master.ciel.skill.s3": {
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
          "printedClause": "粉碎灵魂-战斗阶段：你的交战对手若未控制【幸运】，其下回合无法从局势牌获得魔力和威力加成",
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
  "master.dan.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "从游戏外将3张远隔操作和2张急行放置于此牌上",
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
          "printedClause": "每回合你至多可将其中的一张牌追加打出（回合结束时该牌进入你的弃牌堆）",
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
          "printedClause": "若如此，抽1张牌并将该牌移除",
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
  "master.darnic.skill.ascension": {
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
          "printedClause": "焦土作战-被动：与你位于同一战场的对手的行动阶段开始时必须花费2点战果维持地利，否则其失去地利",
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
          "printedClause": "空中支援-行动阶段：将你的地利翻倍",
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
      "unmodeledClauses": [
        "（将此牌加入你的技能区）",
      ],
    },
  },
  "master.darnic.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你战场上未被占领的地利将属于你",
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
  "master.darnic.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你赢得一场战斗后，你可以将你的魔力设为4点",
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
          "printedClause": "回合结束时，若你的魔力小于等于2，失去2点战果",
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
  "master.fiore.skill.ascension": {
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
          "printedClause": "行动阶段：进行一次【超越】",
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
          "printedClause": "如果你本回合战败，失去2点战果",
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
  "master.fiore.skill.s1a": {
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
          "printedClause": "前哨阶段：切换下列一项，其效果持续至回合结束",
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
          "printedClause": "1.【瘫痪】→【神经机械学】 2.【温顺】→【决意】 3.【回路不良】→【聪慧头脑】",
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
          "printedClause": "行动阶段：再切换一项，战斗阶段结束后，失去4点魔力",
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
  "master.fiore.skill.s5": {
    "activation": "play",
    "windows": [
      "action",
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
          "printedClause": "（超越后，将此牌加入你的技能区",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "行动阶段：花费1点魔力，沿箭头移动一步",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "行动阶段：若你位于你未部署的战场，获得2点地利",
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
      "unmodeledClauses": [
        "（超越后，将此牌加入你的技能区。）",
      ],
    },
  },
  "master.fiore.skill.s6": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "此牌超越时，选择一名战果高于你的对手",
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
          "printedClause": "若你于本回合战胜了他，获得2点战果",
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
  "master.fiore.skill.s7": {
    "activation": "play",
    "windows": [
      "action",
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
          "printedClause": "（超越后，将此牌加入你的技能区",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "连接强化型魔术礼装-行动阶段：花费1点魔力，你的技能牌威力+1",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "（包括从者技能，【聪慧头脑】与【神经机械学】）",
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
      "unmodeledClauses": [
        "（超越后，将此牌加入你的技能区。）",
      ],
    },
  },
  "master.fou.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "复活吧，我的爱人-每局游戏限一次，当一名玩家即将被淘汰时，防止其淘汰",
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
          "printedClause": "本次淘汰结算后，若该玩家为你的对手，交换你们的战果",
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
          "printedClause": "你们其中一人获得游戏胜利时，另一人也获胜（即使另一人被淘汰）",
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
  "master.fou.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "在你花费了1枚或以上的令咒的回合结束时：选择一个本回合回到你技能区的技能，其获得+1威力和-1魔力消耗直至游戏结束",
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
          "printedClause": "降低过的消耗不能低于其印刷魔力消耗的一半",
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
