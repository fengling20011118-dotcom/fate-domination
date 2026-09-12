import type { CardInstance, GameState, PlayerState } from "../domain/state/types.ts";
import { getCardAttributes, type CardDefinition } from "./content-types.ts";
import { getCardInstanceAttributes } from "./card-instance-attributes.ts";
import type { FDAuthoringAbility, FDAuthoringRuleModifier } from "../content/authoring/types.ts";
import { isOtherPlayerAbilityEffectIgnored } from "./ability-immunity.ts";
import { isCardTextSuppressed } from "./card-text.ts";
import { isDuelIsolationCardSourceAllowed } from "./duel-isolation.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface StructuredRuleModifierSource {
  modifier: FDAuthoringRuleModifier;
  ability?: FDAuthoringAbility;
  sourcePlayer: PlayerState;
  sourceInstance?: CardInstance;
  sourceDefinition?: CardDefinition;
}

/**
 * Collect rule modifiers from physical skill sources without knowing character IDs.
 * Passive skill-zone sources are live by default; residual/while-active sources must
 * be face-up and active in the attack zone. Event-gated modifiers are not treated
 * as continuous rules.
 */
export function collectStructuredRuleModifiers(
  state: GameState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
  rule: string,
): StructuredRuleModifierSource[] {
  const targetPlayer = state.players[targetPlayerId];
  if (!targetPlayer || targetPlayer.eliminated) return [];
  const result: StructuredRuleModifierSource[] = [];
  for (const sourcePlayer of Object.values(state.players)) {
    if (sourcePlayer.eliminated) continue;
    if (isOtherPlayerAbilityEffectIgnored(state, sourcePlayer.id, targetPlayer.id)) continue;
    // FQA: passive cards remain effective from the hand and skill zones; attack
    // sources are included for active/residual continuous text.
    const sourceIds = [...new Set([...sourcePlayer.masterSkills, ...sourcePlayer.servantSkills, ...sourcePlayer.hand, ...sourcePlayer.attack])];
    for (const sourceInstanceId of sourceIds) {
      const sourceInstance = state.cards[sourceInstanceId];
      if (!sourceInstance) continue;
      if (!isDuelIsolationCardSourceAllowed(state, targetPlayerId, sourceInstanceId)) continue;
      if (isCardTextSuppressed(state, sourceInstance)) continue;
      const sourceDefinition = definitions[sourceInstance.definitionId];
      if (!sourceDefinition?.rules?.abilities?.length) continue;
      if (isOtherPlayerAbilityEffectIgnored(state, sourcePlayer.id, targetPlayer.id, sourceDefinition.linkedSkillId ?? sourceDefinition.id)) continue;
      for (const ability of sourceDefinition.rules.abilities) {
        if (ability.execution?.mode !== "automatic") continue;
        if (ability.kind !== "passive" && ability.kind !== "residual") continue;
        if (!isContinuousStructuredAbilityAvailable(state, sourcePlayer, sourceInstance, ability)) continue;
        for (const modifier of ability.ruleModifiers ?? []) {
          if (modifier.rule !== rule || !scopeIncludesPlayer(state, sourcePlayer, targetPlayer, modifier.scope)) continue;
          result.push({ modifier, ability, sourcePlayer, sourceInstance, sourceDefinition });
        }
      }
    }
  }
  for (const active of state.activeRuleModifiers ?? []) {
    if (active.rule !== rule) continue;
    const sourcePlayer = state.players[active.controllerPlayerId];
    if (!sourcePlayer || sourcePlayer.eliminated || isOtherPlayerAbilityEffectIgnored(state, sourcePlayer.id, targetPlayer.id, active.sourceId) || !scopeIncludesPlayer(state, sourcePlayer, targetPlayer, active.scope)) continue;
    const sourceInstance = active.sourceInstanceId ? state.cards[active.sourceInstanceId] : undefined;
    if (sourceInstance && isCardTextSuppressed(state, sourceInstance)) continue;
    if (active.duration === "round" && active.createdRound !== state.round) continue;
    if (active.duration === "while-source-active" && (!sourceInstance || sourceInstance.zone !== "attack" || !sourceInstance.active || sourceInstance.face !== "up")) continue;
    const sourceDefinition = sourceInstance ? definitions[sourceInstance.definitionId] : definitions[active.sourceId] ?? definitions[`card.skill.${active.sourceId}`];
    result.push({
      modifier: { id: active.id, operation: active.operation, rule: active.rule, scope: active.scope, value: active.value },
      sourcePlayer, sourceInstance, sourceDefinition,
    });
  }
  return result;
}

export function isContinuousStructuredAbilityAvailable(
  state: GameState,
  sourcePlayer: PlayerState,
  sourceInstance: CardInstance,
  ability: FDAuthoringAbility,
): boolean {
  const conditions = ability.conditions ?? [];
  if (conditions.some((condition) => condition.type === "event_type_is")) return false;
  const lifecycle = ability.lifecycle;
  const requiresActive = ability.kind === "residual"
    || conditions.some((condition) => condition.type === "source_active")
    || lifecycle?.duration === "while_active"
    || lifecycle?.duration === "until_card_closed";
  if (requiresActive && !(sourceInstance.zone === "attack" && sourceInstance.active && sourceInstance.face === "up")) return false;
  for (const condition of conditions) {
    switch (condition.type) {
      case "source_active":
        break;
      case "source_reversed":
        if (sourceInstance.reversed !== true) return false;
        break;
      case "source_revealed":
        if (sourceInstance.face !== "up" || sourceInstance.zone === "deck" || sourceInstance.zone === "hand" || sourceInstance.zone === "discard" || sourceInstance.zone === "removed") return false;
        break;
      case "source_owned": {
        const ownedZones = [...sourcePlayer.masterSkills, ...sourcePlayer.servantSkills, ...sourcePlayer.attack, ...sourcePlayer.hand];
        if (!ownedZones.includes(sourceInstance.instanceId)) return false;
        break;
      }
      case "source_in_skill_zone":
        if (sourceInstance.zone !== "master-skills" && sourceInstance.zone !== "servant-skills") return false;
        break;
      case "true_name_revealed":
        if (!sourcePlayer.trueNameRevealed) return false;
        break;
      case "true_name_hidden":
        if (sourcePlayer.trueNameRevealed) return false;
        break;
      case "at_battlefield":
        if (sourcePlayer.locationId !== "mountain" && sourcePlayer.locationId !== "city") return false;
        break;
      case "mana_at_least": {
        const amount = Number(condition.amount ?? condition.value);
        if (!Number.isInteger(amount) || amount < 0 || sourcePlayer.mana < amount) return false;
        break;
      }
      case "mana_below": {
        const amount = Number(condition.amount ?? condition.value);
        if (!Number.isInteger(amount) || amount < 0 || sourcePlayer.mana >= amount) return false;
        break;
      }
      case "location_is":
        if (typeof condition.locationId !== "string" || sourcePlayer.locationId !== condition.locationId) return false;
        break;
      case "location_in":
        if (!Array.isArray(condition.locationIds) || !condition.locationIds.includes(sourcePlayer.locationId)) return false;
        break;
      case "phase_is":
        if (typeof condition.phase !== "string" || state.phase !== condition.phase) return false;
        break;
      case "player_flag_equals":
        if (typeof condition.key !== "string" || sourcePlayer.flags[condition.key] !== condition.value) return false;
        break;
      case "linked_player_flag_same_battlefield": {
        const key = condition.key;
        const linkedPlayerId = typeof key === "string" ? sourcePlayer.flags[key] : undefined;
        const linkedPlayer = typeof linkedPlayerId === "string" ? state.players[linkedPlayerId] : undefined;
        const locationId = sourcePlayer.locationId;
        if (!linkedPlayer || linkedPlayer.eliminated || (locationId !== "mountain" && locationId !== "city") || linkedPlayer.locationId !== locationId) return false;
        break;
      }
      case "same_battlefield_opponent_status_prefix": {
        const prefix = condition.prefix;
        const locationId = sourcePlayer.locationId;
        if (typeof prefix !== "string" || !prefix || (locationId !== "mountain" && locationId !== "city")) return false;
        const matches = (state.board.locations[locationId] ?? []).some((playerId) => {
          const candidate = state.players[playerId];
          return playerId !== sourcePlayer.id && Boolean(candidate && !candidate.eliminated && !candidate.defeated && candidate.statuses.some((status) => status.startsWith(prefix)));
        });
        if (!matches) return false;
        break;
      }
      case "player_flag_number_at_least": {
        const value = Number(condition.value);
        if (typeof condition.key !== "string" || !Number.isInteger(value) || Number(sourcePlayer.flags[condition.key] ?? Number.NEGATIVE_INFINITY) < value) return false;
        break;
      }
      case "player_flag_number_current_round":
        if (typeof condition.key !== "string" || Number(sourcePlayer.flags[condition.key] ?? Number.NEGATIVE_INFINITY) !== state.round) return false;
        break;
      case "victory_points_is_lowest": {
        const alive = Object.values(state.players).filter((candidate) => !candidate.eliminated);
        const lowest = Math.min(...alive.map((candidate) => candidate.victoryPoints));
        if (sourcePlayer.victoryPoints !== lowest) return false;
        break;
      }
      case "same_battlefield_lower_victory_opponent": {
        const locationId = sourcePlayer.locationId;
        if (locationId !== "mountain" && locationId !== "city") return false;
        const hasLowerOpponent = (state.board.locations[locationId] ?? []).some((playerId) => {
          const candidate = state.players[playerId];
          return Boolean(candidate && playerId !== sourcePlayer.id && !candidate.eliminated
            && candidate.victoryPoints < sourcePlayer.victoryPoints);
        });
        if (!hasLowerOpponent) return false;
        break;
      }
      default:
        // Conditions that need an event/selection/formula are not continuous.
        return false;
    }
  }
  return true;
}

