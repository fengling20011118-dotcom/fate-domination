import type { GameState, GameAction, PhaseId } from "../domain/state/types.ts";
import type { SkillAbilityDefinition, SkillContext, SkillDefinition, SkillHandler, SkillLegalityPredicate } from "./skill-types.ts";
import { getCardAttributes } from "./content-types.ts";
import type { CardDefinition } from "./content-types.ts";
import { createUsageRecord, isUsageAvailable } from "./usage-limits.ts";
import { payManaCost } from "./costs.ts";
import { assertSkillRuleProgram } from "./skill-rule-program.ts";
import { isStructuredSkillUseForbidden } from "./rule-modifiers.ts";
import { captureStateFacts, emitStateFactDiff } from "./state-facts.ts";
import { isOtherPlayerAbilityEffectIgnored, runWithOtherPlayerAbilityImmunity } from "./ability-immunity.ts";
import { revealPlayerTrueName, revealUsedSkillCard } from "./skill-visibility.ts";
import { cardAllowsActionAbilityInCombat, getActionAbilityCombatLimit, playerAllowsActionAbilitiesInCombat } from "./card-rule-modifiers.ts";
import { playerIsDisarmed, playerNoblePhantasmUseBlocked } from "./player-statuses.ts";
import { applyActivatedAbilityReplacement, getActivatedAbilityReplacement } from "./ability-replacement.ts";
import { isPlayerUnaffectedBySituation } from "./situation-immunity.ts";
import { ignoresSituationNoblePhantasmBan } from "./situation-replacements.ts";
import { consumeSkillAbilityReuse, hasSkillAbilityReuse } from "./ability-reuse.ts";
import { getOwnedFullTextSkillCopy, getOwnedSkillCopyReplacement } from "./skill-copies.ts";
import { getPhysicalSkillUseBlocks, getSkillUseBlocks } from "./skill-use-blocks.ts";
import { isAbilityActivationBlocked, isCardSourceAbilityActivationBlocked } from "./ability-activation-restrictions.ts";
import { hasRulerSealWinRewardFromSource, listRulerSealsControlledBy } from "./ruler-seals.ts";
import { isCardTextSuppressed } from "./card-text.ts";

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
      cardType: skill.materializedCardType ?? "skill",
      ownerType: skill.ownerType,
      ownerDefinitionId: skill.ownerId,
      linkedSkillId: skill.id,
      unlockLatestRound: skill.unlockLatestRound,
      requiresSkillUsedThisRound: skill.requiresSkillUsedThisRound,
      playPrerequisite: skill.playPrerequisite ? { ...skill.playPrerequisite } : undefined,
      automaticDeckRecycleKeepMax: skill.automaticDeckRecycleKeepMax,
      cost: skill.cost,
      requirement: skill.requirement,
      costRule: skill.costRule,
      variablePlayAttributeChoice: skill.variablePlayAttributeChoice ? { allowedAttributes: [...skill.variablePlayAttributeChoice.allowedAttributes], manaPerAttribute: skill.variablePlayAttributeChoice.manaPerAttribute } : undefined,
      playAttributeDeclaration: skill.playAttributeDeclaration
        ? { allowedAttributes: [...skill.playAttributeDeclaration.allowedAttributes], uniquePerGame: skill.playAttributeDeclaration.uniquePerGame, repeatAllowedWithOwnedSkillId: skill.playAttributeDeclaration.repeatAllowedWithOwnedSkillId }
        : undefined,
      requiresActiveInSkillZoneToPlay: skill.requiresActiveInSkillZoneToPlay,
      optionalFreePlay: skill.optionalFreePlay ? { ...skill.optionalFreePlay } : undefined,
      alternativePlayCost: skill.alternativePlayCost ? { ...skill.alternativePlayCost } : undefined,
      alternateManaPayer: skill.alternateManaPayer ? { ...skill.alternateManaPayer } : undefined,
      attackManaShare: skill.attackManaShare ? { ...skill.attackManaShare } : undefined,
      pairedPlayOtherCostReduction: skill.pairedPlayOtherCostReduction,
      pairedPlayOtherCostIncrease: skill.pairedPlayOtherCostIncrease,
      pairedWithDefinitionCostIncrease: skill.pairedWithDefinitionCostIncrease ? { ...skill.pairedWithDefinitionCostIncrease } : undefined,
      pairedPlayOtherPowerBonus: skill.pairedPlayOtherPowerBonus,
      terrainAdvantageCostReduction: skill.terrainAdvantageCostReduction,
      commandSealPlayCost: skill.commandSealPlayCost,
      victoryPointPlayCost: skill.victoryPointPlayCost,
      playRequiresPlayerFlag: skill.playRequiresPlayerFlag ? { ...skill.playRequiresPlayerFlag } : undefined,
      basePower: skill.basePower ?? 0,
      basePowerFormula: skill.basePowerFormula ? structuredClone(skill.basePowerFormula) : undefined,
      typeLabel: skill.typeLabel ?? "特殊",
      attributes: skill.attributes !== undefined
        ? getCardAttributes({ attributes: skill.attributes, typeLabel: "" })
        : getCardAttributes({ typeLabel: skill.typeLabel ?? (skill.tags ?? []).join("/") }),
      basicCardPowerBonus: skill.basicCardPowerBonus,
      basicCardPowerBonusAttributes: skill.basicCardPowerBonusAttributes ? [...skill.basicCardPowerBonusAttributes] : undefined,
      basicCardPowerBonusCondition: skill.basicCardPowerBonusCondition,
      playerDefeatIgnoreCondition: skill.playerDefeatIgnoreCondition,
      protectsControllerCardsFromOpponents: skill.protectsControllerCardsFromOpponents,
      activeOwnedCardAttributeGrant: skill.activeOwnedCardAttributeGrant ? { targetDefinitionIds: [...skill.activeOwnedCardAttributeGrant.targetDefinitionIds], attributes: [...skill.activeOwnedCardAttributeGrant.attributes] } : undefined,
      globalActiveCardAttributeGrant: skill.globalActiveCardAttributeGrant ? { targetDefinitionIds: [...skill.globalActiveCardAttributeGrant.targetDefinitionIds], attributes: [...skill.globalActiveCardAttributeGrant.attributes] } : undefined,
      linkedPlayerSameBattlefieldAttributeTransform: skill.linkedPlayerSameBattlefieldAttributeTransform
        ? {
            playerFlag: skill.linkedPlayerSameBattlefieldAttributeTransform.playerFlag,
            removeAttributes: skill.linkedPlayerSameBattlefieldAttributeTransform.removeAttributes ? [...skill.linkedPlayerSameBattlefieldAttributeTransform.removeAttributes] : undefined,
            addAttributes: skill.linkedPlayerSameBattlefieldAttributeTransform.addAttributes ? [...skill.linkedPlayerSameBattlefieldAttributeTransform.addAttributes] : undefined,
          }
        : undefined,
      isSkill: (skill.materializedCardType ?? "skill") === "skill",
      residual: skill.cardResidual ?? (skill.activation === "residual"),
      skillOwnerType: skill.ownerType,
      requiresEightMana: skill.requiresEightMana ?? (skill.requirement === undefined
        ? !skill.tags?.includes("ignores-eight-mana")
        : skill.requirement >= 8),
      eightManaWaiverMaxPrintedBasePower: skill.eightManaWaiverMaxPrintedBasePower,
      lowManaSkillPlaySurcharge: skill.lowManaSkillPlaySurcharge ? { ...skill.lowManaSkillPlaySurcharge } : undefined,
      hiddenTrueNameCostReduction: skill.hiddenTrueNameCostReduction,
      situationForbiddenAttributeCostReduction: skill.situationForbiddenAttributeCostReduction,
      otherPlayersIgnoreSituationEffects: skill.otherPlayersIgnoreSituationEffects,
      limit: skill.limit,
      requiresTrueName: skill.requiresTrueName,
      revealsTrueNameOnPlay: skill.revealsTrueNameOnPlay,
      requiresHiddenTrueName: skill.requiresHiddenTrueName,
      hasReversalEffect: skill.hasReversalEffect,
      revealsTrueNameOnReverse: skill.revealsTrueNameOnReverse,
      ignoresSituationRestrictions: skill.ignoresSituationRestrictions,
      playDrawIfWithBasicAttack: skill.playDrawIfWithBasicAttack,
      appendFromHand: skill.appendFromHand,
      singleCardPlay: skill.singleCardPlay,
      roundExclusivePlay: skill.roundExclusivePlay,
      standardAppend: skill.standardAppend,
      standardAppendIfBoardDefinitionAtControllerLocation: skill.standardAppendIfBoardDefinitionAtControllerLocation ? [...skill.standardAppendIfBoardDefinitionAtControllerLocation] : undefined,
      basePowerPerSameLocationOpponent: skill.basePowerPerSameLocationOpponent,
      basePowerZeroIfBoardDefinitionAtControllerLocation: skill.basePowerZeroIfBoardDefinitionAtControllerLocation ? [...skill.basePowerZeroIfBoardDefinitionAtControllerLocation] : undefined,
      standardAppendRequiresOwnedSkillId: skill.standardAppendRequiresOwnedSkillId,
      standardAppendStackGroup: skill.standardAppendStackGroup,
      standardAppendRequiresBatchCards: skill.standardAppendRequiresBatchCards ? structuredClone(skill.standardAppendRequiresBatchCards) : undefined,
      faceDownAttackFollowup: skill.faceDownAttackFollowup ? { ...skill.faceDownAttackFollowup } : undefined,
      uniqueGroup: skill.uniqueGroup,
      tags: skill.tags,
      cardAbilityIds: skill.cardAbilityIds ? [...skill.cardAbilityIds] : undefined,
      phases: skill.cardAbilityPhases ? [...skill.cardAbilityPhases] : undefined,
      effects: skill.effects?.map((effect) => ({ ...effect })),
      unparsedEffects: skill.unparsedEffects ? [...skill.unparsedEffects] : undefined,
      clauses: skill.clauses?.map((clause) => ({ ...clause })),
      ruleProgram: skill.ruleProgram ? structuredClone(skill.ruleProgram) : undefined,
      rules: skill.rules ? structuredClone(skill.rules) : undefined,
      text: skill.text,
      // Ability activation windows belong to SkillDefinition/abilities. They are
      // not card-play restrictions. Card face play requirements must be authored
      // separately and must never be inferred from ability timing.
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
      if (skill.supportLevel !== "FULL" || !this.#handlers.has(skill.id) || !this.owns(state, player, skill, definitions)) continue;
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

  /**
   * Validate the static/phase/usage portion of one requested skill use without
   * mutating game state.  Pre-resolution reaction windows use this boundary so
   * an illegal command cannot make opponents spend a reaction before the skill
   * itself has even passed the ordinary legality gate.
   */
  assertCanExecute(state: GameState, playerId: string, skillId: string, payload: unknown, definitions?: Record<string, CardDefinition>): void {
    const player = state.players[playerId];
    if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
    const skill = this.get(skillId);
    if (skill.supportLevel === "DISABLED") throw new Error("SKILL_DISABLED");
    if (!this.owns(state, player, skill, definitions)) throw new Error("SKILL_NOT_OWNED");
    const requestedAbilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
    const ability = skill.abilities?.length
      ? skill.abilities.find((item) => item.id === requestedAbilityId)
      : undefined;
    if (skill.abilities?.length && !ability) throw new Error(requestedAbilityId ? "SKILL_ABILITY_UNKNOWN" : "SKILL_ABILITY_REQUIRED");
    if (!this.isLegal(state, playerId, skill, ability, definitions)) throw new Error("SKILL_USE_FORBIDDEN");
    const handler = this.#handlers.get(skill.id);
    if (!handler || skill.supportLevel !== "FULL") throw new Error("SKILL_NOT_IMPLEMENTED");
  }

  execute(state: GameState, playerId: string, skillId: string, payload: unknown, openDecision: SkillContext["openDecision"], randomInt: SkillContext["randomInt"] = () => 0, definitions?: Record<string, CardDefinition>, emitEvent?: SkillContext["emitEvent"], executeCardAbility?: SkillContext["executeCardAbility"], runtimeCatalog?: SkillContext["runtimeCatalog"]): unknown {
    this.assertCanExecute(state, playerId, skillId, payload, definitions);
    const player = state.players[playerId];
    if (!player) throw new Error("PLAYER_NOT_AVAILABLE");
    const skill = this.get(skillId);
    const requestedAbilityId = isRecord(payload) && typeof payload.abilityId === "string" ? payload.abilityId : undefined;
    const ability = skill.abilities?.length
      ? skill.abilities.find((item) => item.id === requestedAbilityId)
      : undefined;
    const handler = this.#handlers.get(skill.id);
    if (!handler) throw new Error("SKILL_NOT_IMPLEMENTED");
    const activation = ability?.activation ?? skill.activation;
    const identityOwnsSkill = skill.ownerType === "master" ? player.masterId === skill.ownerId : player.servantId === skill.ownerId;
    const copiedSkill = identityOwnsSkill ? undefined : getOwnedSkillCopyReplacement(state, player, skill.id, definitions);
    const fullTextCopy = identityOwnsSkill ? undefined : getOwnedFullTextSkillCopy(state, player, skill.id);
    const copyReplacement = copiedSkill?.skillCopyReplacement;
    const reboundOwnerId = skill.ownerType === "master" ? player.masterId : player.servantId;
    const reboundSkill = fullTextCopy?.fullSkillCopy?.rebindNamedOwnerToController === true && reboundOwnerId
      ? { ...skill, ownerId: reboundOwnerId }
      : skill;
    const combatActionLimit = definitions && state.phase === "combat" && (ability?.windows ?? skill.windows).includes("action")
      ? player.attack.map((instanceId) => state.cards[instanceId]).find((instance) => {
        const definition = instance ? definitions[instance.definitionId] : undefined;
        return Boolean(instance?.active && instance.face === "up"
          && (instance.fullSkillCopy?.sourceSkillId === skill.id || instance.definitionId === skill.id || definition?.linkedSkillId === skill.id)
          && cardAllowsActionAbilityInCombat(state, player, instance));
      })
      : undefined;
    const combatLimit = combatActionLimit ? getActionAbilityCombatLimit(state, player, combatActionLimit) : undefined;
    const effectiveLimit = copyReplacement ? undefined : (combatLimit ?? resolvePlayerSkillUsageLimit(player, skill.id, ability?.limit ?? skill.limit, activation, state.round));
    const uniqueGroup = copyReplacement ? undefined : (ability?.uniqueGroup ?? skill.uniqueGroup);
    const usageKey = ability ? `${skill.id}:${ability.id}` : skill.id;
    const uniqueUsageKey = uniqueGroup ? `__unique:${uniqueGroup}` : undefined;
    const effectiveSkill = ability
      ? {
        ...reboundSkill,
        activation,
        windows: ability.windows,
        steps: ability.steps ?? skill.steps,
        abilityCost: copyReplacement ? 0 : (ability.abilityCost ?? skill.abilityCost),
        limit: effectiveLimit,
        uniqueGroup,
        requiresActiveCard: copyReplacement ? false : (ability.requiresActiveCard ?? skill.requiresActiveCard),
        revealsTrueNameOnSkillUse: copyReplacement ? false : (ability.revealsTrueNameOnSkillUse ?? skill.revealsTrueNameOnSkillUse),
      }
      : copyReplacement ? { ...reboundSkill, abilityCost: 0, limit: undefined, uniqueGroup: undefined, requiresActiveCard: false, revealsTrueNameOnSkillUse: false }
        : effectiveLimit === skill.limit && reboundSkill === skill ? skill : { ...reboundSkill, limit: effectiveLimit };
    const abilityReplacement = copyReplacement
      ? { totalPowerGain: copyReplacement.totalPowerGain }
      : activation !== "passive" ? getActivatedAbilityReplacement(player, state.round) : undefined;
    const manaBefore = player.mana;
    const roundPowerBefore = player.flags.roundPowerBonus;
    const copyUsedBefore = copyReplacement?.used;
    const copyCleanupBefore = copiedSkill?.temporaryCleanup;
    const factSnapshot = captureStateFacts(state);
    const usageBefore = player.usage[usageKey];
    const uniqueUsageBefore = uniqueUsageKey ? player.usage[uniqueUsageKey] : undefined;
    const reuseAbilityId = ability?.id ?? "__skill__";
    const usingReuseGrant = Boolean(!copyReplacement && !isUsageAvailable(usageBefore, effectiveLimit, state.round, state.phase)
      && hasSkillAbilityReuse(player, state.round, skill.id, reuseAbilityId));
    try {
      payManaCost(state, player, abilityReplacement ? 0 : (effectiveSkill.abilityCost ?? 0), definitions);
      if (!copyReplacement && !usingReuseGrant) player.usage[usageKey] = createUsageRecord(effectiveSkill.limit, state.round, state.phase, usageBefore);
      if (!copyReplacement && uniqueUsageKey) player.usage[uniqueUsageKey] = createUsageRecord("once-per-round", state.round, state.phase);
      if (!abilityReplacement && (effectiveSkill.abilityCost ?? 0) > 0) {
        player.flags.roundManaSpent = Number(player.flags.roundManaSpent ?? 0) + (effectiveSkill.abilityCost ?? 0);
      }
      const handlerPayload = ability && isRecord(payload) ? { ...payload, abilityId: ability.id } : ability ? { abilityId: ability.id, value: payload } : payload;
      const handlerResult = abilityReplacement
        ? applyActivatedAbilityReplacement(player, abilityReplacement)
        : runWithOtherPlayerAbilityImmunity(state, player.id, () => handler({ state, player, skill: effectiveSkill, payload: handlerPayload, openDecision, emitEvent, executeCardAbility, randomInt, definitions, runtimeCatalog }), skill.id);
      if (copyReplacement && copiedSkill) {
        if (copyReplacement.oncePerCopy) copyReplacement.used = true;
        if (copyReplacement.removeAtRoundEndAfterUse) copiedSkill.temporaryCleanup = "round-end";
      }
      revealUsedSkillCard(state, player.id, skill.id, definitions);
      if (effectiveSkill.activation !== "passive" && effectiveSkill.revealsTrueNameOnSkillUse) {
        revealPlayerTrueName(state, player.id);
      }
      if (usingReuseGrant && !consumeSkillAbilityReuse(player, state.round, skill.id, reuseAbilityId)) {
        throw new Error("ABILITY_REUSE_GRANT_MISSING");
      }
      emitStateFactDiff(factSnapshot, state, emitEvent, { sourceId: skill.id });
      return handlerResult;
    } catch (error) {
      player.mana = manaBefore;
      if (copyReplacement) {
        if (roundPowerBefore === undefined) delete player.flags.roundPowerBonus;
        else player.flags.roundPowerBonus = roundPowerBefore;
        copyReplacement.used = copyUsedBefore;
        if (copiedSkill) {
          if (copyCleanupBefore === undefined) delete copiedSkill.temporaryCleanup;
          else copiedSkill.temporaryCleanup = copyCleanupBefore;
        }
      }
      if (usageBefore === undefined) delete player.usage[usageKey];
      else player.usage[usageKey] = usageBefore;
      if (uniqueUsageKey) {
        if (uniqueUsageBefore === undefined) delete player.usage[uniqueUsageKey];
        else player.usage[uniqueUsageKey] = uniqueUsageBefore;
      }
      throw error;
    }
  }

  private owns(state: GameState, player: GameState["players"][string], skill: SkillDefinition, definitions?: Record<string, CardDefinition>): boolean {
    const identityOwned = skill.ownerType === "master" ? player.masterId === skill.ownerId : player.servantId === skill.ownerId;
    // Catalogue-only / unlock-only skills are definitions, not automatically
    // owned abilities.  Identity grants ownership only for initially-owned
    // skills; otherwise a real physical skill card must have been granted.
    if (identityOwned && skill.initiallyOwned !== false) return true;
    if (skill.rulerSealControllerSourceId && (listRulerSealsControlledBy(state, player.id)
      .some((seal) => seal.sourceId === skill.rulerSealControllerSourceId)
      || hasRulerSealWinRewardFromSource(state, player.id, skill.rulerSealControllerSourceId))) return true;
    const usableZones = [...player.masterSkills, ...player.servantSkills, ...player.attack, ...player.hand];
    return usableZones.some((instanceId) => {
      const instance = state.cards[instanceId];
      if (!instance || instance.zone === "removed") return false;
      const borrowedController = instance.ownerPlayerId !== player.id
        && instance.controllerPlayerId === player.id
        && (instance.returnToOwnerSkillZoneOnClose === "master-skills" || instance.returnToOwnerSkillZoneOnClose === "servant-skills");
      if (instance.ownerPlayerId !== player.id && !borrowedController) return false;
      const definition = definitions?.[instance.definitionId];
      return instance.fullSkillCopy?.sourceSkillId === skill.id || instance.definitionId === skill.id || instance.definitionId === `card.skill.${skill.id}` || definition?.linkedSkillId === skill.id;
    });
  }

  private isLegal(state: GameState, playerId: string, skill: SkillDefinition, ability?: SkillAbilityDefinition, definitions?: Record<string, CardDefinition>): boolean {
    const activation = ability?.activation ?? skill.activation;
    const windows = ability?.windows ?? skill.windows;
    const steps = ability?.steps ?? skill.steps;
    const requiresActiveCard = ability?.requiresActiveCard ?? skill.requiresActiveCard;
    if (activation === "passive" || activation === "play" || activation === "residual") return false;
    const player = state.players[playerId];
    if (!player || playerIsDisarmed(player)) return false;
    if ((state.phase === "action" || state.phase === "combat") && isAbilityActivationBlocked(state, playerId, state.phase)) return false;
    if (getSkillUseBlocks(player, state.round, skill.id).some((block) =>
      !block.sourcePlayerId || !isOtherPlayerAbilityEffectIgnored(state, block.sourcePlayerId, player.id, block.sourceId))) return false;
    if (definitions) {
      const physicalSources = [...player.masterSkills, ...player.servantSkills, ...player.attack, ...player.hand]
        .map((instanceId) => state.cards[instanceId])
        .filter((instance) => {
          if (!instance || instance.ownerPlayerId !== player.id || instance.zone === "removed") return false;
          const definition = definitions[instance.definitionId];
          return instance.fullSkillCopy?.sourceSkillId === skill.id
            || instance.definitionId === skill.id
            || instance.definitionId === `card.skill.${skill.id}`
            || definition?.linkedSkillId === skill.id;
        });
      const everyPhysicalSourceBlocked = physicalSources.length > 0 && physicalSources.every((instance) =>
        getPhysicalSkillUseBlocks(player, state.round, instance.instanceId).some((block) =>
          !block.sourcePlayerId || !isOtherPlayerAbilityEffectIgnored(state, block.sourcePlayerId, player.id, block.sourceId)));
      if (everyPhysicalSourceBlocked) return false;
      if (physicalSources.length > 0 && physicalSources.every((instance) => isCardTextSuppressed(state, instance, definitions))) return false;
    }
    const identityOwnsSkill = skill.ownerType === "master" ? player.masterId === skill.ownerId : player.servantId === skill.ownerId;
    const copiedSkill = identityOwnsSkill ? undefined : getOwnedSkillCopyReplacement(state, player, skill.id, definitions);
    const fullTextCopy = identityOwnsSkill ? undefined : getOwnedFullTextSkillCopy(state, player, skill.id);
    const reboundOwnerId = skill.ownerType === "master" ? player.masterId : player.servantId;
    const legalitySkill = fullTextCopy?.fullSkillCopy?.rebindNamedOwnerToController === true && reboundOwnerId
      ? { ...skill, ownerId: reboundOwnerId }
      : skill;
    if (copiedSkill?.skillCopyReplacement?.oncePerCopy && copiedSkill.skillCopyReplacement.used === true) return false;
    const actionAbilityCombatOverride = Boolean(definitions && state.phase === "combat" && windows.includes("action")
      && (playerAllowsActionAbilitiesInCombat(state, player, definitions) || player.attack.some((instanceId) => {
        const instance = state.cards[instanceId];
        const definition = instance ? definitions[instance.definitionId] : undefined;
        return Boolean(instance?.active && instance.face === "up"
          && (instance.definitionId === skill.id || definition?.linkedSkillId === skill.id)
          && cardAllowsActionAbilityInCombat(state, player, instance));
      })));
    const outOfTurnPhaseAllowed = skill.tags?.includes("any-phase-out-of-turn") === true && windows.includes(state.phase as PhaseId);
    if ((!outOfTurnPhaseAllowed && state.activePlayerId !== playerId) || (!windows.includes(state.phase as PhaseId) && !actionAbilityCombatOverride)) return false;
    if (state.step === "post-power-response" && !steps?.includes("post-power-response")) return false;
    if (steps?.length && !steps.includes(state.step)) return false;
    const forbiddenAttributes = (state.modeState.situationRestrictions as { forbiddenAttributes?: string[] } | undefined)?.forbiddenAttributes ?? [];
    const skillAttributes = skill.attributes !== undefined
      ? getCardAttributes({ attributes: skill.attributes, typeLabel: skill.typeLabel ?? "" })
      : getCardAttributes({ typeLabel: skill.typeLabel ?? "" });
    if (isCardSourceAbilityActivationBlocked(state, playerId, {
      definitionId: skill.id,
      attributes: skillAttributes,
      tags: skill.tags ?? [],
      basic: false,
    })) return false;
    if (playerNoblePhantasmUseBlocked(player, state.round) && skillAttributes.includes("宝具")) return false;
    if (ability?.ignoresSituationRestrictions !== true
      && (!definitions || !isPlayerUnaffectedBySituation(state, playerId, definitions))
      && !(skillAttributes.includes("宝具") && ignoresSituationNoblePhantasmBan(state, player))
      && forbiddenAttributes.some((attribute) => skillAttributes.includes(attribute))) return false;
    // Replacement copies retain the source ability's activation window/type,
    // but all other printed text (costs, conditions and usage clauses) is gone.
    if (copiedSkill?.skillCopyReplacement) return true;
    if (skill.requiresTrueName && !state.players[playerId].trueNameRevealed) return false;
    if (skill.requiresHiddenTrueName && state.players[playerId].trueNameRevealed) return false;
    const forbiddenSkillTag = typeof player.flags.skillUseForbiddenTag === "string" ? player.flags.skillUseForbiddenTag : undefined;
    if (forbiddenSkillTag && skill.tags?.includes(forbiddenSkillTag)) return false;
    if (definitions && isStructuredSkillUseForbidden(state, playerId, skill.id, definitions)) return false;
    if (requiresActiveCard && !state.players[playerId].attack.some((instanceId) => {
      const instance = state.cards[instanceId];
      const definition = instance && definitions ? definitions[instance.definitionId] : undefined;
      return (instance?.fullSkillCopy?.sourceSkillId === skill.id || instance?.definitionId === skill.id || definition?.linkedSkillId === skill.id) && instance?.active && instance.face === "up";
    })) return false;
    const handlerLegality = this.#legality.get(skill.id);
    if (!getActivatedAbilityReplacement(player, state.round) && handlerLegality && !handlerLegality(state, playerId, legalitySkill, ability, definitions)) return false;
    const usageKey = ability ? `${skill.id}:${ability.id}` : skill.id;
    const usageLimit = resolvePlayerSkillUsageLimit(state.players[playerId], skill.id, ability?.limit ?? skill.limit, activation, state.round);
    if (!isUsageAvailable(state.players[playerId].usage[usageKey], usageLimit, state.round, state.phase)
      && !hasSkillAbilityReuse(player, state.round, skill.id, ability?.id ?? "__skill__")) return false;
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

/** Apply temporary structured usage-limit overrides without teaching the registry any character names. */
function resolvePlayerSkillUsageLimit(
  player: GameState["players"][string],
  skillId: string,
  limit: SkillUsageLimit | undefined,
  activation: SkillDefinition["activation"],
  round: number,
): SkillUsageLimit | undefined {
  const override = player.skillUsageLimitOverrides?.find((candidate) => candidate.targetSkillId === skillId && candidate.round === round);
  return override?.limit ?? resolveSkillUsageLimit(limit, activation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
