import type { GameCommand } from "./commands.ts";
import { assertCommandEnvelope, CommandType } from "./commands.ts";
import { createEvent } from "./events.ts";
import { cloneState } from "../domain/state/createGameState.ts";
import type { GameAction, GameEvent, GameState } from "../domain/state/types.ts";
import { getCardAttributes, type CardDefinition, type EventDefinition, type EventGroupDefinition, type SituationDefinition } from "../rules-core/content-types.ts";
import { initializePlayerDeck, initializePlayerSkillCards, removeCardsScheduledAfterCombat } from "../rules-core/decks.ts";
import { deployPlayer, deployScheduledFollowers, movePlayer, playerSkipsOutpostDeployment } from "../rules-core/board.ts";
import { commitStandardAttack } from "../rules-core/card-play.ts";
import { calculateCombatSnapshot, finalizeCombatFromSnapshot, type CombatPowerSnapshot } from "../rules-core/combat.ts";
import { getBattlefieldLocationIds, isBattlefieldLocation, type BattlefieldLocationId } from "../rules-core/battlefield-rules.ts";
import { applyClimaxElimination, chooseEventGroup, endStandardRound, initializeEventDeck, resolveDeferredActionStartDraws, startStandardRound } from "../rules-core/rounds.ts";
import { initializeSituationDeck } from "../rules-core/situation-setup.ts";
import { StateRandom } from "./random.ts";
import { SkillRegistry } from "../rules-core/skill-registry.ts";
import { assignIdentity, assertSetupReady, setPlayerReady } from "../rules-core/setup.ts";
import { getCombatResponseResponderIds, registerConfirmedChoiceSkillHandlers, registerCorePassiveHandlers, registerCoreSkillHandlers } from "../rules-core/skill-handlers.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../rules-core/passives.ts";
import { registerSanzangSkill } from "../rules-core/sanzang-skill.ts";
import { ensureTiamatLifeSea, getTiamatCardDefinitions, initializeTiamatBeasts, registerTiamatCardAbilities, registerTiamatSkill } from "../rules-core/tiamat-skill.ts";
import { CardAbilityRegistry } from "../rules-core/card-abilities.ts";
import { registerMisfortuneCardAbility } from "../rules-core/misfortune.ts";
import { registerMiyuCardAbilities } from "../rules-core/miyu.ts";
import { registerBasicCardAbilities } from "../rules-core/basic-card-abilities.ts";
import { applyThreeXStartModifiers, assertThreeXContentPools, assertThreeXReadyForStart, assertThreeXSelectionsInPools, autoBanThreeXMasters, commitThreeXBan, commitThreeXPurchases, dealThreeXMasterOffer, dealThreeXServantOffer, finalizeThreeXBanStrict, finalizeThreeXMasterDraft, finalizeThreeXServantSelection, lockThreeXTurnOrder, selectThreeXMaster, selectThreeXServant, submitThreeXBan } from "../rules-core/three-x-state.ts";
import { applyThreeXPurchases, finalizeThreeXPurchasesForPlayers, type ThreeXPurchase } from "../rules-core/three-x-economy.ts";
import { DecisionManager } from "./decisions.ts";
import { EffectRuntime } from "./effect-runtime.ts";
import { applyScheduledRoundTurnOrderPosition } from "../rules-core/turn-order.ts";
import { expandSharedVictoryWinnerIds } from "../rules-core/elimination-prevention.ts";
import { consumeForcedExtraRound, peekForcedExtraRound } from "../rules-core/extra-round.ts";
import { finishCommandManaContribution, prepareCommandManaContribution } from "../rules-core/linked-player-rules.ts";
import { createEffectFrame, DRAW_CARDS_EFFECT, GAIN_RESOURCES_EFFECT, RESTORE_COMMAND_SEAL_EFFECT, registerStandardEffectHandlers } from "../rules-core/standard-effects.ts";
import { createDefaultModeRegistry } from "./default-modes.ts";
import type { ModeRegistry } from "./modes.ts";
import { assertDeckDefinition, expandDeckDefinition, type DeckDefinition } from "../rules-core/deck-definitions.ts";
import { enqueueScheduledEffects } from "../rules-core/scheduled-effects.ts";
import { captureStateFacts, emitStateFactDiff } from "../rules-core/state-facts.ts";
import { executeStructuredGrantedCardAbility } from "../rules-core/card-transforms.ts";
import { applyStructuredContinuousStateCleanup } from "../rules-core/continuous-rules.ts";
import { revealPlayerTrueName } from "../rules-core/skill-visibility.ts";
import { hasPendingMandatoryActionAbilityInCombat, markMandatoryActionAbilityInCombatUsed } from "../rules-core/card-rule-modifiers.ts";
import { registerTokiomiCardAbilities } from "../rules-core/tokiomi.ts";
import { getKoyanskayaCardDefinitions, registerKoyanskayaCardAbilities } from "../rules-core/koyanskaya.ts";
import { runWithOtherPlayerAbilityImmunity } from "../rules-core/ability-immunity.ts";
import { initializeNamedEventPool } from "../rules-core/event-lifecycle.ts";
import { abortSkillUseReactionImmunity, armSkillUseReactionImmunityCleanup, beginSkillUseReactions, clearCompletedSkillUseReactionImmunity, isSkillUseReactionDecision, resolveSkillUseReactionDecision } from "../rules-core/skill-use-reactions.ts";
import type { SkillRuntimeCatalog } from "../rules-core/skill-types.ts";
import { applyLostbeltObjectiveRuntimeEvent } from "../rules-core/lostbelt.ts";
import { applyIndiaObjectiveRuntimeEvent } from "../rules-core/india-lostbelt.ts";
import { finishEmbeddedActionPhase } from "../rules-core/embedded-action.ts";
import { applyCombatLossRoundRestart } from "../rules-core/combat-loss-restart.ts";
import { AUTOMATIC_DECK_RECYCLE_DECISION_KIND, AutomaticDeckRecycleChoiceRequired, type AutomaticDeckRecycleChoiceRequest } from "../rules-core/deck-recycle-choice.ts";
import { applyStartingRulePackages } from "../rules-core/starting-rule-packages.ts";
import { getNormalCommandSealLegalActions, useNormalCommandSeal, type NormalCommandSealPayload } from "../rules-core/normal-command-seal.ts";

export interface StandardContent {
  cards: Record<string, CardDefinition>;
  situations: SituationDefinition[];
  events: EventDefinition[];
  eventGroups?: EventGroupDefinition[];
  specialEventPools?: Record<string, EventDefinition[]>;
  playerDecks: Record<string, string[]>;
  servantClasses?: Record<string, string>;
  /** Formal content definitions keyed by their owning servant ID. */
  deckDefinitions?: Record<string, DeckDefinition>;
  masterInitialMana?: Record<string, number>;
  threeXMasterRatings?: Record<string, number>;
  threeXMasterPool?: string[];
  threeXServantPool?: string[];
  skills?: SkillRegistry;
  cardAbilities?: CardAbilityRegistry;
  effectRuntime?: EffectRuntime;
  modeRegistry?: ModeRegistry;
  requireReadySetup?: boolean;
}

export class StandardMatchEngine {
  readonly random = new StateRandom();
  readonly decisions = new DecisionManager();
  readonly effects: EffectRuntime;
  readonly passives = new PassiveRuntime();
  readonly cardAbilities: CardAbilityRegistry;
  readonly dynamicCards: Record<string, CardDefinition>;
  readonly modes: ModeRegistry;
  readonly content: StandardContent;

  constructor(content: StandardContent) {
    this.content = content;
    assertThreeXContentPools(content.threeXMasterPool, content.threeXServantPool);
    this.effects = content.effectRuntime ?? new EffectRuntime();
    this.modes = content.modeRegistry ?? createDefaultModeRegistry({
      threeX: { masterPool: content.threeXMasterPool, servantPool: content.threeXServantPool },
    });
    if (!this.modes.has("standard") || !this.modes.has("three-x")) throw new Error("MODE_REGISTRY_INCOMPLETE");
    registerStandardEffectHandlers(this.effects);
    this.dynamicCards = { ...getTiamatCardDefinitions(), ...getKoyanskayaCardDefinitions() };
    this.cardAbilities = content.cardAbilities ?? new CardAbilityRegistry();
    registerBasicCardAbilities(this.cardAbilities);
    registerTiamatCardAbilities(this.cardAbilities);
    registerMisfortuneCardAbility(this.cardAbilities);
    registerMiyuCardAbilities(this.cardAbilities, this.effects);
    registerTokiomiCardAbilities(this.cardAbilities, this.effects);
    registerKoyanskayaCardAbilities(this.cardAbilities);
    if (this.content.skills) {
      registerCoreSkillHandlers(this.content.skills);
      registerConfirmedChoiceSkillHandlers(this.content.skills, this.effects);
      registerCorePassiveHandlers(this.content.skills, this.passives, this.effects, this.cardDefinitions());
      registerSanzangSkill(this.content.skills, this.effects);
      registerTiamatSkill(this.content.skills, this.effects);
    }
  }

  /** Returns the immutable rules package selected by a match without exposing engine internals. */
  getModeDefinition(mode: GameState["mode"]): import("./modes.ts").GameModeDefinition {
    return this.modes.get(mode);
  }