function scopeIncludesPlayer(
  state: GameState,
  sourcePlayer: PlayerState,
  targetPlayer: PlayerState,
  rawScope: unknown,
): boolean {
  const scope = isRecord(rawScope) ? rawScope : {};
  const subject = scope.subject ?? "controller";
  let baseMatch = false;
  if (subject === "controller") baseMatch = targetPlayer.id === sourcePlayer.id;
  else if (subject === "all_players") baseMatch = true;
  else if (subject === "opponents") baseMatch = targetPlayer.id !== sourcePlayer.id;
  else if (subject === "players_at_source_location") baseMatch = Boolean(sourcePlayer.locationId && targetPlayer.locationId === sourcePlayer.locationId);
  else if (subject === "players_at_source_battlefield") {
    baseMatch = (sourcePlayer.locationId === "mountain" || sourcePlayer.locationId === "city")
      && targetPlayer.locationId === sourcePlayer.locationId;
  }
  else if (subject === "opponents_at_source_location") baseMatch = targetPlayer.id !== sourcePlayer.id && Boolean(sourcePlayer.locationId && targetPlayer.locationId === sourcePlayer.locationId);
  if (!baseMatch && subject !== "opponents_at_source_battlefield") return false;
  if (subject === "opponents_at_source_battlefield") {
    if (!(targetPlayer.id !== sourcePlayer.id
      && (sourcePlayer.locationId === "mountain" || sourcePlayer.locationId === "city")
      && targetPlayer.locationId === sourcePlayer.locationId)) return false;
  } else if (subject !== "controller" && subject !== "all_players" && subject !== "opponents" && subject !== "players_at_source_location" && subject !== "players_at_source_battlefield" && subject !== "opponents_at_source_location") {
    return false;
  }
  if (Array.isArray(scope.playerIds) && !scope.playerIds.includes(targetPlayer.id)) return false;
  const where = Array.isArray(scope.where) ? scope.where : [];
  for (const rawFilter of where) {
    if (!isRecord(rawFilter)) return false;
    if (rawFilter.type === "player_flag_number_current_round") {
      const key = rawFilter.key;
      if (typeof key !== "string" || !key || Number(targetPlayer.flags[key] ?? Number.NEGATIVE_INFINITY) !== state.round) return false;
      continue;
    }
    if (rawFilter.type === "player_flag_equals") {
      const key = rawFilter.key;
      if (typeof key !== "string" || !key || targetPlayer.flags[key] !== rawFilter.value) return false;
      continue;
    }
    if (rawFilter.type === "player_location_is") {
      if (typeof rawFilter.locationId !== "string" || targetPlayer.locationId !== rawFilter.locationId) return false;
      continue;
    }
    if (rawFilter.type === "round_active_attack_paid_cost_sum_is_highest") {
      const locationId = sourcePlayer.locationId;
      if (locationId !== "mountain" && locationId !== "city" || targetPlayer.locationId !== locationId) return false;
      const participantIds = (state.board.locations[locationId] ?? []).filter((id) => !state.players[id]?.eliminated);
      const paidSum = (playerId: string) => state.players[playerId].attack.reduce((sum, instanceId) => {
        const instance = state.cards[instanceId];
        return sum + (instance?.active && instance.face === "up" && instance.playedRound === state.round ? Number(instance.paidCost ?? 0) : 0);
      }, 0);
      const highest = Math.max(0, ...participantIds.map(paidSum));
      if (paidSum(targetPlayer.id) !== highest) return false;
      continue;
    }
    if (rawFilter.type === "same_battlefield_opponent_victory_points_less_than_controller") {
      const locationId = sourcePlayer.locationId;
      if (locationId !== "mountain" && locationId !== "city" || targetPlayer.id !== sourcePlayer.id) return false;
      const hasLowerOpponent = (state.board.locations[locationId] ?? []).some((id) => {
        const candidate = state.players[id];
        return Boolean(candidate && id !== sourcePlayer.id && !candidate.eliminated && candidate.victoryPoints < sourcePlayer.victoryPoints);
      });
      if (!hasLowerOpponent) return false;
      continue;
    }
    return false;
  }
  return true;
}

