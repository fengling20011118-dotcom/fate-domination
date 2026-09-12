import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { applyDefeatEffect } from "./defeat.ts";
import { adjustVictoryPoints, gainVictoryPoints } from "./resources.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const TEZCAT_TEPEYOLLOTL_ID = "servant.tezcat.skill.sc-tezcat-1";
export const TEZCAT_GUISE_ID = "servant.tezcat.skill.sc-tezcat-2";
export const TEZCAT_FIRST_SUN_ID = "servant.tezcat.skill.sc-tezcat-3";

export const TEZCAT_GUISE_HANDLER = "core.tezcat-guise-warrior";
export const TEZCAT_GUISE_RESOLVE = "core.tezcat-guise-warrior-resolve";
export const TEZCAT_FIRST_SUN_HANDLER = "core.tezcat-first-sun";

const GUISE_MARK_PREFIX = "tezcatIncitingStruggleRound:";
const GUISE_LOCATION_PREFIX = "tezcatIncitingStruggleLocation:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return Boolean(definition && (definitionId === skillId || definition.linkedSkillId === skillId));
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return player.attack.map((id) => state.cards[id]).find((card) => {
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && card.ownerPlayerId === player.id && card.controllerPlayerId === player.id
      && card.zone === "attack" && card.active && card.face === "up" && matchesSkill(definition, card.definitionId, skillId));
  });
}

function isAttackDefinition(definition: CardDefinition): boolean {
  return definition.cardType === "attack" || definition.basic === true || getCardAttributes(definition).length > 0;
}

function guiseCandidateIds(state: GameState, playerId: string, definitions: Record<string, CardDefinition>): string[] {
  const player = state.players[playerId];
  if (!player || player.eliminated) return [];
  return [...player.hand, ...player.masterSkills, ...player.servantSkills].filter((instanceId) => {
    const instance = state.cards[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (!instance || !definition || !isAttackDefinition(definition) || definition.standardAppend === true) return false;
    if (definition.variablePlayAttributeChoice || definition.playAttributeDeclaration) return false;
    try {
      const draft = structuredClone(state);
      addCardToAttack(draft, playerId, instanceId, definitions, {
        payCost: true,
        allowedSourceZones: ["hand", "master-skills", "servant-skills"],
        bypassFaceUpPlayLimit: true,
        bypassTiming: true,
      });
      return true;
    } catch {
      return false;
    }
  });
}

function markGuisePlayer(state: GameState, sourcePlayerId: string, targetPlayerId: string, locationId: string): void {
  const target = state.players[targetPlayerId];
  if (!target) return;
  target.flags[`${GUISE_MARK_PREFIX}${sourcePlayerId}`] = state.round;
  target.flags[`${GUISE_LOCATION_PREFIX}${sourcePlayerId}`] = locationId;
}

function openGuiseDecision(
  state: GameState,
  controller: PlayerState,
  order: string[],
  startIndex: number,
  locationId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): { finished: boolean } {
  let index = startIndex;
  while (index < order.length) {
    const chooserId = order[index];
    const chooser = state.players[chooserId];
    if (!chooser || chooser.eliminated || chooser.locationId !== locationId) { index += 1; continue; }
    const candidates = guiseCandidateIds(state, chooserId, definitions);
    if (candidates.length === 0) { index += 1; continue; }
    const effectId = `${state.gameInstanceId}:${state.revision}:${controller.id}:${TEZCAT_GUISE_ID}:player:${index}`;
    state.effectQueue.unshift({
      effectId,
      handlerId: TEZCAT_GUISE_RESOLVE,
      sourceId: TEZCAT_GUISE_ID,
      controllerPlayerId: controller.id,
      payload: { stage: "player", order, index, locationId, candidates },
      createdAtRevision: state.revision,
    });
    openDecision({
      decisionId: `${effectId}:decision`,
      ownerPlayerId: controller.id,
      chooserPlayerIds: [chooserId],
      kind: "tezcat-inciting-struggle-play",
      options: [
        { id: "skip", label: "不打出攻击" },
        ...candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId].definitionId]?.name ?? instanceId })),
      ],
      min: 1,
      max: 1,
      allowCancel: false,
      continuationEffectId: effectId,
      submissions: {},
    });
    return { finished: false };
  }
  return { finished: true };
}

function settleGuiseCombat(state: GameState, controller: PlayerState, payload: Record<string, unknown>): { penalizedPlayerIds: string[]; gainedVictoryPoints: number } {
  const event = isRecord(payload.event) ? payload.event : {};
  const previousLocations = isRecord(event.previousLocations) ? event.previousLocations : {};
  const winnersByLocation = isRecord(event.combatWinnerIdsByLocation) ? event.combatWinnerIdsByLocation : {};
  const penalizedPlayerIds: string[] = [];
  let opponentLost = false;
  for (const target of Object.values(state.players)) {
    const markKey = `${GUISE_MARK_PREFIX}${controller.id}`;
    const locationKey = `${GUISE_LOCATION_PREFIX}${controller.id}`;
    if (Number(target.flags[markKey] ?? -1) !== state.round) continue;
    const locationId = typeof target.flags[locationKey] === "string" ? String(target.flags[locationKey]) : undefined;
    delete target.flags[markKey];
    delete target.flags[locationKey];
    if (!locationId || previousLocations[target.id] !== locationId) continue;
    const winners = Array.isArray(winnersByLocation[locationId]) ? winnersByLocation[locationId] : undefined;
    if (!winners || winners.includes(target.id)) continue;
    adjustVictoryPoints(target, -2);
    penalizedPlayerIds.push(target.id);
    if (target.id !== controller.id) opponentLost = true;
  }
  const gainedVictoryPoints = opponentLost ? gainVictoryPoints(controller, 2) : 0;
  return { penalizedPlayerIds, gainedVictoryPoints };
}

