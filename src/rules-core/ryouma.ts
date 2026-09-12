import type { GameState, PlayerState } from "../domain/state/types.ts";
import { addCardToAttack } from "./card-play.ts";
import { addCardRuleModifier } from "./card-rule-modifiers.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { closePlayerCard, drawCards, movePlayerCard } from "./decks.ts";
import { revealPlayerTrueName } from "./skill-visibility.ts";
import type { SkillContext, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const RYOUMA_SOARING_ID = "servant.ryouma.skill.sc-ryouma-1";
export const RYOUMA_BLADE_ID = "servant.ryouma.skill.sc-ryouma-2";
export const RYOUMA_DRAGON_ID = "servant.ryouma.skill.sc-ryouma-3";
export const RYOUMA_SOARING_HANDLER = "core.ryouma-soaring-dragon";
export const RYOUMA_BLADE_HANDLER = "core.ryouma-blade-restoration";
export const RYOUMA_BLADE_RESOLVE = "core.ryouma-blade-restoration-resolve";
export const RYOUMA_DRAGON_HANDLER = "core.ryouma-dragon-restoration";
export const RYOUMA_DRAGON_RESOLVE = "core.ryouma-dragon-restoration-resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(definition: CardDefinition | undefined, definitionId: string, skillId: string): boolean {
  return definitionId === skillId || definitionId === `card.skill.${skillId}` || definition?.linkedSkillId === skillId;
}

function ownedSkillInstances(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return [...new Set([...player.servantSkills, ...player.attack, ...player.hand])]
    .map((id) => state.cards[id])
    .filter((card) => {
      const definition = card ? definitions[card.definitionId] : undefined;
      return Boolean(card && card.ownerPlayerId === player.id && card.zone !== "discard" && card.zone !== "removed"
        && matchesSkill(definition, card.definitionId, skillId));
    });
}

function activeOwnedSkill(state: GameState, player: PlayerState, skillId: string, definitions: Record<string, CardDefinition>) {
  return ownedSkillInstances(state, player, skillId, definitions)
    .find((card) => card.zone === "attack" && card.active && card.face === "up");
}

function addRoundPower(card: NonNullable<ReturnType<typeof activeOwnedSkill>>, id: string, sourceId: string, value: number): void {
  card.powerModifiers = [...(card.powerModifiers ?? []).filter((modifier) => modifier.id !== id), {
    id, sourceId, kind: "add", value, duration: "round",
  }];
}

function strengthAttackDefinitionIds(definitions: Record<string, CardDefinition>): string[] {
  return Object.values(definitions)
    .filter((definition) => definition.cardType === "attack" && getCardAttributes(definition).includes("力量")
      && !matchesSkill(definition, definition.id, RYOUMA_SOARING_ID))
    .map((definition) => definition.id);
}

function installSoaringAura(state: GameState, player: PlayerState, sourceInstanceId: string, definitions: Record<string, CardDefinition>): void {
  const id = `${RYOUMA_SOARING_ID}:strength-aura:${sourceInstanceId}`;
  if ((player.cardRuleModifiers ?? []).some((modifier) => modifier.id === id)) return;
  addCardRuleModifier(player, {
    id,
    sourceId: RYOUMA_SOARING_ID,
    sourceInstanceId,
    targetDefinitionIds: strengthAttackDefinitionIds(definitions),
    costAdd: 3,
    powerAdd: 3,
    duration: "while-source-active",
  });
}

export const useRyoumaSoaringDragon: SkillHandler = ({ state, player, skill, payload, definitions }) => {
  if (!definitions || !isRecord(payload)) throw new Error("RYOUMA_SOARING_CONTEXT_REQUIRED");
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (eventType === "card.played") {
    const event = isRecord(payload.event) ? payload.event : {};
    if (event.playerId !== player.id || typeof event.instanceId !== "string" || typeof event.definitionId !== "string"
      || !matchesSkill(definitions[event.definitionId], event.definitionId, skill.id)) return;
    const source = state.cards[event.instanceId];
    if (!source || source.zone !== "attack" || !source.active || source.face !== "up") return;
    addRoundPower(source, `${skill.id}:on-play:${state.round}`, skill.id, 10);
    installSoaringAura(state, player, source.instanceId, definitions);
    return { powerBonus: 10 };
  }
  if (eventType === "round.ending") {
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (!source || player.mana >= 4) return;
    closePlayerCard(state, player.id, source.instanceId, definitions);
    return { closedInstanceId: source.instanceId };
  }
};