  /** Rules-owned action discovery. Payload candidates are hints; execute remains authoritative. */
  getLegalActions(state: GameState, playerId: string): GameAction[] {
    const player = state.players[playerId];
    if (!player || player.eliminated || state.status === "finished") return [];
    if (state.pendingDecision) {
      if (!state.pendingDecision.chooserPlayerIds.includes(playerId)) return [];
      if (Object.prototype.hasOwnProperty.call(state.pendingDecision.submissions, playerId)) return [];
      return [{
        type: CommandType.ResolveDecision,
        label: state.pendingDecision.kind,
        payload: {
          decisionId: state.pendingDecision.decisionId,
          options: structuredClone(state.pendingDecision.options.filter((option) => option.chooserPlayerIds === undefined || option.chooserPlayerIds.includes(playerId))),
          min: state.pendingDecision.min,
          max: state.pendingDecision.max,
          allowCancel: state.pendingDecision.allowCancel,
        },
      }];
    }
    const actions = this.modes.get(state.mode).getLegalActions(structuredClone(state), playerId);
    const definitions = this.cardDefinitions();
    if (this.content.skills) actions.push(...this.content.skills.getLegalActions(state, playerId, definitions));
    actions.push(...getNormalCommandSealLegalActions(state, playerId, definitions));
    if (state.activePlayerId === playerId && state.status === "playing") {
      actions.push({ type: CommandType.CompletePlayerWindow, label: "完成当前步骤", payload: {} });
    }
    return structuredClone(actions);
  }

  execute(current: GameState, command: GameCommand): { state: GameState; events: GameEvent[]; duplicate: boolean } {
    try {
      return this.executeOnce(current, command);
    } catch (error) {
      if (error instanceof AutomaticDeckRecycleChoiceRequired) return this.openAutomaticDeckRecycleChoice(current, command, error.request);
      throw error;
    }
  }

  private openAutomaticDeckRecycleChoice(
    current: GameState,
    command: GameCommand,
    request: AutomaticDeckRecycleChoiceRequest,
  ): { state: GameState; events: GameEvent[]; duplicate: boolean } {
    const state = cloneState(current);
    if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
    const player = state.players[request.playerId];
    if (!player || player.eliminated) throw new Error("AUTOMATIC_DECK_RECYCLE_PLAYER_INVALID");
    const definitions = this.cardDefinitions();
    state.modeState.pendingCommandReplay = {
      gameInstanceId: command.gameInstanceId,
      actorId: command.actorId,
      type: command.type,
      payload: structuredClone(command.payload),
      sourceCommandId: command.commandId,
      recyclePlayerId: request.playerId,
      recycleSourceInstanceId: request.sourceInstanceId,
      recycleSourceDefinitionId: request.sourceDefinitionId,
    };
    state.pendingDecision = {
      decisionId: `${command.commandId}:automatic-deck-recycle`,
      ownerPlayerId: request.playerId,
      chooserPlayerIds: [request.playerId],
      kind: AUTOMATIC_DECK_RECYCLE_DECISION_KIND,
      options: request.candidateInstanceIds.map((instanceId) => ({
        id: instanceId,
        label: definitions[state.cards[instanceId]?.definitionId ?? ""]?.name ?? instanceId,
      })),
      min: 0,
      max: Math.min(request.maxKeep, request.candidateInstanceIds.length),
      allowCancel: false,
      submissions: {},
    };
    const event = createEvent(state, command.commandId, 0, "decision.opened", {
      decisionId: state.pendingDecision.decisionId,
      kind: AUTOMATIC_DECK_RECYCLE_DECISION_KIND,
      playerId: request.playerId,
      sourceInstanceId: request.sourceInstanceId,
    });
    state.revision += 1;
    state.processedCommandIds.push(command.commandId);
    state.eventLog.push(event);
    return { state, events: [event], duplicate: false };
  }

