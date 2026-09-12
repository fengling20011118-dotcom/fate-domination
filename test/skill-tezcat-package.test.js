import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { calculateCombatCardBasePower } from "../src/rules-core/combat-power.ts";
import { TEZCAT_FIRST_SUN_ID, TEZCAT_GUISE_ID, TEZCAT_TEPEYOLLOTL_ID, useTezcatGuise } from "../src/rules-core/tezcat.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "tezcat") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "t", name: "Tezcat" }, { id: "o", name: "Opponent" }], seed: 2610 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "t";
  state.turnOrder = ["t", "o"];
  state.players.t.servantId = "servant.tezcat";
  state.players.t.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["t", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  state.players.t.mana = 40;
  state.players.o.mana = 40;
  state.players.t.commandSeals = 3;
  state.players.o.commandSeals = 3;
  return { built, definitions, engine, state };
}

function add(state, playerId, instanceId, definitionId, zone = "hand", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face: zone === "attack" ? "up" : "down", active });
}

function resolve(engine, state, id, actorId, selection) {
  return engine.execute(state, command(state, id, CommandType.ResolveDecision, actorId, {
    decisionId: state.pendingDecision.decisionId,
    selections: [selection],
  }));
}

test("特斯卡特利波卡整包 3/3 FULL 且三张规则元数据来自英文原文", () => {
  const { built } = setup("tezcat-full");
  for (const id of [TEZCAT_TEPEYOLLOTL_ID, TEZCAT_GUISE_ID, TEZCAT_FIRST_SUN_ID]) {
    assert.equal(built.skills.get(id).supportLevel, "FULL");
    assert.equal(built.skills.hasHandler(id), true);
  }
  const tepey = built.skills.get(TEZCAT_TEPEYOLLOTL_ID);
  assert.equal(tepey.standardAppend, true);
  assert.equal(tepey.pairedPlayOtherCostIncrease, 2);
  assert.equal(tepey.pairedPlayOtherPowerBonus, 1);
  assert.equal(built.skills.get(TEZCAT_FIRST_SUN_ID).commandSealPlayCost, 1);
});

test("Tepeyollotl 与攻击同批打出时立即令其他攻击 +1 威力/+2当前费用，且费用修正跟随物理牌离开攻击区", () => {
  const { definitions, state } = setup("tezcat-tepey");
  add(state, "t", "a", "card.cardb1");
  add(state, "t", "b", "card.cardq1");
  add(state, "t", "tepey", TEZCAT_TEPEYOLLOTL_ID, "servant-skills");
  const baseA = getCardPlayCost(state, definitions[state.cards.a.definitionId], state.players.t, state.cards.a, definitions);
  const baseB = getCardPlayCost(state, definitions[state.cards.b.definitionId], state.players.t, state.cards.b, definitions);

  commitStandardAttack(state, "t", ["a", "b", "tepey"], [], definitions);
  assert.equal(state.cards.a.paidCost, baseA + 2);
  assert.equal(state.cards.b.paidCost, baseB + 2);
  assert.equal(state.cards.tepey.paidCost, definitions[TEZCAT_TEPEYOLLOTL_ID].cost);
  assert.equal(getCardPlayCost(state, definitions[state.cards.a.definitionId], state.players.t, state.cards.a, definitions), baseA + 2);
  assert.equal(calculateCombatCardBasePower(state, state.players.t, "a", definitions), definitions[state.cards.a.definitionId].basePower);
  assert.equal(state.cards.a.powerModifiers?.filter((modifier) => modifier.duration === "round").reduce((sum, modifier) => sum + modifier.value, 0), 1);

  movePlayerCard(state, "t", "a", "deck");
  assert.equal(getCardPlayCost(state, definitions[state.cards.a.definitionId], state.players.t, state.cards.a, definitions), baseA + 2);
});

