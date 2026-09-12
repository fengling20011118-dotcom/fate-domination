import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardBasePower } from "../src/rules-core/combat-power.ts";
import {
  XIANGYU_MATRIX_ID,
  XIANGYU_MARTIAL_ID,
  XIANGYU_MIGHT_ID,
  getXiangyuReflex,
  useXiangyuUltimateDefenseMatrix,
  useXiangyuMartialForce,
  useXiangyuConqueringMight,
} from "../src/rules-core/xiangyu.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "xiangyu") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "x", name: "Xiang Yu" }, { id: "o", name: "Opponent" }], seed: 2610 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "x";
  state.turnOrder = ["x", "o"];
  state.players.x.servantId = "servant.xiangyu";
  state.players.x.locationId = "city";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["o"];
  state.board.locations.city = ["x"];
  state.board.locations.scouting = [];
  state.players.x.mana = 30;
  state.players.o.mana = 30;
  state.players.x.commandSeals = 3;
  state.players.o.commandSeals = 3;
  return { built, definitions, engine, state };
}

function addSkill(state, instanceId, definitionId, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "x", { instanceId, definitionId, zone, face: "up", active });
}

const noDecision = () => { throw new Error("UNEXPECTED_DECISION"); };

test("项羽整包 3/3 FULL 且 handler 已注册", () => {
  const { built } = setup("xiangyu-full");
  for (const id of [XIANGYU_MATRIX_ID, XIANGYU_MARTIAL_ID, XIANGYU_MIGHT_ID]) {
    assert.equal(built.skills.get(id).supportLevel, "FULL");
    assert.equal(built.skills.hasHandler(id), true);
  }
});