  private executeOnce(current: GameState, command: GameCommand): { state: GameState; events: GameEvent[]; duplicate: boolean } {
    assertCommandEnvelope(command, current);
    if (current.processedCommandIds.includes(command.commandId)) return { state: current, events: [], duplicate: true };
    if (command.expectedRevision !== current.revision) throw new Error("REVISION_MISMATCH");

    const state = cloneState(current);
    const commandFactSnapshot = captureStateFacts(state);
    prepareCommandManaContribution(state, command.actorId, command.payload);
    // Normalize mandatory continuous text before command legality is checked.
    // This is still inside the same atomic transaction and never parses card text.
    applyStructuredContinuousStateCleanup(state, this.cardDefinitions());
    const events: GameEvent[] = [];
    const processedEventIds = new Set<string>();
    const emit = (type: string, payload: unknown): GameEvent => {
      const event = createEvent(state, command.commandId, events.length, type, payload);
      events.push(event);
      return event;
    };
    const pumpEvents = (): void => {
      while (true) {
        let enqueued = 0;
        for (const event of events) {
          if (processedEventIds.has(event.eventId)) continue;
          processedEventIds.add(event.eventId);
          if (event.type === "card.played") {
            const played = event.payload as { instanceId?: unknown; method?: unknown };
            if (typeof played.instanceId === "string" && typeof played.method === "string" && state.cards[played.instanceId]) {
              state.cards[played.instanceId].playedByEffectRound = state.round;
            }
          }
          const lostbeltFactSnapshot = captureStateFacts(state);
          applyLostbeltObjectiveRuntimeEvent(state, event.type, event.payload, this.cardDefinitions());
          applyIndiaObjectiveRuntimeEvent(state, event.type, event.payload, this.cardDefinitions(), randomInt, emit);
          emitStateFactDiff(lostbeltFactSnapshot, state, emit, { sourceId: event.type, existingEvents: events });
          enqueueScheduledEffects(state, event);
          enqueuePassiveEffects(state, this.passives, event);
          enqueued += 1;
        }
        if (state.pendingDecision) break;
        const resolved = this.drainEffects(state, emit);
        if (enqueued === 0 && resolved === 0) break;
      }
    };
    const randomInt = (maxExclusive: number): number => this.random.integer(state, maxExclusive);
    type PendingRoundStart = {
      context: "game-start" | "round-transition";
      targetRound: number;
      eventPoolIds: string[];
      endedRound?: number;
      eliminatedThisRound?: string[];
      previousLocations?: Record<string, string | null>;
    };
    const resumePendingRoundStart = (): void => {
      if (state.pendingDecision) return;
      const checkpoint = state.modeState.pendingRoundStart as PendingRoundStart | undefined;
      if (!checkpoint) return;
      if (checkpoint.targetRound !== state.round + 1) throw new Error("PENDING_ROUND_START_TARGET_INVALID");
      const eventPool = checkpoint.eventPoolIds
        .map((id) => this.content.events.find((event) => event.id === id))
        .filter((event): event is EventDefinition => Boolean(event));
      if (eventPool.length !== checkpoint.eventPoolIds.length || eventPool.length === 0) throw new Error("PENDING_ROUND_START_EVENT_POOL_INVALID");
      delete state.modeState.pendingRoundStart;
      startStandardRound(state, this.content.situations, eventPool, randomInt, this.cardDefinitions());
      state.modeState = { ...state.modeState, resolvedCombats: [], combatWinnerIdsByLocation: {}, phaseStartPlayerId: state.activePlayerId };
      if (checkpoint.context === "game-start") {
        emit("game.started", { round: state.round, phase: state.phase, activePlayerId: state.activePlayerId });
      } else {
        emit("round.ended", {
          round: checkpoint.endedRound,
          nextPhase: state.phase,
          eliminatedThisRound: checkpoint.eliminatedThisRound ?? [],
          previousLocations: checkpoint.previousLocations ?? {},
        });
      }
      emit("round.started", { round: state.round, phase: state.phase, activePlayerId: state.activePlayerId });
      for (const locationId of ["mountain", "city"] as const) {
        for (const eventId of state.board.currentEvents[locationId] ?? []) {
          if (state.board.eventVisibility[eventId] === "up") emit("event.revealed", { eventId, locationId });
        }
      }
    };
    const beginPendingRoundStart = (checkpoint: PendingRoundStart): void => {
      if (state.modeState.pendingRoundStart) throw new Error("PENDING_ROUND_START_ALREADY_EXISTS");
      if (checkpoint.targetRound !== state.round + 1) throw new Error("PENDING_ROUND_START_TARGET_INVALID");
      const situationId = state.board.situationDeck[0];
      if (!situationId) throw new Error("SITUATION_DECK_EMPTY");
      const situation = this.content.situations.find((item) => item.id === situationId);
      if (!situation) throw new Error("SITUATION_NOT_FOUND");
      state.modeState.pendingRoundStart = structuredClone(checkpoint);
      emit("situation.will-activate", {
        round: checkpoint.targetRound,
        situationId,
        climax: situation.climax === true,
        eventPlacement: structuredClone(situation.eventPlacement ?? { mountain: 1, city: 1 }),
      });
      pumpEvents();
      if (!state.pendingDecision) resumePendingRoundStart();
    };
    const performSkillUse = (actorId: string, payload: { skillId: string; data?: unknown }): unknown => {
      if (!this.content.skills) throw new Error("SKILL_REGISTRY_NOT_CONFIGURED");
      const trueNamesBefore = Object.fromEntries(Object.values(state.players).map((player) => [player.id, player.trueNameRevealed]));
      const trueNameBefore = trueNamesBefore[actorId] === true;
      const skillResult = this.content.skills.execute(state, actorId, payload.skillId, payload.data, (decision) => {
        if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
        state.pendingDecision = structuredClone(decision);
      }, randomInt, this.cardDefinitions(), emit, (instanceId, abilityId, target, options) => {
        const definitions = this.cardDefinitions();
        if (this.cardAbilities.has(abilityId)) {
          this.cardAbilities.execute(abilityId, {
            state,
            playerId: actorId,
            instanceId,
            target,
            definitions,
            randomInt,
            emitEvent: emit,
            openDecision: (decision) => {
              if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
              state.pendingDecision = structuredClone(decision);
            },
            effectTimingOverride: options?.timingOverride === true,
          });
        } else {
          executeStructuredGrantedCardAbility(state, actorId, instanceId, abilityId, definitions, emit);
        }
        const usedCard = state.cards[instanceId];
        const usedDefinition = usedCard ? definitions[usedCard.definitionId] : undefined;
        if (state.phase === "combat" && usedDefinition?.phases?.includes("action")) {
          markMandatoryActionAbilityInCombatUsed(state.players[actorId], instanceId, abilityId);
        }
        emit("card.ability.used", { playerId: actorId, instanceId, ability: abilityId });
        emit("card.used", {
          playerId: actorId, instanceId, definitionId: usedCard?.definitionId ?? null,
          locationId: state.players[actorId].locationId,
          attributes: usedDefinition ? getCardAttributes(usedDefinition) : [],
          method: "ability", ability: abilityId,
        });
      }, this.skillRuntimeCatalog());
      emit("skill.used", { playerId: actorId, skillId: payload.skillId });
      const usedSkillDefinition = this.cardDefinitions()[payload.skillId];
      emit("card.used", {
        playerId: actorId,
        instanceId: state.players[actorId].attack.find((instanceId) => state.cards[instanceId]?.definitionId === payload.skillId)
          ?? state.players[actorId].masterSkills.find((instanceId) => state.cards[instanceId]?.definitionId === payload.skillId)
          ?? state.players[actorId].servantSkills.find((instanceId) => state.cards[instanceId]?.definitionId === payload.skillId)
          ?? null,
        definitionId: payload.skillId,
        locationId: state.players[actorId].locationId,
        attributes: usedSkillDefinition ? getCardAttributes(usedSkillDefinition) : [],
        method: "ability",
      });
      const playedBySkill = skillResult && typeof skillResult === "object" && Array.isArray((skillResult as { cards?: unknown }).cards)
        ? (skillResult as { cards: Array<{ instanceId: string; definitionId: string; paidMana: number; revealsTrueName?: boolean }> }).cards
        : [];
      if (playedBySkill.length) {
        for (const card of playedBySkill) {
          emit("card.played", { playerId: actorId, instanceId: card.instanceId, definitionId: card.definitionId, face: "up", paidMana: card.paidMana, attributes: getCardAttributes(this.cardDefinitions()[card.definitionId]), method: "skill-effect" });
        }
      }
      const player = state.players[actorId];
      const revealBlocked = player.flags.preventTrueNameReveal === true
        || (player.flags.preventTrueNameRevealWhenNoSeals === true && player.commandSeals === 0);
      if (!trueNameBefore && !player.trueNameRevealed && !revealBlocked && playedBySkill.some((card) => card.revealsTrueName === true)) {
        revealPlayerTrueName(state, actorId);
      }
      for (const changedPlayer of Object.values(state.players)) {
        if (!trueNamesBefore[changedPlayer.id] && changedPlayer.trueNameRevealed) {
          emit("servant.true-name-revealed", { playerId: changedPlayer.id, servantId: changedPlayer.servantId });
        }
      }
      return skillResult;
    };

    switch (command.type) {
      case CommandType.ThreeXBanMaster:
        this.assertThreeXCommand(state);
        submitThreeXBan(this.threeXState(state), command.actorId, (command.payload as { masterId: string }).masterId, this.content.threeXMasterPool);
        emit("three-x.ban.changed", { masterId: (command.payload as { masterId: string }).masterId });
        break;
      case CommandType.ThreeXAutoBan:
        this.assertThreeXCommand(state);
        if (command.actorId !== "host") throw new Error("HOST_ONLY_COMMAND");
        const autoBanPayload = command.payload as { count?: number };
        const autoBanPool = this.content.threeXMasterPool;
        if (!autoBanPool) throw new Error("THREE_X_MASTER_POOL_MISSING");
        const banned = autoBanThreeXMasters(this.threeXState(state), autoBanPool, autoBanPayload.count ?? 1);
        emit("three-x.ai-ban.completed", { masterIds: banned });
        break;
      case CommandType.ThreeXCommitBan:
        this.assertThreeXCommand(state);
        commitThreeXBan(this.threeXState(state), command.actorId);
        emit("three-x.ban.player-committed", { playerId: command.actorId });
        break;
      case CommandType.ThreeXSelectMaster:
        this.assertThreeXCommand(state);
        selectThreeXMaster(this.threeXState(state), command.actorId, (command.payload as { masterId: string }).masterId);
        emit("three-x.master.selected", { playerId: command.actorId });
        break;
      case CommandType.ThreeXFinalizeBan:
        this.assertThreeXCommand(state);
        this.assertThreeXHost(command.actorId);
        finalizeThreeXBanStrict(this.threeXState(state));
        if (this.content.threeXMasterPool) {
          const threeX = this.threeXState(state);
          for (const playerId of threeX.playerIds) dealThreeXMasterOffer(threeX, playerId, this.content.threeXMasterPool, 3, randomInt);
        }
        emit("three-x.ban.finalized", {});
        break;
      case CommandType.ThreeXFinalizeMasters:
        this.assertThreeXCommand(state);
        this.assertThreeXHost(command.actorId);
        finalizeThreeXMasterDraft(this.threeXState(state), this.content.threeXMasterRatings ?? {});
        emit("three-x.masters.finalized", {});
        break;
      case CommandType.ThreeXPurchase:
        this.assertThreeXCommand(state);
        const purchasePayload = command.payload as { purchases: ThreeXPurchase[] };
        if (!purchasePayload || !Array.isArray(purchasePayload.purchases)) throw new Error("THREE_X_PURCHASE_LIST_INVALID");
        const purchaseState = this.threeXState(state);
        if (purchaseState.purchaseCommittedPlayerIds.includes(command.actorId)) throw new Error("THREE_X_PURCHASE_ALREADY_COMMITTED");
        if (!purchaseState.budgets[command.actorId]) throw new Error("THREE_X_PLAYER_INVALID");
        applyThreeXPurchases(purchaseState.budgets[command.actorId], purchasePayload.purchases);
        emit("three-x.purchase.applied", { playerId: command.actorId, count: purchasePayload.purchases.length });
        break;
      case CommandType.ThreeXFinalizePurchase:
        this.assertThreeXCommand(state);
        commitThreeXPurchases(this.threeXState(state), command.actorId);
        if (this.threeXState(state).setupPhase === "servant-select") {
          const threeX = this.threeXState(state);
          finalizeThreeXPurchasesForPlayers(threeX.budgets, threeX.playerIds);
          const pool = this.content.threeXServantPool;
          if (pool) {
            for (const playerId of threeX.playerIds) {
              const count = 1 + threeX.budgets[playerId].purchases["servant-draw"];
              if (pool.length < count) throw new Error("THREE_X_SERVANT_POOL_INSUFFICIENT");
              dealThreeXServantOffer(threeX, playerId, pool, count, randomInt);
            }
          }
        }
        emit("three-x.purchase.finalized", { playerId: command.actorId });
        break;
      case CommandType.ThreeXSelectServant:
        this.assertThreeXCommand(state);
        selectThreeXServant(this.threeXState(state), command.actorId, (command.payload as { servantId: string }).servantId);
        emit("three-x.servant.selected", { playerId: command.actorId });
        break;
      case CommandType.ThreeXFinalizeServants:
        this.assertThreeXCommand(state);
        this.assertThreeXHost(command.actorId);
        finalizeThreeXServantSelection(this.threeXState(state));
        emit("three-x.servants.finalized", {});
        break;
      case CommandType.ThreeXLockTurnOrder:
        this.assertThreeXCommand(state);
        this.assertThreeXHost(command.actorId);
        lockThreeXTurnOrder(this.threeXState(state), (command.payload as { playerIds: string[] }).playerIds);
        emit("three-x.turn-order.locked", {});
        break;
      case CommandType.StartStandardGame:
        if (state.status !== "lobby") throw new Error("GAME_ALREADY_STARTED");
        if (this.content.requireReadySetup) assertSetupReady(state);
          if (state.mode === "three-x") {
          const threeX = state.modeState.threeX as import("../rules-core/three-x-state.ts").ThreeXModeState | undefined;
          if (!threeX) throw new Error("THREE_X_STATE_MISSING");
          assertThreeXReadyForStart(threeX);
          assertThreeXSelectionsInPools(threeX, this.content.threeXMasterPool, this.content.threeXServantPool);
            applyThreeXStartModifiers(state);
          }
          // Static game-start rule flags must be installed before the first
          // round draws resources, otherwise a first-round cap would be late.
          if (this.content.skills && state.mode !== "three-x") {
            for (const player of Object.values(state.players)) {
              for (const skill of this.content.skills.list()) {
                if (skill.supportLevel !== "FULL"
                  || skill.handlerId !== "core.game-start-rule-flags"
                  || skill.ownerType !== "master"
                  || skill.ownerId !== player.masterId
                  || !skill.playerFlags) continue;
                Object.assign(player.flags, skill.playerFlags);
              }
            }
          }
          // Some Master rules replace the setup-time Servant with a fixed package.
          // Resolve that generic content metadata before any deck/Servant-skill instances are seeded.
          if (this.content.skills) {
            for (const player of Object.values(state.players)) {
              const replacements = this.content.skills.list().filter((skill) => skill.supportLevel === "FULL"
                && skill.ownerType === "master" && skill.ownerId === player.masterId && skill.startingServantOverride);
              if (replacements.length > 1) throw new Error("STARTING_SERVANT_OVERRIDE_AMBIGUOUS");
              const replacement = replacements[0]?.startingServantOverride;
              if (!replacement) continue;
              if (!replacement.servantId || replacement.deckDefinitionIds.length === 0
                || replacement.deckDefinitionIds.some((definitionId) => !this.content.cards[definitionId])) {
                throw new Error("STARTING_SERVANT_OVERRIDE_INVALID");
              }
              player.servantId = replacement.servantId;
              player.flags.firstServantId = replacement.servantId;
            }
          }
          state.status = "playing";
        state.round = 0;
        for (const player of Object.values(state.players)) {
          if (state.mode !== "three-x") player.mana = this.content.masterInitialMana?.[player.masterId ?? ""] ?? 4;
          if (player.masterId === "master.tiamat") {
            player.mana = Math.max(player.mana, 8);
            player.commandSeals = 0;
            initializeTiamatBeasts(state, player.id);
          }
          // Content packages key decks by servant definition; keep player-id as
          // a compatibility fallback for small authored/test packages.
          const formalDeck = this.content.deckDefinitions?.[player.servantId ?? ""];
          if (formalDeck) assertDeckDefinition(formalDeck, this.content.cards, player.servantId ?? undefined);
          const startingOverride = this.content.skills?.list().find((skill) => skill.supportLevel === "FULL"
            && skill.ownerType === "master" && skill.ownerId === player.masterId
            && skill.startingServantOverride?.servantId === player.servantId)?.startingServantOverride;
          const deckDefinitionIds = formalDeck
            ? expandDeckDefinition(formalDeck)
            : startingOverride?.deckDefinitionIds
              ?? this.content.playerDecks[player.servantId ?? ""]
              ?? this.content.playerDecks[player.id]
              ?? [];
          initializePlayerDeck(state, player.id, deckDefinitionIds, randomInt);
          if (this.content.skills) {
            initializePlayerSkillCards(state, player.id, this.content.skills.list().filter((skill) => skill.initiallyOwned !== false && ((skill.ownerType === "master" && skill.ownerId === player.masterId) || (skill.ownerType === "servant" && skill.ownerId === player.servantId))).map((skill) => ({ id: skill.id, ownerType: skill.ownerType })));
          }
          // Initialize generated cards after the regular skill setup, which resets skill arrays.
          ensureTiamatLifeSea(state, player.id);
        }
        const selectedEvents = chooseEventGroup(state, this.content.eventGroups, this.content.events, randomInt);
        initializeEventDeck(state, selectedEvents, randomInt);
        for (const [poolId, events] of Object.entries(this.content.specialEventPools ?? {})) {
          initializeNamedEventPool(state, poolId, events.map((event) => event.id), randomInt);
        }
        if (this.content.skills) applyStartingRulePackages(state, this.content.skills.list(), randomInt);
        if (state.board.situationDeck.length === 0) initializeSituationDeck(state, this.content.situations, randomInt);
        beginPendingRoundStart({
          context: "game-start",
          targetRound: 1,
          eventPoolIds: selectedEvents.map((event) => event.id),
        });
        break;
      case CommandType.AssignIdentity:
        {
          const payload = command.payload as { masterId: string; servantId: string };
          assignIdentity(state, command.actorId, payload.masterId, payload.servantId);
          emit("setup.identity.assigned", { playerId: command.actorId, masterId: payload.masterId, servantId: payload.servantId });
        }
        break;
      case CommandType.SetReady:
        {
          const payload = command.payload as { ready: boolean };
          setPlayerReady(state, command.actorId, payload.ready);
          emit("setup.ready.changed", { playerId: command.actorId, ready: payload.ready });
        }
        break;
      case CommandType.CompletePlayerWindow:
        {
          if (state.phase === "combat" && state.step === "player-window" && state.activePlayerId === command.actorId
            && hasPendingMandatoryActionAbilityInCombat(state, state.players[command.actorId], this.cardDefinitions())) {
            throw new Error("MANDATORY_CARD_ABILITY_PENDING");
          }
          const visibilityBefore = { ...state.board.eventVisibility };
          const result = advanceStandardWindow(state, command.actorId);
          if (result.previousPhase === "outpost" && result.transition === "next-phase" && state.phase === "action") {
            resolveDeferredActionStartDraws(state, randomInt, this.cardDefinitions());
          }
          emit("phase.player-window.closed", { playerId: command.actorId, phase: result.previousPhase });
          emit(result.embedded === true ? "phase.embedded-transitioned" : "phase.transitioned", result);
          for (const locationId of ["mountain", "city"] as const) {
            for (const eventId of state.board.currentEvents[locationId] ?? []) {
              if (visibilityBefore[eventId] !== "up" && state.board.eventVisibility[eventId] === "up") {
                emit("event.revealed", { eventId, locationId });
              }
            }
          }
        }
        break;
      case CommandType.DeployPlayer: {
        const previousLocationId = state.players[command.actorId]?.locationId;
        const deployPayload = command.payload as { locationId: "workshop" | "mountain" | "city"; victoryPointsPayment?: number; terrainAdvantageChoice?: 0 | 1 | 3; locationAccessPayments?: Array<{ ruleId: string; kind: "mana" | "discard"; instanceId?: string }> };
        deployPlayer(state, command.actorId, deployPayload.locationId, this.cardDefinitions(), {
          victoryPointsPayment: deployPayload.victoryPointsPayment,
          terrainAdvantageChoice: deployPayload.terrainAdvantageChoice,
          locationAccessPayments: deployPayload.locationAccessPayments,
        });
        const locationId = state.players[command.actorId].locationId;
        emit("player.deployed", { playerId: command.actorId, locationId });
        emit("player.entered-location", { playerId: command.actorId, previousLocationId, locationId, method: "deploy", distance: 0 });
        if (locationId === "workshop" || locationId === "mountain" || locationId === "city") {
          for (const follower of deployScheduledFollowers(state, command.actorId, locationId, this.cardDefinitions())) {
            emit("player.deployed", { playerId: follower.playerId, locationId: follower.locationId, forcedFollowPlayerId: command.actorId });
            emit("player.entered-location", {
              playerId: follower.playerId,
              previousLocationId: follower.previousLocationId,
              locationId: follower.locationId,
              method: "deploy",
              distance: 0,
              forcedFollowPlayerId: command.actorId,
            });
          }
        }
        break;
      }
      case CommandType.UseSkill:
        {
          if (!this.content.skills) throw new Error("SKILL_REGISTRY_NOT_CONFIGURED");
          const payload = command.payload as { skillId: string; data?: unknown };
          const definitions = this.cardDefinitions();
          this.content.skills.assertCanExecute(state, command.actorId, payload.skillId, payload.data, definitions);
          if (!beginSkillUseReactions(state, command.actorId, payload.skillId, payload.data, definitions)) {
            performSkillUse(command.actorId, payload);
          }
        }
        break;
      case CommandType.UseCommandSeal:
        {
          const result = useNormalCommandSeal(state, command.actorId, command.payload as NormalCommandSealPayload, this.cardDefinitions());
          emit("command-seal.used", { playerId: command.actorId, ...result });
          if (result.movement) {
            emit("player.moved", { playerId: command.actorId, ...result.movement, method: "command-seal" });
            emit("player.entered-location", {
              playerId: command.actorId,
              previousLocationId: result.movement.previousLocationId,
              locationId: result.movement.locationId,
              distance: result.movement.distance,
              cost: result.movement.cost,
              method: "command-seal",
            });
          }
        }
        break;
      case CommandType.ResolveDecision:
        {
          const payload = command.payload as { decisionId: string; selections: string[] };
          const decision = this.decisions.resolve(state, { decisionId: payload.decisionId, actorId: command.actorId, selections: payload.selections });
          emit("decision.resolved", { decisionId: decision.decisionId, actorId: command.actorId, selections: payload.selections });
          // Multi-participant decisions stay open until every chooser submits.
          // Only the final submission resumes the continuation effect.
          if (!state.pendingDecision) {
            if (isSkillUseReactionDecision(decision)) {
              const reaction = resolveSkillUseReactionDecision(state, decision, payload.selections, this.cardDefinitions());
              if (reaction.ready) {
                armSkillUseReactionImmunityCleanup(state, reaction.ready);
                try {
                  performSkillUse(reaction.ready.actorPlayerId, { skillId: reaction.ready.skillId, data: reaction.ready.data });
                } catch (error) {
                  abortSkillUseReactionImmunity(state, reaction.ready);
                  throw error;
                }
              }
            } else if (decision.kind === AUTOMATIC_DECK_RECYCLE_DECISION_KIND) {
              const replay = state.modeState.pendingCommandReplay as {
                recyclePlayerId?: unknown;
                recycleSourceInstanceId?: unknown;
              } | undefined;
              if (!replay || replay.recyclePlayerId !== decision.ownerPlayerId || typeof replay.recycleSourceInstanceId !== "string") {
                throw new Error("AUTOMATIC_DECK_RECYCLE_REPLAY_INVALID");
              }
              state.modeState.preparedAutomaticDeckRecycleChoice = {
                playerId: decision.ownerPlayerId,
                sourceInstanceId: replay.recycleSourceInstanceId,
                keepInstanceIds: [...payload.selections],
              };
              state.modeState.pendingCommandReplayReady = true;
            } else {
              this.resumeDecision(state, decision, { status: "resolved", selections: payload.selections });
              this.drainEffects(state, emit);
              if (!state.pendingDecision && state.modeState.pendingRoundStart) resumePendingRoundStart();
            }
          }
        }
        break;
      case CommandType.CancelDecision:
        {
          const payload = command.payload as { decisionId: string };
          const decision = this.decisions.cancel(state, { decisionId: payload.decisionId, actorId: command.actorId });
          emit("decision.cancelled", { decisionId: decision.decisionId, actorId: command.actorId });
          this.resumeDecision(state, decision, { status: "cancelled", selections: [] });
          this.drainEffects(state, emit);
        }
        break;
      case CommandType.MovePlayer:
        {
          const payload = command.payload as { locationId: string; ignoreEngagement?: boolean; locationAccessPayments?: Array<{ ruleId: string; kind: "mana" | "discard"; instanceId?: string }> };
          const previousLocationId = state.players[command.actorId]?.locationId;
          const cost = movePlayer(state, command.actorId, payload.locationId, payload.ignoreEngagement ?? false, this.cardDefinitions(), {
            locationAccessPayments: payload.locationAccessPayments,
          });
          const locationOrder = ["workshop", "mountain", "city", "scouting"];
          const fromIndex = previousLocationId ? locationOrder.indexOf(previousLocationId) : -1;
          const toIndex = locationOrder.indexOf(payload.locationId);
          const distance = fromIndex >= 0 && toIndex >= 0 ? Math.abs(toIndex - fromIndex) : 0;
          emit("player.moved", { playerId: command.actorId, previousLocationId, locationId: payload.locationId, distance, cost });
          emit("player.entered-location", { playerId: command.actorId, previousLocationId, locationId: payload.locationId, distance, cost, method: "move" });
        }
        break;
      case CommandType.UseCardAbility:
        {
          const payload = command.payload as { instanceId: string; ability: string; targetLocationId?: string; data?: unknown };
          const definitions = this.cardDefinitions();
          runWithOtherPlayerAbilityImmunity(state, command.actorId, () => {
            if (this.cardAbilities.has(payload.ability)) {
              this.cardAbilities.execute(payload.ability, {
                state,
                playerId: command.actorId,
                instanceId: payload.instanceId,
                target: payload.data !== undefined ? payload.data : payload.targetLocationId,
                definitions,
                randomInt,
                emitEvent: emit,
                openDecision: (decision) => {
                  if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
                  state.pendingDecision = structuredClone(decision);
                },
              });
            } else {
              executeStructuredGrantedCardAbility(state, command.actorId, payload.instanceId, payload.ability, definitions, emit);
            }
          });
          const usedCard = state.cards[payload.instanceId];
          const usedDefinition = usedCard ? definitions[usedCard.definitionId] : undefined;
          if (state.phase === "combat" && usedDefinition?.phases?.includes("action")) {
            markMandatoryActionAbilityInCombatUsed(state.players[command.actorId], payload.instanceId, payload.ability);
          }
          emit("card.ability.used", { playerId: command.actorId, instanceId: payload.instanceId, ability: payload.ability, targetLocationId: payload.targetLocationId });
          emit("card.used", {
            playerId: command.actorId,
            instanceId: payload.instanceId,
            definitionId: usedCard?.definitionId ?? null,
            locationId: state.players[command.actorId].locationId,
            attributes: usedDefinition ? getCardAttributes(usedDefinition) : [],
            method: "ability",
            ability: payload.ability,
          });
        }
        break;
      case CommandType.CommitAttack:
        {
          const payload = command.payload as {
            faceUpInstanceIds: string[];
            faceDownInstanceIds: string[];
            /** Optional per-card data consumed by structured play-trigger skills. */
            cardDataByInstanceId?: Record<string, unknown>;
            /** Optional per-definition data consumed by structured play-trigger skills. */
            cardDataByDefinitionId?: Record<string, unknown>;
            /** Explicit alternate all-face-down attack granted by owned card text. */
            useFaceDownAttackFollowup?: boolean;
          };
          const result = commitStandardAttack(state, command.actorId, payload.faceUpInstanceIds, payload.faceDownInstanceIds, this.cardDefinitions(), { cardDataByInstanceId: payload.cardDataByInstanceId, cardDataByDefinitionId: payload.cardDataByDefinitionId, useFaceDownAttackFollowup: payload.useFaceDownAttackFollowup });
          emit("attack.committed", {
            playerId: command.actorId,
            paidMana: result.paidMana,
            committed: result.committed,
            faceUpInstanceIds: [...payload.faceUpInstanceIds],
            faceDownInstanceIds: [...payload.faceDownInstanceIds],
            setAsideInstanceIds: [...result.setAsideInstanceIds],
          });
          for (const instanceId of result.setAsideInstanceIds) {
            emit("card.set-aside", { playerId: command.actorId, instanceId, sourceId: state.cards[instanceId]?.setAsideForCombat?.sourceId ?? null });
          }
          for (const card of result.cards) {
            if (state.cards[card.instanceId]) delete state.cards[card.instanceId].playedByEffectRound;
            emit("card.played", {
              playerId: command.actorId,
              instanceId: card.instanceId,
              definitionId: card.face === "up" ? card.definitionId : null,
              face: card.face,
              paidMana: card.paidMana,
              attributes: card.face === "up" ? card.attributes : [],
              ...(card.face === "up" && (payload.cardDataByInstanceId?.[card.instanceId] ?? payload.cardDataByDefinitionId?.[card.definitionId]) !== undefined
                ? { data: payload.cardDataByInstanceId?.[card.instanceId] ?? payload.cardDataByDefinitionId?.[card.definitionId] }
                : {}),
            });
            if (card.face === "up") {
              emit("card.used", {
                playerId: command.actorId,
                instanceId: card.instanceId,
                definitionId: card.definitionId,
                locationId: state.players[command.actorId].locationId,
                attributes: card.attributes,
                method: "play",
              });
            }
          }
          for (const request of result.drawRequests) {
            state.effectQueue.push(createEffectFrame({
              effectId: `${command.commandId}:draw:${request.sourceInstanceId}`,
              handlerId: DRAW_CARDS_EFFECT,
              sourceId: request.sourceInstanceId,
              controllerPlayerId: command.actorId,
              payload: { count: request.count },
              state,
            }));
            emit("card.play-effect.queued", { playerId: command.actorId, sourceInstanceId: request.sourceInstanceId, effect: "draw", count: request.count });
          }
          for (const [index, request] of result.playEffectRequests.entries()) {
            const effect = request.effect;
            const handlerId = effect.kind === "draw-cards"
              ? DRAW_CARDS_EFFECT
              : effect.kind === "restore-command-seal"
                ? RESTORE_COMMAND_SEAL_EFFECT
                : GAIN_RESOURCES_EFFECT;
            const payload = effect.kind === "draw-cards"
              ? { count: effect.count }
              : effect.kind === "restore-command-seal"
                ? { amount: effect.amount }
                : effect.kind === "gain-mana"
                  ? { mana: effect.amount }
                  : { victoryPoints: effect.amount };
            state.effectQueue.push(createEffectFrame({
              effectId: `${command.commandId}:play-effect:${request.sourceInstanceId}:${index}`,
              handlerId,
              sourceId: request.sourceInstanceId,
              controllerPlayerId: command.actorId,
              payload,
              state,
            }));
            emit("card.play-effect.queued", { playerId: command.actorId, sourceInstanceId: request.sourceInstanceId, effect: effect.kind });
          }
          const player = state.players[command.actorId];
          const revealBlocked = player.flags.preventTrueNameReveal === true
            || (player.flags.preventTrueNameRevealWhenNoSeals === true && player.commandSeals === 0);
          if (!player.trueNameRevealed && !revealBlocked && result.cards.some((card) => card.revealsTrueName)) {
            revealPlayerTrueName(state, command.actorId);
            emit("servant.true-name-revealed", { playerId: command.actorId, servantId: player.servantId });
          }
        }
        break;
      case CommandType.ResolveCombat:
        {
          if (state.phase !== "combat" || state.step !== "settlement") throw new Error("COMBAT_WINDOW_NOT_CLOSED");
          const payload = command.payload as { locationId: BattlefieldLocationId };
          if (!isBattlefieldLocation(state, payload.locationId)) throw new Error("COMBAT_LOCATION_INVALID");
          const resolvedBefore = new Set<string>((state.modeState.resolvedCombats as string[] | undefined) ?? []);
          if (resolvedBefore.has(payload.locationId)) throw new Error("COMBAT_ALREADY_RESOLVED");
          const snapshot = calculateCombatSnapshot(state, payload.locationId, this.cardDefinitions());
          // Card responses (for example Misfortune) are independent from the
          // character skill registry, so always collect the response window.
          // A content package without migrated character skills still needs
          // to expose its supported card abilities.
          const responderIds = getCombatResponseResponderIds(
            state,
            this.content.skills ?? new SkillRegistry(),
            snapshot,
            this.cardDefinitions(),
          );
          if (responderIds.length > 0) {
            state.modeState = {
              ...state.modeState,
              pendingCombatResolution: { snapshot, responderIds, nextResponderIndex: 0 },
            };
            state.step = "post-power-response";
            state.activePlayerId = responderIds[0];
            emit("combat.power-calculated", { snapshot, responderIds });
          } else {
            const restarted = applyCombatLossRoundRestart(state, snapshot, this.cardDefinitions());
            if (restarted) {
              emit("round.restarted", { round: state.round, reason: "combat-loss-replacement", locationId: snapshot.locationId, ...restarted });
              break;
            }
            const result = finalizeCombatFromSnapshot(state, snapshot, this.cardDefinitions(), this.eventDefinitions());
            resolvedBefore.add(payload.locationId);
            const previousWinners = (state.modeState.combatWinnerIdsByLocation as Record<string, string[]> | undefined) ?? {};
            state.modeState = {
              ...state.modeState,
              resolvedCombats: [...resolvedBefore],
              combatWinnerIdsByLocation: { ...previousWinners, [payload.locationId]: [...result.winnerIds] },
            };
            for (const defeatedPlayerId of result.defeatedPlayerIds ?? []) {
              emit("player.defeated", { playerId: defeatedPlayerId, reason: "combat", locationId: result.locationId });
            }
            emit("combat.resolved", result);
          }
        }
        break;
      case CommandType.CompleteCombatResponse:
        {
          const pending = state.modeState.pendingCombatResolution as { snapshot?: CombatPowerSnapshot; responderIds?: string[]; nextResponderIndex?: number } | undefined;
          if (state.phase !== "combat" || state.step !== "post-power-response" || !pending?.snapshot || !Array.isArray(pending.responderIds)) {
            throw new Error("COMBAT_RESPONSE_WINDOW_NOT_OPEN");
          }
          const index = Number(pending.nextResponderIndex ?? 0);
          if (pending.responderIds[index] !== command.actorId || state.activePlayerId !== command.actorId) throw new Error("COMBAT_RESPONSE_NOT_ACTIVE_PLAYER");
          emit("combat.response.completed", { playerId: command.actorId, locationId: pending.snapshot.locationId });
          const nextIndex = index + 1;
          if (nextIndex < pending.responderIds.length) {
            pending.nextResponderIndex = nextIndex;
            state.activePlayerId = pending.responderIds[nextIndex];
          } else {
            const restarted = applyCombatLossRoundRestart(state, pending.snapshot, this.cardDefinitions());
            if (restarted) {
              emit("round.restarted", { round: state.round, reason: "combat-loss-replacement", locationId: pending.snapshot.locationId, ...restarted });
              break;
            }
            const result = finalizeCombatFromSnapshot(state, pending.snapshot, this.cardDefinitions(), this.eventDefinitions());
            const resolved = new Set<string>((state.modeState.resolvedCombats as string[] | undefined) ?? []);
            resolved.add(pending.snapshot.locationId);
            const previousWinners = (state.modeState.combatWinnerIdsByLocation as Record<string, string[]> | undefined) ?? {};
            const { pendingCombatResolution: _pending, ...modeState } = state.modeState;
            state.modeState = {
              ...modeState,
              resolvedCombats: [...resolved],
              combatWinnerIdsByLocation: { ...previousWinners, [pending.snapshot.locationId]: [...result.winnerIds] },
            };
            state.step = "settlement";
            state.activePlayerId = null;
            for (const defeatedPlayerId of result.defeatedPlayerIds ?? []) {
              emit("player.defeated", { playerId: defeatedPlayerId, reason: "combat", locationId: result.locationId });
            }
            emit("combat.resolved", result);
          }
        }
        break;
      case CommandType.EndRound: {
        if (state.phase !== "combat" || state.step !== "settlement") throw new Error("ROUND_NOT_READY");
        const resolvedCombatLocations = new Set((state.modeState.resolvedCombats as string[] | undefined) ?? []);
        if (getBattlefieldLocationIds(state).some((locationId) => !resolvedCombatLocations.has(locationId))) throw new Error("COMBAT_NOT_RESOLVED");
        type EndRoundCheckpoint = {
          round: number;
          stage: "after-combat-ending" | "after-round-ending";
          previousLocations: Record<string, string | null>;
          combatWinnerIdsByLocation: Record<string, string[]>;
        };
        const endedRound = state.round;
        let checkpoint = state.modeState.endRoundCheckpoint as EndRoundCheckpoint | undefined;
        if (!checkpoint || checkpoint.round !== endedRound) {
          const previousLocations = Object.fromEntries(
            Object.values(state.players).map((player) => [player.id, player.locationId]),
          );
          checkpoint = {
            round: endedRound,
            stage: "after-combat-ending",
            previousLocations,
            combatWinnerIdsByLocation: structuredClone((state.modeState.combatWinnerIdsByLocation as Record<string, string[]> | undefined) ?? {}),
          };
          // Persist the continuation point before pumping effects. If a passive
          // opens a serializable decision, a later EndRound command resumes
          // after combat.ending instead of emitting the event twice.
          state.modeState.endRoundCheckpoint = structuredClone(checkpoint);
          emit("combat.ending", {
            round: endedRound,
            previousLocations: structuredClone(checkpoint.previousLocations),
            combatWinnerIdsByLocation: structuredClone(checkpoint.combatWinnerIdsByLocation),
          });
          pumpEvents();
          if (state.pendingDecision) break;
        }
        if (checkpoint.stage === "after-combat-ending") {
          removeCardsScheduledAfterCombat(state);
          checkpoint = { ...checkpoint, stage: "after-round-ending" };
          state.modeState.endRoundCheckpoint = structuredClone(checkpoint);
          emit("round.ending", { round: endedRound, previousLocations: structuredClone(checkpoint.previousLocations) });
          pumpEvents();
          if (state.pendingDecision) break;
        }
        const previousLocations = checkpoint.previousLocations;
        const eliminatedThisRound = applyClimaxElimination(state, this.cardDefinitions());
        emit("elimination.resolved", { round: endedRound, eliminatedPlayerIds: [...eliminatedThisRound] });
        pumpEvents();
        if (state.pendingDecision) throw new Error("ELIMINATION_RESOLVED_DECISION_FORBIDDEN");
        const instantVictoryIds = Array.isArray(state.modeState.instantVictoryIds)
          ? state.modeState.instantVictoryIds.filter((id): id is string => typeof id === "string")
          : [];
        const forcedExtraRound = peekForcedExtraRound(state);
        const shouldFinish = instantVictoryIds.length > 0
          || (!forcedExtraRound && state.board.situationDeck.length === 0)
          || Object.values(state.players).filter((player) => !player.eliminated).length <= 1;
        const finalStatus = shouldFinish
          ? (instantVictoryIds.length > 0
            ? { finished: true, winnerIds: instantVictoryIds, reason: "round-eleven-noble-phantasm" }
            : (this.getModeDefinition(state.mode).getFinalWinnerStatus?.(state) ?? { finished: true, winnerIds: determineFinalWinnerIds(state), reason: "final-score" }))
          : null;
        const finalWinnerIds = expandSharedVictoryWinnerIds(state, finalStatus?.winnerIds ?? []);
        delete state.modeState.endRoundCheckpoint;
        endStandardRound(state, this.cardDefinitions());
        if (shouldFinish) {
          state.status = "finished";
          state.phase = "combat";
          state.step = "settlement";
          state.activePlayerId = null;
          emit("round.ended", { round: endedRound, nextPhase: "finished", eliminatedThisRound, previousLocations });
          emit("game.finished", { round: endedRound, eliminatedThisRound, winnerIds: finalWinnerIds, reason: finalStatus?.reason ?? "final-score" });
        } else {
          const eventPoolIds = Array.isArray(state.modeState.eventPoolEventIds)
            ? state.modeState.eventPoolEventIds.filter((id): id is string => typeof id === "string")
            : [];
          const eventPool = eventPoolIds.length > 0
            ? eventPoolIds.map((id) => this.content.events.find((event) => event.id === id)).filter((event): event is EventDefinition => Boolean(event))
            : this.content.events;
          if (eventPool.length === 0) throw new Error("EVENT_GROUP_CARD_NOT_FOUND");
          const consumedForcedExtraRound = consumeForcedExtraRound(state);
          if (consumedForcedExtraRound) {
            if (!this.content.situations.some((situation) => situation.id === consumedForcedExtraRound.situationId)) throw new Error("FORCED_EXTRA_ROUND_SITUATION_NOT_FOUND");
            state.board.situationDeck = [consumedForcedExtraRound.situationId];
          }
          beginPendingRoundStart({
            context: "round-transition",
            targetRound: endedRound + 1,
            eventPoolIds: eventPool.map((event) => event.id),
            endedRound,
            eliminatedThisRound: [...eliminatedThisRound],
            previousLocations: structuredClone(previousLocations),
          });
        }
        break;
      }
      default:
        throw new Error("COMMAND_NOT_SUPPORTED_BY_STANDARD_ENGINE");
    }

    // Direct command mutations may satisfy mandatory continuous cleanup rules.
    applyStructuredContinuousStateCleanup(state, this.cardDefinitions());

    // Emit generic state facts for core command mutations. Skill/effect handlers
    // already emit their own diffs; existingEvents prevents duplicate facts here.
    emitStateFactDiff(commandFactSnapshot, state, emit, { sourceId: command.type, existingEvents: events });

    // Event pump: rule/effect handlers may emit additional authoritative events.
    // Newly emitted events must register their scheduled/passive work before the
    // command commits, preserving a single deterministic transaction.
    pumpEvents();
    // Passive/scheduled effects can mutate hand state after the first fact pass.
    // Re-apply cleanup, emit only newly observed facts, and pump those events.
    while (applyStructuredContinuousStateCleanup(state, this.cardDefinitions()).length > 0) {
      emitStateFactDiff(commandFactSnapshot, state, emit, { sourceId: command.type, existingEvents: events });
      pumpEvents();
    }
    clearCompletedSkillUseReactionImmunity(state);
    finishCommandManaContribution(state);
    state.revision += 1;
    state.processedCommandIds.push(command.commandId);
    state.eventLog.push(...events);
    if (state.modeState.pendingCommandReplayReady === true) {
      const replay = state.modeState.pendingCommandReplay as {
        gameInstanceId?: unknown;
        actorId?: unknown;
        type?: unknown;
        payload?: unknown;
        sourceCommandId?: unknown;
      } | undefined;
      if (!replay || typeof replay.gameInstanceId !== "string" || typeof replay.actorId !== "string"
        || typeof replay.type !== "string" || replay.payload === undefined || typeof replay.sourceCommandId !== "string") {
        throw new Error("AUTOMATIC_DECK_RECYCLE_REPLAY_INVALID");
      }
      delete state.modeState.pendingCommandReplayReady;
      delete state.modeState.pendingCommandReplay;
      const replayResult = this.execute(state, {
        commandId: `${replay.sourceCommandId}:replay:${state.revision}`,
        gameInstanceId: replay.gameInstanceId,
        actorId: replay.actorId,
        expectedRevision: state.revision,
        type: replay.type,
        payload: structuredClone(replay.payload),
      });
      return { state: replayResult.state, events: [...events, ...replayResult.events], duplicate: false };
    }
    return { state, events, duplicate: false };
  }

