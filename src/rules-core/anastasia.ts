import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { clearCardTextSuppressionBySource, suppressCardText } from "./card-text.ts";
import type { SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const ANASTASIA_CASTER_CLASS_ID = "servant.anastasia.skill.sc-anastasia-1";
export const ANASTASIA_KREMLIN_ID = "servant.anastasia.skill.sc-anastasia-2";
export const ANASTASIA_VIY_ID = "servant.anastasia.skill.sc-anastasia-3";
export const ANASTASIA_KREMLIN_HANDLER = "core.anastasia-sumerki-kremlin";
export const ANASTASIA_VIY_HANDLER = "core.anastasia-viy";

const KREMLIN_COMBAT_ABILITY = "kremlin-combat";
const VIY_COMBAT_ABILITY = "viy-eyes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function physicalSkillMatches(card: CardInstance, skillId: string, definitions: Record<string, CardDefinition>): boolean {
  const definition = definitions[card.definitionId];
  return card.definitionId === skillId || card.definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedPhysicalSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  const ids = [...new Set([...player.masterSkills, ...player.servantSkills, ...player.hand, ...player.attack])];
  return ids.map((instanceId) => state.cards[instanceId]).find((card) => Boolean(card
    && card.ownerPlayerId === player.id
    && card.zone !== "removed"
    && card.zone !== "discard"
    && physicalSkillMatches(card, skillId, definitions)));
}

function activeOwnedSkill(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return player.attack.map((instanceId) => state.cards[instanceId]).find((card) => Boolean(card
    && card.ownerPlayerId === player.id
    && card.controllerPlayerId === player.id
    && card.zone === "attack"
    && card.active
    && card.face === "up"
    && physicalSkillMatches(card, skillId, definitions)));
}

function sameBattlefieldOpponents(state: GameState, player: PlayerState): PlayerState[] {
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city") return [];
  return (state.board.locations[locationId] ?? [])
    .filter((playerId) => playerId !== player.id)
    .map((playerId) => state.players[playerId])
    .filter((candidate): candidate is PlayerState => Boolean(candidate && !candidate.eliminated));
}

function absoluteFreezeModifierPrefix(playerId: string): string {
  return `${ANASTASIA_KREMLIN_ID}:absolute-freeze:${playerId}:`;
}