export function installStructuredRuleModifier(
  state: GameState,
  controllerPlayerId: string,
  sourceId: string,
  sourceInstanceId: string | undefined,
  abilityId: string,
  modifier: FDAuthoringRuleModifier,
  scopeOverride?: Record<string, unknown>,
): string {
  const durationRaw = modifier.lifecycle?.duration;
  const duration = durationRaw === "this_round" ? "round"
    : durationRaw === "permanent" ? "game"
      : durationRaw === "while_active" || durationRaw === "until_card_closed" ? "while-source-active"
        : undefined;
  if (!duration) throw new Error("RULE_MODIFIER_LIFECYCLE_REQUIRED");
  if (duration === "while-source-active" && !sourceInstanceId) throw new Error("RULE_MODIFIER_SOURCE_REQUIRED");
  const id = `${sourceId}:${abilityId}:${modifier.id}:${controllerPlayerId}:${state.round}:${state.revision}:${state.activeRuleModifiers.length}`;
  state.activeRuleModifiers.push({
    id, sourceId, controllerPlayerId, ...(sourceInstanceId ? { sourceInstanceId } : {}),
    operation: modifier.operation, rule: modifier.rule,
    ...((scopeOverride ?? modifier.scope) ? { scope: structuredClone(scopeOverride ?? modifier.scope) } : {}),
    ...(modifier.value !== undefined ? { value: structuredClone(modifier.value) } : {}),
    duration, createdRound: state.round,
  });
  return id;
}

export function installStructuredAbilityRuleModifiers(
  state: GameState,
  controllerPlayerId: string,
  sourceId: string,
  sourceInstanceId: string | undefined,
  ability: FDAuthoringAbility,
): string[] {
  const installed: string[] = [];
  for (const modifier of ability.ruleModifiers ?? []) {
    if (modifier.installation === "effect") continue;
    const inherited = modifier.lifecycle?.duration ? modifier : { ...modifier, lifecycle: ability.lifecycle };
    installed.push(installStructuredRuleModifier(state, controllerPlayerId, sourceId, sourceInstanceId, ability.id, inherited));
  }
  return installed;
}
export function structuredModifierMatchesCard(
  state: GameState,
  definitions: Record<string, CardDefinition>,
  source: StructuredRuleModifierSource,
  targetInstance: CardInstance,
  targetDefinition: CardDefinition,
): boolean {
  const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
  const cards = isRecord(scope.cards) ? scope.cards : {};
  if (cards.attack === true && targetDefinition.cardType !== "attack" && targetDefinition.isSkill !== true) return false;
  if (cards.attack === false && (targetDefinition.cardType === "attack" || targetDefinition.isSkill === true)) return false;
  if (cards.basic === true && targetDefinition.basic !== true) return false;
  if (cards.basic === false && targetDefinition.basic === true) return false;
  if (cards.skill === true && targetDefinition.isSkill !== true) return false;
  if (cards.skill === false && targetDefinition.isSkill === true) return false;
  if (cards.residual === true && targetInstance.residual !== true) return false;
  if (cards.residual === false && targetInstance.residual === true) return false;
  if (typeof cards.face === "string" && targetInstance.face !== cards.face) return false;
  if (typeof cards.cardType === "string" && targetDefinition.cardType !== cards.cardType) return false;
  if (Array.isArray(cards.zones) && !cards.zones.includes(targetInstance.zone)) return false;
  if (cards.sourceOnly === true && (!source.sourceInstance || targetInstance.instanceId !== source.sourceInstance.instanceId)) return false;
  if (cards.excludeSource === true && source.sourceInstance && targetInstance.instanceId === source.sourceInstance.instanceId) return false;
  if (Array.isArray(cards.instanceIds) && !cards.instanceIds.includes(targetInstance.instanceId)) return false;
  if (Array.isArray(cards.excludeInstanceIds) && cards.excludeInstanceIds.includes(targetInstance.instanceId)) return false;
  if (Array.isArray(cards.definitionIds) && !cards.definitionIds.includes(targetDefinition.id)) return false;
  if (Array.isArray(cards.excludeDefinitionIds) && cards.excludeDefinitionIds.includes(targetDefinition.id)) return false;
  if (Array.isArray(cards.ownerDefinitionIds) && !cards.ownerDefinitionIds.includes(targetDefinition.ownerDefinitionId)) return false;
  const attributes = getCardInstanceAttributes(targetInstance, targetDefinition, state, definitions);
  if (Array.isArray(cards.attributesAny) && !cards.attributesAny.some((attribute) => attributes.includes(String(attribute) as never))) return false;
  if (Array.isArray(cards.attributesAll) && !cards.attributesAll.every((attribute) => attributes.includes(String(attribute) as never))) return false;
  if (Array.isArray(cards.attributesNone) && cards.attributesNone.some((attribute) => attributes.includes(String(attribute) as never))) return false;
  if (Array.isArray(cards.tagsAny) && !cards.tagsAny.some((tag) => targetDefinition.tags?.includes(String(tag)))) return false;
  return true;
}

interface ModifierNumberOptions {
  targetDefinition?: CardDefinition;
  state?: GameState;
  definitions?: Record<string, CardDefinition>;
  /** Ignore numeric operations that would lower the running value. */
  preventReduction?: boolean;
  /** Apply additive/subtractive and multiplicative power alterations this many times; explicit set values remain idempotent. */
  applications?: number;
}

function resolveModifierNumber(value: unknown, source: StructuredRuleModifierSource, options: ModifierNumberOptions = {}): number {
  if (Number.isInteger(value)) return Number(value);
  if (isRecord(value) && value.type === "constant" && Number.isInteger(value.value)) return Number(value.value);
  if (isRecord(value) && value.type === "metric" && value.metric === "target_card_base_power" && value.source === "target_card") {
    const basePower = options.targetDefinition?.basePower;
    if (Number.isInteger(basePower)) return Number(basePower);
  }
  if (isRecord(value) && value.type === "metric" && value.metric === "face_up_definition_count") {
    const state = options.state;
    const definitionId = typeof value.key === "string" ? value.key : undefined;
    if (!state || !definitionId) throw new Error("RULE_MODIFIER_VALUE_INVALID");
    const players = value.source === "controller"
      ? [source.sourcePlayer]
      : value.source === "all_players"
        ? Object.values(state.players).filter((candidate) => !candidate.eliminated)
        : [];
    if (players.length === 0 && value.source !== "all_players") throw new Error("RULE_MODIFIER_VALUE_INVALID");
    return players.reduce((count, player) => count + player.attack.filter((instanceId) => {
      const instance = state.cards[instanceId];
      return Boolean(instance?.zone === "attack" && instance.face === "up" && instance.active && instance.definitionId === definitionId);
    }).length, 0);
  }
  if (isRecord(value) && value.type === "metric" && value.metric === "opponents_without_status_count") {
    const state = options.state;
    const status = typeof value.key === "string" ? value.key : undefined;
    if (!state || !status || value.source !== "controller") throw new Error("RULE_MODIFIER_VALUE_INVALID");
    return Object.values(state.players).filter((candidate) => !candidate.eliminated && candidate.id !== source.sourcePlayer.id
      && !candidate.statuses.includes(status)).length;
  }
  if (isRecord(value) && value.type === "metric" && value.metric === "same_battlefield_opponent_count") {
    const state = options.state;
    if (!state || value.source !== "controller") throw new Error("RULE_MODIFIER_VALUE_INVALID");
    const locationId = source.sourcePlayer.locationId;
    if (locationId !== "mountain" && locationId !== "city") return 0;
    return (state.board.locations[locationId] ?? []).filter((playerId) => playerId !== source.sourcePlayer.id && !state.players[playerId]?.eliminated).length;
  }
  if (isRecord(value) && value.type === "formula" && typeof value.op === "string" && Array.isArray(value.args)) {
    const args = value.args.map((argument) => resolveModifierNumber(argument, source, options));
    if (args.length === 0 || args.some((argument) => !Number.isFinite(argument))) throw new Error("RULE_MODIFIER_VALUE_INVALID");
    switch (value.op) {
      case "add": return args.reduce((sum, argument) => sum + argument, 0);
      case "subtract": return args.slice(1).reduce((result, argument) => result - argument, args[0]);
      case "multiply": return args.reduce((result, argument) => result * argument, 1);
      case "floor_divide": {
        if (args.length !== 2 || args[1] === 0) throw new Error("RULE_MODIFIER_VALUE_INVALID");
        return Math.floor(args[0] / args[1]);
      }
      case "ceil_divide": {
        if (args.length !== 2 || args[1] === 0) throw new Error("RULE_MODIFIER_VALUE_INVALID");
        return Math.ceil(args[0] / args[1]);
      }
      case "min": return Math.min(...args);
      case "max": return Math.max(...args);
      case "abs": {
        if (args.length !== 1) throw new Error("RULE_MODIFIER_VALUE_INVALID");
        return Math.abs(args[0]);
      }
    }
  }
  throw new Error("RULE_MODIFIER_VALUE_INVALID");
}

