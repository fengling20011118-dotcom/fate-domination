import { GAME_STATUS } from "../core/constants.js";

export class SkillRuntime {
  constructor(registry) {
    this.registry = registry;
  }

  getLegalActivations(state, playerId, ownedSkillIds) {
    if (state.status !== GAME_STATUS.PLAYING || state.pendingChoice) return [];
    if (state.turnOrder[state.activeSeat] !== playerId) return [];

    const player = state.players[playerId];
    if (!player || player.eliminated) return [];

    return ownedSkillIds.flatMap((skillId) => {
      const skill = this.registry.get(skillId);
      if (!skill || !this.#isPlayerActivated(skill)) return [];
      if (!(skill.activation.windows ?? []).includes(state.phase)) return [];
      if (!this.registry.hasHandler(skill.handler)) return [];
      if (!this.#canPay(player, skill)) return [];
      if (this.#isUsed(state, player, skill)) return [];

      return [
        {
          type: "skill.activate",
          skillId: skill.id,
          playerId,
          cost: structuredClone(skill.cost ?? {}),
        },
      ];
    });
  }

  #isPlayerActivated(skill) {
    return skill.activation.kind === "active" || skill.activation.kind === "optional-trigger";
  }

  #canPay(player, skill) {
    const manaCost = Number(skill.cost?.mana ?? 0);
    const victoryPointCost = Number(skill.cost?.victoryPoints ?? 0);
    return player.mana >= manaCost && player.victoryPoints >= victoryPointCost;
  }

  #isUsed(state, player, skill) {
    const usage = player.usage[skill.id];
    if (!usage) return false;
    if (skill.limit === "once-per-game") return Boolean(usage.used);
    if (skill.limit === "once-per-round") return usage.round === state.round;
    return false;
  }
}