function ensureAbsoluteFreezeModifier(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  const kremlin = ownedPhysicalSkill(state, player, ANASTASIA_KREMLIN_ID, definitions);
  const caster = ownedPhysicalSkill(state, player, ANASTASIA_CASTER_CLASS_ID, definitions);
  const prefix = absoluteFreezeModifierPrefix(player.id);
  if (!kremlin || !caster || Number(player.flags.anastasiaAbsoluteFreezeEndedRound ?? -1) === state.round) {
    state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => !modifier.id.startsWith(prefix));
    if (caster) clearCardTextSuppressionBySource(state, caster.instanceId);
    return caster;
  }
  const id = `${prefix}${state.round}:${caster.instanceId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => !modifier.id.startsWith(prefix) || modifier.id === id);
  if (!(state.activeRuleModifiers ?? []).some((modifier) => modifier.id === id)) {
    state.activeRuleModifiers.push({
      id,
      sourceId: ANASTASIA_KREMLIN_ID,
      sourceInstanceId: caster.instanceId,
      controllerPlayerId: player.id,
      operation: "forbid",
      rule: "card_text",
      scope: {
        subject: "opponents_at_source_location",
        cards: { skill: false, zones: ["attack"], attributesAny: ["特殊"] },
      },
      duration: "while-source-active",
      createdRound: state.round,
    });
  }
  return caster;
}

function syncAbsoluteFreezeMarkers(
  state: GameState,
  player: PlayerState,
  definitions: Record<string, CardDefinition>,
  caster: CardInstance | undefined,
): void {
  if (!caster) return;
  clearCardTextSuppressionBySource(state, caster.instanceId);
  if (Number(player.flags.anastasiaAbsoluteFreezeEndedRound ?? -1) === state.round
    || caster.zone !== "attack" || !caster.active || caster.face !== "up" || !player.locationId) return;
  for (const target of Object.values(state.players)) {
    if (target.id === player.id || target.eliminated || target.locationId !== player.locationId) continue;
    for (const instanceId of target.attack) {
      const card = state.cards[instanceId];
      const definition = card ? definitions[card.definitionId] : undefined;
      if (!card || !definition || card.zone !== "attack" || !card.active || card.face !== "up" || definition.isSkill === true) continue;
      if (!getCardInstanceAttributes(card, definition, state, definitions).includes("特殊")) continue;
      suppressCardText(card, caster.instanceId);
    }
  }
}

function maintainAbsoluteFreeze(state: GameState, player: PlayerState, eventType: string | undefined, definitions: Record<string, CardDefinition>): void {
  if (eventType === "combat.ending") {
    player.flags.anastasiaAbsoluteFreezeEndedRound = state.round;
    const caster = ownedPhysicalSkill(state, player, ANASTASIA_CASTER_CLASS_ID, definitions);
    if (caster) clearCardTextSuppressionBySource(state, caster.instanceId);
    const prefix = absoluteFreezeModifierPrefix(player.id);
    state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => !modifier.id.startsWith(prefix));
    return;
  }
  if (eventType === "round.started" || eventType === "game.started") delete player.flags.anastasiaAbsoluteFreezeEndedRound;
  const caster = ensureAbsoluteFreezeModifier(state, player, definitions);
  syncAbsoluteFreezeMarkers(state, player, definitions, caster);
}

/** Sumerki Kremlin: Absolute Freeze maintenance plus the optional Combat type restriction. */
export const useAnastasiaSumerkiKremlin: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions) throw new Error("ANASTASIA_KREMLIN_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  if (eventType) {
    maintainAbsoluteFreeze(state, player, eventType, definitions);
    return;
  }
  if (data.abilityId !== KREMLIN_COMBAT_ABILITY || state.phase !== "combat") throw new Error("ANASTASIA_KREMLIN_ABILITY_INVALID");
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("ANASTASIA_KREMLIN_SOURCE_INACTIVE");
  const opponents = sameBattlefieldOpponents(state, player);
  if (opponents.length === 0) throw new Error("ANASTASIA_KREMLIN_NO_FIGHT");
  const targetDefinitionIds = Object.keys(definitions);
  for (const opponent of opponents) {
    const id = `${skill.id}:retain-special-np:${state.round}:${source.instanceId}:${opponent.id}`;
    opponent.cardRuleModifiers = (opponent.cardRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
    addCardRuleModifier(opponent, {
      id,
      sourceId: skill.id,
      sourceInstanceId: source.instanceId,
      targetDefinitionIds,
      retainAttributes: ["特殊", "宝具"],
      condition: { sourceControllerSameBattlefield: true, targetZoneAttack: true, targetActiveFaceUp: true },
      duration: "round",
    });
  }
};

export const isAnastasiaSumerkiKremlinLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === KREMLIN_COMBAT_ABILITY && state.phase === "combat"
    && activeOwnedSkill(state, player, skill.id, definitions) && sameBattlefieldOpponents(state, player).length > 0);
};

/** Viy, Viy, Viy: zero Special attacks in the fight and protect Anastasia's Magic/total power from opponent abilities. */
export const useAnastasiaViy: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== VIY_COMBAT_ABILITY || state.phase !== "combat") {
    throw new Error("ANASTASIA_VIY_ABILITY_INVALID");
  }
  const source = activeOwnedSkill(state, player, skill.id, definitions);
  if (!source) throw new Error("ANASTASIA_VIY_SOURCE_INACTIVE");
  if (sameBattlefieldOpponents(state, player).length === 0) throw new Error("ANASTASIA_VIY_NO_FIGHT");
  const id = `${skill.id}:special-zero:${state.round}:${source.instanceId}`;
  state.activeRuleModifiers = (state.activeRuleModifiers ?? []).filter((modifier) => modifier.id !== id);
  state.activeRuleModifiers.push({
    id,
    sourceId: skill.id,
    sourceInstanceId: source.instanceId,
    controllerPlayerId: player.id,
    operation: "set",
    rule: "card_power",
    scope: {
      subject: "opponents_at_source_battlefield",
      cards: { zones: ["attack"], attributesAny: ["特殊"] },
    },
    value: 0,
    duration: "round",
    createdRound: state.round,
  });
  player.flags.opponentAbilityMagicPowerReductionProtectedRound = state.round;
  player.flags.opponentAbilityTotalPowerReductionProtectedRound = state.round;
};

export const isAnastasiaViyLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === VIY_COMBAT_ABILITY && state.phase === "combat"
    && activeOwnedSkill(state, player, skill.id, definitions) && sameBattlefieldOpponents(state, player).length > 0);
};
