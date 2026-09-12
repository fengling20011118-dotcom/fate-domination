import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import type { FDAuthoringGrantedCardAbility, FDAuthoringTransformSpec } from "../content/authoring/types.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { installStructuredRuleModifier, isContinuousStructuredAbilityAvailable } from "./rule-modifiers.ts";
import { executeConfirmedGrantedCardAbilityHandler } from "./granted-card-ability-handlers.ts";
import { playerIsDisarmed } from "./player-statuses.ts";

interface StructuredCardTransformSource {
  transform: FDAuthoringTransformSpec;
  sourcePlayer: PlayerState;
  sourceInstance: CardInstance;
  sourceDefinition: CardDefinition;
}

function transformSubjectMatches(sourcePlayer: PlayerState, targetPlayerId: string, transform: FDAuthoringTransformSpec): boolean {
  const subject = transform.target?.subject ?? "controller";
  if (subject === "controller") return sourcePlayer.id === targetPlayerId;
  if (subject === "opponents") return sourcePlayer.id !== targetPlayerId;
  if (subject === "all_players") return true;
  return false;
}

function transformCardMatches(transform: FDAuthoringTransformSpec, targetDefinition: CardDefinition): boolean {
  const cards = transform.target?.cards ?? {};
  if (cards.basic === true && targetDefinition.basic !== true) return false;
  if (cards.basic === false && targetDefinition.basic === true) return false;
  if (cards.skill === true && targetDefinition.isSkill !== true) return false;
  if (cards.skill === false && targetDefinition.isSkill === true) return false;
  if (cards.definitionIds?.length && !cards.definitionIds.includes(targetDefinition.id)) return false;
  const attributes = getCardAttributes(targetDefinition);
  if (cards.attributesAny?.length && !cards.attributesAny.some((attribute) => attributes.includes(attribute as never))) return false;
  if (cards.attributesAll?.length && !cards.attributesAll.every((attribute) => attributes.includes(attribute as never))) return false;
  if (cards.tagsAny?.length && !cards.tagsAny.some((tag) => targetDefinition.tags?.includes(tag))) return false;
  return true;
}

/** Collect continuous authored transforms without character-name branches or display-text parsing. */
export function collectStructuredCardTransforms(
  state: GameState,
  targetPlayerId: string,
  targetDefinition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): StructuredCardTransformSource[] {
  const result: StructuredCardTransformSource[] = [];
  for (const sourcePlayer of Object.values(state.players)) {
    if (sourcePlayer.eliminated) continue;
    const sourceIds = [...new Set([...sourcePlayer.masterSkills, ...sourcePlayer.servantSkills, ...sourcePlayer.hand, ...sourcePlayer.attack])];
    for (const sourceInstanceId of sourceIds) {
      const sourceInstance = state.cards[sourceInstanceId];
      const sourceDefinition = sourceInstance ? definitions[sourceInstance.definitionId] : undefined;
      if (!sourceInstance || !sourceDefinition?.rules?.abilities?.length) continue;
      for (const ability of sourceDefinition.rules.abilities) {
        if (ability.execution?.mode !== "automatic" || (ability.kind !== "passive" && ability.kind !== "residual")) continue;
        if (!isContinuousStructuredAbilityAvailable(state, sourcePlayer, sourceInstance, ability)) continue;
        for (const transform of ability.transforms ?? []) {
          if (transform.type !== "card") continue;
          if (!transformSubjectMatches(sourcePlayer, targetPlayerId, transform) || !transformCardMatches(transform, targetDefinition)) continue;
          result.push({ transform, sourcePlayer, sourceInstance, sourceDefinition });
        }
      }
    }
  }
  return result;
}