export function applyStructuredNumericRuleModifiers(base: number, sources: StructuredRuleModifierSource[], options: ModifierNumberOptions = {}): number {
  const applications = options.applications ?? 1;
  if (!Number.isInteger(applications) || applications < 1) throw new Error("RULE_MODIFIER_APPLICATION_COUNT_INVALID");
  const sets = sources.filter((source) => source.modifier.operation === "set").map((source) => resolveModifierNumber(source.modifier.value, source, options));
  const distinctSets = [...new Set(sets)];
  if (distinctSets.length > 1) throw new Error("RULE_MODIFIER_CONFLICT_UNRESOLVED");
  let value = base;
  // Numeric continuous rules use the same deterministic ordering as terrain and
  // situation modifiers: additive changes, then multipliers, then an explicit set.
  for (const source of sources) {
    const operation = source.modifier.operation;
    const amount = resolveModifierNumber(source.modifier.value, source, options);
    if (operation === "add" || operation === "subtract") {
      const candidate = operation === "add" ? value + amount * applications : value - amount * applications;
      if (!options.preventReduction || candidate >= value) value = candidate;
    } else if (operation !== "set" && operation !== "multiply") throw new Error("RULE_MODIFIER_OPERATION_UNSUPPORTED");
  }
  for (const source of sources) {
    if (source.modifier.operation !== "multiply") continue;
    const candidate = value * Math.pow(resolveModifierNumber(source.modifier.value, source, options), applications);
    if (!options.preventReduction || candidate >= value) value = candidate;
  }
  if (distinctSets.length === 1 && (!options.preventReduction || distinctSets[0] >= value)) value = distinctSets[0];
  const maxResults = sources.map((source) => {
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    return Number.isFinite(scope.maxResult) ? Number(scope.maxResult) : undefined;
  }).filter((candidate): candidate is number => candidate !== undefined);
  if (maxResults.length > 0 && !options.preventReduction) value = Math.min(value, ...maxResults);
  return value;
}

function removeOpponentNumericReductionSources(
  base: number,
  sources: StructuredRuleModifierSource[],
  targetPlayerId: string,
  options: ModifierNumberOptions,
): StructuredRuleModifierSource[] {
  return sources.filter((source) => {
    if (source.sourcePlayer.id === targetPlayerId) return true;
    const operation = source.modifier.operation;
    if (!["add", "subtract", "multiply", "set"].includes(operation)) return true;
    const amount = resolveModifierNumber(source.modifier.value, source, options);
    if (operation === "add") return amount >= 0;
    if (operation === "subtract") return amount <= 0;
    if (operation === "multiply") return amount >= 1;
    return amount >= base;
  });
}

export function structuredCardIgnoresSituationRestrictions(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "situation_card_play")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition))
    .some((source) => source.modifier.operation === "ignore" || source.modifier.operation === "allow");
}

export function getStructuredDeploymentDestinations(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  baseLocations: readonly string[],
): string[] {
  const player = state.players[playerId];
  if (!player) return [];
  let allowed = [...baseLocations];
  for (const source of collectStructuredRuleModifiers(state, playerId, definitions, "deployment_destinations")) {
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    if (source.modifier.operation === "forbid") {
      const forbidden = Array.isArray(scope.locationIds) ? scope.locationIds.filter((id): id is string => typeof id === "string") : [];
      if (forbidden.length > 0) allowed = allowed.filter((locationId) => !forbidden.includes(locationId));
      continue;
    }
    if (source.modifier.operation !== "replace") continue;
    const filter = isRecord(scope.destinationFilter) ? scope.destinationFilter : undefined;
    if (!filter) continue;
    let candidates = [...baseLocations];
    if (filter.locationKind === "battlefield") candidates = candidates.filter((locationId) => locationId === "mountain" || locationId === "city");
    if (Number.isInteger(filter.opponentCountEquals)) {
      candidates = candidates.filter((locationId) => (state.board.locations[locationId] ?? [])
        .filter((id) => id !== playerId && !state.players[id]?.eliminated).length === Number(filter.opponentCountEquals));
    }
    if (filter.opponentVictoryPoints === "less_than_controller") {
      candidates = candidates.filter((locationId) => {
        const opponents = (state.board.locations[locationId] ?? []).filter((id) => id !== playerId && !state.players[id]?.eliminated);
        return opponents.length > 0 && opponents.every((id) => state.players[id].victoryPoints < player.victoryPoints);
      });
    }
    if (candidates.length > 0) allowed = allowed.filter((locationId) => candidates.includes(locationId));
  }
  return allowed;
}

export function isStructuredSituationBenefitForbidden(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  benefit: "mana" | "power",
): boolean {
  const rule = benefit === "mana" ? "situation_mana_gain" : "situation_power_bonus";
  return collectStructuredRuleModifiers(state, playerId, definitions, rule)
    .some((source) => source.modifier.operation === "forbid");
}

export function getStructuredSituationPowerMultiplier(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  base = 1,
): number {
  if (!Number.isFinite(base)) throw new Error("SITUATION_POWER_MULTIPLIER_BASE_INVALID");
  return applyStructuredNumericRuleModifiers(base, collectStructuredRuleModifiers(state, playerId, definitions, "situation_power_multiplier"), { state });
}

/** Resolve numeric situation-mana modifiers in add/subtract -> multiply -> set order. */
export function getStructuredSituationManaGain(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  base: number,
): number {
  if (!Number.isFinite(base) || base < 0) throw new Error("SITUATION_MANA_BASE_INVALID");
  const numeric = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (isRecord(value) && value.type === "constant" && typeof value.value === "number" && Number.isFinite(value.value)) return value.value;
    throw new Error("RULE_MODIFIER_VALUE_INVALID");
  };
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "situation_mana_gain");
  if (sources.some((source) => source.modifier.operation === "forbid")) return 0;
  const sets = sources.filter((source) => source.modifier.operation === "set").map((source) => numeric(source.modifier.value));
  const distinctSets = [...new Set(sets)];
  if (distinctSets.length > 1) throw new Error("RULE_MODIFIER_CONFLICT_UNRESOLVED");
  let value = base;
  for (const source of sources) {
    if (source.modifier.operation === "add") value += numeric(source.modifier.value);
    else if (source.modifier.operation === "subtract") value -= numeric(source.modifier.value);
  }
  for (const source of sources) {
    if (source.modifier.operation === "multiply") value *= numeric(source.modifier.value);
    else if (!["set", "add", "subtract", "forbid"].includes(source.modifier.operation)) throw new Error("RULE_MODIFIER_OPERATION_UNSUPPORTED");
  }
  if (distinctSets.length === 1) value = distinctSets[0];
  return Math.max(0, value);
}

