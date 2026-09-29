import rawContent from "../content/generated/legacy-content.json" with { type: "json" };
import { GameApplication } from "../application/game-application.ts";
import { buildStandardContent } from "../content/content-package.ts";
import { CommandType } from "../match-engine/commands.ts";
import type { AvailableAction } from "../application/integration-contract.ts";

const MASTER_IDS = [
  "master.kayneth",
  "master.shinji",
  "master.kiritsugu",
  "master.maiya",
  "master.gatou",
  "master.irisviel",
  "master.olga-marie",
] as const;

const SERVANT_IDS = [
  "servant.artoriac",
  "servant.drake",
  "servant.achilles",
  "servant.artoria-alt",
  "servant.ereshkigal",
  "servant.tomoe",
  "servant.kintoki",
] as const;

type CharacterPreview = { sourceId?: string; name?: string; fullName?: string; class?: string; image?: string };
type DetailCatalog = { masters?: Record<string, CharacterPreview>; servants?: Record<string, CharacterPreview> };
type Listener = (snapshot: ReturnType<BrowserBattleRuntime["snapshot"]>) => void;

declare global {
  interface Window {
    FDCodexDetailData?: DetailCatalog;
    FDBattleRuntime?: { create(options?: { master?: string; servant?: string; seed?: number }): BrowserBattleRuntime };
  }
}

function previewBySourceId(kind: "masters" | "servants", sourceId: string): CharacterPreview | undefined {
  return Object.values(window.FDCodexDetailData?.[kind] ?? {}).find((entry) => entry.sourceId === sourceId);
}

function selectedSourceId(kind: "masters" | "servants", requested: string | undefined, allowed: readonly string[]): string {
  const catalog = window.FDCodexDetailData?.[kind] ?? {};
  const direct = requested ? catalog[requested]?.sourceId : undefined;
  if (direct && allowed.includes(direct)) return direct;
  const byName = Object.values(catalog).find((entry) => entry.name === requested || entry.fullName === requested)?.sourceId;
  return byName && allowed.includes(byName) ? byName : allowed[0];
}

function orderedWithSelected(allowed: readonly string[], selected: string): string[] {
  return [selected, ...allowed.filter((id) => id !== selected)];
}

function decisionPayload(action: AvailableAction): unknown {
  if (action.commandType !== CommandType.ResolveDecision) return action.payload ?? {};
  const options = action.input?.options?.filter((option) => !option.disabled) ?? [];
  return {
    ...(action.payload && typeof action.payload === "object" ? action.payload : {}),
    selections: options.slice(0, action.input?.min ?? 1).map((option) => option.id),
  };
}

export class BrowserBattleRuntime {
  readonly playerId = "p1";
  readonly assignments: Array<{ playerId: string; masterId: string; servantId: string }>;
  readonly app: GameApplication;
  #sequence = 0;
  #listeners = new Set<Listener>();
  #lastEvents: unknown[] = [];
  #aiPumping = false;

  constructor(options: { master?: string; servant?: string; seed?: number } = {}) {
    const selectedMaster = selectedSourceId("masters", options.master, MASTER_IDS);
    const selectedServant = selectedSourceId("servants", options.servant, SERVANT_IDS);
    const masters = orderedWithSelected(MASTER_IDS, selectedMaster);
    const servants = orderedWithSelected(SERVANT_IDS, selectedServant);
    this.assignments = masters.map((masterId, index) => ({ playerId: `p${index + 1}`, masterId, servantId: servants[index] }));

    const allContent = buildStandardContent(rawContent);
    const fuyukiGroups = (allContent.eventGroups ?? []).filter((group) => group.id === "event-group.fuyuki" || group.name.includes("冬木"));
    if (fuyukiGroups.length !== 1) throw new Error("FUYUKI_EVENT_GROUP_REQUIRED");
    const content = { ...allContent, eventGroups: fuyukiGroups };
    this.app = GameApplication.create({
      gameInstanceId: `local-${Date.now().toString(36)}`,
      players: this.assignments.map(({ playerId }, index) => ({ id: playerId, name: index === 0 ? "玩家" : `电脑玩家 ${index}` })),
      seed: options.seed ?? Date.now(),
      content,
    });
    for (const assignment of this.assignments) {
      this.#send(assignment.playerId, CommandType.AssignIdentity, { masterId: assignment.masterId, servantId: assignment.servantId });
    }
    this.#send("host", CommandType.StartStandardGame, {});
    this.#scheduleComputerPlayers();
  }