  private eventDefinitions(): Record<string, EventDefinition> {
    return Object.fromEntries(
      [...this.content.events, ...Object.values(this.content.specialEventPools ?? {}).flat()].map((event) => [event.id, event]),
    );
  }

  private cardDefinitions(): Record<string, CardDefinition> {
    const eventDefinitions = Object.fromEntries(this.content.events.map((event) => [event.id, event as unknown as CardDefinition]));
    const specialEventDefinitions = Object.fromEntries(Object.values(this.content.specialEventPools ?? {}).flat().map((event) => [event.id, event as unknown as CardDefinition]));
    const situationDefinitions = Object.fromEntries(this.content.situations.map((situation) => [situation.id, situation as unknown as CardDefinition]));
    return { ...this.content.cards, ...eventDefinitions, ...specialEventDefinitions, ...situationDefinitions, ...this.dynamicCards, ...(this.content.skills?.asCardDefinitions() ?? {}) };
  }

  private skillRuntimeCatalog(): SkillRuntimeCatalog {
    const formalDecks = Object.fromEntries(Object.entries(this.content.deckDefinitions ?? {}).map(([servantId, definition]) => [
      servantId,
      expandDeckDefinition(definition),
    ]));
    return {
      servantDecks: { ...this.content.playerDecks, ...formalDecks },
      servantClasses: this.content.servantClasses ?? {},
      skillDefinitions: this.content.skills?.list() ?? [],
      masterInitialMana: this.content.masterInitialMana ?? {},
    };
  }

