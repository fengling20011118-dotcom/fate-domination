import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

export interface NpcCombatantState {
  id: string;
  name: string;
  sourceId: string;
  controllerPlayerId?: string;
  basePower: number;
  victoryPoints: number;
  eliminated: boolean;
  /** NPC participates on every battlefield containing an event with this stable structured tag. */
  presenceEventTag?: string;
}

const NPC_KEY = "npcCombatants";

function isNpc(value: unknown): value is NpcCombatantState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const npc = value as Partial<NpcCombatantState>;
  return typeof npc.id === "string" && npc.id.length > 0
    && typeof npc.name === "string" && typeof npc.sourceId === "string"
    && Number.isFinite(npc.basePower) && Number.isInteger(npc.victoryPoints)
    && npc.victoryPoints! >= 0 && typeof npc.eliminated === "boolean";
}

export function listNpcCombatants(state: GameState): NpcCombatantState[] {
  const raw = state.modeState[NPC_KEY];
  return Array.isArray(raw) ? raw.filter(isNpc) : [];
}

function writeNpcCombatants(state: GameState, npcs: readonly NpcCombatantState[]): void {
  state.modeState[NPC_KEY] = npcs.map((npc) => ({ ...npc }));
}

export function upsertNpcCombatant(state: GameState, input: Omit<NpcCombatantState, "victoryPoints" | "eliminated"> & { victoryPoints?: number; eliminated?: boolean }): NpcCombatantState {
  if (!input.id || !input.sourceId || !Number.isFinite(input.basePower) || input.basePower < 0) throw new Error("NPC_COMBATANT_INVALID");
  if (input.controllerPlayerId && !state.players[input.controllerPlayerId]) throw new Error("NPC_CONTROLLER_INVALID");
  const current = listNpcCombatants(state);
  const found = current.find((npc) => npc.id === input.id);
  const npc: NpcCombatantState = {
    id: input.id,
    name: input.name,
    sourceId: input.sourceId,
    ...(input.controllerPlayerId ? { controllerPlayerId: input.controllerPlayerId } : {}),
    basePower: input.basePower,
    victoryPoints: input.victoryPoints ?? found?.victoryPoints ?? 0,
    eliminated: input.eliminated ?? found?.eliminated ?? false,
    ...(input.presenceEventTag ? { presenceEventTag: input.presenceEventTag } : {}),
  };
  if (!Number.isInteger(npc.victoryPoints) || npc.victoryPoints < 0) throw new Error("NPC_VICTORY_POINTS_INVALID");
  const next = current.filter((candidate) => candidate.id !== npc.id);
  next.push(npc);
  writeNpcCombatants(state, next);
  return npc;
}

export function getNpcCombatant(state: GameState, npcId: string): NpcCombatantState | undefined {
  return listNpcCombatants(state).find((npc) => npc.id === npcId);
}

export function updateNpcCombatant(state: GameState, npcId: string, update: (npc: NpcCombatantState) => void): NpcCombatantState {
  const current = listNpcCombatants(state);
  const index = current.findIndex((npc) => npc.id === npcId);
  if (index < 0) throw new Error("NPC_COMBATANT_NOT_FOUND");
  update(current[index]);
  if (!Number.isInteger(current[index].victoryPoints) || current[index].victoryPoints < 0) throw new Error("NPC_VICTORY_POINTS_INVALID");
  writeNpcCombatants(state, current);
  return current[index];
}

export function gainNpcVictoryPoints(state: GameState, npcId: string, amount: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("NPC_VICTORY_POINTS_INVALID");
  if (amount === 0) return 0;
  updateNpcCombatant(state, npcId, (npc) => { npc.victoryPoints += amount; });
  return amount;
}

function eventTags(definitions: Record<string, CardDefinition>, eventId: string): string[] {
  return definitions[eventId]?.tags?.filter((tag): tag is string => typeof tag === "string") ?? [];
}

export function npcIsAtLocation(state: GameState, npc: NpcCombatantState, locationId: string, definitions: Record<string, CardDefinition>): boolean {
  if (npc.eliminated || (locationId !== "mountain" && locationId !== "city")) return false;
  if (!npc.presenceEventTag) return false;
  return (state.board.currentEvents[locationId] ?? []).some((eventId) => eventTags(definitions, eventId).includes(npc.presenceEventTag!));
}

export function getNpcCombatantsAtLocation(state: GameState, locationId: string, definitions: Record<string, CardDefinition>): NpcCombatantState[] {
  return listNpcCombatants(state).filter((npc) => npcIsAtLocation(state, npc, locationId, definitions));
}

export function calculateNpcCombatPower(state: GameState, npc: NpcCombatantState, locationId: string, definitions: Record<string, CardDefinition>): number {
  if (!npcIsAtLocation(state, npc, locationId, definitions)) return 0;
  const prefix = `npc-power:${npc.id}:`;
  let modifier = 0;
  for (const eventId of state.board.currentEvents[locationId] ?? []) {
    for (const tag of eventTags(definitions, eventId)) {
      if (!tag.startsWith(prefix)) continue;
      const value = Number(tag.slice(prefix.length));
      if (!Number.isFinite(value)) throw new Error("NPC_POWER_MODIFIER_INVALID");
      modifier += value;
    }
  }
  return Math.max(0, npc.basePower + modifier);
}

export function npcPresenceLocations(state: GameState, npcId: string, definitions: Record<string, CardDefinition>): Array<"mountain" | "city"> {
  const npc = getNpcCombatant(state, npcId);
  if (!npc || npc.eliminated) return [];
  return (["mountain", "city"] as const).filter((locationId) => npcIsAtLocation(state, npc, locationId, definitions));
}

export function eliminateNpcCombatant(state: GameState, npcId: string): boolean {
  const npc = getNpcCombatant(state, npcId);
  if (!npc || npc.eliminated) return false;
  updateNpcCombatant(state, npcId, (target) => { target.eliminated = true; });
  return true;
}
