import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { applyCombatLossRoundRestart } from "../src/rules-core/combat-loss-restart.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { NURSERY_ENGINE_ABILITY, NURSERY_HANDLER, NURSERY_JABBERWOCK_ID, NURSERY_QUEEN_ID, useNurseryPackage } from "../src/rules-core/nursery.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function state(id) {
  const s = createGameState({ gameInstanceId: id, players: [{ id: "n", name: "Nursery" }, { id: "o", name: "Opponent" }], seed: 23 });
  s.status = "playing";
  s.round = 5;
  s.turnOrder = ["n", "o"];
  s.players.n.servantId = "servant.nursery";
  s.players.n.mana = 20;
  s.players.o.mana = 20;
  s.players.n.locationId = "mountain";
  s.players.o.locationId = "mountain";
  s.board.locations.mountain = ["n", "o"];
  return s;
}

function add(s, playerId, instanceId, definitionId, zone = "hand", face = "down", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}

function context(s, skillId, payload) {
  return { state: s, player: s.players.n, skill: built.skills.get(skillId), payload, definitions, openDecision() {}, emitEvent() {} };
}

test("童谣剩余两张技能整包进入FULL并使用专用handler", () => {
  for (const id of [NURSERY_QUEEN_ID, NURSERY_JABBERWOCK_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, NURSERY_HANDLER);
    assert.ok(built.skills.hasHandler(id));
    assert.equal(definitions[id].residual, true);
  }
  assert.deepEqual(definitions[NURSERY_JABBERWOCK_ID].playPrerequisite?.shuffleIntoOpponentDeck, { count: 1, basic: true, requireSameLocation: true });
});

test("Queen's Glass Game永动炉心获得1魔力1战果", () => {
  const s = state("nursery-engine");
  s.phase = "outpost";
  s.step = "player-window";
  s.activePlayerId = "n";
  s.players.n.mana = 5;
  add(s, "n", "queen", NURSERY_QUEEN_ID, "attack", "up", true);
  s.cards.queen.residual = true;
  const beforeVp = s.players.n.victoryPoints;
  const result = useNurseryPackage(context(s, NURSERY_QUEEN_ID, { abilityId: NURSERY_ENGINE_ABILITY }));
  assert.deepEqual(result, { manaGained: 1, victoryPointsGained: 1 });
  assert.equal(s.players.n.mana, 6);
  assert.equal(s.players.n.victoryPoints, beforeVp + 1);
});

test("Queen's Glass Game败北替代保留既有状态并从同回合Preparation重开", () => {
  const s = state("nursery-restart");
  s.phase = "combat";
  s.step = "settlement";
  s.activePlayerId = null;
  add(s, "n", "queen", NURSERY_QUEEN_ID, "attack", "up", true);
  s.cards.queen.residual = true;
  add(s, "n", "own-basic", "card.cardb1", "attack", "up", true);
  add(s, "o", "opp-basic", "card.carda4", "attack", "up", true);
  s.players.n.flags.ignoreDefeatRound = s.round;
  useNurseryPackage(context(s, NURSERY_QUEEN_ID, { eventType: "card.played", event: { playerId: "n", instanceId: "queen", definitionId: NURSERY_QUEEN_ID } }));
  const restarted = applyCombatLossRoundRestart(s, {
    round: s.round, locationId: "mountain", participantIds: ["n", "o"], powers: { n: 4, o: 8 }, attributes: { n: [], o: [] },
  }, definitions);
  assert.ok(restarted);
  assert.equal(s.round, 5);
  assert.equal(s.phase, "preparation");
  assert.equal(s.step, "player-window");
  assert.equal(s.activePlayerId, "n");
  assert.equal(s.players.n.locationId, null);
  assert.equal(s.players.o.locationId, null);
  assert.equal(s.players.n.flags.ignoreDefeatRound, 5);
  assert.ok(s.players.n.servantSkills.includes("queen"));
  assert.equal(s.cards["own-basic"].zone, "attack");
  assert.equal(s.cards["own-basic"].face, "down");
  assert.equal(s.cards["opp-basic"].face, "down");
});

test("Queen's Glass Game不会关闭受对手能力免疫保护玩家已打出的攻击", () => {
  const s = state("nursery-restart-immunity");
  s.phase = "combat";
  s.step = "settlement";
  s.activePlayerId = null;
  add(s, "n", "queen", NURSERY_QUEEN_ID, "attack", "up", true);
  s.cards.queen.residual = true;
  add(s, "o", "protected-basic", "card.carda4", "attack", "up", true);
  s.activeRuleModifiers.push({
    id: "oath-immunity",
    sourceId: "servant.bedivere.skill.sc-bedivere-2",
    controllerPlayerId: "o",
    operation: "ignore",
    rule: "other_player_ability_effect",
    scope: { subject: "controller", sourcePlayers: "all_opponents" },
    duration: "round",
    createdRound: s.round,
  });
  useNurseryPackage(context(s, NURSERY_QUEEN_ID, { eventType: "card.played", event: { playerId: "n", instanceId: "queen", definitionId: NURSERY_QUEEN_ID } }));
  const restarted = applyCombatLossRoundRestart(s, {
    round: s.round, locationId: "mountain", participantIds: ["n", "o"], powers: { n: 4, o: 8 }, attributes: { n: [], o: [] },
  }, definitions);
  assert.ok(restarted);
  assert.equal(s.cards["protected-basic"].zone, "attack");
  assert.equal(s.cards["protected-basic"].face, "up");
  assert.equal(s.cards["protected-basic"].active, true);
  assert.ok(s.players.n.servantSkills.includes("queen"));
});

test("Jabberwock打出前把基础攻击洗入同地对手牌库并记住展示牌", () => {
  const s = state("nursery-jabberwock-play");
  s.phase = "action";
  s.step = "play-batch-draft";
  s.activePlayerId = "n";
  add(s, "n", "jab", NURSERY_JABBERWOCK_ID);
  add(s, "n", "pair", "card.carda1");
  add(s, "n", "slain", "card.cardb1");
  commitStandardAttack(s, "n", ["jab", "pair"], [], definitions, {
    cardDataByInstanceId: { jab: { playPrerequisiteShuffleInstanceIds: ["slain"], playPrerequisiteTargetPlayerId: "o" } },
  });
  assert.ok(s.players.o.deck.includes("slain"));
  assert.equal(s.cards.slain.ownerPlayerId, "o");
  assert.equal(s.cards.slain.zone, "deck");
  assert.deepEqual(s.cards.jab.playPrerequisiteTransferredDefinitionIds, ["card.cardb1"]);
  assert.equal(s.cards.jab.residual, true);
});

test("Jabberwock在交战对手控制展示牌同名攻击时于战斗结算后关闭", () => {
  const s = state("nursery-jabberwock-close");
  s.phase = "combat";
  s.step = "settlement";
  add(s, "n", "jab", NURSERY_JABBERWOCK_ID, "attack", "up", true);
  s.cards.jab.residual = true;
  s.cards.jab.playPrerequisiteTransferredDefinitionIds = ["card.cardb1"];
  add(s, "o", "copy", "card.cardb1", "attack", "up", true);
  const result = useNurseryPackage(context(s, NURSERY_JABBERWOCK_ID, {
    eventType: "combat.resolved", event: { locationId: "mountain", participantIds: ["n", "o"], winnerIds: ["n"] },
  }));
  assert.equal(result.closed, true);
  assert.deepEqual(result.matchingOpponentIds, ["o"]);
  assert.ok(s.players.n.servantSkills.includes("jab"));
  assert.equal(s.cards.jab.active, false);
});
