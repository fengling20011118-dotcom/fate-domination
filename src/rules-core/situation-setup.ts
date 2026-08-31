import type { GameState } from "../domain/state/types.ts";
import type { SituationDefinition } from "./content-types.ts";

export function initializeSituationDeck(state: GameState, definitions: SituationDefinition[], random: (max: number) => number): void {
  const regular = definitions.filter((definition) => !definition.climax);
  const climax = definitions.filter((definition) => definition.climax);
  if (regular.length !== 10 || climax.length !== 3) throw new Error("SITUATION_DECK_SHAPE_INVALID");

  const shuffled = [...regular];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = random(index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  const removed = shuffled.splice(0, 2);
  state.board.situationDiscard = removed.map((definition) => definition.id);
  state.board.situationDeck = [
    ...shuffled.map((definition) => definition.id),
    ...climax.map((definition) => definition.id),
  ];
}