  private threeXState(state: GameState): import("../rules-core/three-x-state.ts").ThreeXModeState {
    const mode = state.modeState.threeX as import("../rules-core/three-x-state.ts").ThreeXModeState | undefined;
    if (state.mode !== "three-x" || !mode) throw new Error("THREE_X_MODE_REQUIRED");
    return mode;
  }

  private assertThreeXCommand(state: GameState): void {
    this.threeXState(state);
    if (state.status !== "lobby" && state.status !== "setup") throw new Error("THREE_X_SETUP_CLOSED");
  }

  private assertThreeXHost(actorId: string): void {
    if (actorId !== "host") throw new Error("HOST_ONLY_COMMAND");
  }

  private resumeDecision(
    state: GameState,
    decision: import("../domain/state/types.ts").PendingDecision,
    result: { status: "resolved" | "cancelled"; selections: string[] },
  ): void {
    const effectId = result.status === "resolved" ? decision.continuationEffectId : decision.fallbackEffectId;
    if (!effectId) return;
    const effect = state.effectQueue.find((item) => item.effectId === effectId);
    if (!effect) throw new Error("DECISION_CONTINUATION_NOT_FOUND");
    effect.payload = { previous: effect.payload, decision: { decisionId: decision.decisionId, ...result, chooserPlayerIds: structuredClone(decision.chooserPlayerIds), submissions: structuredClone(decision.submissions) } };
  }