/** Guise of the Warrior: serialize one optional real attack play for each player on the battlefield, then settle the loss penalty after combat. */
export const useTezcatGuise: SkillHandler = ({ state, player, payload, definitions, openDecision }) => {
  if (!definitions) throw new Error("TEZCAT_GUISE_DEFINITIONS_REQUIRED");
  const data = isRecord(payload) ? payload : {};
  if (data.eventType === "combat.ending") return settleGuiseCombat(state, player, data);
  if (data.abilityId !== "inciting-struggle" || state.phase !== "action" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, TEZCAT_GUISE_ID, definitions)) throw new Error("TEZCAT_GUISE_WINDOW_INVALID");
  const locationId = player.locationId;
  if (locationId !== "mountain" && locationId !== "city" && locationId !== "workshop") throw new Error("TEZCAT_GUISE_BATTLEFIELD_REQUIRED");
  const order = state.turnOrder.filter((id) => state.players[id] && !state.players[id].eliminated && state.players[id].locationId === locationId);
  return openGuiseDecision(state, player, order, 0, locationId, definitions, openDecision);
};

export const resolveTezcatGuise: SkillHandler = ({ state, player, payload, definitions, openDecision, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("TEZCAT_GUISE_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  const order = Array.isArray(previous.order) ? previous.order.filter((id): id is string => typeof id === "string") : [];
  const index = Number(previous.index);
  const locationId = typeof previous.locationId === "string" ? previous.locationId : undefined;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (previous.stage !== "player" || decision.status !== "resolved" || !Number.isInteger(index) || index < 0 || !locationId || selections.length !== 1) {
    throw new Error("TEZCAT_GUISE_DECISION_INVALID");
  }
  const chooserId = order[index];
  const chooser = chooserId ? state.players[chooserId] : undefined;
  if (!chooser) throw new Error("TEZCAT_GUISE_DECISION_INVALID");
  const selection = selections[0];
  if (selection !== "skip") {
    const candidates = guiseCandidateIds(state, chooserId, definitions);
    if (!candidates.includes(selection)) throw new Error("TEZCAT_GUISE_CARD_INVALID");
    const card = state.cards[selection];
    const definition = definitions[card.definitionId];
    const result = addCardToAttack(state, chooserId, selection, definitions, {
      payCost: true,
      allowedSourceZones: ["hand", "master-skills", "servant-skills"],
      bypassFaceUpPlayLimit: true,
      bypassTiming: true,
    });
    if (definition.revealsTrueNameOnPlay === true && !chooser.trueNameRevealed) revealPlayerTrueName(state, chooserId);
    emitEvent?.("card.played", { playerId: chooserId, instanceId: selection, definitionId: definition.id, face: "up", paidMana: result.paidMana, attributes: getCardAttributes(definition), method: "tezcat-inciting-struggle" });
    emitEvent?.("card.used", { playerId: chooserId, instanceId: selection, definitionId: definition.id, locationId: chooser.locationId, attributes: getCardAttributes(definition), method: "tezcat-inciting-struggle" });
    markGuisePlayer(state, player.id, chooserId, locationId);
  }
  return openGuiseDecision(state, player, order, index + 1, locationId, definitions, openDecision);
};

export const isTezcatGuiseLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "inciting-struggle" && state.phase === "action" && state.activePlayerId === playerId
    && (player.locationId === "mountain" || player.locationId === "city" || player.locationId === "workshop")
    && activeOwnedSkill(state, player, TEZCAT_GUISE_ID, definitions));
};

/** First Sun Xibalba / Black Sun: apply defeat to every opponent in the current fight. */
export const useTezcatFirstSun: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || payload.abilityId !== "black-sun" || state.phase !== "combat" || state.activePlayerId !== player.id
    || !activeOwnedSkill(state, player, TEZCAT_FIRST_SUN_ID, definitions)) throw new Error("TEZCAT_FIRST_SUN_WINDOW_INVALID");
  const locationId = player.locationId;
  if (!locationId) throw new Error("TEZCAT_FIRST_SUN_BATTLEFIELD_REQUIRED");
  const targetIds = (state.board.locations[locationId] ?? []).filter((id) => id !== player.id && state.players[id] && !state.players[id].eliminated);
  const results = targetIds.map((targetPlayerId) => ({
    targetPlayerId,
    ...applyDefeatEffect(state, targetPlayerId, player.id, definitions, emitEvent, { sourceId: TEZCAT_FIRST_SUN_ID, method: "black-sun" }),
  }));
  return { targetIds, results };
};

export const isTezcatFirstSunLegal: SkillLegalityPredicate = (state, playerId, _skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "black-sun" && state.phase === "combat" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, TEZCAT_FIRST_SUN_ID, definitions)
    && player.locationId && (state.board.locations[player.locationId] ?? []).some((id) => id !== playerId && state.players[id] && !state.players[id].eliminated));
};
