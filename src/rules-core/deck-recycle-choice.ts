import type { GameState } from "../domain/state/types.ts";
import type { CardDefinition } from "./content-types.ts";

export const AUTOMATIC_DECK_RECYCLE_DECISION_KIND = "automatic-deck-recycle-keep";

export interface AutomaticDeckRecycleChoiceRequest {
  playerId: string;
  sourceInstanceId: string;
  sourceDefinitionId: string;
  candidateInstanceIds: string[];
  maxKeep: number;
}

export class AutomaticDeckRecycleChoiceRequired extends Error {
  readonly request: AutomaticDeckRecycleChoiceRequest;

  constructor(request: AutomaticDeckRecycleChoiceRequest) {
    super("AUTOMATIC_DECK_RECYCLE_CHOICE_REQUIRED");
    this.name = "AutomaticDeckRecycleChoiceRequired";
    this.request = structuredClone(request);
  }
}

interface PreparedAutomaticDeckRecycleChoice {
  playerId: string;
  sourceInstanceId: string;
  keepInstanceIds: string[];
}

function sourceRule(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): { sourceInstanceId: string; sourceDefinitionId: string; maxKeep: number } | undefined {
  for (const card of Object.values(state.cards)) {
    if (card.controllerPlayerId !== playerId || card.zone === "removed") continue;
    const definition = definitions[card.definitionId];
    const maxKeep = Number(definition?.automaticDeckRecycleKeepMax ?? 0);
    if (!Number.isInteger(maxKeep) || maxKeep <= 0) continue;
    if (card.zone !== "master-skills" && card.zone !== "servant-skills" && card.zone !== "attack") continue;
    return { sourceInstanceId: card.instanceId, sourceDefinitionId: definition.id, maxKeep };
  }
  return undefined;
}

/**
 * Resolves the optional pre-recycle keep choice. A prepared choice is installed
 * by the match engine after the chooser responds, then consumed on deterministic
 * replay of the command that attempted the automatic recycle.
 */
export function consumeAutomaticDeckRecycleKeepChoice(
  state: GameState,
  playerId: string,
  definitions: Record<string, CardDefinition>,
): string[] | undefined {
  const rule = sourceRule(state, playerId, definitions);
  if (!rule) return [];
  const prepared = state.modeState.preparedAutomaticDeckRecycleChoice as PreparedAutomaticDeckRecycleChoice | undefined;
  if (!prepared || prepared.playerId !== playerId || prepared.sourceInstanceId !== rule.sourceInstanceId) {
    const player = state.players[playerId];
    if (!player) throw new Error("PLAYER_NOT_FOUND");
    throw new AutomaticDeckRecycleChoiceRequired({
      playerId,
      sourceInstanceId: rule.sourceInstanceId,
      sourceDefinitionId: rule.sourceDefinitionId,
      candidateInstanceIds: [...player.discard],
      maxKeep: Math.min(rule.maxKeep, player.discard.length),
    });
  }
  const player = state.players[playerId];
  const keep = [...prepared.keepInstanceIds];
  if (new Set(keep).size !== keep.length || keep.length > rule.maxKeep || keep.some((id) => !player.discard.includes(id))) {
    throw new Error("AUTOMATIC_DECK_RECYCLE_CHOICE_INVALID");
  }
  delete state.modeState.preparedAutomaticDeckRecycleChoice;
  return keep;
}