export function getStructuredDeploymentAdvantage(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  base: number,
  locationId?: string | null,
): number {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "deployment_advantage");
  const sets = sources.filter((source) => source.modifier.operation === "set").map((source) => resolveModifierNumber(source.modifier.value, source, { state, definitions }));
  const distinctSets = [...new Set(sets)];
  if (distinctSets.length > 1) throw new Error("RULE_MODIFIER_CONFLICT_UNRESOLVED");
  let value = base;
  for (const source of sources) {
    const operation = source.modifier.operation;
    if (operation === "add") value += resolveModifierNumber(source.modifier.value, source, { state, definitions });
    else if (operation === "subtract") value -= resolveModifierNumber(source.modifier.value, source, { state, definitions });
  }
  for (const source of sources) {
    if (source.modifier.operation === "multiply") value *= resolveModifierNumber(source.modifier.value, source, { state, definitions });
    else if (!["set", "add", "subtract"].includes(source.modifier.operation)) throw new Error("RULE_MODIFIER_OPERATION_UNSUPPORTED");
  }
  const player = state.players[playerId];
  const multiplierLocationId = typeof player?.flags.deploymentAdvantageMultiplierLocationId === "string"
    ? player.flags.deploymentAdvantageMultiplierLocationId
    : undefined;
  if (player?.flags.deploymentAdvantageMultiplierRound === state.round
    && (!multiplierLocationId || multiplierLocationId === locationId)) {
    const multiplier = Number(player.flags.deploymentAdvantageMultiplier ?? 1);
    if (!Number.isFinite(multiplier) || multiplier < 0) throw new Error("DEPLOYMENT_ADVANTAGE_RUNTIME_MULTIPLIER_INVALID");
    value *= multiplier;
  }
  // Terrain Advantage rules apply set effects after additive and multiplicative effects.
  if (distinctSets.length === 1) value = distinctSets[0];
  return Math.max(0, value);
}

export function getStructuredCombatPower(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  basePower: number,
  preventOpponentReduction = false,
): number {
  let sources = collectStructuredRuleModifiers(state, playerId, definitions, "combat_power");
  if (preventOpponentReduction) sources = removeOpponentNumericReductionSources(basePower, sources, playerId, { state, definitions });
  return applyStructuredNumericRuleModifiers(basePower, sources, { state, definitions });
}

/** True when an active structured rule forbids spending positive mana. */
export function isStructuredManaSpendingForbidden(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "mana_spending")
    .some((source) => source.modifier.operation === "forbid");
}

export function getStructuredCardCost(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
  baseCost: number,
): number {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "card_cost")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition));
  return Math.max(0, applyStructuredNumericRuleModifiers(baseCost, sources, { targetDefinition: definition }));
}

export function getStructuredCardPower(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
  basePower: number,
  preventReduction = false,
  preventOpponentReduction = false,
  applications = 1,
): number {
  let sources = collectStructuredRuleModifiers(state, playerId, definitions, "card_power")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition));
  if (preventOpponentReduction) sources = removeOpponentNumericReductionSources(basePower, sources, playerId, { state, definitions, targetDefinition: definition });
  return applyStructuredNumericRuleModifiers(basePower, sources, { targetDefinition: definition, preventReduction, applications });
}

export function getStructuredCardBasePower(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
  basePower: number,
  preventReduction = false,
  preventOpponentReduction = false,
  applications = 1,
): number {
  let sources = collectStructuredRuleModifiers(state, playerId, definitions, "card_base_power")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition));
  if (preventOpponentReduction) sources = removeOpponentNumericReductionSources(basePower, sources, playerId, { state, definitions, targetDefinition: definition });
  return applyStructuredNumericRuleModifiers(basePower, sources, { targetDefinition: definition, preventReduction, applications });
}

/** Continuous card text may grant Permanent/Residual to a matching physical card. */
export function getStructuredCardResidualGrantSources(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): CardInstance[] {
  const matches = collectStructuredRuleModifiers(state, playerId, definitions, "card_residual")
    .filter((source) => source.modifier.operation === "allow")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition));
  const seen = new Set<string>();
  const sources: CardInstance[] = [];
  for (const match of matches) {
    const source = match.sourceInstance;
    if (!source || seen.has(source.instanceId)) continue;
    seen.add(source.instanceId);
    sources.push(source);
  }
  return sources;
}

/**
 * Resolve generic "after power calculation" defeat rules against the frozen
 * per-card power snapshot.  The rule source declares the affected players via
 * normal structured scope and filters their active cards via `scope.cards`;
 * `value` is the exact calculated card power that triggers defeat.
 */
export function getStructuredPostPowerDefeatTargetIds(
  state: GameState,
  participantIds: readonly string[],
  cardPowers: Record<string, Record<string, number>>,
  powersOrDefinitions: Record<string, number> | Record<string, CardDefinition>,
  maybeDefinitions?: Record<string, CardDefinition>,
): string[] {
  const powers = maybeDefinitions ? powersOrDefinitions as Record<string, number> : {};
  const definitions = (maybeDefinitions ?? powersOrDefinitions) as Record<string, CardDefinition>;
  const defeated = new Set<string>();
  for (const targetPlayerId of participantIds) {
    const target = state.players[targetPlayerId];
    const emptyDeckSources = collectStructuredRuleModifiers(state, targetPlayerId, definitions, "combat_post_power_defeat_if_deck_empty");
    if (target?.deck.length === 0 && emptyDeckSources.some((source) => source.modifier.operation === "set" || source.modifier.operation === "allow")) {
      defeated.add(targetPlayerId);
    }
    const measured = cardPowers[targetPlayerId] ?? {};
    if (Object.keys(measured).length > 0) {
      const sources = collectStructuredRuleModifiers(state, targetPlayerId, definitions, "combat_post_power_defeat");
      for (const source of sources) {
        if (source.modifier.operation !== "set") throw new Error("POST_POWER_DEFEAT_OPERATION_INVALID");
        const triggerPower = Number(source.modifier.value);
        if (!Number.isInteger(triggerPower)) throw new Error("POST_POWER_DEFEAT_POWER_INVALID");
        const matched = Object.entries(measured).some(([instanceId, power]) => {
          const instance = state.cards[instanceId];
          const definition = instance ? definitions[instance.definitionId] : undefined;
          return Boolean(instance && definition && power === triggerPower && structuredModifierMatchesCard(state, definitions, source, instance, definition));
        });
        if (matched) defeated.add(targetPlayerId);
      }
    }
    const lowerPowerSources = collectStructuredRuleModifiers(state, targetPlayerId, definitions, "combat_post_power_defeat_lower_than_controller");
    for (const source of lowerPowerSources) {
      if (source.modifier.operation !== "set" && source.modifier.operation !== "allow") throw new Error("POST_POWER_LOWER_DEFEAT_OPERATION_INVALID");
      const sourcePower = Number(powers[source.sourcePlayer.id]);
      const targetPower = Number(powers[targetPlayerId]);
      if (Number.isFinite(sourcePower) && Number.isFinite(targetPower) && targetPower < sourcePower) defeated.add(targetPlayerId);
    }
  }
  return participantIds.filter((playerId) => defeated.has(playerId));
}