  snapshot() {
    const view = this.app.viewFor(this.playerId);
    const definitions = this.app.cardDefinitions();
    const roster = this.assignments.map((assignment) => {
      const player = view.players[assignment.playerId];
      const master = previewBySourceId("masters", assignment.masterId) ?? { sourceId: assignment.masterId, name: assignment.masterId };
      const servant = previewBySourceId("servants", assignment.servantId) ?? { sourceId: assignment.servantId, name: assignment.servantId };
      return { ...assignment, player, master, servant };
    });
    return {
      view,
      actions: this.app.availableActionsFor(this.playerId),
      definitions,
      roster,
      events: structuredClone(this.#lastEvents),
      approvedEventGroupId: "event-group.fuyuki",
    };
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => this.#listeners.delete(listener);
  }

  dispatch(actionId: string, selections?: string[]): ReturnType<BrowserBattleRuntime["snapshot"]> {
    const action = this.app.availableActionsFor(this.playerId).find((candidate) => candidate.id === actionId);
    if (!action) throw new Error("ACTION_NOT_AVAILABLE");
    let payload: unknown = action.payload ?? {};
    if (action.commandType === CommandType.ResolveDecision) payload = {
      ...(payload && typeof payload === "object" ? payload : {}),
      selections: selections ?? [],
    };
    const result = this.#send(this.playerId, action.commandType, payload);
    if (!result.ok) throw new Error(result.rejection.code);
    this.#lastEvents = result.events;
    this.#emit();
    this.#scheduleComputerPlayers();
    return this.snapshot();
  }

  save(): string { return this.app.save(); }

  #send(actorId: string, type: string, payload: unknown) {
    const state = this.app.state;
    try {
      const result = this.app.dispatch({
        commandId: `browser:${this.#sequence++}`,
        gameInstanceId: state.gameInstanceId,
        actorId,
        expectedRevision: state.revision,
        type,
        payload,
      });
      return { ok: true as const, events: result.events };
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "COMMAND_REJECTED";
      return { ok: false as const, events: [], rejection: { code } };
    }
  }

  #scheduleComputerPlayers(): void {
    if (this.#aiPumping) return;
    this.#aiPumping = true;
    window.setTimeout(async () => {
      try {
        await this.#pumpComputerPlayers();
      } catch (error) {
        console.error(error);
      } finally {
        this.#aiPumping = false;
        this.#emit();
      }
    }, 0);
  }

  async #pumpComputerPlayers(): Promise<void> {
    for (let guard = 0; guard < 300; guard += 1) {
      const state = this.app.state;
      const pendingActor = state.pendingDecision?.chooserPlayerIds.find((id) => state.pendingDecision?.submissions[id] === undefined);
      const actorId = pendingActor ?? state.activePlayerId;
      if (!actorId || actorId === this.playerId || state.status === "finished") return;
      const player = state.players[actorId];
      const candidates: Array<{ type: string; payload: unknown }> = [];
      if (pendingActor) {
        const action = this.app.availableActionsFor(actorId).find((candidate) => candidate.commandType === CommandType.ResolveDecision);
        if (action) candidates.push({ type: action.commandType, payload: decisionPayload(action) });
      } else if (state.phase === "outpost" && player?.flags.deploymentBonusActive !== true) {
        for (const locationId of ["workshop", "mountain", "city"]) candidates.push({ type: CommandType.DeployPlayer, payload: { locationId } });
      } else if (state.phase === "action" && state.step === "move-decision") {
        for (const locationId of ["mountain", "city", "scouting", "workshop"]) {
          if (locationId !== player?.locationId) candidates.push({ type: CommandType.MovePlayer, payload: { locationId } });
        }
      } else if (state.phase === "action" && state.step === "play-batch-draft") {
        const faceUpInstanceIds = player?.hand.slice(0, Math.min(2, player.hand.length)) ?? [];
        if (faceUpInstanceIds.length) candidates.push({ type: CommandType.CommitAttack, payload: { faceUpInstanceIds, faceDownInstanceIds: [] } });
      } else if (state.phase === "combat" && state.step === "post-power-response") {
        candidates.push({ type: CommandType.CompleteCombatResponse, payload: {} });
      }
      candidates.push({ type: CommandType.CompletePlayerWindow, payload: {} });
      let acceptedEvents: unknown[] | undefined;
      for (const candidate of candidates) {
        const result = this.#send(actorId, candidate.type, candidate.payload);
        if (result.ok) { acceptedEvents = result.events; break; }
      }
      if (!acceptedEvents) return;
      this.#lastEvents = acceptedEvents;
      this.#emit();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    throw new Error("AI_ACTION_GUARD_EXCEEDED");
  }

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}

window.FDBattleRuntime = { create: (options) => new BrowserBattleRuntime(options) };

