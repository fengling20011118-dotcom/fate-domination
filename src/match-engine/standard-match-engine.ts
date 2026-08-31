import type { GameCommand } from "./commands.ts";
import { assertCommandEnvelope, CommandType } from "./commands.ts";
import { createEvent } from "./events.ts";
import { cloneState } from "../domain/state/createGameState.ts";
import type { GameEvent, GameState } from "../domain/state/types.ts";
import { getCardAttributes, type CardDefinition, type EventDefinition, type EventGroupDefinition, type SituationDefinition } from "../rules-core/content-types.ts";
import { initializePlayerDeck, initializePlayerSkillCards } from "../rules-core/decks.ts";
import { deployPlayer, movePlayer } from "../rules-core/board.ts";
import { commitStandardAttack } from "../rules-core/card-play.ts";
import { calculateCombatSnapshot, finalizeCombatFromSnapshot, type CombatPowerSnapshot } from "../rules-core/combat.ts";
import { applyClimaxElimination, chooseEventGroup, endStandardRound, initializeEventDeck, startStandardRound } from "../rules-core/rounds.ts";
import { StateRandom } from "./random.ts";
import { SkillRegistry } from "../rules-core/skill-registry.ts";
import { assignIdentity, assertSetupReady, setPlayerReady } from "../rules-core/setup.ts";
import { getCombatResponseResponderIds, registerCorePassiveHandlers, registerCoreSkillHandlers } from "../rules-core/skill-handlers.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../rules-core/passives.ts";
import { registerSanzangSkill } from "../rules-core/sanzang-skill.ts";
import { ensureTiamatLifeSea, getTiamatCardDefinitions, initializeTiamatBeasts, registerTiamatCardAbilities, registerTiamatSkill } from "../rules-core/tiamat-skill.ts";
import { CardAbilityRegistry } from "../rules-core/card-abilities.ts";
import { registerMisfortuneCardAbility } from "../rules-core/misfortune.ts";
import { applyThreeXStartModifiers, assertThreeXContentPools, assertThreeXReadyForStart, assertThreeXSelectionsInPools, autoBanThreeXMasters, commitThreeXBan, commitThreeXPurchases, dealThreeXMasterOffer, dealThreeXServantOffer, finalizeThreeXBanStrict, finalizeThreeXMasterDraft, finalizeThreeXServantSelection, lockThreeXTurnOrder, selectThreeXMaster, selectThreeXServant, submitThreeXBan } from "../rules-core/three-x-state.ts";
import { applyThreeXPurchases, finalizeThreeXPurchasesForPlayers, type ThreeXPurchase } from "../rules-core/three-x-economy.ts";
import { DecisionManager } from "./decisions.ts";
import { EffectRuntime } from "./effect-runtime.ts";
import { createEffectFrame, DRAW_CARDS_EFFECT, registerStandardEffectHandlers } from "../rules-core/standard-effects.ts";
import { createDefaultModeRegistry } from "./default-modes.ts";
import type { ModeRegistry } from "./modes.ts";

