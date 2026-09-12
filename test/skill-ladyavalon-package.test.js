import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { finalizeCombatFromSnapshot } from "../src/rules-core/combat.ts";

const IDEAL = "servant.ladyavalon.skill.sc-ladyavalon-1";
const PRETENDER = "servant.ladyavalon.skill.sc-ladyavalon-2";

function setup(id = "lady-avalon") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "l", name: "Lady Avalon" }, { id: "o", name: "Opponent" }, { id: "a", name: "Ally" }],
    seed: 9301,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "l";
  state.turnOrder = ["l", "o", "a"];
  state.players.l.servantId = "servant.ladyavalon";
  return { built, definitions, state };
}

function command(state, id, type, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId: "l", expectedRevision: state.revision, type, payload };
}

test("Lady Avalon package: all three skills are FULL", () => {
  const { built } = setup("lady-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.ladyavalon");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  const ideal = built.skills.get(IDEAL);
  assert.equal(ideal.handlerId, "core.lady-avalon-ideal-land");
  assert.deepEqual(ideal.passiveEventTypes, ["game.started"]);
  assert.deepEqual(ideal.abilities?.map((ability) => ability.id), ["ideal-land-close"]);
  assert.deepEqual(ideal.rules?.ambiguities ?? [], []);
  assert.deepEqual(ideal.rules?.unmodeledClauses ?? [], []);
});

test("Ideal Land permanent climax event-reward block belongs to Lady Avalon identity and is not copied with the card", () => {
  const { built, definitions, state } = setup("lady-passive");
  state.players.o.servantId = "servant.saber";
  createOwnedCardInstance(state, "o", { instanceId: "copied-ideal", definitionId: IDEAL, zone: "servant-skills", face: "up", active: false });
  registerCoreSkillHandlers(built.skills);
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  enqueuePassiveEffects(state, passives, {
    eventId: "evt:game-started",
    sourceCommandId: "test",
    revision: state.revision,
    type: "game.started",
    payload: { round: state.round },
  });
  effects.drain(state, 1000, definitions);
  assert.equal(state.players.l.flags.climaxEventVictoryPointGainBlocked, true);
  assert.equal(state.players.o.flags.climaxEventVictoryPointGainBlocked, undefined);
});

test("During climax Lady Avalon receives only location reward while another tied winner still receives event reward", () => {
  const { state, definitions } = setup("lady-climax-reward");
  state.modeState.currentSituationClimax = true;
  state.players.l.flags.climaxEventVictoryPointGainBlocked = true;
  for (const id of ["l", "a", "o"]) state.players[id].locationId = "city";
  state.board.locations.city = ["l", "a", "o"];
  state.board.currentEvents.city = ["event-test"];
  const result = finalizeCombatFromSnapshot(state, {
    locationId: "city",
    participantIds: ["l", "a", "o"],
    powers: { l: 10, a: 10, o: 1 },
    attributes: { l: [], a: [], o: [] },
    round: state.round,
  }, definitions, { "event-test": { id: "event-test", victoryPoints: 4 } });
  assert.deepEqual(result.winnerIds, ["l", "a"]);
  assert.equal(result.victoryPoints.l, 2); // ceil(city 3 / 2), no event-card points
  assert.equal(result.victoryPoints.a, 4); // ceil((event 4 + city 3) / 2)
});

test("Ideal Land closes every other active attack whose printed cost equals Pretender's locked printed power", () => {
  const { built, state } = setup("lady-close");
  const extra = {
    "test.lady.cost4-a": { id: "test.lady.cost4-a", name: "A", cost: 4, basePower: 2, typeLabel: "力量", basic: true },
    "test.lady.cost4-b": { id: "test.lady.cost4-b", name: "B", cost: 4, basePower: 3, typeLabel: "迅捷", basic: true },
    "test.lady.cost3": { id: "test.lady.cost3", name: "C", cost: 3, basePower: 1, typeLabel: "魔术", basic: true },
  };
  const engine = new StandardMatchEngine({ ...built, cards: { ...built.cards, ...extra } });
  for (const id of ["l", "o"]) state.players[id].locationId = "city";
  state.board.locations.city = ["l", "o"];
  state.players.l.flags[`pretenderClassX:${PRETENDER}`] = 4;
  createOwnedCardInstance(state, "l", { instanceId: "own4", definitionId: "test.lady.cost4-a", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "opp4", definitionId: "test.lady.cost4-b", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "opp3", definitionId: "test.lady.cost3", zone: "attack", face: "up", active: true });
  const result = engine.execute(state, command(state, "ideal-close", CommandType.UseSkill, {
    skillId: IDEAL,
    data: { abilityId: "ideal-land-close" },
  }));
  assert.equal(result.state.cards.own4.active, false);
  assert.equal(result.state.cards.opp4.active, false);
  assert.equal(result.state.cards.opp3.active, true);
  assert.equal(result.state.players.l.trueNameRevealed, true);
});