test("战术躯体只统计对手自己行动回合的技能、令咒使用和移动入场，令咒支付/他人回合强制移动不计", () => {
  const { definitions, state } = setup("xiangyu-matrix");
  addSkill(state, "matrix", XIANGYU_MATRIX_ID);
  useXiangyuUltimateDefenseMatrix({ state, player: state.players.x, skill: definitions[XIANGYU_MATRIX_ID], payload: { abilityId: "arm-matrix" }, definitions, openDecision: noDecision, randomInt: () => 0 });

  state.activePlayerId = "o";
  useXiangyuUltimateDefenseMatrix({ state, player: state.players.x, skill: definitions[XIANGYU_MATRIX_ID], payload: { eventType: "card.played", event: { playerId: "o", definitionId: "servant.kiyohime.skill.sc-kiyohime-3" } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(getXiangyuReflex(state.players.x), 1);

  state.players.o.flags.commandSealUsesRound = state.round;
  state.players.o.flags.commandSealUsesThisRound = 1;
  useXiangyuUltimateDefenseMatrix({ state, player: state.players.x, skill: definitions[XIANGYU_MATRIX_ID], payload: { eventType: "skill.used", event: { playerId: "o", skillId: "test-seal-user" } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(getXiangyuReflex(state.players.x), 2);

  state.players.o.locationId = "city";
  state.board.locations.mountain = [];
  state.board.locations.city = ["x", "o"];
  useXiangyuUltimateDefenseMatrix({ state, player: state.players.x, skill: definitions[XIANGYU_MATRIX_ID], payload: { eventType: "player.entered-location", event: { playerId: "o", previousLocationId: "mountain", locationId: "city", method: "move" } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(getXiangyuReflex(state.players.x), 3);
  useXiangyuUltimateDefenseMatrix({ state, player: state.players.x, skill: definitions[XIANGYU_MATRIX_ID], payload: { eventType: "player.entered-location", event: { playerId: "o", previousLocationId: "mountain", locationId: "city", method: "effect" } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(getXiangyuReflex(state.players.x), 3);

  state.activePlayerId = "x";
  useXiangyuUltimateDefenseMatrix({ state, player: state.players.x, skill: definitions[XIANGYU_MATRIX_ID], payload: { eventType: "card.played", event: { playerId: "o", definitionId: "servant.kiyohime.skill.sc-kiyohime-3" } }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(getXiangyuReflex(state.players.x), 3);
});

test("战术躯体战斗结束失去一半反应并向上取整", () => {
  const { definitions, state } = setup("xiangyu-decay");
  addSkill(state, "matrix", XIANGYU_MATRIX_ID);
  state.players.x.flags.reflexCount = 5;
  state.phase = "combat";
  state.activePlayerId = "x";
  const result = useXiangyuUltimateDefenseMatrix({ state, player: state.players.x, skill: definitions[XIANGYU_MATRIX_ID], payload: { eventType: "combat.ending", event: {} }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.deepEqual(result, { lostReflex: 3, remainingReflex: 2 });
  assert.equal(getXiangyuReflex(state.players.x), 2);
});

test("霸王之武同一效果可重复购买：逆箭头每次1反应并真实移动一格", () => {
  const { engine, state } = setup("xiangyu-repeat");
  addSkill(state, "martial", XIANGYU_MARTIAL_ID);
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "x";
  state.players.x.flags.reflexCount = 3;

  let result = engine.execute(state, command(state, "back-1", CommandType.UseSkill, "x", { skillId: XIANGYU_MARTIAL_ID, data: { abilityId: "backward-one" } }));
  assert.equal(result.state.players.x.locationId, "mountain");
  assert.equal(getXiangyuReflex(result.state.players.x), 2);
  result = engine.execute(result.state, command(result.state, "back-2", CommandType.UseSkill, "x", { skillId: XIANGYU_MARTIAL_ID, data: { abilityId: "backward-one" } }));
  assert.equal(result.state.players.x.locationId, "workshop");
  assert.equal(getXiangyuReflex(result.state.players.x), 1);
});

test("霸王之武4反应打牌库顶支付当前费用，7反应打手牌免费", () => {
  const { definitions, state } = setup("xiangyu-play");
  addSkill(state, "martial", XIANGYU_MARTIAL_ID);
  createOwnedCardInstance(state, "x", { instanceId: "top", definitionId: "card.cardb4", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "x", { instanceId: "hand", definitionId: "card.cardq6", zone: "hand", face: "down", active: false });
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "x";
  state.players.x.flags.reflexCount = 11;
  const manaBeforeTop = state.players.x.mana;
  const topResult = useXiangyuMartialForce({ state, player: state.players.x, skill: definitions[XIANGYU_MARTIAL_ID], payload: { abilityId: "play-top" }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(topResult.card.instanceId, "top");
  assert.equal(state.cards.top.zone, "attack");
  assert.equal(state.players.x.mana, manaBeforeTop - 1);
  assert.equal(getXiangyuReflex(state.players.x), 7);
  const manaBeforeFree = state.players.x.mana;
  const freeResult = useXiangyuMartialForce({ state, player: state.players.x, skill: definitions[XIANGYU_MARTIAL_ID], payload: { abilityId: "play-hand-free" }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(freeResult.card.instanceId, "hand");
  assert.equal(state.cards.hand.zone, "attack");
  assert.equal(state.players.x.mana, manaBeforeFree);
  assert.equal(getXiangyuReflex(state.players.x), 0);
});

test("力拔山兮气盖世行动能力支付1魔力得2反应；移动至少3格后只将自身基础威力翻倍，关闭后立即失效", () => {
  const { engine, definitions, state } = setup("xiangyu-might");
  addSkill(state, "might", XIANGYU_MIGHT_ID);
  const manaBefore = state.players.x.mana;
  let result = engine.execute(state, command(state, "gain-reflex", CommandType.UseSkill, "x", { skillId: XIANGYU_MIGHT_ID, data: { abilityId: "gain-reflex" } }));
  assert.equal(result.state.players.x.mana, manaBefore - 1);
  assert.equal(getXiangyuReflex(result.state.players.x), 2);

  result.state.phase = "combat";
  result.state.step = "player-window";
  result.state.activePlayerId = "x";
  result.state.players.x.flags.movementDistanceThisRound = 3;
  result.state.cards.might.zone = "attack";
  result.state.cards.might.active = true;
  result.state.cards.might.face = "up";
  result.state.players.x.servantSkills = result.state.players.x.servantSkills.filter((id) => id !== "might");
  result.state.players.x.attack.push("might");
  const before = calculateCombatCardBasePower(result.state, result.state.players.x, "might", definitions);
  useXiangyuConqueringMight({ state: result.state, player: result.state.players.x, skill: definitions[XIANGYU_MIGHT_ID], payload: { abilityId: "unstoppable-force" }, definitions, openDecision: noDecision, randomInt: () => 0 });
  assert.equal(calculateCombatCardBasePower(result.state, result.state.players.x, "might", definitions), before * 2);
  result.state.cards.might.active = false;
  assert.equal(calculateCombatCardBasePower(result.state, result.state.players.x, "might", definitions), before);
});