export interface StandardContent {
  cards: Record<string, CardDefinition>;
  situations: SituationDefinition[];
  events: EventDefinition[];
  eventGroups?: EventGroupDefinition[];
  playerDecks: Record<string, string[]>;
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
    this.dynamicCards = getTiamatCardDefinitions();
    this.cardAbilities = content.cardAbilities ?? new CardAbilityRegistry();
    if (!this.cardAbilities.has("wave-beast-move")) registerTiamatCardAbilities(this.cardAbilities);
    registerMisfortuneCardAbility(this.cardAbilities);
    if (this.content.skills) {
      registerCoreSkillHandlers(this.content.skills);
      registerCorePassiveHandlers(this.content.skills, this.passives, this.effects);
      registerSanzangSkill(this.content.skills, this.effects);
      registerTiamatSkill(this.content.skills, this.effects);
    }
  }

  /** Returns the immutable rules package selected by a match without exposing engine internals. */
  getModeDefinition(mode: GameState["mode"]): import("./modes.ts").GameModeDefinition {
    return this.modes.get(mode);
  }

  execute(current: GameState, command: GameCommand): { state: GameState; events: GameEvent[]; duplicate: boolean } {
    assertCommandEnvelope(command, current);
    if (current.processedCommandIds.includes(command.commandId)) return { state: current, events: [], duplicate: true };
    if (command.expectedRevision !== current.revision) throw new Error("REVISION_MISMATCH");

    const state = cloneState(current);
    const events: GameEvent[] = [];
    const emit = (type: string, payload: unknown): void => {
      events.push(createEvent(state, command.commandId, events.length, type, payload));
    };
    const randomInt = (maxExclusive: number): number => this.random.integer(state, maxExclusive);

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
          const deckDefinitionIds = this.content.playerDecks[player.servantId ?? ""]
            ?? this.content.playerDecks[player.id]
            ?? [];
          initializePlayerDeck(state, player.id, deckDefinitionIds, randomInt);
          if (this.content.skills) {
            initializePlayerSkillCards(state, player.id, this.content.skills.list().filter((skill) => (skill.ownerType === "master" && skill.ownerId === player.masterId) || (skill.ownerType === "servant" && skill.ownerId === player.servantId)).map((skill) => ({ id: skill.id, ownerType: skill.ownerType })));
          }
          // Initialize generated cards after the regular skill setup, which resets skill arrays.
          ensureTiamatLifeSea(state, player.id);
        }
        const selectedEvents = chooseEventGroup(state, this.content.eventGroups, this.content.events, randomInt);
        initializeEventDeck(state, selectedEvents, randomInt);
        startStandardRound(state, this.content.situations, selectedEvents, randomInt);
        state.modeState = { ...state.modeState, resolvedCombats: [], phaseStartPlayerId: state.activePlayerId };
        emit("game.started", { round: state.round, phase: state.phase, activePlayerId: state.activePlayerId });
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
          const result = advanceStandardWindow(state, command.actorId);
          emit("phase.player-window.closed", { playerId: command.actorId, phase: result.previousPhase });
          emit("phase.transitioned", result);
        }
        break;
      case CommandType.DeployPlayer:
        deployPlayer(state, command.actorId, (command.payload as { locationId: "workshop" | "mountain" | "city" }).locationId);
        emit("player.deployed", { playerId: command.actorId, locationId: state.players[command.actorId].locationId });
        break;
      case CommandType.UseSkill:
        {
          if (!this.content.skills) throw new Error("SKILL_REGISTRY_NOT_CONFIGURED");
          const payload = command.payload as { skillId: string; data?: unknown };
          const trueNameBefore = state.players[command.actorId]?.trueNameRevealed === true;
          const skillResult = this.content.skills.execute(state, command.actorId, payload.skillId, payload.data, (decision) => {
            if (state.pendingDecision) throw new Error("DECISION_ALREADY_OPEN");
            state.pendingDecision = structuredClone(decision);
          }, randomInt, this.cardDefinitions());
          emit("skill.used", { playerId: command.actorId, skillId: payload.skillId });
          const playedBySkill = skillResult && typeof skillResult === "object" && Array.isArray((skillResult as { cards?: unknown }).cards)
            ? (skillResult as { cards: Array<{ instanceId: string; definitionId: string; paidMana: number; revealsTrueName?: boolean }> }).cards
            : [];
          if (playedBySkill.length) {
            for (const card of playedBySkill) {
              emit("card.played", { playerId: command.actorId, instanceId: card.instanceId, definitionId: card.definitionId, face: "up", paidMana: card.paidMana, attributes: getCardAttributes(this.cardDefinitions()[card.definitionId]) });
            }
          }
          const player = state.players[command.actorId];
          if (!trueNameBefore && !player.trueNameRevealed && playedBySkill.some((card) => card.revealsTrueName === true)) {
            player.trueNameRevealed = true;
          }
          if (!trueNameBefore && player.trueNameRevealed) {
            emit("servant.true-name-revealed", { playerId: command.actorId, servantId: player.servantId });
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
            this.resumeDecision(state, decision, { status: "resolved", selections: payload.selections });
            this.drainEffects(state);
          }
        }
        break;
      case CommandType.CancelDecision:
        {
          const payload = command.payload as { decisionId: string };
          const decision = this.decisions.cancel(state, { decisionId: payload.decisionId, actorId: command.actorId });
          emit("decision.cancelled", { decisionId: decision.decisionId, actorId: command.actorId });
          this.resumeDecision(state, decision, { status: "cancelled", selections: [] });
          this.drainEffects(state);
        }
        break;
      case CommandType.MovePlayer:
        {
          const payload = command.payload as { locationId: string; ignoreEngagement?: boolean };
          const cost = movePlayer(state, command.actorId, payload.locationId, payload.ignoreEngagement ?? false);
          emit("player.moved", { playerId: command.actorId, locationId: payload.locationId, cost });
        }
        break;
      case CommandType.UseCardAbility:
        {
          const payload = command.payload as { instanceId: string; ability: string; targetLocationId?: string };
          this.cardAbilities.execute(payload.ability, {
            state,
            playerId: command.actorId,
            instanceId: payload.instanceId,
            target: payload.targetLocationId,
            definitions: this.cardDefinitions(),
          });
          emit("card.ability.used", { playerId: command.actorId, instanceId: payload.instanceId, ability: payload.ability, targetLocationId: payload.targetLocationId });
        }
        break;
      case CommandType.CommitAttack:
        {
          const payload = command.payload as { faceUpInstanceIds: string[]; faceDownInstanceIds: string[] };
          const result = commitStandardAttack(state, command.actorId, payload.faceUpInstanceIds, payload.faceDownInstanceIds, this.cardDefinitions());
          emit("attack.committed", { playerId: command.actorId, paidMana: result.paidMana, committed: result.committed });
          for (const card of result.cards) {
            emit("card.played", {
              playerId: command.actorId,
              instanceId: card.instanceId,
              definitionId: card.face === "up" ? card.definitionId : null,
              face: card.face,
              paidMana: card.paidMana,
              attributes: card.face === "up" ? card.attributes : [],
            });
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
          const player = state.players[command.actorId];
          if (!player.trueNameRevealed && result.cards.some((card) => card.revealsTrueName)) {
            player.trueNameRevealed = true;
            emit("servant.true-name-revealed", { playerId: command.actorId, servantId: player.servantId });
          }
        }
        break;
      case CommandType.ResolveCombat:
        {
          if (state.phase !== "combat" || state.step !== "settlement") throw new Error("COMBAT_WINDOW_NOT_CLOSED");
          const payload = command.payload as { locationId: "mountain" | "city" };
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
            const result = finalizeCombatFromSnapshot(state, snapshot, this.cardDefinitions(), Object.fromEntries(this.content.events.map((event) => [event.id, event])));
            resolvedBefore.add(payload.locationId);
            state.modeState = { ...state.modeState, resolvedCombats: [...resolvedBefore] };
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
            const result = finalizeCombatFromSnapshot(state, pending.snapshot, this.cardDefinitions(), Object.fromEntries(this.content.events.map((event) => [event.id, event])));
            const resolved = new Set<string>((state.modeState.resolvedCombats as string[] | undefined) ?? []);
            resolved.add(pending.snapshot.locationId);
            const { pendingCombatResolution: _pending, ...modeState } = state.modeState;
            state.modeState = { ...modeState, resolvedCombats: [...resolved] };
            state.step = "settlement";
            state.activePlayerId = null;
            emit("combat.resolved", result);
          }
        }
        break;
      case CommandType.EndRound:
        if (state.phase !== "combat" || state.step !== "settlement") throw new Error("ROUND_NOT_READY");
        if (new Set((state.modeState.resolvedCombats as string[] | undefined) ?? []).size < 2) throw new Error("COMBAT_NOT_RESOLVED");
        const eliminatedThisRound = applyClimaxElimination(state);
        const shouldFinish = state.board.situationDeck.length === 0 || Object.values(state.players).filter((player) => !player.eliminated).length <= 1;
        const finalWinnerIds = shouldFinish ? determineFinalWinnerIds(state) : [];
        endStandardRound(state, this.cardDefinitions());
        if (shouldFinish) {
          state.status = "finished";
          state.phase = "combat";
          state.step = "settlement";
          state.activePlayerId = null;
          emit("game.finished", { round: state.round, eliminatedThisRound, winnerIds: finalWinnerIds });
        } else {
          const eventPoolIds = Array.isArray(state.modeState.eventPoolEventIds)
            ? state.modeState.eventPoolEventIds.filter((id): id is string => typeof id === "string")
            : [];
          const eventPool = eventPoolIds.length > 0
            ? eventPoolIds.map((id) => this.content.events.find((event) => event.id === id)).filter((event): event is EventDefinition => Boolean(event))
            : this.content.events;
          if (eventPool.length === 0) throw new Error("EVENT_GROUP_CARD_NOT_FOUND");
          startStandardRound(state, this.content.situations, eventPool, randomInt);
          state.modeState = { ...state.modeState, resolvedCombats: [], phaseStartPlayerId: state.activePlayerId };
          emit("round.ended", { round: state.round, nextPhase: state.phase, eliminatedThisRound });
        }
        break;
      default:
        throw new Error("COMMAND_NOT_SUPPORTED_BY_STANDARD_ENGINE");
    }

    for (const event of events) enqueuePassiveEffects(state, this.passives, event);
    this.drainEffects(state);
    state.revision += 1;
    state.processedCommandIds.push(command.commandId);
    state.eventLog.push(...events);
    return { state, events, duplicate: false };
  }

  private cardDefinitions(): Record<string, CardDefinition> {
    return { ...this.content.cards, ...this.dynamicCards, ...(this.content.skills?.asCardDefinitions() ?? {}) };
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
    effect.payload = { previous: effect.payload, decision: { decisionId: decision.decisionId, ...result } };
  }

  private drainEffects(state: GameState): void {
    this.effects.drain(state);
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
    if (player && !player.eliminated && !player.defeated) return { index, id };
  }
  return null;
}

