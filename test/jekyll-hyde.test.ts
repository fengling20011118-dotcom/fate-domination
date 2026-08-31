import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { applyJekyllHydeRoundStart, ignoresDefeat, isHyde, isJekyll } from "../src/rules-core/jekyll-hyde.ts";
import { movePlayer } from "../src/rules-core/board.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatPower, } from "../src/rules-core/combat-power.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";

const baseCards = {
  "servant.jekyll.skill.sc-jekyll-2": { id: "servant.jekyll.skill.sc-jekyll-2", name: "兽化症", cost: 5, basePower: 5, typeLabel: "宝具", attributes: ["宝具"], isSkill: true, skillOwnerType: "servant" as const },
  "card.normal": { id: "card.normal", name: "普通攻击", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"] },
  "card.low": { id: "card.low", name: "低位攻击", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"] },
};

test("杰基尔形态在回合开始按奇偶回合自动切换，非杰基尔玩家不受影响", () => {
  const state = createGameState({ gameInstanceId: "jekyll-forms", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  state.players.p1.servantId = "servant.jekyll";
  state.round = 1;
  applyJekyllHydeRoundStart(state);
  assert.equal(state.players.p1.form, "hyde");
  assert.equal(isHyde(state.players.p1), true);
  assert.equal(ignoresDefeat(state.players.p1), true);
  state.round = 2;
  applyJekyllHydeRoundStart(state);
  assert.equal(state.players.p1.form, "jekyll");
  assert.equal(isJekyll(state.players.p1), true);
  assert.equal(state.players.p2.form, null);
});

test("杰基尔形态移动时每段费用减少1点魔力", () => {
  const state = createGameState({ gameInstanceId: "jekyll-move", players: [{ id: "p1", name: "一" }], seed: 2 });
  state.status = "playing"; state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.jekyll"; state.players.p1.form = "jekyll"; state.players.p1.mana = 2;
  state.players.p1.locationId = "workshop"; state.board.locations.workshop = ["p1"];
  const cost = movePlayer(state, "p1", "city");
  assert.equal(cost, 2);
  assert.equal(state.players.p1.mana, 0);
  assert.equal(state.players.p1.locationId, "city");
});

test("杰基尔宝具可免费打出并记录下回合威力归零，兽化症为非基础攻击提供3点威力", () => {
  const state = createGameState({ gameInstanceId: "jekyll-beast", players: [{ id: "p1", name: "一" }], seed: 3 });
  state.status = "playing"; state.round = 1; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.jekyll"; state.players.p1.form = "hyde"; state.players.p1.mana = 0;
  state.cards.beast = { instanceId: "beast", definitionId: "servant.jekyll.skill.sc-jekyll-2", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "servant-skills", face: "up", active: false, residual: false, temporary: false, modifiers: [] };
  state.cards.normal = { instanceId: "normal", definitionId: "card.normal", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "hand", face: "down", active: false, residual: false, temporary: false, modifiers: [] };
  state.players.p1.servantSkills = ["beast"]; state.players.p1.hand = ["normal"];
  const result = commitStandardAttack(state, "p1", ["beast", "normal"], [], baseCards);
  assert.equal(result.paidMana, 0);
  assert.equal(state.players.p1.flags.jekyllZeroPowerRound, 2);
  assert.equal(calculateCombatPower(state, state.players.p1, baseCards), 13);
  state.round = 2;
  assert.equal(calculateCombatPower(state, state.players.p1, baseCards), 0);
});

test("杰基尔形态赢得战斗时额外获得1点战果", () => {
  const state = createGameState({ gameInstanceId: "jekyll-score", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 4 });
  state.status = "playing"; state.round = 2; state.phase = "combat"; state.step = "settlement";
  state.players.p1.servantId = "servant.jekyll"; state.players.p1.form = "jekyll"; state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "mountain"; state.board.locations.mountain = ["p1", "p2"];
  state.cards.p1 = { instanceId: "p1", definitionId: "card.normal", ownerPlayerId: "p1", controllerPlayerId: "p1", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.cards.p2 = { instanceId: "p2", definitionId: "card.low", ownerPlayerId: "p2", controllerPlayerId: "p2", zone: "attack", face: "up", active: true, residual: false, temporary: false, modifiers: [] };
  state.players.p1.attack = ["p1"]; state.players.p2.attack = ["p2"];
  const result = resolveCombat(state, "mountain", baseCards, {});
  assert.deepEqual(result.winnerIds, ["p1"]);
  assert.equal(state.players.p1.victoryPoints, 3);
});