  private drainEffects(state: GameState, emitEvent?: (type: string, payload: unknown) => void): number {
    return this.effects.drain(state, 1000, this.cardDefinitions(), emitEvent, (playerId, instanceId, abilityId, target, options) => {
      const definitions = this.cardDefinitions();
      if (this.cardAbilities.has(abilityId)) {
        this.cardAbilities.execute(abilityId, {
          state, playerId, instanceId, target, definitions, emitEvent,
          randomInt: (maxExclusive) => this.random.integer(state, maxExclusive),
          openDecision: (decision) => {
            if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
            state.pendingDecision = structuredClone(decision);
          },
          effectTimingOverride: options?.timingOverride === true,
        });
      } else {
        executeStructuredGrantedCardAbility(state, playerId, instanceId, abilityId, definitions, emitEvent);
      }
      const usedCard = state.cards[instanceId];
      const usedDefinition = usedCard ? definitions[usedCard.definitionId] : undefined;
      if (state.phase === "combat" && usedDefinition?.phases?.includes("action")) {
        markMandatoryActionAbilityInCombatUsed(state.players[playerId], instanceId, abilityId);
      }
      emitEvent?.("card.ability.used", { playerId, instanceId, ability: abilityId });
      emitEvent?.("card.used", { playerId, instanceId, definitionId: usedCard?.definitionId ?? null, locationId: state.players[playerId].locationId, attributes: usedDefinition ? getCardAttributes(usedDefinition) : [], method: "ability", ability: abilityId });
    }, this.skillRuntimeCatalog(), (maxExclusive) => this.random.integer(state, maxExclusive));
  }
}

