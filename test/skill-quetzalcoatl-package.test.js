import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { useQuetzalSunstone } from "../src/rules-core/skill-handlers.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const FLAME = "servant.quetzalcoatl.skill.sc-quetzalcoatl-1";
const SUNSTONE = "servant.quetzalcoatl.skill.sc-quetzalcoatl-2";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "quetzal") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "q", name: "Quetzalcoatl" }, { id: "o", name: "Opponent" }], seed: 9901 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "q";
  state.turnOrder = ["q", "o"];
  state.players.q.servantId = "servant.quetzalcoatl";
  state.players.q.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.q.mana = 20;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["q", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

test("Quetzalcoatl package: all three skills are FULL", () => {
  const { built } = setup("quetzal-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.quetzalcoatl");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(FLAME).handlerId, "core.quetzal-flame");
  assert.equal(built.skills.get(SUNSTONE).handlerId, "core.quetzal-sunstone");
});

test("Flame draws and plays an Agility card, may repeat, then a Strength draw grants +1 to every card played by the chain", () => {
  const { definitions, engine, state } = setup("quetzal-flame");
  createOwnedCardInstance(state, "q", { instanceId: "flame", definitionId: FLAME, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "q", { instanceId: "quick", definitionId: "card.cardq1", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "q", { instanceId: "strength", definitionId: "card.cardb1", zone: "deck", face: "down", active: false });

  let result = engine.execute(state, command(state, "quetzal-flame-use", CommandType.UseSkill, "q", { skillId: FLAME }));
  assert.equal(result.state.cards.quick.zone, "attack");
  assert.equal(result.state.pendingDecision?.kind, "quetzal-flame-repeat");
  result = engine.execute(result.state, command(result.state, "quetzal-flame-repeat", CommandType.ResolveDecision, "q", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["repeat"],
  }));
  assert.equal(result.state.cards.strength.zone, "attack");
  assert.equal(result.state.pendingDecision, null);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.q, "quick", definitions), definitions["card.cardq1"].basePower + 1);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.q, "strength", definitions), definitions["card.cardb1"].basePower + 1);
});

test("Flame is unavailable while an active Strength basic attack is already controlled", () => {
  const { engine, state } = setup("quetzal-flame-blocked");
  createOwnedCardInstance(state, "q", { instanceId: "flame", definitionId: FLAME, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "q", { instanceId: "strength", definitionId: "card.cardb1", zone: "attack", face: "up", active: true });
  assert.ok(!engine.getLegalActions(state, "q").some((action) => action.type === CommandType.UseSkill && action.payload?.skillId === FLAME));
});

test("Sunstone Prophecy chooses 0..2 draws, then puts exactly two chosen hand cards on the deck bottom in order", () => {
  const { engine, state } = setup("quetzal-prophecy");
  createOwnedCardInstance(state, "q", { instanceId: "sunstone", definitionId: SUNSTONE, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "q", { instanceId: "h1", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "q", { instanceId: "h2", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "q", { instanceId: "d1", definitionId: "card.carda3", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "q", { instanceId: "d2", definitionId: "card.cardb4", zone: "deck", face: "down", active: false });

  let result = engine.execute(state, command(state, "sunstone-prophecy", CommandType.UseSkill, "q", {
    skillId: SUNSTONE,
    data: { abilityId: "sunstone-prophecy" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "quetzal-sunstone-draw-count");
  result = engine.execute(result.state, command(result.state, "sunstone-draw-two", CommandType.ResolveDecision, "q", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["draw-2"],
  }));
  assert.equal(result.state.pendingDecision?.kind, "quetzal-sunstone-bottom-cards");
  result = engine.execute(result.state, command(result.state, "sunstone-bottom", CommandType.ResolveDecision, "q", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["h2", "d1"],
  }));
  assert.equal(result.state.pendingDecision, null);
  assert.deepEqual(result.state.players.q.deck.slice(-2), ["h2", "d1"]);
  assert.ok(!result.state.players.q.hand.includes("h2"));
  assert.ok(!result.state.players.q.hand.includes("d1"));
});

test("Sunstone may close in Outpost and grants 4 VP if Quetzalcoatl wins that round", () => {
  const { built, definitions, engine, state } = setup("quetzal-sunstone-reward");
  createOwnedCardInstance(state, "q", { instanceId: "sunstone", definitionId: SUNSTONE, zone: "attack", face: "up", active: true, residual: true });
  state.phase = "outpost";
  let result = engine.execute(state, command(state, "sunstone-arm", CommandType.UseSkill, "q", {
    skillId: SUNSTONE,
    data: { abilityId: "sunstone-outpost" },
  }));
  assert.equal(result.state.cards.sunstone.zone, "servant-skills");
  assert.equal(result.state.players.q.flags.quetzalSunstoneRewardRound, 4);
  useQuetzalSunstone({
    state: result.state,
    player: result.state.players.q,
    skill: built.skills.get(SUNSTONE),
    payload: { eventType: "combat.resolved", event: { winnerIds: ["q"], powers: { q: 10, o: 5 }, locationId: "mountain" } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(result.state.players.q.victoryPoints, 4);
  assert.equal(result.state.players.q.flags.quetzalSunstoneRewardRound, undefined);
});
