import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

export const structuredBatch018Overrides: Record<string, ConfirmedSkillOverride> = {
  "master.sion.skill.s8": {
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    requiresActiveCard: true,
    limit: "once-per-round",
    playDrawIfWithBasicAttack: 1,
    appendFromHand: { maxCount: 3, maxBasePower: 3 },
    abilities: [
      {
        id: "delayed-summon",
        name: "延时召唤",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.riding",
    supportLevel: "FULL",
  },
  "master.sion.skill.s11": {
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    requiresActiveCard: true,
    requiresEightMana: false,
    abilities: [
      {
        id: "madness-enhancement",
        name: "狂化",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "madness-enhancement",
          kind: "phase_action",
          activation: { phase: "action" },
          printedClause: "狂化-行动阶段：以背面朝上抽取至多三张牌并将其移除（以此方法被移除的牌不触发任何卡牌效果），你每以此法抽一张牌，此牌+4威力。",
          execution: { mode: "automatic" },
          conditions: [{ type: "source_active" }],
          effects: [
            {
              type: "choose_cards",
              target: "controller",
              zone: "deck",
              visibility: "private_to_controller",
              minCount: 0,
              maxCount: 3,
              payloadKey: "madnessRemovedInstanceIds",
              then: [
                {
                  type: "remove_selected_cards",
                  zone: "deck",
                  payloadKey: "madnessRemovedInstanceIds",
                  minCount: 0,
                  maxCount: 3,
                },
                {
                  type: "source_card_power_bonus",
                  id: "madness-enhancement",
                  amount: { type: "payload_count", key: "madnessRemovedInstanceIds", multiply: 4 },
                  duration: "game",
                },
              ],
            },
          ],
        },
      ],
    },
  },
  "master.sion.skill.s9": {
    activation: "residual",
    passiveEventTypes: ["player.deployed", "combat.resolved"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "territory-expansion-workshop",
        name: "领域扩张：工房部署",
        activation: "passive",
        windows: [],
        requiresActiveCard: true,
      },
      {
        id: "territory-expansion-growth",
        name: "领域扩张：胜利成长",
        activation: "passive",
        windows: [],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.sion-territory-expansion-ex",
    supportLevel: "FULL",
  },
  "master.chaos.skill.s12": {
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "rush",
        name: "突进",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "rush",
          kind: "phase_action",
          activation: { phase: "action" },
          printedClause: "【兽】在1~8内自由选择X。突进-行动阶段：沿着箭头移动至多X步。此牌获得1+X威力。",
          execution: { mode: "automatic" },
          conditions: [{ type: "source_active" }],
          effects: [
            {
              type: "move_forward",
              target: "controller",
              steps: { type: "payload_number", key: "x", min: 1, max: 8 },
            },
            {
              type: "source_card_power_bonus",
              id: "rush",
              amount: { type: "payload_number_plus", key: "x", add: 1, min: 2, max: 9 },
              duration: "game",
            },
          ],
        },
      ],
    },
  },
  "master.chaos.skill.s5": {
    activation: "residual",
    passiveEventTypes: ["player.deployed", "player.moved"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "shadow-trap",
        name: "诱捕",
        activation: "passive",
        windows: [],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.chaos-shadow-trap",
    supportLevel: "FULL",
  },
  "master.chaos.skill.s13": {
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    requiresActiveCard: true,
    abilities: [
      {
        id: "calamity-crossing",
        name: "过境",
        activation: "phase",
        windows: ["action"],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill",
    supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "calamity-crossing",
          kind: "phase_action",
          activation: { phase: "action" },
          printedClause: "【兽】自由选择X。过境-行动阶段：弃置一张你所在战场战果点数为X+2的事件牌。",
          execution: { mode: "automatic" },
          conditions: [
            { type: "source_active" },
            { type: "at_battlefield" },
          ],
          effects: [
            {
              type: "discard_current_event_by_victory_points",
              victoryPoints: { type: "payload_number_plus", key: "x", add: 2, min: 2 },
            },
          ],
        },
      ],
    },
  },
  "master.wodime.skill.ascension": {
    activation: "passive",
    passiveEventTypes: ["combat.resolved"],
    abilities: [
      {
        id: "grand-designation-extra-round",
        name: "冠位指定",
        activation: "passive",
        windows: [],
      },
    ],
    handlerId: "core.wodime-lostbelt-system",
    supportLevel: "FULL",
  },
  "master.ryuunosuke.skill.ascension": {
    activation: "phase",
    windows: ["action"],
    steps: ["player-window"],
    abilityCost: 0,
    passiveEventTypes: ["phase.transitioned"],
    abilities: [
      {
        id: "blasphemer",
        name: "渎神者",
        activation: "phase",
        windows: ["action"],
        steps: ["player-window"],
        abilityCost: 0,
      },
      {
        id: "blasphemer-combat-punishment",
        name: "渎神者：战斗惩罚",
        activation: "passive",
        windows: [],
      },
    ],
    handlerId: "core.ryuunosuke-blasphemer",
    supportLevel: "FULL",
  },
};
