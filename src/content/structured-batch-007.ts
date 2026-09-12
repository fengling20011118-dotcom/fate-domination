import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

// 批次 007：由 tools/refactor-remaining-skills.py 按牌面原文批量生成（全句覆盖校验）。
// 确定性条款 → automatic（effect DSL 精确表达）；其余 → host_adjudicated + allowedOperations。
// FULL 仅授予整卡所有能力可自动执行且无未建模行的技能。
export const structuredBatch007Overrides: Record<string, ConfirmedSkillOverride> = {
  "master.fujino.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "解锁此技能时，将一张【歪曲之魔眼】的复制加入你的技能区",
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
          "printedClause": "当你因获得【创伤【脊椎】】切换【痛觉】且所有【痛觉】被弃置之后，获得4点战果",
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
  "master.fujino.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "战斗阶段，若你位于战场，随机抽取2张【创伤】，获得其中一张并将另一张洗回【创伤】牌堆",
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
  "master.fujino.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "从魔术工房指向深山町的移动箭头改为指向新都，从新都的改为指向深山町，从深山町的改为指向侦查",
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
          "printedClause": "（同时更改相邻地点关系）",
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
          "printedClause": "修复-任何阶段：关闭【扭曲空间】",
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
  "master.fujino.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【创伤【头部】】获得此牌时，立即随机弃置一张手牌",
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
          "printedClause": "行动阶段开始时，随机弃置一张手牌",
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
          "printedClause": "【创伤【肩部】】你的基础攻击威力-1",
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
          "printedClause": "【创伤【胃部】】+2的魔术工房与+3的地利位置对你视为已被占领，无法部署",
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
          "printedClause": "【创伤【腕部】】当你使用令咒时，失去1点战果",
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
          "printedClause": "【创伤【腿部】】当你于你的回合移动后，失去1点魔力",
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
          "printedClause": "【创伤【脊椎】】将【歪曲之魔眼】加入你的攻击，然后将牌堆中剩余的【创伤】移除游戏并将所有已有的【创伤】切换为【痛觉】",
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
          "printedClause": "【痛觉】唯一：战斗结束后，弃置一张【痛觉】",
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
          "id": "clause-9",
          "kind": "phase_action",
          "printedClause": "失控-你的技能魔力消耗-1",
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
  "master.goetia.skill.ascension": {
    "activation": "passive",
    "windows": [
      "outpost",
    ],
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
          "kind": "phase_action",
          "printedClause": "此牌激活时，立即将此牌加入你的攻击",
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
          "printedClause": "残留：此牌永不关闭",
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
          "kind": "play_trigger",
          "activation": {
            "eventType": "card.played",
          },
          "printedClause": "【魔神柱】获得\"打出时：此牌+4威力",
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
              "type": "source_card_power_bonus",
              "amount": 4,
            },
          ],
        },
        {
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "前哨阶段：花费1点魔力，若你的手牌中没有【魔神柱】，弃置你的所有手牌并抽三张牌",
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
  "master.goetia.skill.s1": {
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
          "printedClause": "将7张【魔神柱】加入攻击",
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
          "printedClause": "回合结束时若你该回合未获得胜利，将一张你控制的【魔神柱】移除游戏，若无法达成，你被淘汰",
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
  "master.goetia.skill.s2": {
    "activation": "passive",
    "windows": [
      "action",
      "combat",
      "outpost",
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
          "printedClause": "【魔神柱巴力】13耗13需1威：残留：此卡的威力不可改变",
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
          "printedClause": "魔神柱只能追加打出并且它们的费用减少X（X=打出的非魔神柱攻击的费用）",
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
          "printedClause": "【魔神柱菲尼克斯】13耗13需1威：残留：此牌的威力不可变动",
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
          "printedClause": "行动阶段：移除一张菲尼克斯以外的激活的魔神柱，获得6点魔力",
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
          "printedClause": "【魔神柱佛钮司】力量5耗5需0威：残留",
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
          "id": "clause-6",
          "kind": "phase_action",
          "printedClause": "战斗阶段：将佛钮司洗入你的牌库并关闭你控制的一张牌",
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
          "id": "clause-7",
          "kind": "phase_action",
          "printedClause": "打出一张牌，支付其费用且使用该牌行动阶段能力",
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
          "printedClause": "【魔神柱佛劳洛斯】迅捷4耗4需0威：残留",
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
          "id": "clause-9",
          "kind": "phase_action",
          "printedClause": "前哨阶段：将佛劳洛斯洗入你的牌库，直到回合结束合计威力+5",
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
          "id": "clause-10",
          "kind": "phase_action",
          "printedClause": "【魔神柱桀派】魔术6耗6需0威：残留：当你输掉战斗时，你可将桀派洗入你的牌库并获得2点战果，如此便可无需于回合结束时将魔神柱移除游戏",
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
          "id": "clause-11",
          "kind": "phase_action",
          "printedClause": "【魔神柱劳姆】特殊2耗2需0威：残留：战斗阶段结束后若你位于侦察，你可将劳姆加入手牌，如此便可无需于回合结束时将魔神柱移除游戏",
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
          "printedClause": "被动/行动阶段：从手牌或场上弃置劳姆，移动至任意地点",
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
          "id": "clause-13",
          "kind": "phase_action",
          "printedClause": "【魔神柱巴巴妥司】3耗3需0威：残留：当你将要获得、失去或支付一枚令咒时，改为获得、失去、支付4点魔力",
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
          "id": "clause-14",
          "kind": "phase_action",
          "printedClause": "行动阶段：将巴巴妥司洗入你的牌库，直到回合结束之前，你拥有的魔力少于8点也可打出技能、你的宝具不会被局势牌禁止使用",
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
  "master.goredolf.skill.ascension": {
    "activation": "passive",
    "passiveEventTypes": ["combat.resolved"],
    "handlerId": "core.goredolf-dont-fall-behind",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "iron-fist-plus-six",
          "kind": "passive",
          "printedClause": "【戈夫铁拳】获得+6威力",
          "execution": { "mode": "automatic" },
          "conditions": [{ "type": "source_owned" }],
          "ruleModifiers": [{
            "id": "goredolf-iron-fist-plus-six",
            "rule": "card_power",
            "operation": "add",
            "scope": { "subject": "controller", "cards": { "definitionIds": ["card.card-gof-fist"] } },
            "value": 6,
            "lifecycle": { "duration": "permanent" }
          }]
        },
        {
          "id": "dont-fall-behind-reward",
          "kind": "passive",
          "activation": { "eventType": "combat.resolved" },
          "printedClause": "当你使用了愚者的决意并赢得了战斗，此战斗的所有败者失去2点战果",
          "execution": { "mode": "automatic" },
          "conditions": [
            { "type": "event_type_is", "eventType": "combat.resolved" },
            { "type": "source_owned" },
            { "type": "player_flag_number_current_round", "key": "goredolfFoolishResolveRound" },
            { "type": "event_player_won_combat" }
          ],
          "effects": [{ "type": "lose_victory_points", "target": { "scope": "event_combat_losers" }, "amount": 2 }]
        },
      ],
    },
  },
  "master.goredolf.skill.s1a": {
    "activation": "phase",
    "windows": [
      "outpost",
    ],
    "steps": [
      "player-window",
    ],
    "abilities": [
      {
        "id": "foolish-resolve-use",
        "name": "前哨阶段：+2合计威",
        "activation": "phase",
        "windows": [
          "outpost",
        ],
      },
    ],
    "handlerId": "core.goredolf-fools-resolve",
    "supportLevel": "FULL",
    "passiveEventTypes": ["combat.resolved"],
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "foolish-resolve-use",
          "kind": "phase_action",
          "activation": {
            "phase": "outpost",
          },
          "printedClause": "前哨阶段：+2合计威力。你本回合必须部署于一处战场且你不能于你的回合移动，若你本回合战败，失去2点战果",
          "execution": { "mode": "automatic" },
          "conditions": [],
          "effects": [
            { "type": "combat_power_bonus", "amount": 2 },
            { "type": "set_player_flag", "target": "controller", "key": "goredolfFoolishResolveRound", "value": { "type": "current_round" } },
            { "type": "set_player_flag", "target": "controller", "key": "mustDeployBattlefieldRound", "value": { "type": "current_round" } },
            { "type": "set_player_flag", "target": "controller", "key": "movementBlockedRound", "value": { "type": "current_round" } }
          ],
        },
        {
          "id": "foolish-resolve-loss",
          "kind": "passive",
          "activation": { "eventType": "combat.resolved" },
          "printedClause": "若你本回合战败，失去2点战果",
          "execution": { "mode": "automatic" },
          "conditions": [
            { "type": "event_type_is", "eventType": "combat.resolved" },
            { "type": "player_flag_number_current_round", "key": "goredolfFoolishResolveRound" },
            { "type": "event_player_lost_combat" }
          ],
          "effects": [{ "type": "lose_victory_points", "target": "controller", "amount": 2 }]
        },
      ],
    },
  },
  "master.hakuno-f.skill.ascension": {
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
          "printedClause": "【Extra】获得：你拥有的魔力少于8点也可使用此牌",
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
          "printedClause": "【CCC】获得：临时打出一张因此弃置的牌的复制",
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
          "printedClause": "【Extella】获得威力+5且你的地利变为0",
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
          "printedClause": "【Link】获得：你的基础攻击威力+1",
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
  "master.hakuno-f.skill.s1": {
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
          "printedClause": "前哨阶段：随机弃置1张手牌",
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
          "printedClause": "选择游戏外的一张【神秘代码】加入技能区，直到你再次使用此效果",
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
          "printedClause": "【神秘代码】为追加打出",
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
  "master.hakuno-f.skill.s2": {
    "activation": "passive",
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
          "printedClause": "（此牌为追加打出）",
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
          "printedClause": "精神同步-被动：你的令咒只可用来移动和支付它来使用某些能力",
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
          "printedClause": "代码_月球驱动-行动阶段：你本回合的攻击增加其自身魔力消耗等值的威力（最多+3）",
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
  "master.hakuno-f.skill.s4": {
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
          "printedClause": "（此牌为追加打出）",
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
          "printedClause": "频率对接-被动：当你移动时，将此牌移除游戏（其可以被再度加入技能区）",
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
          "printedClause": "cc_回复()-战斗阶段：若你战败，获得等于你本回合打出的一张非残留攻击的魔力消耗一半的魔力（向上取整）",
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
  "master.hakuno-f.skill.s5": {
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
          "printedClause": "（此牌为追加打出）",
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
          "printedClause": "应急协议-被动：当你赢得一场战斗时，将此牌移除游戏",
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
          "printedClause": "代码_秘密通道-当一名其他玩家进入你所在的战场时，你可移动至侦查，此时你不计入侦查的人数限制",
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
  "master.hakuno-m.skill.ascension": {
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
          "printedClause": "行动阶段：花费1点魔力，将一张分析牌从一名玩家移动到另一名玩家处",
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
          "printedClause": "每回合你可多次使用此能力",
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
  "master.hakuno-m.skill.s1": {
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
          "printedClause": "战斗阶段：失去2威力然后给你交战的对手一张【分析】牌；或【挑战】与之进行三次猜拳，根据你获胜的次数决定【挑战结果】的全部效果",
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
  "master.hakuno-m.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "0胜：你【败北】",
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
          "printedClause": "1+胜：你总威力+2",
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
          "printedClause": "2+胜：你总威力+3",
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
          "printedClause": "给挑战的对手1张【分析】",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "3+胜：挑战的对手【败北】",
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
  "master.hakuno-m.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当岸波白野【挑战】你时，每持有3张【分析】将使岸波白野获胜一局",
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
          "printedClause": "当你被淘汰时，将你的【分析】按回合顺序传给下一位未被淘汰的岸波白野的对手",
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
  "master.hinako.skill.ascension": {
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
          "printedClause": "将莎士比亚的所有技能牌移除游戏，不再拥有从者牌",
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
          "printedClause": "再次获得【咒血尸解叹歌】，该牌获得：\"行动阶段：花费4X点魔力，你的X张基础牌变为【咒血尸解叹歌】的复制，直至战斗阶段结束并且失去<每局游戏限一次>",
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
  "master.hinako.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "将NPC【始皇帝】加入游戏",
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
          "printedClause": "他负责【中国异闻带】",
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
  "master.hinako.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时，你进行4次扩张",
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
          "printedClause": "当你获胜时，你进行扩张且芥雏子获得3点战果",
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
          "printedClause": "你的合计威力为14（可以被修正）",
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
          "printedClause": "你出现在所有具有【中国】事件牌的地点",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "战力结算时，若你不位于任何地点，获得2点战果",
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
  "master.hinako.skill.s4": {
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
          "printedClause": "扩张-从游戏外的【中国】事件牌中随机抽取一张，展示并将其洗入事件牌堆",
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
          "printedClause": "同时满足【扩张】条件的玩家需要同步执行【扩张】",
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
          "printedClause": "【风暴帝都】战果7：始皇帝于此战斗威力+7",
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
          "printedClause": "战斗结束后将此牌移除游戏，此牌不会因【扩张】再次回到游戏",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "【完美的追求】战果3：始皇帝于此战斗威力+2",
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
          "printedClause": "此战场上，攻击因局势牌和事件牌提升的威力翻倍",
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
          "printedClause": "【长生的追求】战果3：始皇帝于此战斗威力+2",
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
          "printedClause": "任何人于此战斗皆无视【战败】效果",
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
          "printedClause": "【云中行】战果2：始皇帝于此战斗威力+3",
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
          "id": "clause-10",
          "kind": "phase_action",
          "printedClause": "若此战场的玩家本回合只打出了一张正面攻击牌，则他的合计威力+5",
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
          "printedClause": "【日下行】战果2：始皇帝于此战斗威力+3",
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
          "id": "clause-12",
          "kind": "phase_action",
          "printedClause": "若此战场的玩家于本回合进行了【真名解放】，则他的合计威力+5",
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
          "id": "clause-13",
          "kind": "phase_action",
          "printedClause": "【水上行】战果2：始皇帝于此战斗威力+3",
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
          "printedClause": "若此战场的玩家控制的所有攻击印刷威力均为偶数，则他的合计威力+5",
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
          "printedClause": "【宁静】战果1：始皇帝于此战斗威力-3",
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
          "id": "clause-16",
          "kind": "phase_action",
          "printedClause": "力量攻击于此战场禁止打出",
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
          "printedClause": "【深潜】战果1：始皇帝于此战斗威力-3",
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
          "printedClause": "迅捷攻击于此战场禁止打出",
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
          "printedClause": "【博学】战果1：始皇帝于此战斗威力-3",
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
          "id": "clause-20",
          "kind": "phase_action",
          "printedClause": "魔术攻击于此战场禁止打出",
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
  "master.hisui-detective.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "解锁此牌时，你立即切换一张【线索】，然后将一张事件牌弃牌堆的【固有结界】移除游戏",
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
          "printedClause": "若你如此做，你可以于本局游戏重新使用一次携闻而至",
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
  "master.hisui-detective.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时，查看并选择一张事件牌堆内的【固有结界】（或类似事件牌）移除游戏",
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
  "master.hisui-detective.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "每局游戏限一次，所有人的前哨阶段结束时，将一张被移除的【固有结界】放置于一处拥有2+名对手的战场，本回合于该战场获胜的对手在该处留下一枚【线索】",
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
  "master.hisui-detective.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "（将留下此【线索】的嫌疑人记录于此牌上",
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
          "printedClause": "唯一：当翡翠部署于此地点的地利位置时，将一张此地点的【线索】加入其技能区",
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
          "printedClause": "调查-被动：当你进入侦查时，切换此牌",
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
  "master.hisui-detective.skill.s3": {
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
          "printedClause": "完美推理-被动/行动阶段：若此时为第11回合，令嫌疑人淘汰",
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
          "printedClause": "若不为第11回合且嫌疑人与你位于同一战场，你获得5点合计威力并偷取其4点战果",
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
  "master.iliya.skill.ascension": {
    "activation": "passive",
    "passiveEventTypes": [
      "skill.unlocked",
      "round.started",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "third-magic-on-unlock",
          "kind": "passive",
          "printedClause": "解锁此技能后，你立即从手牌、牌库及弃牌堆中移除所有力量牌。",
          "conditions": [
            { "type": "event_type_is", "eventType": "skill.unlocked" },
            { "type": "event_player_is_controller" },
            { "type": "event_definition_is_self" },
          ],
          "effects": [
            { "type": "remove_cards_in_zone", "target": "controller", "zone": "hand", "attributesAny": ["力量"] },
            { "type": "remove_cards_in_zone", "target": "controller", "zone": "deck", "attributesAny": ["力量"] },
            { "type": "remove_cards_in_zone", "target": "controller", "zone": "discard", "attributesAny": ["力量"] },
          ],
          "execution": { "mode": "automatic" },
        },
        {
          "id": "third-magic-basic-power",
          "kind": "passive",
          "printedClause": "你的魔术和特殊属性的基本攻击获得+2威力。",
          "conditions": [
            { "type": "source_owned" },
          ],
          "ruleModifiers": [
            {
              "id": "magic-special-basic-plus-two",
              "operation": "add",
              "rule": "card_power",
              "scope": {
                "subject": "controller",
                "cards": { "basic": true, "attributesAny": ["魔术", "特殊"] },
              },
              "value": 2,
              "lifecycle": { "duration": "permanent" },
            },
          ],
          "execution": { "mode": "automatic" },
        },
        {
          "id": "third-magic-heavens-cup-victory",
          "kind": "passive",
          "printedClause": "当局势牌为天之杯时，未被淘汰的玩家全部获胜。",
          "conditions": [
            { "type": "event_type_is", "eventType": "round.started" },
            { "type": "source_owned" },
            { "type": "current_situation_id_is", "situationId": "situation.sit13" },
          ],
          "effects": [
            { "type": "finish_game", "target": { "scope": "all_players" }, "reason": "master.iliya.third-magic-heavens-cup" },
          ],
          "execution": { "mode": "automatic" },
        },
      ],
      "evidence": [
        {
          "kind": "development-image",
          "document": "Fate_Domination-开发版",
          "category": "master",
          "page": "images/masters/伊莉雅斯菲尔.png",
          "locator": "master.iliya/伊莉雅斯菲尔",
        },
      ],
      "ambiguities": [],
      "unmodeledClauses": [],
    },
  },
  "master.illya-mahou.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "回合结束时，花费3点魔力，否则将此牌移除游戏",
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
          "printedClause": "你从局势牌和事件牌受到的影响翻倍",
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
          "printedClause": "（不包括局势牌的魔力和事件牌的战果）",
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
  "master.illya-mahou.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当有牌将通过万花筒之杖以外的效果进入你的牌库时，改为将其弃置",
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
  "master.illya-mahou.skill.s1a": {
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
          "printedClause": "准备阶段：抽任意张牌",
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
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "准备阶段：花费你手牌数两倍的魔力，将你弃牌堆的牌洗入牌库",
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
            "phase": "preparation",
          },
        },
      ],
    },
  },
  "master.irisviel.skill.ascension": {
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
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "你每回合只能使用此攻击的其中一项能力",
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
          "printedClause": "行动阶段：本回合的一张基础攻击可以保持激活至下回合结束",
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
          "printedClause": "战斗阶段：你的攻击获得魔术属性并且威力+1",
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
      "unmodeledClauses": [
        "（升华技，将此牌加入你的技能区）",
      ],
    },
  },
  "master.jinako.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你可以于前哨阶段选择不进行部署，若如此做，则重新获得【作弊代码转换】",
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
          "printedClause": "你激活的攻击一直保留其原本印刷的属性",
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
  "master.jinako.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时拥有【作弊代码转换】",
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
          "printedClause": "你的基础特殊属性攻击威力增加X点（X=8-2Y【Y=游戏开始时从者牌库中基础特殊属性攻击牌的数量】，且X至少为1",
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
          "printedClause": "当你离开魔术工房时，失去3点魔力",
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
  "master.jinako.skill.s2": {
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
          "printedClause": "<每局游戏一次>",
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
          "printedClause": "行动阶段：本回合你可以将你的非特殊属性基础攻击变为威力相同的特殊属性基础攻击打出",
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
          "printedClause": "（4变为【幸运】，3变为【急行】，2变为【远隔操作】，你需要支付它们变更后的魔力",
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
  "master.julius.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "安全增强方案-当你使用【潜行】时，可以部署于魔术工房",
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
          "printedClause": "隐身增强方案-当你使用【潜行】时，可以花费2点魔力，改为于自己的战斗阶段中进行部署",
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
  "master.julius.skill.s1": {
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
          "printedClause": "前哨阶段：本阶段不进行部署，于你的行动阶段开始时部署于一处战场",
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
      ],
    },
  },
  "master.julius.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "每回合结束时移除你弃牌堆中两张牌或随机弃置一张牌",
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
          "printedClause": "若无法执行，需要先抽一张牌",
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
  "master.kadoc.skill.ascension": {
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
          "printedClause": "被动：你位于【俄罗斯】战场时合计威力+5",
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
          "printedClause": "行动阶段：将一张【俄罗斯】事件牌从游戏外放入你所在的战场（视为一次扩张）",
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
          "printedClause": "若你无法做到，改为获得5点战果",
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
  "master.kadoc.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你负责【俄罗斯异闻带】",
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
          "printedClause": "当你赢得一场战斗时，进行【扩张】",
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
          "printedClause": "在游戏开始时，【扩张】两次",
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
          "printedClause": "你不会受到【俄罗斯】事件牌的影响",
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
  "master.kadoc.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "扩张-抽2张事件牌并展示",
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
          "printedClause": "你可以将游戏外的【俄罗斯】事件牌替换其中一张，然后将它们洗回事件牌堆",
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
          "printedClause": "同时满足【扩张】条件的玩家需要同步执行【扩张】",
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
  "master.kadoc.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【俄罗斯事件牌】战果1，数量5",
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
          "printedClause": "部署于此战场的玩家立即失去2点魔力",
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
          "printedClause": "进入此战场的玩家失去2点魔力",
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
  "master.kadoc.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【俄罗斯事件牌】战果3，数量2",
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
          "printedClause": "玩家无法从此战场离开",
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
          "printedClause": "此战场的战败者失去3点战果",
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
  "master.kadoc.skill.s5": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【俄罗斯事件牌】战果5，数量2",
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
          "printedClause": "在此战场发生战斗后，不位于此战场的玩家失去2点战果",
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
          "printedClause": "不位于任何战场的玩家失去所有本回合获得的战果",
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
  "master.kariya.skill.ascension": {
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
          "printedClause": "你的基础牌的魔力消耗+3且威力+4",
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
          "printedClause": "行动阶段：如果你已【崩坏】，你可花费4点魔力将牌堆顶的那张牌加入攻击",
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
          "printedClause": "战斗阶段：如果你在【魔术工房】，你可以移动至宿敌所在的战场",
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
  "master.kariya.skill.s4": {
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
          "printedClause": "准备阶段：将你技能区的牌与手牌混洗之后，随机抽取一张牌并展示",
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
        {
          "id": "clause-2",
          "kind": "phase_action",
          "printedClause": "若该牌是攻击牌，则你本回合必须在常规出牌时将其打出（可以暗置）且该牌获得“此牌获得+3威力”",
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
          "printedClause": "该效果具有强制性",
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
  "master.kayneth.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你的所有攻击牌可以残留至下回合结束",
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
          "printedClause": "当你从从者牌库中抽到【月灵髓液】时，你可以将其展示并再抽一张牌",
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
  "master.kayneth.skill.s2": {
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
          "printedClause": "游戏开始时，将6张【月灵髓液】洗成一副独立的牌库",
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
          "printedClause": "行动阶段：从独立牌库抽一张【月灵髓液】",
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
  "master.kayneth.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "若你可以部署于一名战果低于你且独自位于战场的其他玩家所在的战场，则你必须部署",
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
  "master.kiara.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "解锁此技能后，立即移除一张【秘密花园】并获得4点战果",
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
          "printedClause": "当你激活【天堂之孔】时，莎士比亚的技能不计入你拥有的技能，不占用技能位",
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
  "master.kiara.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "游戏开始时将6张【秘密花园】依轮次随机暗置于其他玩家处",
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
          "printedClause": "他们可查看自己的【秘密花园】",
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
          "printedClause": "在游戏第八回合结束后激活【天堂之孔】",
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
  "master.kiara.skill.s1a": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你输给一位拥有暗置【秘密花园】的对手时，展示其一张【秘密花园】",
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
  "master.kiara.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【无限的恐惧】战果3：当【钻石领域】放置入场时，展示此牌",
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
          "printedClause": "当【钻石领域】打出时，杀生院以外的玩家抽3张牌",
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
          "printedClause": "当此牌因【五停心观】展开时，若杀生院本回合未进行移动，其获得3点战果",
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
          "printedClause": "【征服欲】战果2：当【此世全部之欲】放置入场时，展示此牌",
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
          "id": "clause-5",
          "kind": "phase_action",
          "printedClause": "【此世全部之欲】的威力-6",
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
          "printedClause": "当此牌因【五停心观】展开时，若杀生院本回合未进行移动，其获得2点战果",
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
          "printedClause": "【控制欲】战果2：当【此世全部之欲】放置入场时，展示此牌",
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
          "id": "clause-8",
          "kind": "phase_action",
          "printedClause": "当玩家移动至杀生院所在的地点时，【此世全部之欲】不触发效果",
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
          "printedClause": "【过往的遗憾】战果1：当【胎藏界】放置入场时，展示此牌",
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
          "id": "clause-11",
          "kind": "phase_action",
          "printedClause": "【胎藏界】无法在其打出的时候弃置事件牌",
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
          "printedClause": "当此牌因【五停心观】展开时，若杀生院本回合未进行移动，其获得1点战果",
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
          "id": "clause-13",
          "kind": "phase_action",
          "printedClause": "【逃避现实】战果1：当【胎藏界】放置入场时，展示此牌",
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
          "id": "clause-14",
          "kind": "phase_action",
          "printedClause": "【胎藏界】无法在行动阶段开始时弃置事件牌",
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
          "id": "clause-16",
          "kind": "phase_action",
          "printedClause": "【未来的恐惧】战果1：当【胎藏界】放置入场时，展示此牌",
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
          "id": "clause-17",
          "kind": "phase_action",
          "printedClause": "【胎藏界】无法在战斗阶段开始时弃置事件牌",
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
  "master.kiara.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "移除任意数量的技能牌，然后将【胎藏界】【钻石领域】【此世全部之欲】补充至你的技能区达到3个技能",
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
          "printedClause": "你在准备阶段即进行你的前哨及行动阶段",
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
  "master.kiara.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当你打出此牌时，下个玩家行动阶段开始时，战斗阶段开始时，你可以弃置一张事件牌，然后抽一新事件牌代替",
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
          "printedClause": "获得你因此能力弃置的所有事件牌战果数的合计威力",
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
  "master.kiara.skill.s5": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "残留：玩家们无法通过【无限的恐惧】以外的方式抽牌",
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
          "printedClause": "玩家们每回合可以打少于两张牌",
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
          "printedClause": "当你【败北】时，此牌威力-5，且你无视【败北】与相应效果",
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
  "master.kiara.skill.s6": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "当玩家部署于你所在的地点将移除游戏他们的一张【秘密花园】，如果他们无法移除则【败北】",
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
          "printedClause": "当有玩家移动至你所在的地点，将弃置他们的所有手牌，如果他们弃置的手牌数低于3张则【败北】",
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
  "master.kohaku.skill.ascension": {
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
          "printedClause": "（将此卡加入你的技能区）",
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
          "printedClause": "行动阶段：使用至多2张【魔力猛攻】",
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
          "printedClause": "战斗阶段：与你交战的对手地利小于你则合计威力-4",
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
          "printedClause": "如果你获胜，所有位于魔术工房的玩家获得【燃尽的工房】",
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
        "（将此卡加入你的技能区）",
      ],
    },
  },
  "master.kohaku.skill.s3": {
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
          "printedClause": "你无法部署于魔术工房，且你通过局势牌获得的魔力减半",
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
          "printedClause": "行动阶段：本回合你只能使用一张正面向上的攻击",
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
          "printedClause": "如果你在战斗阶段后位于【深山町】，则在本回合结束后将此卡移出游戏",
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
  "master.kuzuki.skill.ascension": {
    "activation": "passive",
    "windows": [
      "combat",
    ],
    "passiveEventTypes": [
      "skill.unlocked",
    ],
    "handlerId": "core.structured-skill",
    "supportLevel": "FULL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "perfect-breath-on-unlock",
          "kind": "passive",
          "printedClause": "解锁此技能后立刻从牌库，弃牌堆及手牌中移除所有魔术牌。",
          "conditions": [
            { "type": "event_type_is", "eventType": "skill.unlocked" },
            { "type": "event_player_is_controller" },
            { "type": "event_definition_is_self" },
          ],
          "effects": [
            { "type": "remove_cards_in_zone", "target": "controller", "zone": "deck", "attributesAny": ["魔术"] },
            { "type": "remove_cards_in_zone", "target": "controller", "zone": "discard", "attributesAny": ["魔术"] },
            { "type": "remove_cards_in_zone", "target": "controller", "zone": "hand", "attributesAny": ["魔术"] },
          ],
          "execution": {
            "mode": "automatic",
          },
        },
        {
          "id": "perfect-breath-continuous",
          "kind": "passive",
          "printedClause": "迅捷基础牌威力+3。你的【蛇】获得以下效果“被动/战斗阶段：花费6点魔力，将此牌加入你的攻击中。”",
          "conditions": [
            { "type": "source_owned" },
          ],
          "ruleModifiers": [
            {
              "id": "quick-basic-power-plus-three",
              "operation": "add",
              "rule": "card_power",
              "scope": {
                "subject": "controller",
                "cards": { "basic": true, "attributesAny": ["迅捷"] },
              },
              "value": 3,
              "lifecycle": { "duration": "permanent" },
            },
          ],
          "transforms": [
            {
              "id": "grant-snake-combat-join",
              "type": "card",
              "target": {
                "subject": "controller",
                "cards": { "definitionIds": ["master.kuzuki.skill.s3"] },
              },
              "grantAbilities": [
                {
                  "id": "perfect-breath-snake-join",
                  "name": "完美呼吸·蛇",
                  "activation": { "phase": "combat" },
                  "handlerId": "core.kuzuki-snake-join",
                  "allowedZones": ["hand", "master-skills", "servant-skills"],
                  "allowInactive": true,
                },
              ],
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
          "page": "images/masters/葛木宗一郎.png",
          "locator": "master.kuzuki/葛木宗一郎",
        },
        {
          "kind": "fqa",
          "document": "Fate_Domination FQA.docx",
          "locator": "被动技能 / 激活的卡 / 加入攻击、创造并激活、打出",
        },
        {
          "kind": "keywords",
          "document": "玩家回合流程和关键词.txt",
          "locator": "被动/XX阶段",
        },
      ],
      "ambiguities": [],
      "unmodeledClauses": [],
    },
  },
  "master.kuzuki.skill.s2": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你无法通过部署于魔术工房获得魔力，但你以常规移动从魔术工房离开时-1移动成本",
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
          "printedClause": "每回合战斗阶段结束后，若你于该回合未获得战果，获得1点战果，若你同时是位于魔术工房的唯一玩家，改为获得2点战果",
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
  "master.maiya.skill.ascension": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "解锁此技能后，立即从手牌、牌库和弃牌堆移除所有魔术牌，每以此法移除一张魔术牌，你获得2点魔力",
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
          "printedClause": "然后将游戏外的一张【射击】加入你的技能区",
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
  "master.maiya.skill.s1": {
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
          "printedClause": "你拥有【援护射击】",
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
          "printedClause": "前哨阶段：若你不位于战场，花费2点魔力，将【援护射击】加入一名其他玩家的攻击，回合结束时令其返回你的技能区",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "若如此做，你本回合无法成为战斗的胜者",
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
  "master.maiya.skill.s2": {
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
          "printedClause": "迅捷属性，2魔耗2需0威力",
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
          "id": "clause-3",
          "kind": "phase_action",
          "printedClause": "压制-行动阶段：若你不是久宇舞弥，你需向其支付2点战果使用此效果",
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
          "id": "clause-4",
          "kind": "phase_action",
          "printedClause": "获得+1基础地利后，翻倍你的地利",
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
  "master.miyu.skill.ascension": {
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
          "printedClause": "解锁此牌后立刻将美游所有的【梦幻召唤】从游戏外加入手牌",
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
          "printedClause": "前哨阶段：弃置1张牌，抽2张牌",
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
  "master.miyu.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "美游的从者是【魔法蓝宝石】",
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
          "printedClause": "游戏开始时，从未被抽取的从者中抽取3名并选择他们的3个技能构筑你的技能区",
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
          "printedClause": "【魔法蓝宝石】额外获得被抽取的从者的名称和职阶",
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
  "master.miyu.skill.s2": {
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
          "printedClause": "被动/前哨阶段：弃置此牌，抽2张牌",
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
          "printedClause": "被动/前哨阶段：将此牌与游戏开始时你所抽取从者的牌堆中的牌或游戏外的【梦幻召唤】交换",
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
      ],
    },
  },
  "master.miyu.skill.s3": {
    "activation": "passive",
    "windows": [
      "combat",
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
          "printedClause": "【梦幻召唤-剑士】特殊0耗0需3威：每回合只能进行1次【梦幻召唤】<每局游戏限一次>",
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
          "printedClause": "战斗阶段：将同一战场所有对手的魔术属性威力变为0",
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
          "printedClause": "【梦幻召唤-枪兵】特殊0耗0需4威：每回合只能进行1次【梦幻召唤】<每局游戏限一次>",
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
          "printedClause": "行动阶段：移动到【魔术工房】以外的任何地点",
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
          "printedClause": "【梦幻召唤-弓兵】力量/迅捷/魔术0耗0需4威：每回合只能进行1次【梦幻召唤】<每局游戏限一次>",
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
          "printedClause": "行动阶段：将你的地利翻倍",
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
          "id": "clause-7",
          "kind": "phase_action",
          "printedClause": "【梦幻召唤-骑兵】特殊0耗0需0威：每回合只能进行1次【梦幻召唤】<每局游戏限一次>",
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
          "printedClause": "行动阶段：从手牌中打出至多3张基本威力3及以下的牌",
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
          "id": "clause-9",
          "kind": "phase_action",
          "printedClause": "【梦幻召唤-魔术师】魔术0耗0需2威：每回合只能进行1次【梦幻召唤】<每局游戏限一次>",
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
          "id": "clause-10",
          "kind": "phase_action",
          "printedClause": "残留：当你打出另一张非基础攻击时关闭此牌",
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
          "id": "clause-11",
          "kind": "phase_action",
          "printedClause": "令那张牌获得获得威力+2或费用-3",
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
          "id": "clause-12",
          "kind": "phase_action",
          "printedClause": "【梦幻召唤-暗杀者】迅捷0耗0需2威：每回合只能进行1次【梦幻召唤】<每局游戏限一次>",
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
          "printedClause": "战斗阶段：与你交战的对手本回合每使用过一张技能牌，便偷取他们的1点战果",
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
  "master.ophelia.skill.ascension": {
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
          "printedClause": "毁灭的开始-若你赢得胜利，于战斗阶段结束时将该战场的事件牌移除游戏，它们不会因【扩张】再次加入游戏，每有1张因此效果而移除的事件牌，此牌获得威力+3",
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
        "（将此牌加入你的技能区）",
      ],
    },
  },
  "master.ophelia.skill.s1": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "你负责【北欧异闻带】",
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
          "printedClause": "当你赢得一场战斗时，进行【扩张】",
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
  "master.ophelia.skill.s2": {
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
          "printedClause": "<每局游戏限两次>",
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
          "printedClause": "无光于前-行动阶段：花费2点魔力，与你位于同一战场的对手的攻击威力无法被其他牌增加",
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
  "master.ophelia.skill.s3": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "扩张-抽2张事件牌并展示",
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
          "printedClause": "你可以将游戏外的【北欧】事件牌替换其中一张，然后将它们洗回事件牌堆",
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
          "printedClause": "同时满足【扩张】条件的玩家需要同步执行【扩张】",
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
  "master.ophelia.skill.s4": {
    "activation": "passive",
    "handlerId": "core.structured-skill",
    "supportLevel": "PARTIAL",
    "rules": {
      "schemaVersion": "fd-card-authoring-v1",
      "abilities": [
        {
          "id": "clause-1",
          "kind": "phase_action",
          "printedClause": "【北欧事件牌】战果0，数量3",
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
          "printedClause": "战斗阶段结束将此牌移除游戏",
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
          "printedClause": "此牌不会因【扩张】再次加入游戏",
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
