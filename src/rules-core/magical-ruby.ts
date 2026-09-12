import type { CardInstance, GameState, PendingDecision, PlayerState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";
import { payManaCost } from "./costs.ts";
import { drawCards, movePlayerCard, shufflePlayerDeck } from "./decks.ts";
import { installDeckEntryRestriction } from "./deck-entry-rules.ts";
import type { SkillContext, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";

export const MAGICAL_RUBY_HANDLER = "core.magical-ruby";
export const MAGICAL_RUBY_RESOLVE = "core.magical-ruby-resolve";
export const RUBY_IMAGINATION_ID = "master.illya-mahou.skill.s1";
export const RUBY_KALEIDOSTICK_ID = "master.illya-mahou.skill.s1a";
export const RUBY_DOPPELGANGER_ID = "master.illya-mahou.skill.ascension";
export const RUBY_DRAW_ABILITY = "magical-ruby-draw";
export const RUBY_SHUFFLE_ABILITY = "magical-ruby-shuffle";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesSkill(card: CardInstance | undefined, definition: CardDefinition | undefined, skillId: string): boolean {
  return Boolean(card && (card.definitionId === skillId || definition?.linkedSkillId === skillId));
}

function ownedSkillSource(
  state: GameState,
  player: PlayerState,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): CardInstance | undefined {
  return [...player.masterSkills, ...player.servantSkills]
    .map((instanceId) => state.cards[instanceId])
    .find((card) => matchesSkill(card, card ? definitions[card.definitionId] : undefined, skillId));
}

function canPayManaCost(state: GameState, playerId: string, amount: number, definitions: Record<string, CardDefinition>): boolean {
  try {
    const draft = structuredClone(state) as GameState;
    payManaCost(draft, draft.players[playerId], amount, definitions);
    return true;
  } catch {
    return false;
  }
}

function openSingleChoice(
  state: GameState,
  player: PlayerState,
  skill: SkillDefinition,
  stage: string,
  options: PendingDecision["options"],
  previous: Record<string, unknown>,
  openDecision: SkillContext["openDecision"],
): { pending: true } {
  const effectId = `${state.gameInstanceId}:${state.revision}:${player.id}:${skill.id}:${stage}`;
  state.effectQueue.unshift({
    effectId,
    handlerId: MAGICAL_RUBY_RESOLVE,
    sourceId: skill.id,
    controllerPlayerId: player.id,
    payload: { stage, ...previous },
    createdAtRevision: state.revision,
  });
  openDecision({
    decisionId: `${effectId}:decision`,
    ownerPlayerId: player.id,
    chooserPlayerIds: [player.id],
    kind: `magical-ruby-${stage}`,
    options,
    min: 1,
    max: 1,
    allowCancel: false,
    continuationEffectId: effectId,
    submissions: {},
  });
  return { pending: true };
}

function beginDraw(context: SkillContext): { pending: true } {
  const { state, player, skill, definitions, openDecision } = context;
  if (!definitions || state.phase !== "preparation" || state.activePlayerId !== player.id
    || !ownedSkillSource(state, player, skill.id, definitions)) throw new Error("MAGICAL_RUBY_DRAW_WINDOW_INVALID");
  const max = player.deck.length;
  return openSingleChoice(
    state,
    player,
    skill,
    "draw",
    Array.from({ length: max + 1 }, (_, count) => ({ id: String(count), label: `Draw ${count}` })),
    { max },
    openDecision,
  );
}

function shuffleDiscard(context: SkillContext) {
  const { state, player, skill, definitions, randomInt } = context;
  if (!definitions || state.phase !== "preparation" || state.activePlayerId !== player.id
    || !ownedSkillSource(state, player, skill.id, definitions)) throw new Error("MAGICAL_RUBY_SHUFFLE_WINDOW_INVALID");
  const manaCost = player.hand.length * 2;
  payManaCost(state, player, manaCost, definitions, "MAGICAL_RUBY_SHUFFLE_MANA_REQUIRED");
  if (manaCost > 0) player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + manaCost;
  const shuffledInstanceIds = [...player.discard];
  for (const instanceId of shuffledInstanceIds) {
    movePlayerCard(state, player.id, instanceId, "deck", { ignoreDeckEntryRestriction: true });
    state.cards[instanceId].face = "down";
    state.cards[instanceId].active = false;
  }
  if (shuffledInstanceIds.length > 0) shufflePlayerDeck(state, player.id, randomInt ?? (() => 0));
  return { manaPaid: manaCost, shuffledInstanceIds };
}

function beginDoppelgangerUpkeep(context: SkillContext) {
  const { state, player, skill, definitions, openDecision } = context;
  if (!definitions) throw new Error("MAGICAL_RUBY_DOPPELGANGER_DEFINITIONS_REQUIRED");
  const source = ownedSkillSource(state, player, skill.id, definitions);
  if (!source) return;
  if (!canPayManaCost(state, player.id, 3, definitions)) {
    movePlayerCard(state, player.id, source.instanceId, "removed");
    return { removedInstanceId: source.instanceId, manaPaid: 0 };
  }
  return openSingleChoice(
    state,
    player,
    skill,
    "doppelganger-upkeep",
    [{ id: "pay", label: "Pay 3 mana" }, { id: "remove", label: "Remove Doppelgänger" }],
    { sourceInstanceId: source.instanceId },
    openDecision,
  );
}

export const useMagicalRuby: SkillHandler = (context) => {
  const { state, player, skill, payload } = context;
  const data = isRecord(payload) ? payload : {};
  const eventType = typeof data.eventType === "string" ? data.eventType : undefined;
  const abilityId = typeof data.abilityId === "string" ? data.abilityId : undefined;

  if (skill.id === RUBY_IMAGINATION_ID) {
    if (eventType !== "game.started") return;
    installDeckEntryRestriction(player, skill.id);
    return { installed: true };
  }
  if (skill.id === RUBY_KALEIDOSTICK_ID) {
    if (abilityId === RUBY_DRAW_ABILITY) return beginDraw(context);
    if (abilityId === RUBY_SHUFFLE_ABILITY) return shuffleDiscard(context);
    return;
  }
  if (skill.id === RUBY_DOPPELGANGER_ID) {
    if (eventType !== "round.ending") return;
    return beginDoppelgangerUpkeep(context);
  }
  throw new Error("MAGICAL_RUBY_SKILL_INVALID");
};

export const resolveMagicalRubyDecision: SkillHandler = ({ state, player, payload, definitions, randomInt }) => {
  if (!definitions || !isRecord(payload) || !isRecord(payload.previous) || !isRecord(payload.decision)) {
    throw new Error("MAGICAL_RUBY_DECISION_INVALID");
  }
  const previous = payload.previous;
  const decision = payload.decision;
  const selections = Array.isArray(decision.selections) ? decision.selections.filter((id): id is string => typeof id === "string") : [];
  if (decision.status !== "resolved" || selections.length !== 1) throw new Error("MAGICAL_RUBY_DECISION_INVALID");
  const stage = typeof previous.stage === "string" ? previous.stage : undefined;

  if (stage === "draw") {
    const max = Number(previous.max);
    const count = Number(selections[0]);
    if (!Number.isInteger(max) || !Number.isInteger(count) || count < 0 || count > max || count > player.deck.length) {
      throw new Error("MAGICAL_RUBY_DRAW_SELECTION_INVALID");
    }
    const drawnInstanceIds = drawCards(state, player.id, count, randomInt ?? (() => 0), definitions);
    return { drawnInstanceIds };
  }
  if (stage === "doppelganger-upkeep") {
    const sourceInstanceId = typeof previous.sourceInstanceId === "string" ? previous.sourceInstanceId : undefined;
    const source = sourceInstanceId ? state.cards[sourceInstanceId] : undefined;
    if (!source || source.ownerPlayerId !== player.id || source.zone !== "master-skills") throw new Error("MAGICAL_RUBY_DOPPELGANGER_SOURCE_INVALID");
    if (selections[0] === "pay") {
      payManaCost(state, player, 3, definitions, "MAGICAL_RUBY_DOPPELGANGER_MANA_REQUIRED");
      player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + 3;
      return { manaPaid: 3, removedInstanceId: null };
    }
    if (selections[0] === "remove") {
      movePlayerCard(state, player.id, sourceInstanceId, "removed");
      return { manaPaid: 0, removedInstanceId: sourceInstanceId };
    }
    throw new Error("MAGICAL_RUBY_DOPPELGANGER_SELECTION_INVALID");
  }
  throw new Error("MAGICAL_RUBY_DECISION_STAGE_INVALID");
};

export const isMagicalRubyLegal: SkillLegalityPredicate = (state, playerId, skill, ability, definitions) => {
  const player = state.players[playerId];
  if (!player || player.eliminated || !definitions) return false;
  if (skill.id !== RUBY_KALEIDOSTICK_ID || state.phase !== "preparation" || state.activePlayerId !== playerId
    || !ownedSkillSource(state, player, skill.id, definitions)) return false;
  if (ability?.id === RUBY_DRAW_ABILITY) return true;
  if (ability?.id === RUBY_SHUFFLE_ABILITY) return canPayManaCost(state, playerId, player.hand.length * 2, definitions);
  return false;
};