test("First Sun Xibalba 打出时支付1枚普通令咒但不计为使用令咒，随后 Black Sun 对所有交战对手施加败北", () => {
  const { engine, state } = setup("tezcat-first-sun");
  add(state, "t", "first", TEZCAT_FIRST_SUN_ID, "servant-skills");
  add(state, "t", "basic", "card.cardb1");
  const sealsBefore = state.players.t.commandSeals;
  let result = engine.execute(state, command(state, "play-first", CommandType.CommitAttack, "t", {
    faceUpInstanceIds: ["first", "basic"], faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.t.commandSeals, sealsBefore - 1);
  assert.equal(result.state.players.t.flags.commandSealSpentRound, result.state.round);
  assert.equal(result.state.players.t.flags.commandSealUsedRound, undefined);
  assert.equal(result.state.players.t.trueNameRevealed, true);

  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "t";
  result = engine.execute(result.state, command(result.state, "black-sun", CommandType.UseSkill, "t", {
    skillId: TEZCAT_FIRST_SUN_ID,
    data: { abilityId: "black-sun" },
  }));
  assert.equal(result.state.players.o.defeated, true);
});

test("First Sun Xibalba 没有可支付令咒时整批出牌原子拒绝", () => {
  const { engine, state } = setup("tezcat-no-seal");
  state.players.t.commandSeals = 0;
  add(state, "t", "first", TEZCAT_FIRST_SUN_ID, "servant-skills");
  add(state, "t", "basic", "card.cardb1");
  const manaBefore = state.players.t.mana;
  assert.throws(() => engine.execute(state, command(state, "play-first-no-seal", CommandType.CommitAttack, "t", {
    faceUpInstanceIds: ["first", "basic"], faceDownInstanceIds: [],
  })), /COMMAND_SEAL_NOT_AVAILABLE/);
  assert.equal(state.players.t.mana, manaBefore);
  assert.equal(state.cards.first.zone, "servant-skills");
});

test("Guise of the Warrior 按回合顺位逐人可真实付费打出攻击；实际打出者若输掉该战斗失2VP，Tezcat因对手受罚只得2VP一次", () => {
  const { engine, definitions, state } = setup("tezcat-guise");
  add(state, "t", "guise", TEZCAT_GUISE_ID, "attack", true);
  add(state, "t", "ta", "card.cardb1");
  add(state, "o", "oa", "card.cardq1");
  state.players.t.victoryPoints = 1;
  state.players.o.victoryPoints = 5;
  const opponentManaBefore = state.players.o.mana;
  const opponentCost = getCardPlayCost(state, definitions[state.cards.oa.definitionId], state.players.o, state.cards.oa, definitions);

  let result = engine.execute(state, command(state, "guise-use", CommandType.UseSkill, "t", {
    skillId: TEZCAT_GUISE_ID,
    data: { abilityId: "inciting-struggle" },
  }));
  assert.equal(result.state.pendingDecision?.chooserPlayerIds[0], "t");
  result = resolve(engine, result.state, "guise-t-skip", "t", "skip");
  assert.equal(result.state.pendingDecision?.chooserPlayerIds[0], "o");
  result = resolve(engine, result.state, "guise-o-play", "o", "oa");
  assert.equal(result.state.cards.oa.zone, "attack");
  assert.equal(result.state.players.o.mana, opponentManaBefore - opponentCost);
  assert.equal(result.state.pendingDecision, null);

  useTezcatGuise({
    state: result.state,
    player: result.state.players.t,
    skill: definitions[TEZCAT_GUISE_ID],
    payload: { eventType: "combat.ending", event: { previousLocations: { t: "mountain", o: "mountain" }, combatWinnerIdsByLocation: { mountain: ["t"], city: [] } } },
    definitions,
    openDecision: () => { throw new Error("UNEXPECTED_DECISION"); },
    randomInt: () => 0,
  });
  assert.equal(result.state.players.o.victoryPoints, 3);
  assert.equal(result.state.players.t.victoryPoints, 3);
});