/** Generic self-regression rule evaluated after frozen combat power is known. */
export function getStructuredPostPowerCloseAllAttackTargetIds(
  state: GameState,
  participantIds: readonly string[],
  powers: Record<string, number>,
  definitions: Record<string, CardDefinition>,
): string[] {
  const targets = new Set<string>();
  for (const playerId of participantIds) {
    if (state.activePlayerId !== playerId) continue;
    const sources = collectStructuredRuleModifiers(state, playerId, definitions, "combat_post_power_close_all_attacks_above");
    if (sources.some((source) => source.modifier.operation === "ignore")) continue;
    for (const source of sources) {
      if (source.modifier.operation !== "set") throw new Error("POST_POWER_CLOSE_OPERATION_INVALID");
      const threshold = Number(source.modifier.value);
      if (!Number.isFinite(threshold)) throw new Error("POST_POWER_CLOSE_THRESHOLD_INVALID");
      if (Number(powers[playerId] ?? 0) > threshold) targets.add(playerId);
    }
  }
  return participantIds.filter((playerId) => targets.has(playerId));
}

export interface StructuredStandardAppendRule {
  extraCost: number;
}

/**
 * Resolve a continuous permission to use one selected card as the extra card in
 * an ordinary standard attack. The surcharge is intentionally separate from
 * card_cost because it applies only when the card actually occupies the append
 * slot, not when the same card is played as part of the normal card count.
 */
export function getStructuredStandardAppendRule(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): StructuredStandardAppendRule | undefined {
  const allowed = collectStructuredRuleModifiers(state, playerId, definitions, "standard_append")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition))
    .some((source) => source.modifier.operation === "allow");
  if (!allowed) return undefined;
  const costSources = collectStructuredRuleModifiers(state, playerId, definitions, "standard_append_cost")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition));
  const extraCost = costSources.length > 0 ? applyStructuredNumericRuleModifiers(0, costSources, { targetDefinition: definition }) : 0;
  if (!Number.isInteger(extraCost) || extraCost < 0) throw new Error("STANDARD_APPEND_COST_INVALID");
  return { extraCost };
}

export function isStructuredSkillUseForbidden(
  state: GameState,
  playerId: string,
  skillId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "skill_use").some((source) => {
    if (source.modifier.operation !== "forbid") return false;
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    if (Array.isArray(scope.skillDefinitionIds) && !scope.skillDefinitionIds.includes(skillId)) return false;
    const cardFilter = isRecord(scope.skillCard) ? scope.skillCard : undefined;
    if (!cardFilter) return true;
    const player = state.players[playerId];
    const matching = Object.values(state.cards).filter((instance) => {
      if (instance.ownerPlayerId !== playerId) return false;
      const definition = definitions[instance.definitionId];
      if (!definition || (definition.id !== skillId && definition.linkedSkillId !== skillId)) return false;
      if (Array.isArray(cardFilter.zones) && !cardFilter.zones.includes(instance.zone)) return false;
      if (typeof cardFilter.face === "string" && instance.face !== cardFilter.face) return false;
      if (cardFilter.notInAttack === true && instance.zone === "attack") return false;
      if (cardFilter.trueNameRelease === true && definition.revealsTrueNameOnPlay !== true) return false;
      if (Array.isArray(cardFilter.definitionIds) && !cardFilter.definitionIds.includes(definition.id) && !cardFilter.definitionIds.includes(definition.linkedSkillId)) return false;
      if (Array.isArray(cardFilter.excludeDefinitionIds) && (cardFilter.excludeDefinitionIds.includes(definition.id) || cardFilter.excludeDefinitionIds.includes(definition.linkedSkillId))) return false;
      if (Array.isArray(cardFilter.ownerDefinitionIds) && !cardFilter.ownerDefinitionIds.includes(definition.ownerDefinitionId)) return false;
      const attributes = getCardAttributes(definition);
      if (Array.isArray(cardFilter.attributesAny) && !cardFilter.attributesAny.some((attribute) => attributes.includes(String(attribute) as never))) return false;
      if (Array.isArray(cardFilter.attributesAll) && !cardFilter.attributesAll.every((attribute) => attributes.includes(String(attribute) as never))) return false;
      return true;
    });
    return Boolean(player && matching.length > 0);
  });
}

/** Return combat participants that a structured rule explicitly adds to the winner set. */
/** True when a continuous/round rule explicitly removes a player from combat-winner eligibility. */
export function isStructuredCombatWinnerForbidden(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "combat_winner_eligibility")
    .some((source) => source.modifier.operation === "forbid");
}

export function getStructuredCombatWinnerInclusions(
  state: GameState,
  participantIds: string[],
  definitions: Record<string, CardDefinition>,
  currentWinnerIds: string[] = [],
): string[] {
  return participantIds.filter((playerId) => collectStructuredRuleModifiers(state, playerId, definitions, "combat_winner_inclusion")
    .some((source) => {
      if (source.modifier.operation !== "allow") return false;
      const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
      const requiredSkillId = typeof scope.whenOtherWinnerControlsOrHasSkillDefinitionId === "string"
        ? scope.whenOtherWinnerControlsOrHasSkillDefinitionId
        : undefined;
      if (!requiredSkillId) return true;
      return currentWinnerIds.some((winnerId) => {
        if (winnerId === playerId) return false;
        const winner = state.players[winnerId];
        if (!winner || winner.eliminated) return false;
        const physicalIds = [...winner.attack, ...winner.masterSkills, ...winner.servantSkills];
        return physicalIds.some((instanceId) => {
          const instance = state.cards[instanceId];
          const definition = instance ? definitions[instance.definitionId] : undefined;
          if (!instance || !definition) return false;
          const matches = instance.definitionId === requiredSkillId
            || instance.definitionId === `card.skill.${requiredSkillId}`
            || definition.linkedSkillId === requiredSkillId;
          if (!matches) return false;
          if (instance.zone === "attack") return instance.controllerPlayerId === winnerId;
          return instance.zone === "master-skills" || instance.zone === "servant-skills";
        });
      });
    }));
}

export function shouldEachCombatWinnerReceiveFullReward(
  state: GameState,
  winnerIds: string[],
  definitions: Record<string, CardDefinition>,
): boolean {
  let enabled = false;
  for (const winnerId of winnerIds) {
    const sources = collectStructuredRuleModifiers(state, winnerId, definitions, "combat_reward_distribution");
    for (const source of sources) {
      const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
      if (source.sourcePlayer.id !== winnerId) continue;
      if (scope.whenControllerWins !== true) continue;
      if (scope.mode !== "full_reward_each") throw new Error("RULE_MODIFIER_VALUE_INVALID");
      if (source.modifier.operation !== "replace") throw new Error("RULE_MODIFIER_OPERATION_UNSUPPORTED");
      enabled = true;
    }
  }
  return enabled;
}