function determineFinalWinnerIds(state: GameState): string[] {
  const eligible = Object.values(state.players).filter((player) => !player.eliminated);
  if (eligible.length === 0) return [];
  const highest = Math.max(...eligible.map((player) => player.victoryPoints));
  return eligible.filter((player) => player.victoryPoints === highest).map((player) => player.id);
}

function nextEligible(state: GameState, fromIndex: number): { index: number; id: string } | null {
  for (let offset = 1; offset < state.turnOrder.length; offset += 1) {
    const index = (fromIndex + offset) % state.turnOrder.length;
    const id = state.turnOrder[index];
    const player = state.players[id];
    if (player && !player.eliminated && !player.defeated
      && !(state.phase === "outpost" && (playerSkipsOutpostDeployment(state, id) || Number(player.flags.outpostTakenEarlyRound ?? -1) === state.round))
      && !(state.phase === "action" && Number(player.flags.actionTakenEarlyRound ?? -1) === state.round)) return { index, id };
  }
  return null;
}

function firstEligible(state: GameState): string | null {
  return state.turnOrder.find((id) => {
    const player = state.players[id];
    return player && !player.eliminated && !player.defeated
      && !(state.phase === "outpost" && (playerSkipsOutpostDeployment(state, id) || Number(player.flags.outpostTakenEarlyRound ?? -1) === state.round))
      && !(state.phase === "action" && Number(player.flags.actionTakenEarlyRound ?? -1) === state.round);
  }) ?? null;
}

function setPhaseStart(state: GameState, playerId: string | null): void {
  state.modeState = { ...state.modeState, phaseStartPlayerId: playerId };
}

function actionStartStep(state: GameState, playerId: string | null): "move-decision" | "play-batch-draft" {
  return playerId && state.players[playerId]?.flags.actionPlayBeforeMove === true ? "play-batch-draft" : "move-decision";
}

type EmbeddedPhaseState = {
  playerId: string;
  returnPreparationPlayerId: string | null;
  preparationStartPlayerId: string | null;
  stage: "outpost" | "action";
  actionOnly?: boolean;
  returnPhase?: GameState["phase"];
  returnStep?: GameState["step"];
  returnActivePlayerId?: string | null;
  returnPhaseStartPlayerId?: string | null;
};