function firstEligible(state: GameState): string | null {
  return state.turnOrder.find((id) => {
    const player = state.players[id];
    return player && !player.eliminated && !player.defeated;
  }) ?? null;
}

function setPhaseStart(state: GameState, playerId: string | null): void {
  state.modeState = { ...state.modeState, phaseStartPlayerId: playerId };
}

function advanceStandardWindow(state: GameState, playerId: string): { transition: string; previousPhase: string } {
  if (state.status !== "playing") throw new Error("GAME_NOT_PLAYING");
  if (state.pendingDecision) throw new Error("PHASE_BLOCKED_BY_DECISION");
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
  if (state.phase === "action" && state.step === "move-decision") {
    state.step = "play-batch-draft";
    return { transition: "move-passed", previousPhase };
  }
  const seat = state.turnOrder.indexOf(playerId);
  const next = nextEligible(state, seat);
  const phaseStartPlayerId = String(state.modeState.phaseStartPlayerId ?? playerId);
  if (next && next.id !== phaseStartPlayerId) {
    state.activePlayerId = next.id;
    state.step = state.phase === "action" ? "move-decision" : "player-window";
    return { transition: "next-player", previousPhase };
  }
  if (state.phase === "preparation") {
    state.phase = "outpost";
    state.step = "player-window";
    state.activePlayerId = firstEligible(state);
    setPhaseStart(state, state.activePlayerId);
    return { transition: "next-phase", previousPhase };
  }
  if (state.phase === "outpost") {
    state.phase = "action";
    state.step = "move-decision";
    state.activePlayerId = firstEligible(state);
    for (const eventId of state.board.currentEvents.city ?? []) state.board.eventVisibility[eventId] = "up";
    setPhaseStart(state, state.activePlayerId);
    return { transition: "next-phase", previousPhase };
  }
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = firstEligible(state);
  state.modeState = { ...state.modeState, resolvedCombats: [], phaseStartPlayerId: state.activePlayerId };
  return { transition: "next-phase", previousPhase };
}
