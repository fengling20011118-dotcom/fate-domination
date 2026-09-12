import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

export const structuredMasterBatchOverrides: Record<string, ConfirmedSkillOverride> = {
  "master.kirei.skill.ascension": {
    activation: "phase", windows: ["combat"], steps: ["player-window"],
    requiresActiveCard: true,
    basicCardPowerBonus: 2,
    basicCardPowerBonusCondition: { playerFlagEquals: { key: "kireiRole", value: "executor" } },
    playerDefeatIgnoreCondition: { playerFlagEquals: { key: "kireiRole", value: "executor" } },
    abilities: [
      {
        id: "overseer-execution",
        name: "监督者处决",
        activation: "phase",
        windows: ["combat"],
        steps: ["player-window"],
        requiresActiveCard: true,
        revealsTrueNameOnSkillUse: true,
      },
      {
        id: "executor-basic-aura",
        name: "执行者",
        activation: "passive",
        windows: [],
        requiresActiveCard: true,
      },
    ],
    handlerId: "core.structured-skill", supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [
        {
          id: "overseer-execution", kind: "phase_action", activation: { phase: "combat" },
          printedClause: "当你为【监督者】时，战斗阶段：可【真名解放】使与你位于同一战场的一名玩家【败北】。",
          execution: { mode: "automatic" },
          conditions: [
            { type: "source_active" },
            { type: "player_flag_equals", key: "kireiRole", value: "overseer" },
          ],
          targets: [{ id: "targetPlayerId", type: "player", scope: "same_battlefield_players" }],
          effects: [
            { type: "defeat_player", target: { scope: "selected_same_battlefield_player" } },
            { type: "set_player_flag", key: "kireiRole", value: "executor" },
          ],
          visibility: { revealsTrueName: true, revealTiming: "on_resolve", revealScope: "servant_package" },
        },
        {
          id: "executor-basic-aura", kind: "passive",
          printedClause: "当你为【执行者】时，你的所有基础攻击牌威力+2且无视【败北】。",
          execution: { mode: "automatic" },
          conditions: [
            { type: "source_active" },
            { type: "player_flag_equals", key: "kireiRole", value: "executor" },
          ],
          effects: [
            {
              type: "info_note",
              note: "由 basicCardPowerBonusCondition 与 playerDefeatIgnoreCondition 执行：本激活技能卡仅在控制者为执行者时使其基础攻击牌威力+2并无视败北。",
            },
          ],
        },
      ],
    },
  },
  "master.waver.skill.s3": {
    activation: "phase", windows: ["outpost"], steps: ["player-window"],
    handlerId: "core.structured-skill", supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "investigate", kind: "phase_action", activation: { phase: "outpost" },
        printedClause: "查看一位玩家的手牌。你可选择其中一张牌放于其拥有的牌库顶部，若如此，下回合你不可进行【调查】。",
        execution: { mode: "automatic" },
        conditions: [{ type: "player_flag_number_not_current_round", key: "investigationBlockedRound" }],
        targets: [{ id: "targetPlayerId", type: "player", scope: "all_players" }],
        effects: [{
          type: "choose_cards", target: { scope: "selected_any_player" }, zone: "hand",
          visibility: "private_to_controller", minCount: 0, maxCount: 1,
          then: [
            { type: "move_selected_cards", target: { scope: "selected_any_player" }, zone: "hand", destination: "deck", position: "top", count: 1 },
            { type: "set_player_flag", key: "investigationBlockedRound", value: { type: "current_round", offset: 1 } },
          ],
        }],
      }],
    },
  },
  "master.kohaku.skill.s1a": {
    activation: "phase", windows: ["action"], steps: ["player-window"],
    handlerId: "core.structured-skill", supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "empath", kind: "phase_action", activation: { phase: "action" },
        printedClause: "行动阶段：弃置一张与你控制的攻击完全相同的手牌，获得+2合计威力和1点魔力。\n【魔力猛攻】为牌库牌，抽到手牌后于战斗时打出。",
        execution: { mode: "automatic" },
        effects: [{
          type: "choose_cards", target: "controller", zone: "hand", matchesControlledAttack: true,
          visibility: "private_to_controller", minCount: 1, maxCount: 1,
          then: [
            { type: "move_selected_cards", target: "controller", zone: "hand", matchesControlledAttack: true, destination: "discard", count: 1 },
            { type: "combat_power_bonus", amount: 2 },
            { type: "gain_mana", amount: 1 },
          ],
        }],
      }],
    },
  },
  "master.shiki-ryougi.skill.s3": {
    activation: "phase", windows: ["action"], steps: ["player-window"],
    requiresActiveCard: true,
    handlerId: "core.structured-skill", supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "grip", kind: "phase_action", activation: { phase: "action" }, requiresActiveCard: true,
        printedClause: "此牌需追加打出。\n行动阶段：查看一名与你位于同一战场的玩家的手牌，你可将其中一张牌洗回其所有者的牌库。",
        execution: { mode: "automatic" },
        conditions: [{ type: "at_battlefield" }],
        targets: [{ id: "targetPlayerId", type: "player", scope: "same_battlefield_players" }],
        effects: [{
          type: "choose_cards", target: { scope: "selected_same_battlefield_player" }, zone: "hand",
          visibility: "private_to_controller", minCount: 0, maxCount: 1,
          then: [
            { type: "move_selected_cards", target: { scope: "selected_same_battlefield_player" }, zone: "hand", destination: "deck", position: "shuffle", count: 1 },
          ],
        }],
      }],
    },
  },
  "master.sion.skill.s16": {
    activation: "phase", windows: ["action"], steps: ["player-window"],
    handlerId: "core.structured-skill", supportLevel: "FULL",
    rules: {
      schemaVersion: "fd-card-authoring-v1",
      abilities: [{
        id: "abyss-gaze", kind: "phase_action", activation: { phase: "action" },
        printedClause: "凝视深渊-行动阶段：你所在地点的所有玩家弃置所有手牌。你可花费2点魔力，将目标更改为\"游戏内的所有玩家\"。",
        execution: { mode: "automatic" },
        effects: [{
          type: "choose_one",
          options: [
            { id: "same-location", effects: [{ type: "discard_all_hand", target: { scope: "same_location_players" } }] },
            { id: "all-players", effects: [{ type: "pay_mana", amount: 2 }, { type: "discard_all_hand", target: { scope: "all_players" } }] },
          ],
        }],
      }],
    },
  },
};