function embeddedPhaseState(state: GameState): EmbeddedPhaseState | undefined {
  const value = state.modeState.embeddedPhaseSequence;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.playerId !== "string" || (candidate.stage !== "outpost" && candidate.stage !== "action")) return undefined;
  const phases = new Set(["preparation", "outpost", "action", "combat"]);
  const steps = new Set(["player-window", "move-decision", "play-batch-draft", "play-batch-commit", "post-power-response", "settlement"]);
  return {
    playerId: candidate.playerId,
    returnPreparationPlayerId: typeof candidate.returnPreparationPlayerId === "string" ? candidate.returnPreparationPlayerId : null,
    preparationStartPlayerId: typeof candidate.preparationStartPlayerId === "string" ? candidate.preparationStartPlayerId : null,
    stage: candidate.stage,
    ...(candidate.actionOnly === true ? { actionOnly: true } : {}),
    ...(typeof candidate.returnPhase === "string" && phases.has(candidate.returnPhase) ? { returnPhase: candidate.returnPhase as GameState["phase"] } : {}),
    ...(typeof candidate.returnStep === "string" && steps.has(candidate.returnStep) ? { returnStep: candidate.returnStep as GameState["step"] } : {}),
    ...(candidate.returnActivePlayerId === null || typeof candidate.returnActivePlayerId === "string" ? { returnActivePlayerId: candidate.returnActivePlayerId as string | null } : {}),
    ...(candidate.returnPhaseStartPlayerId === null || typeof candidate.returnPhaseStartPlayerId === "string" ? { returnPhaseStartPlayerId: candidate.returnPhaseStartPlayerId as string | null } : {}),
  };
}

function beginEmbeddedOutpostAction(
  state: GameState,
  playerId: string,
  returnPreparationPlayerId: string | null,
  preparationStartPlayerId: string | null,
): void {
  state.modeState.embeddedPhaseSequence = { playerId, returnPreparationPlayerId, preparationStartPlayerId, stage: "outpost" } satisfies EmbeddedPhaseState;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = playerId;
}

function finishEmbeddedOutpostAction(state: GameState, embedded: EmbeddedPhaseState): void {
  const player = state.players[embedded.playerId];
  if (embedded.actionOnly === true) {
    if (!embedded.returnPhase || !embedded.returnStep) throw new Error("EMBEDDED_ACTION_RETURN_STATE_INVALID");
    finishEmbeddedActionPhase(state, {
      playerId: embedded.playerId,
      returnPhase: embedded.returnPhase,
      returnStep: embedded.returnStep,
      returnActivePlayerId: embedded.returnActivePlayerId,
      returnPhaseStartPlayerId: embedded.returnPhaseStartPlayerId,
    });
    return;
  }
  if (player) {
    player.flags.outpostTakenEarlyRound = state.round;
    player.flags.actionTakenEarlyRound = state.round;
  }
  delete state.modeState.embeddedPhaseSequence;
  if (embedded.returnPreparationPlayerId) {
    state.phase = "preparation";
    state.step = "player-window";
    state.activePlayerId = embedded.returnPreparationPlayerId;
    setPhaseStart(state, embedded.preparationStartPlayerId);
    return;
  }
  state.phase = "outpost";
  state.step = "player-window";
  applyScheduledRoundTurnOrderPosition(state);
  state.activePlayerId = firstEligible(state);
  setPhaseStart(state, state.activePlayerId);
  if (state.activePlayerId === null) {
    state.phase = "action";
    state.activePlayerId = firstEligible(state);
    state.step = actionStartStep(state, state.activePlayerId);
    for (const eventId of state.board.currentEvents.city ?? []) state.board.eventVisibility[eventId] = "up";
    setPhaseStart(state, state.activePlayerId);
  }
}

function advanceStandardWindow(state: GameState, playerId: string): { transition: string; previousPhase: string; embedded?: boolean } {
  if (state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
  if (state.pendingDecision) throw new Error("PHASE_BLOCKED_BY_DECISION");
  const embedded = embeddedPhaseState(state);
  if (embedded) {
    if (embedded.playerId !== playerId || state.activePlayerId !== playerId) throw new Error("NOT_ACTIVE_PLAYER");
    const player = state.players[playerId];
    if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
    const previousPhase = state.phase;
    if (embedded.stage === "outpost") {
      if (state.phase !== "outpost") throw new Error("EMBEDDED_PHASE_STATE_INVALID");
      if (player.flags.mustDeployBattlefieldRound === state.round && player.flags.mustDeployBattlefieldSatisfiedRound !== state.round) {
        throw new Error("OUTPOST_BATTLEFIELD_DEPLOYMENT_REQUIRED");
      }
      player.flags.outpostTakenEarlyRound = state.round;
      state.modeState.embeddedPhaseSequence = { ...embedded, stage: "action" } satisfies EmbeddedPhaseState;
      state.phase = "action";
      state.step = actionStartStep(state, playerId);
      state.activePlayerId = playerId;
      return { transition: "embedded-action", previousPhase, embedded: true };
    }
    if (state.phase !== "action") throw new Error("EMBEDDED_PHASE_STATE_INVALID");
    if (state.step === "play-batch-draft" && player.flags.actionPlayBeforeMove === true) {
      state.step = "move-decision";
      return { transition: "play-passed", previousPhase, embedded: true };
    }
    if (state.step === "move-decision") {
      state.step = player.flags.actionPlayBeforeMove === true ? "settlement" : "play-batch-draft";
      return { transition: "move-passed", previousPhase, embedded: true };
    }
    finishEmbeddedOutpostAction(state, embedded);
    return { transition: "embedded-return-preparation", previousPhase, embedded: true };
  }
  if (state.phase === "combat") {
    if (state.step !== "player-window" || state.activePlayerId !== playerId) throw new Error("COMBAT_REQUIRES_RESOLUTION");
    const previousPhase = state.phase;
    const seat = state.turnOrder.indexOf(playerId);
    const next = nextEligible(state, seat);
    const phaseStartPlayerId = String(state.modeState.phaseStartPlayerId ?? playerId);
    if (next && next.id !== phaseStartPlayerId) {
      state.activePlayerId = next.id;
      return { transition: "next-player", previousPhase };
    }
    state.step = "settlement";
    state.activePlayerId = null;
    return { transition: "combat-settlement-ready", previousPhase };
  }
  if (state.activePlayerId !== playerId) throw new Error("NOT_ACTIVE_PLAYER");
  const player = state.players[playerId];
  if (!player || player.eliminated) throw new Error("PLAYER_NOT_AVAILABLE");
  const previousPhase = state.phase;
  if (state.phase === "outpost"
    && player.flags.mustDeployBattlefieldRound === state.round
    && player.flags.mustDeployBattlefieldSatisfiedRound !== state.round) {
    throw new Error("OUTPOST_BATTLEFIELD_DEPLOYMENT_REQUIRED");
  }
  if (state.phase === "action" && state.step === "play-batch-draft" && player.flags.actionPlayBeforeMove === true) {
    state.step = "move-decision";
    return { transition: "play-passed", previousPhase };
  }
  if (state.phase === "action" && state.step === "move-decision") {
    state.step = player.flags.actionPlayBeforeMove === true ? "settlement" : "play-batch-draft";
    return { transition: "move-passed", previousPhase };
  }
  const seat = state.turnOrder.indexOf(playerId);
  const next = nextEligible(state, seat);
  const phaseStartPlayerId = String(state.modeState.phaseStartPlayerId ?? playerId);
  if (state.phase === "preparation" && player.flags.outpostActionDuringPreparation === true
    && Number(player.flags.actionTakenEarlyRound ?? -1) !== state.round) {
    const returnPreparationPlayerId = next && next.id !== phaseStartPlayerId ? next.id : null;
    beginEmbeddedOutpostAction(state, playerId, returnPreparationPlayerId, phaseStartPlayerId || null);
    return { transition: "embedded-outpost", previousPhase, embedded: true };
  }
  if (next && next.id !== phaseStartPlayerId) {
    state.activePlayerId = next.id;
    state.step = state.phase === "action" ? actionStartStep(state, next.id) : "player-window";
    return { transition: "next-player", previousPhase };
  }
  if (state.phase === "preparation") {
    state.phase = "outpost";
    state.step = "player-window";
    applyScheduledRoundTurnOrderPosition(state);
    state.activePlayerId = firstEligible(state);
    setPhaseStart(state, state.activePlayerId);
    if (state.activePlayerId === null) {
      state.phase = "action";
      state.activePlayerId = firstEligible(state);
      state.step = actionStartStep(state, state.activePlayerId);
      for (const eventId of state.board.currentEvents.city ?? []) state.board.eventVisibility[eventId] = "up";
      setPhaseStart(state, state.activePlayerId);
    }
    return { transition: "next-phase", previousPhase };
  }
  if (state.phase === "outpost") {
    state.phase = "action";
    state.activePlayerId = firstEligible(state);
    state.step = actionStartStep(state, state.activePlayerId);
    for (const eventId of state.board.currentEvents.city ?? []) state.board.eventVisibility[eventId] = "up";
    setPhaseStart(state, state.activePlayerId);
    if (state.activePlayerId === null) {
      state.phase = "combat";
      state.step = "player-window";
      state.activePlayerId = firstEligible(state);
      state.modeState = { ...state.modeState, resolvedCombats: [], combatWinnerIdsByLocation: {}, phaseStartPlayerId: state.activePlayerId };
    }
    return { transition: "next-phase", previousPhase };
  }
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = firstEligible(state);
  state.modeState = { ...state.modeState, resolvedCombats: [], combatWinnerIdsByLocation: {}, phaseStartPlayerId: state.activePlayerId };
  return { transition: "next-phase", previousPhase };
}