type TagKind = "strength" | "agility";

function tagTriggerMatches(state: GameState, player: PlayerState, payload: Record<string, unknown>, definitions: Record<string, CardDefinition>, kind: TagKind): boolean {
  if (payload.eventType !== "attack.committed" || !isRecord(payload.event)) return false;
  const event = payload.event;
  if (event.playerId !== player.id) return false;
  const ids = Array.isArray(event.faceUpInstanceIds) ? event.faceUpInstanceIds.filter((id): id is string => typeof id === "string") : [];
  if (ids.length !== 2) return false;
  const required = kind === "strength" ? "力量" : "迅捷";
  return ids.every((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    return Boolean(card && definition && definition.cardType === "attack"
      && getCardInstanceAttributes(card, definition, state, definitions).includes(required));
  });
}

function tagAllowedAttributes(kind: TagKind): string[] {
  return kind === "strength" ? ["魔术", "迅捷"] : ["力量", "特殊"];
}

function tagCandidates(state: GameState, player: PlayerState, definitions: Record<string, CardDefinition>, kind: TagKind): string[] {
  const allowed = tagAllowedAttributes(kind);
  const zones = [...new Set([...player.hand, ...player.masterSkills, ...player.servantSkills])];
  return zones.filter((instanceId) => {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition || !getCardInstanceAttributes(card, definition, state, definitions).some((attribute) => allowed.includes(attribute))) return false;
    try {
      const clone = structuredClone(state);
      addCardToAttack(clone, player.id, instanceId, definitions, {
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

function openTagDecision(
  state: GameState,
  player: PlayerState,
  skillId: string,
  handlerId: string,
  kind: TagKind,
  candidates: string[],
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:tag-team:${kind}`;
  state.effectQueue.unshift({ effectId, handlerId, sourceId: skillId, controllerPlayerId: player.id, payload: { kind, candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: `ryouma-tag-team-${kind}`,
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 0, max: 1, allowCancel: true, continuationEffectId: effectId, submissions: {},
  });
}

function playTagCard(
  state: GameState,
  player: PlayerState,
  instanceId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent: SkillContext["emitEvent"],
): { instanceId: string; definitionId: string; paidMana: number } {
  const card = state.cards[instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!card || !definition) throw new Error("RYOUMA_TAG_TEAM_CARD_INVALID");
  const { paidMana } = addCardToAttack(state, player.id, instanceId, definitions, {
    payCost: true,
    allowedSourceZones: ["hand", "master-skills", "servant-skills"],
    bypassFaceUpPlayLimit: true,
    bypassTiming: true,
  });
  if (definition.revealsTrueNameOnPlay === true && !player.trueNameRevealed) {
    revealPlayerTrueName(state, player.id);
    emitEvent?.("servant.true-name-revealed", { playerId: player.id, servantId: player.servantId, sourceDefinitionId: definition.id, method: "ryouma-tag-team" });
  }
  const attributes = getCardInstanceAttributes(card, definition, state, definitions);
  emitEvent?.("card.played", { playerId: player.id, instanceId, definitionId: definition.id, face: "up", paidMana, attributes, method: "ryouma-tag-team" });
  emitEvent?.("card.used", { playerId: player.id, instanceId, definitionId: definition.id, locationId: player.locationId, attributes, method: "ryouma-tag-team" });
  return { instanceId, definitionId: definition.id, paidMana };
}

function resolveTagDecision(
  state: GameState,
  player: PlayerState,
  payload: unknown,
  definitions: Record<string, CardDefinition>,
  kind: TagKind,
  emitEvent: SkillContext["emitEvent"],
) {
  if (!isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) throw new Error("RYOUMA_TAG_TEAM_DECISION_INVALID");
  const previous = payload.previous;
  const decision = payload.decision;
  if (previous.kind !== kind || (decision.status !== "resolved" && decision.status !== "cancelled")) throw new Error("RYOUMA_TAG_TEAM_DECISION_INVALID");
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status === "cancelled" || selections.length === 0) return { played: null };
  if (selections.length !== 1) throw new Error("RYOUMA_TAG_TEAM_DECISION_INVALID");
  const candidates = Array.isArray(previous.candidates) ? previous.candidates.filter((id): id is string => typeof id === "string") : [];
  const current = tagCandidates(state, player, definitions, kind);
  if (!candidates.includes(selections[0]) || !current.includes(selections[0])) throw new Error("RYOUMA_TAG_TEAM_CARD_INVALID");
  return { played: playTagCard(state, player, selections[0], definitions, emitEvent) };
}

function runTagTrigger(
  state: GameState,
  player: PlayerState,
  skillId: string,
  payload: unknown,
  definitions: Record<string, CardDefinition>,
  kind: TagKind,
  handlerId: string,
  openDecision: SkillContext["openDecision"],
) {
  if (!isRecord(payload) || !tagTriggerMatches(state, player, payload, definitions, kind)) return;
  if (ownedSkillInstances(state, player, skillId, definitions).length === 0) return;
  const candidates = tagCandidates(state, player, definitions, kind);
  if (candidates.length === 0) return { candidates: [] };
  openTagDecision(state, player, skillId, handlerId, kind, candidates, definitions, openDecision);
  return { pending: true, candidates };
}

function applyBladeFocus(state: GameState, player: PlayerState, skillId: string, payload: Record<string, unknown>, definitions: Record<string, CardDefinition>) {
  if (payload.eventType !== "card.played" || !isRecord(payload.event)) return;
  const event = payload.event;
  if (event.playerId !== player.id || event.face !== "up" || typeof event.instanceId !== "string" || typeof event.definitionId !== "string") return;
  const source = activeOwnedSkill(state, player, skillId, definitions);
  const card = state.cards[event.instanceId];
  const definition = card ? definitions[card.definitionId] : undefined;
  if (!source || !card || !definition || definition.basic !== true || !getCardInstanceAttributes(card, definition, state, definitions).includes("迅捷")) return;
  const id = `${skillId}:focus:${state.round}:${card.instanceId}`;
  addRoundPower(card, id, skillId, 2);
  player.flags.ryoumaBladeFocusCloseRound = state.round;
  return { boostedInstanceId: card.instanceId };
}

export const useRyoumaBladeRestoration: SkillHandler = ({ state, player, skill, payload, definitions, openDecision }) => {
  if (!definitions || !isRecord(payload)) throw new Error("RYOUMA_BLADE_CONTEXT_REQUIRED");
  if (payload.eventType === "round.ending") {
    if (Number(player.flags.ryoumaBladeFocusCloseRound ?? -1) !== state.round) return;
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (!source) return;
    closePlayerCard(state, player.id, source.instanceId, definitions);
    return { closedInstanceId: source.instanceId };
  }
  const focus = applyBladeFocus(state, player, skill.id, payload, definitions);
  if (focus) return focus;
  return runTagTrigger(state, player, skill.id, payload, definitions, "strength", RYOUMA_BLADE_RESOLVE, openDecision);
};

export const resolveRyoumaBladeRestoration: SkillHandler = ({ state, player, payload, definitions, emitEvent }) => {
  if (!definitions) throw new Error("RYOUMA_BLADE_DEFINITIONS_REQUIRED");
  return resolveTagDecision(state, player, payload, definitions, "strength", emitEvent);
};

function applyRampageDiscards(
  state: GameState,
  player: PlayerState,
  skillId: string,
  sourceInstanceId: string,
  selected: string[],
  definitions: Record<string, CardDefinition>,
) {
  const source = state.cards[sourceInstanceId];
  if (!source || source.zone !== "attack" || !source.active || source.face !== "up") throw new Error("RYOUMA_RAMPAGE_SOURCE_INACTIVE");
  const unique = [...new Set(selected)];
  if (unique.length !== selected.length || unique.some((id) => !player.hand.includes(id))) throw new Error("RYOUMA_RAMPAGE_DISCARD_INVALID");
  let strengthCount = 0;
  for (const instanceId of unique) {
    const card = state.cards[instanceId];
    const definition = card ? definitions[card.definitionId] : undefined;
    if (!card || !definition) throw new Error("RYOUMA_RAMPAGE_DISCARD_INVALID");
    if (getCardInstanceAttributes(card, definition, state, definitions).includes("力量")) strengthCount += 1;
    movePlayerCard(state, player.id, instanceId, "discard");
    card.face = "down";
    card.active = false;
  }
  if (strengthCount > 0) addRoundPower(source, `${skillId}:rampage:${state.round}`, skillId, 2 * strengthCount);
  return { discardedInstanceIds: unique, strengthCount, powerBonus: 2 * strengthCount };
}

function openRampageDiscard(
  state: GameState,
  player: PlayerState,
  skillId: string,
  sourceInstanceId: string,
  definitions: Record<string, CardDefinition>,
  openDecision: SkillContext["openDecision"],
): void {
  const candidates = [...player.hand];
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skillId}:rampage-discard`;
  state.effectQueue.unshift({ effectId, handlerId: RYOUMA_DRAGON_RESOLVE, sourceId: skillId, controllerPlayerId: player.id, payload: { stage: "rampage", sourceInstanceId, candidates }, createdAtRevision: state.revision });
  openDecision({
    decisionId: `${effectId}:decision`, ownerPlayerId: player.id, chooserPlayerIds: [player.id], kind: "ryouma-rampage-discard",
    options: candidates.map((instanceId) => ({ id: instanceId, label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId })),
    min: 0, max: candidates.length, allowCancel: false, continuationEffectId: effectId, submissions: {},
  });
}

export const useRyoumaDragonRestoration: SkillHandler = ({ state, player, skill, payload, definitions, openDecision, randomInt }) => {
  if (!definitions || !isRecord(payload)) throw new Error("RYOUMA_DRAGON_CONTEXT_REQUIRED");
  if (payload.abilityId === "rampage") {
    if (state.phase !== "action" || state.activePlayerId !== player.id) throw new Error("RYOUMA_RAMPAGE_WINDOW_INVALID");
    const source = activeOwnedSkill(state, player, skill.id, definitions);
    if (!source) throw new Error("RYOUMA_RAMPAGE_SOURCE_INACTIVE");
    payManaCost(state, player, 3, definitions);
    const drawnInstanceIds = drawCards(state, player.id, 2, randomInt ?? (() => 0), definitions);
    if (Array.isArray(payload.discardInstanceIds)) {
      const selected = payload.discardInstanceIds.filter((id): id is string => typeof id === "string");
      if (selected.length !== payload.discardInstanceIds.length) throw new Error("RYOUMA_RAMPAGE_DISCARD_INVALID");
      return { drawnInstanceIds, ...applyRampageDiscards(state, player, skill.id, source.instanceId, selected, definitions) };
    }
    openRampageDiscard(state, player, skill.id, source.instanceId, definitions, openDecision);
    return { pending: true, drawnInstanceIds };
  }
  return runTagTrigger(state, player, skill.id, payload, definitions, "agility", RYOUMA_DRAGON_RESOLVE, openDecision);
};

export const resolveRyoumaDragonRestoration: SkillHandler = ({ state, player, skill, payload, definitions, emitEvent }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous)) throw new Error("RYOUMA_DRAGON_DECISION_INVALID");
  if (payload.previous.stage === "rampage") {
    if (!isRecord(payload.decision) || payload.decision.status !== "resolved") throw new Error("RYOUMA_RAMPAGE_DECISION_INVALID");
    const selections = Array.isArray(payload.decision.selections) ? payload.decision.selections.filter((id): id is string => typeof id === "string") : [];
    const candidates = Array.isArray(payload.previous.candidates) ? payload.previous.candidates.filter((id): id is string => typeof id === "string") : [];
    if (selections.some((id) => !candidates.includes(id))) throw new Error("RYOUMA_RAMPAGE_DISCARD_INVALID");
    const sourceInstanceId = typeof payload.previous.sourceInstanceId === "string" ? payload.previous.sourceInstanceId : undefined;
    if (!sourceInstanceId) throw new Error("RYOUMA_RAMPAGE_SOURCE_INACTIVE");
    return applyRampageDiscards(state, player, skill.id, sourceInstanceId, selections, definitions);
  }
  return resolveTagDecision(state, player, payload, definitions, "agility", emitEvent);
};

export const isRyoumaRampageLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  return Boolean(player && definitions && ability?.id === "rampage" && state.phase === "action" && state.activePlayerId === playerId
    && activeOwnedSkill(state, player, skill.id, definitions) && (player.flags.infiniteMana === true || player.mana >= 3));
};