export function assertStructuredCardBatchAllowed(
  state: GameState,
  playerId: string,
  instanceIds: string[],
  definitions: Record<string, CardDefinition>,
): void {
  if (instanceIds.length <= 1) return;
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "card_play_with_others");
  for (const source of sources) {
    if (source.modifier.operation !== "forbid") continue;
    const matched = instanceIds.some((instanceId) => {
      const instance = state.cards[instanceId];
      const definition = instance ? definitions[instance.definitionId] : undefined;
      return Boolean(instance && definition && structuredModifierMatchesCard(state, definitions, source, instance, definition));
    });
    if (matched) throw new Error("CARD_MUST_BE_PLAYED_ALONE");
  }
}

export function isStructuredDefeatIgnored(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  if (Number(state.players[playerId]?.flags.ignoreDefeatRound ?? -1) === state.round) return true;
  return collectStructuredRuleModifiers(state, playerId, definitions, "defeat")
    .some((source) => source.modifier.operation === "ignore");
}

/** Additional mana an opposing effect controller must pay to defeat this player. */
export function getStructuredOpponentDefeatManaCost(
  state: GameState,
  targetPlayerId: string,
  definitions: Record<string, CardDefinition>,
): number {
  const sources = collectStructuredRuleModifiers(state, targetPlayerId, definitions, "defeat_cost");
  let total = 0;
  for (const source of sources) {
    if (source.modifier.operation !== "add") throw new Error("DEFEAT_COST_OPERATION_UNSUPPORTED");
    const amount = resolveModifierNumber(source.modifier.value, source, { state, definitions });
    if (!Number.isInteger(amount) || amount < 0) throw new Error("DEFEAT_COST_VALUE_INVALID");
    total += amount;
  }
  return total;
}

export interface StructuredCardPlayUpgrade {
  extraMana: number;
  addAttributes: string[];
  powerBonus: number;
  sourceId: string;
}

/** Optional play-time upgrade granted by an active/owned continuous rule source. */
export function getStructuredCardPlayUpgrade(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): StructuredCardPlayUpgrade | undefined {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "card_play_upgrade")
    .filter((source) => source.modifier.operation === "allow")
    .filter((source) => structuredModifierMatchesCard(state, definitions, source, instance, definition));
  if (sources.length === 0) return undefined;
  const parsed = sources.map((source) => {
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    const extraMana = Number(scope.extraMana ?? 0);
    const powerBonus = Number(scope.powerBonus ?? 0);
    const addAttributes = Array.isArray(scope.addAttributes)
      ? scope.addAttributes.filter((attribute): attribute is string => typeof attribute === "string" && attribute.length > 0)
      : [];
    if (!Number.isInteger(extraMana) || extraMana < 0 || !Number.isInteger(powerBonus)) throw new Error("CARD_PLAY_UPGRADE_INVALID");
    return {
      extraMana,
      powerBonus,
      addAttributes,
      sourceId: source.sourceDefinition?.id ?? source.modifier.id,
    };
  });
  const signatures = [...new Set(parsed.map((item) => `${item.extraMana}:${item.powerBonus}:${[...item.addAttributes].sort().join(",")}`))];
  if (signatures.length > 1) throw new Error("CARD_PLAY_UPGRADE_CONFLICT_UNRESOLVED");
  return parsed[0];
}

/** Whether base-rule victory-point awards (combat/scouting) are forbidden for this player. */
export function isStructuredNonEffectVictoryPointGainForbidden(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "non_effect_victory_point_gain")
    .some((source) => source.modifier.operation === "forbid");
}

export type VictoryPointGainSource = "objective" | "competition" | "command_seal" | "scouting";

/** Apply source-specific VP replacement/multiplier text without overloading the global gain boundary. */
export function getStructuredVictoryPointGainForSource(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  sourceKind: VictoryPointGainSource,
  base: number,
): number {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "victory_point_gain")
    .filter((source) => {
      const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
      const listed = Array.isArray(scope.sources) ? scope.sources.filter((value): value is string => typeof value === "string") : [];
      return listed.length === 0 || listed.includes(sourceKind);
    });
  if (sources.length === 0) return base;
  return Math.max(0, applyStructuredNumericRuleModifiers(base, sources, { state, definitions }));
}

/** Resolve a continuous integer setting such as Leonidas' face-up-card cap. */
export function getStructuredIntegerSetting(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  rule: string,
): number | undefined {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, rule);
  if (sources.length === 0) return undefined;
  const values = sources.filter((source) => source.modifier.operation === "set").map((source) => resolveModifierNumber(source.modifier.value, source, { state, definitions }));
  if (values.length !== sources.length) throw new Error("RULE_MODIFIER_OPERATION_UNSUPPORTED");
  const distinct = [...new Set(values)];
  if (distinct.length > 1) throw new Error("RULE_MODIFIER_CONFLICT_UNRESOLVED");
  return distinct[0];
}

export function getFaceUpCardsPerRoundLimit(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): number | undefined {
  return getStructuredIntegerSetting(state, playerId, definitions, "face_up_cards_per_round");
}

export function assertFaceUpCardPlayAllowed(
  state: GameState,
  playerId: string,
  additionalFaceUpCards: number,
  definitions: Record<string, CardDefinition>,
): void {
  if (!Number.isInteger(additionalFaceUpCards) || additionalFaceUpCards < 0) throw new Error("FACE_UP_PLAY_COUNT_INVALID");
  const limit = getFaceUpCardsPerRoundLimit(state, playerId, definitions);
  if (limit === undefined) return;
  const player = state.players[playerId];
  const alreadyPlayed = Number(player?.flags.faceUpCardsPlayedThisRound ?? 0);
  if (!Number.isInteger(alreadyPlayed) || alreadyPlayed < 0) throw new Error("FACE_UP_PLAY_HISTORY_INVALID");
  if (alreadyPlayed + additionalFaceUpCards > limit) throw new Error("FACE_UP_PLAY_LIMIT_EXCEEDED");
}

export function recordFaceUpCardPlay(state: GameState, playerId: string, count: number): void {
  if (!Number.isInteger(count) || count < 0) throw new Error("FACE_UP_PLAY_COUNT_INVALID");
  if (count === 0) return;
  const player = state.players[playerId];
  if (!player) throw new Error("PLAYER_NOT_FOUND");
  player.flags.faceUpCardsPlayedThisRound = Number(player.flags.faceUpCardsPlayedThisRound ?? 0) + count;
}

