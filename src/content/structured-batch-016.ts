import type { ConfirmedSkillOverride } from "./confirmed-skill-overrides.ts";

export const structuredBatch016Overrides: Record<string, ConfirmedSkillOverride> = {
  "servant.molay.skill.sc-molay-4": {
    activation: "phase",
    windows: ["combat"],
    steps: ["player-window"],
    requiresActiveCard: true,
    revealsTrueNameOnPlay: true,
    passiveEventTypes: ["combat.resolved"],
    handlerId: "core.outer-god-life",
    supportLevel: "FULL",
  },
  "servant.passionlip.skill.sc-passionlip-1": {
    activation: "residual",
    requiresActiveCard: true,
    abilities: [{
      id: "alter-ego-transform",
      name: "他人格",
      activation: "optional-trigger",
      windows: ["action"],
      handlerId: "core.alter-ego-transform",
      requiresActiveCard: true,
    }],
    handlerId: "core.alter-ego-transform",
    supportLevel: "FULL",
  },
  "master.sion.skill.s12": {
    activation: "residual",
    requiresActiveCard: true,
    alterEgoCloseSource: false,
    abilities: [{
      id: "alter-ego-transform",
      name: "他人格EX",
      activation: "optional-trigger",
      windows: ["action"],
      abilityCost: 3,
      handlerId: "core.alter-ego-transform",
      requiresActiveCard: true,
    }],
    handlerId: "core.alter-ego-transform",
    supportLevel: "FULL",
  },
  "master.sakura.skill.s1": {
    activation: "passive",
    passiveEventTypes: ["round.ended"],
    activateSkillDefinitionId: "master.sakura.skill.s3",
    handlerId: "core.sakura-corrupted-grail-trigger",
    supportLevel: "FULL",
  },
};