/** Effective rules name after continuous card transformations. */
export function getStructuredCardName(
  state: GameState,
  targetPlayerId: string,
  targetDefinition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): string {
  const names = collectStructuredCardTransforms(state, targetPlayerId, targetDefinition, definitions)
    .map((source) => source.transform.set?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  const distinct = [...new Set(names)];
  if (distinct.length > 1) throw new Error("CARD_TRANSFORM_NAME_CONFLICT_UNRESOLVED");
  return distinct[0] ?? targetDefinition.name;
}

export function cardHasStructuredName(
  state: GameState,
  targetPlayerId: string,
  targetDefinition: CardDefinition,
  definitions: Record<string, CardDefinition>,
  name: string,
): boolean {
  return getStructuredCardName(state, targetPlayerId, targetDefinition, definitions) === name;
}

interface GrantedAbilitySource extends StructuredCardTransformSource {
  ability: FDAuthoringGrantedCardAbility;
}

function findGrantedAbility(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  abilityId: string,
  definitions: Record<string, CardDefinition>,
): GrantedAbilitySource {
  const definition = definitions[instance.definitionId];
  if (!definition) throw new Error("CARD_DEFINITION_NOT_FOUND");
  const matches = collectStructuredCardTransforms(state, playerId, definition, definitions)
    .flatMap((source) => (source.transform.grantAbilities ?? [])
      .filter((ability) => ability.id === abilityId)
      .map((ability) => ({ ...source, ability })));
  if (matches.length === 0) throw new Error("CARD_ABILITY_NOT_FOUND");
  if (matches.length > 1) {
    const signatures = new Set(matches.map((match) => JSON.stringify(match.ability)));
    if (signatures.size > 1) throw new Error("CARD_TRANSFORM_ABILITY_CONFLICT_UNRESOLVED");
  }
  return matches[0];
}

/** Execute a phase ability granted by a continuous transforms[] rule. */
export function executeStructuredGrantedCardAbility(
  state: GameState,
  playerId: string,
  instanceId: string,
  abilityId: string,
  definitions: Record<string, CardDefinition>,
  emitEvent?: (type: string, payload: unknown) => void,
  target?: unknown,
): void {
  if (state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
  if (state.pendingDecision) throw new Error("CARD_ABILITY_BLOCKED_BY_DECISION");
  const player = state.players[playerId];
  const instance = state.cards[instanceId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  if (playerIsDisarmed(player)) throw new Error("PLAYER_DISARMED");
  if (!instance || (instance.ownerPlayerId !== playerId && instance.controllerPlayerId !== playerId)) throw new Error("CARD_ABILITY_NOT_OWNED");
  const granted = findGrantedAbility(state, playerId, instance, abilityId, definitions);
  const allowedZones = granted.ability.allowedZones ?? ["attack"];
  if (!allowedZones.includes(instance.zone)) throw new Error("CARD_ABILITY_ZONE_FORBIDDEN");
  if (granted.ability.allowInactive !== true && (!instance.active || instance.face !== "up")) throw new Error("CARD_ABILITY_INACTIVE");
  if (instance.zone === "removed" || instance.zone === "discard") throw new Error("CARD_ABILITY_INACTIVE");
  if (state.phase !== granted.ability.activation.phase) throw new Error("CARD_ABILITY_WINDOW_FORBIDDEN");
  if (granted.ability.activation.step && state.step !== granted.ability.activation.step) throw new Error("CARD_ABILITY_STEP_FORBIDDEN");
  const usageKey = `granted-card-ability:${granted.sourceDefinition.id}:${granted.transform.id}:${instanceId}:${abilityId}`;
  if (granted.ability.limit === "once-per-round" && player.usage[usageKey]?.round === state.round) throw new Error("CARD_ABILITY_LIMIT_REACHED");
  const sourceId = granted.sourceDefinition.linkedSkillId ?? granted.sourceDefinition.id;
  if (granted.ability.handlerId) {
    executeConfirmedGrantedCardAbilityHandler(granted.ability.handlerId, { state, playerId, instanceId, target, definitions, emitEvent });
  }
  for (const modifier of granted.ability.ruleModifiers ?? []) {
    installStructuredRuleModifier(
      state,
      playerId,
      sourceId,
      granted.sourceInstance.instanceId,
      `${granted.transform.id}:${abilityId}`,
      modifier,
    );
  }
  if (granted.ability.limit === "once-per-round") player.usage[usageKey] = { round: state.round, used: true };
}