export function consumeStructuredEliminationReplacement(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "elimination")
    .filter((source) => source.modifier.operation === "replace");
  if (sources.length === 0) return false;
  if (sources.length > 1) throw new Error("RULE_MODIFIER_CONFLICT_UNRESOLVED");
  const source = sources[0];
  const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
  if (scope.replacement !== "remove_source_card") throw new Error("ELIMINATION_REPLACEMENT_UNSUPPORTED");
  const player = state.players[playerId];
  const instance = source.sourceInstance;
  if (!player || !instance || (instance.ownerPlayerId !== playerId && instance.controllerPlayerId !== playerId)) {
    throw new Error("ELIMINATION_REPLACEMENT_SOURCE_INVALID");
  }
  for (const zoneKey of ["hand", "deck", "discard", "attack", "masterSkills", "servantSkills"] as const) {
    player[zoneKey] = player[zoneKey].filter((id) => id !== instance.instanceId);
  }
  instance.zone = "removed";
  instance.face = "down";
  instance.active = false;
  instance.residual = false;
  const nextRoundMultiplier = Number(scope.nextRoundVictoryPointGainMultiplier ?? 1);
  if (!Number.isInteger(nextRoundMultiplier) || nextRoundMultiplier < 1) throw new Error("ELIMINATION_REPLACEMENT_VP_MULTIPLIER_INVALID");
  if (nextRoundMultiplier > 1) player.flags.nextRoundVictoryPointGainMultiplier = nextRoundMultiplier;
  return true;
}
export function isStructuredCardPlayForbidden(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): boolean {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "card_play");
  // A controller-scoped ignore modifier represents text such as "ignore card
  // effects that prevent you from playing cards". It suppresses authored card
  // prohibitions only; base timing, costs, hand ownership, situation rules and
  // every other non-card legality gate remain enforced elsewhere.
  if (sources.some((source) => source.modifier.operation === "ignore" && source.sourcePlayer.id === playerId)) return false;
  return sources.some((source) => {
    if (source.modifier.operation !== "forbid") return false;
    return structuredModifierMatchesCard(state, definitions, source, instance, definition);
  });
}

/** True when continuous card text says to ignore card effects that prevent this controller from playing cards. */
export function ignoresCardEffectPlayRestrictions(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "card_play")
    .some((source) => source.modifier.operation === "ignore" && source.sourcePlayer.id === playerId);
}

/**
 * Whether continuous card text forbids the player from drawing cards.
 * A forbidden draw resolves as zero cards instead of invalidating the enclosing
 * command, so mandatory draw windows and composite effects remain deterministic.
 */
export function isStructuredCardDrawForbidden(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "card_draw")
    .some((source) => source.modifier.operation === "forbid");
}

export function isStructuredCardCloseForbidden(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "card_close").some((source) => {
    if (source.modifier.operation !== "forbid") return false;
    return structuredModifierMatchesCard(state, definitions, source, instance, definition);
  });
}

export function isStructuredDeploymentResourceGainForbidden(
  state: GameState,
  playerId: string,
  resource: "mana" | "victory_points",
  locationId: string,
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "deployment_resource_gain").some((source) => {
    if (source.modifier.operation !== "forbid") return false;
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    if (typeof scope.resource === "string" && scope.resource !== resource) return false;
    if (Array.isArray(scope.locationIds) && !scope.locationIds.includes(locationId)) return false;
    return true;
  });
}

export function isStructuredMovementDestinationForbidden(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  context: { method: "regular" | "effect"; fromLocationId: string; toLocationId: string },
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "movement_destinations").some((source) => {
    if (source.modifier.operation !== "forbid") return false;
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    if (typeof scope.method === "string" && scope.method !== context.method) return false;
    if (Array.isArray(scope.fromLocationIds) && !scope.fromLocationIds.includes(context.fromLocationId)) return false;
    if (Array.isArray(scope.toLocationIds) && !scope.toLocationIds.includes(context.toLocationId)) return false;
    if (scope.sourceLocationBoundary === true) {
      const sourceLocationId = source.sourcePlayer.locationId;
      if (!sourceLocationId || (context.fromLocationId !== sourceLocationId && context.toLocationId !== sourceLocationId)) return false;
    }
    return true;
  });
}

/** Explicit card-text permission for a phase ability to move against its base direction. */
export function isStructuredCardAbilityMoveDirectionAllowed(
  state: GameState,
  playerId: string,
  instance: CardInstance,
  definition: CardDefinition,
  direction: "forward" | "backward",
  definitions: Record<string, CardDefinition>,
): boolean {
  return collectStructuredRuleModifiers(state, playerId, definitions, "card_ability_move_direction").some((source) => {
    if (source.modifier.operation !== "allow") return false;
    if (!structuredModifierMatchesCard(state, definitions, source, instance, definition)) return false;
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    return Array.isArray(scope.directions) && scope.directions.includes(direction);
  });
}

export interface StructuredStandardAttackCardCountRule {
  minCount: number;
  maxCount: number;
  closeSourceWhenHandEmpty: boolean;
  sourceInstanceIds: string[];
}

/**
 * Resolve a card-text replacement for the ordinary standard-attack batch size.
 * This models the batch itself; append/single-card legality remains a separate,
 * more specific card rule. Conflicting replacement ranges require an explicit
 * rules ruling instead of silently choosing one.
 */
export function getStructuredStandardAttackCardCountRule(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): StructuredStandardAttackCardCountRule | undefined {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "standard_attack_card_count")
    .filter((source) => source.modifier.operation === "replace");
  if (sources.length === 0) return undefined;
  const parsed = sources.map((source) => {
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    const minCount = Number(scope.minCount);
    const maxCount = Number(scope.maxCount);
    if (!Number.isInteger(minCount) || !Number.isInteger(maxCount) || minCount < 0 || maxCount < minCount) {
      throw new Error("STANDARD_ATTACK_CARD_COUNT_RULE_INVALID");
    }
    return {
      minCount,
      maxCount,
      closeSourceWhenHandEmpty: scope.closeSourceWhenHandEmpty === true,
      sourceInstanceId: source.sourceInstance?.instanceId,
    };
  });
  const signatures = [...new Set(parsed.map((item) => `${item.minCount}:${item.maxCount}:${item.closeSourceWhenHandEmpty}`))];
  if (signatures.length !== 1) throw new Error("RULE_MODIFIER_CONFLICT_UNRESOLVED");
  return {
    minCount: parsed[0].minCount,
    maxCount: parsed[0].maxCount,
    closeSourceWhenHandEmpty: parsed[0].closeSourceWhenHandEmpty,
    sourceInstanceIds: [...new Set(parsed.map((item) => item.sourceInstanceId).filter((id): id is string => Boolean(id)))],
  };
}

export function getStructuredMovementCost(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
  baseCost: number,
  context: { method: "regular" | "effect"; fromLocationId: string; toLocationId: string },
): number {
  const sources = collectStructuredRuleModifiers(state, playerId, definitions, "movement_cost").filter((source) => {
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    if (typeof scope.method === "string" && scope.method !== context.method) return false;
    if (Array.isArray(scope.fromLocationIds) && !scope.fromLocationIds.includes(context.fromLocationId)) return false;
    if (Array.isArray(scope.toLocationIds) && !scope.toLocationIds.includes(context.toLocationId)) return false;
    return true;
  });
  const locationOrder = ["workshop", "mountain", "city", "scouting"];
  const fromIndex = locationOrder.indexOf(context.fromLocationId);
  const toIndex = locationOrder.indexOf(context.toLocationId);
  const distance = fromIndex >= 0 && toIndex >= 0 ? Math.abs(toIndex - fromIndex) : 0;
  const scaledSources = sources.map((source) => {
    const scope = isRecord(source.modifier.scope) ? source.modifier.scope : {};
    if (scope.perSpace !== true) return source;
    if (source.modifier.operation !== "add" && source.modifier.operation !== "subtract") throw new Error("MOVEMENT_COST_PER_SPACE_OPERATION_INVALID");
    const amount = Number(source.modifier.value);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(distance)) throw new Error("MOVEMENT_COST_PER_SPACE_VALUE_INVALID");
    return { ...source, modifier: { ...source.modifier, value: amount * distance } };
  });
  return Math.max(0, applyStructuredNumericRuleModifiers(baseCost, scaledSources));
}
