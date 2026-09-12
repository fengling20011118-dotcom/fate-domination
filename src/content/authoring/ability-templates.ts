import type { FDAuthoringAbility } from "./types.ts";

type AbilityBody = Omit<FDAuthoringAbility, "kind">;

/** Expands to ordinary DSL data; execution status must still be supplied by the author. */
export function onOwnFaceUpPlay(body: AbilityBody): FDAuthoringAbility {
  return {
    ...body,
    kind: "play_trigger",
    conditions: [
      { type: "event_type_is", eventType: "card.played" },
      { type: "event_player_is_controller" },
      { type: "event_definition_is_self" },
      { type: "event_face_is", face: "up" },
      ...(body.conditions ?? []),
    ],
  };
}

/** Only active-source combat wins; other passive lifetimes must use explicit DSL. */
export function onActiveCombatWin(body: AbilityBody): FDAuthoringAbility {
  return {
    ...body,
    kind: "passive",
    activation: body.activation ?? { phase: "combat" },
    conditions: [
      { type: "event_type_is", eventType: "combat.resolved" },
      { type: "source_active" },
      { type: "event_player_won_combat" },
      ...(body.conditions ?? []),
    ],
  };
}
