import type { GameState, GameAction, PhaseId } from "../domain/state/types.ts";
import type { SkillAbilityDefinition, SkillContext, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { getCardAttributes } from "./content-types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createUsageRecord, isUsageAvailable } from "./usage-limits.ts";
import { payMana } from "./costs.ts";
import { assertSkillRuleProgram } from "./skill-rule-program.ts";

export class SkillRegistry {
  readonly #definitions = new Map<string, SkillDefinition>();
  readonly #handlers = new Map<string, SkillHandler>();
  readonly #legality = new Map<string, SkillLegalityPredicate>();

  register(definition: SkillDefinition, handler?: SkillHandler): void {
    if (this.#definitions.has(definition.id)) throw new Error("SKILL_ID_DUPLICATE");
    if (!["FULL", "PARTIAL", "MANUAL", "DISABLED"].includes(definition.supportLevel)) throw new Error("SKILL_SUPPORT_LEVEL_INVALID");
    if (definition.cost < 0) throw new Error("SKILL_COST_INVALID");
    if ((definition.abilityCost ?? 0) < 0) throw new Error("SKILL_ABILITY_COST_INVALID");
    if (definition.supportLevel === "FULL" && ["phase", "optional-trigger"].includes(definition.activation) && definition.windows.length === 0) {
      throw new Error("SKILL_WINDOW_REQUIRED");
    }
    if (definition.abilities !== undefined) {
      if (!Array.isArray(definition.abilities) || new Set(definition.abilities.map((ability) => ability.id)).size !== definition.abilities.length) {
        throw new Error("SKILL_ABILITIES_INVALID");
      }
      for (const ability of definition.abilities) {
        if (!ability.id || !ability.name || !Array.isArray(ability.windows)) throw new Error("SKILL_ABILITY_INVALID");
        if ((ability.abilityCost ?? 0) < 0) throw new Error("SKILL_ABILITY_COST_INVALID");
        if (definition.supportLevel === "FULL" && ["phase", "optional-trigger"].includes(ability.activation) && ability.windows.length === 0) {
          throw new Error("SKILL_ABILITY_WINDOW_REQUIRED");
        }
      }
    }
    if (definition.supportLevel === "FULL" && !handler && !definition.handlerId) throw new Error("FULL_SKILL_HANDLER_REQUIRED");
    if (definition.ruleProgram) {
      assertSkillRuleProgram(definition.ruleProgram);
      if (definition.ruleProgram.skillId !== definition.id) throw new Error("SKILL_RULE_PROGRAM_ID_MISMATCH");
    }
    this.#definitions.set(definition.id, structuredClone(definition));
    if (handler) this.#handlers.set(definition.id, handler);
  }

  registerHandler(skillId: string, handler: SkillHandler, legality?: SkillLegalityPredicate): void {
    if (!this.#definitions.has(skillId)) throw new Error("SKILL_NOT_FOUND");
    if (this.#handlers.has(skillId)) throw new Error("SKILL_HANDLER_DUPLICATE");
    this.#handlers.set(skillId, handler);
    if (legality) this.#legality.set(skillId, legality);
  }

  get(id: string): SkillDefinition {
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error("SKILL_NOT_FOUND");
    return definition;
  }

  has(id: string): boolean { return this.#definitions.has(id); }

  hasHandler(id: string): boolean { return this.#handlers.has(id); }

  list(): SkillDefinition[] { return [...this.#definitions.values()].map((item) => structuredClone(item)); }

  asCardDefinitions(): Record<string, import("./content-types.ts").CardDefinition> {
    return Object.fromEntries(this.list().map((skill) => [skill.id, {
      id: skill.id,
      version: 1,
      name: skill.name,
      cardType: "skill",
      ownerType: skill.ownerType,
      ownerDefinitionId: skill.ownerId,
      linkedSkillId: skill.id,
      cost: skill.cost,
      costRule: skill.costRule,
      basePower: skill.basePower ?? 0,
      typeLabel: skill.typeLabel ?? "特殊",
      attributes: skill.attributes !== undefined
        ? getCardAttributes({ attributes: skill.attributes, typeLabel: "" })
        : getCardAttributes({ typeLabel: skill.typeLabel ?? (skill.tags ?? []).join("/") }),
      isSkill: true,
      residual: skill.activation === "residual",
      skillOwnerType: skill.ownerType,
      requiresEightMana: skill.requiresEightMana ?? (skill.requirement === undefined
        ? !skill.tags?.includes("ignores-eight-mana")
        : skill.requirement >= 8),
      hiddenTrueNameCostReduction: skill.hiddenTrueNameCostReduction,
      limit: skill.limit,
      requiresTrueName: skill.requiresTrueName,
      revealsTrueNameOnPlay: skill.revealsTrueNameOnPlay,
      requiresHiddenTrueName: skill.requiresHiddenTrueName,
      hasReversalEffect: skill.hasReversalEffect,
      ignoresSituationRestrictions: skill.ignoresSituationRestrictions,
      playDrawIfWithBasicAttack: skill.playDrawIfWithBasicAttack,
      appendFromHand: skill.appendFromHand,
      singleCardPlay: skill.singleCardPlay,
      standardAppend: skill.standardAppend,
      uniqueGroup: skill.uniqueGroup,
      tags: skill.tags,
      effects: skill.effects?.map((effect) => ({ ...effect })),
      unparsedEffects: skill.unparsedEffects ? [...skill.unparsedEffects] : undefined,
      clauses: skill.clauses?.map((clause) => ({ ...clause })),
      ruleProgram: skill.ruleProgram ? structuredClone(skill.ruleProgram) : undefined,
      text: skill.text,
      phases: skill.windows.length ? [...skill.windows] : undefined,
      steps: skill.steps?.length ? [...skill.steps] : undefined,
      implementation: {
        level: skill.supportLevel,
        ...(skill.handlerId ? { handlerId: skill.handlerId } : {}),
      },
      sourceRefs: skill.sourceRefs?.map((source) => ({ ...source })),
    }]));
  }

  getLegalActions(state: GameState, playerId: string, definitions?: Record<string, CardDefinition>): GameAction[] {
    const player = state.players[playerId];
    if (!player || player.eliminated || state.status !== "playing" || state.pendingDecision) return [];
    const actions: GameAction[] = [];
    for (const skill of this.list()) {
      if (skill.supportLevel !== "FULL" || !this.#handlers.has(skill.id) || !this.owns(player, skill)) continue;
      const abilities = skill.abilities?.length ? skill.abilities : [undefined];
      for (const ability of abilities) {
        if (!this.isLegal(state, playerId, skill, ability, definitions)) continue;
        actions.push({
          type: "skill.use",
          label: ability ? `${skill.name}·${ability.name}` : skill.name,
          payload: { skillId: skill.id, ...(ability ? { data: { abilityId: ability.id } } : {}) },
        });
      }
    }
    return actions;
  }

  execute(state: GameState, playerId: string, skillId: string, payload: unknown, openDecision: SkillContext["openDecision"], randomInt: SkillContext["randomInt"] = () => 0, definitions?: Record<string, CardDefinition>): unknown {
    const player = state.players[playerId];
    if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
    const skill = this.get(skillId);
    if (skill.supportLevel === "DISABLED") throw new Error("SKILL_DISABLED");
    if (!this.owns(player, skill)) throw new Error("SKILL_NOT_OWNED");
    const requestedAbilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
    const ability = skill.abilities?.length
      ? skill.abilities.find((item) => item.id === requestedAbilityId)
      : undefined;
    if (skill.abilities?.length && !ability) throw new Error(requestedAbilityId ? "SKILL_ABILITY_UNKNOWN" : "SKILL_ABILITY_REQUIRED");
    if (!this.isLegal(state, playerId, skill, ability, definitions)) throw new Error("SKILL_USE_FORBIDDEN");
    const handler = this.#handlers.get(skill.id);
    if (!handler || skill.supportLevel !== "FULL") throw new Error("SKILL_NOT_IMPLEMENTED");
    const activation = ability?.activation ?? skill.activation;
    const effectiveLimit = resolveSkillUsageLimit(ability?.limit ?? skill.limit, activation);
    const uniqueGroup = ability?.uniqueGroup ?? skill.uniqueGroup;
    const usageKey = ability ? `${skill.id}:${ability.id}` : skill.id;
    const uniqueUsageKey = uniqueGroup ? `__unique:${uniqueGroup}` : undefined;
    const effectiveSkill = ability
      ? { ...skill, activation, windows: ability.windows, steps: ability.steps ?? skill.steps, abilityCost: ability.abilityCost ?? skill.abilityCost, limit: effectiveLimit, uniqueGroup, requiresActiveCard: ability.requiresActiveCard ?? skill.requiresActiveCard }
      : effectiveLimit === skill.limit ? skill : { ...skill, limit: effectiveLimit };
    const manaBefore = player.mana;
    const usageBefore = player.usage[usageKey];
    const uniqueUsageBefore = uniqueUsageKey ? player.usage[uniqueUsageKey] : undefined;
    try {
      payMana(player, effectiveSkill.abilityCost ?? 0);
      player.usage[usageKey] = createUsageRecord(effectiveSkill.limit, state.round, state.phase);
      if (uniqueUsageKey) player.usage[uniqueUsageKey] = createUsageRecord("once-per-round", state.round, state.phase);
      const handlerPayload = ability && isRecord(payload) ? { ...payload, abilityId: ability.id } : ability ? { abilityId: ability.id, value: payload } : payload;
      const handlerResult = handler({ state, player, skill: effectiveSkill, payload: handlerPayload, openDecision, randomInt, definitions });
      if (effectiveSkill.ownerType === "servant" && effectiveSkill.activation !== "passive" && effectiveSkill.revealsTrueNameOnSkillUse) {
        player.trueNameRevealed = true;
      }
      return handlerResult;
    } catch (error) {
      player.mana = manaBefore;
      if (usageBefore === undefined) delete player.usage[usageKey];
      else player.usage[usageKey] = usageBefore;
      if (uniqueUsageKey) {
        if (uniqueUsageBefore === undefined) delete player.usage[uniqueUsageKey];
        else player.usage[uniqueUsageKey] = uniqueUsageBefore;
      }
      throw error;
    }
  }

  private owns(player: GameState["players"][string], skill: SkillDefinition): boolean {
    return skill.ownerType === "master" ? player.masterId === skill.ownerId : player.servantId === skill.ownerId;
  }

  private isLegal(state: GameState, playerId: string, skill: SkillDefinition, ability?: SkillAbilityDefinition, definitions?: Record<string, CardDefinition>): boolean {
    const activation = ability?.activation ?? skill.activation;
    const windows = ability?.windows ?? skill.windows;
    const steps = ability?.steps ?? skill.steps;
    const requiresActiveCard = ability?.requiresActiveCard ?? skill.requiresActiveCard;
    if (activation === "passive" || activation === "play" || activation === "residual") return false;
    if (state.activePlayerId !== playerId || !windows.includes(state.phase as PhaseId)) return false;
    if (state.step === "post-power-response" && !steps?.includes("post-power-response")) return false;
    if (steps?.length && !steps.includes(state.step)) return false;
    const forbiddenAttributes = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
    const skillAttributes = skill.attributes !== undefined
      ? getCardAttributes({ attributes: skill.attributes, typeLabel: skill.typeLabel ?? "" })
      : getCardAttributes({ typeLabel: skill.typeLabel ?? "" });
    if (forbiddenAttributes.some((attribute) => skillAttributes.includes(attribute))) return false;
    if (skill.requiresTrueName && !state.players[playerId].trueNameRevealed) return false;
    if (skill.requiresHiddenTrueName && state.players[playerId].trueNameRevealed) return false;
    if (requiresActiveCard && !state.players[playerId].attack.some((instanceId) => {
      const instance = state.cards[instanceId];
      return instance?.definitionId === skill.id && instance.active && instance.face === "up";
    })) return false;
    const handlerLegality = this.#legality.get(skill.id);
    if (handlerLegality && !handlerLegality(state, playerId, skill, ability, definitions)) return false;
    const usageKey = ability ? `${skill.id}:${ability.id}` : skill.id;
    const usageLimit = resolveSkillUsageLimit(ability?.limit ?? skill.limit, activation);
    if (!isUsageAvailable(state.players[playerId].usage[usageKey], usageLimit, state.round, state.phase)) return false;
    const uniqueGroup = ability?.uniqueGroup ?? skill.uniqueGroup;
    if (uniqueGroup && !isUsageAvailable(state.players[playerId].usage[`__unique:${uniqueGroup}`], "once-per-round", state.round, state.phase)) return false;
    return true;
  }
}

/** Rules default every phase/optional-trigger ability to once per round unless a card explicitly says otherwise. */
function resolveSkillUsageLimit(limit: SkillUsageLimit | undefined, activation: SkillDefinition["activation"]): SkillUsageLimit | undefined {
  if (limit) return limit;
  return activation === "phase" || activation === "optional-trigger" ? "once-per-round" : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
