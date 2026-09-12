import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { closePlayerCard, createOwnedCardInstance, lendSkillFromOwnerSkillZoneToPlayer } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  NIGHTINGALE_ANGEL_ID,
  NIGHTINGALE_IRON_NURSE_ID,
  NIGHTINGALE_PLEDGE_ID,
  useNightingaleAngel,
  useNightingaleIronNurse,
  useNightingalePledge,
} from "../src/rules-core/nightingale.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const testBasic = { id: "card.test.nightingale.basic", name: "Test Basic", cardType: "attack", cost: 2, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [testBasic.id]: testBasic };

function state(id, includeThird = false) {
  const players = [{ id: "n", name: "Nightingale" }, { id: "o", name: "Opponent" }];
  if (includeThird) players.push({ id: "x", name: "Third" });
  const s = createGameState({ gameInstanceId: id, players, seed: 919 });
  s.status = "playing";
  s.round = 4;
  s.phase = "action";
  s.step = "play-batch-draft";
  s.activePlayerId = "n";
  s.turnOrder = includeThird ? ["n", "o", "x"] : ["n", "o"];
  s.players.n.servantId = "servant.nightingale";
  s.players.n.mana = 10;
  s.players.n.locationId = "mountain";
  s.players.o.mana = 10;
  s.players.o.locationId = "mountain";
  if (includeThird) {
    s.players.x.mana = 10;
    s.players.x.locationId = "city";
    s.board.locations.city = ["x"];
  } else s.board.locations.city = [];
  s.board.locations.mountain = ["n", "o"];
  s.board.locations.workshop = [];
  return s;
}

function add(s, playerId, instanceId, definitionId, zone = "servant-skills", face = "up", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(s, skillId, payload, openDecision = () => {}) {
  return { state: s, player: s.players.n, skill: built.skills.get(skillId), payload, definitions, openDecision };
}

test("南丁格尔技能包3/3 FULL并注册专用handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.nightingale");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.deepEqual(built.skills.get(NIGHTINGALE_PLEDGE_ID).alternateManaPayer, {
    requireSameBattlefield: true,
    requiredControlledDefinitionId: NIGHTINGALE_ANGEL_ID,
  });
});

test("Nightingale Pledge只把自身费用交给同战场Angel控制者，其他牌仍由南丁格尔支付", () => {
  const s = state("nightingale-alt-payer");
  add(s, "n", "angel", NIGHTINGALE_ANGEL_ID);
  lendSkillFromOwnerSkillZoneToPlayer(s, "n", "o", "angel", definitions);
  add(s, "n", "pledge", NIGHTINGALE_PLEDGE_ID);
  add(s, "n", "basic", testBasic.id, "hand", "down", false);

  const result = commitStandardAttack(s, "n", ["pledge", "basic"], [], definitions, {
    cardDataByInstanceId: { pledge: { manaPayerPlayerId: "o" } },
  });
  assert.equal(result.paidMana, 6);
  assert.equal(s.players.n.mana, 8);
  assert.equal(s.players.o.mana, 6);
  assert.equal(s.cards.pledge.paidCost, 4);
  assert.equal(s.cards.pledge.playManaPayerPlayerId, "o");
  assert.equal(s.cards.basic.playManaPayerPlayerId, "n");
  assert.equal(s.players.n.flags.roundManaSpent, 2);
  assert.equal(s.players.o.flags.roundManaSpent, 4);
});

test("Nightingale Pledge自己支付时接管任意战场激活的Angel", () => {
  const s = state("nightingale-self-pay");
  add(s, "n", "angel", NIGHTINGALE_ANGEL_ID);
  lendSkillFromOwnerSkillZoneToPlayer(s, "n", "o", "angel", definitions);
  add(s, "n", "pledge", NIGHTINGALE_PLEDGE_ID, "attack", "up", true);
  s.cards.pledge.playManaPayerPlayerId = "n";

  const result = useNightingalePledge(ctx(s, NIGHTINGALE_PLEDGE_ID, {
    eventType: "card.played",
    event: { playerId: "n", instanceId: "pledge", definitionId: NIGHTINGALE_PLEDGE_ID, face: "up" },
  }));
  assert.equal(result.instanceId, "angel");
  assert.equal(result.previousControllerPlayerId, "o");
  assert.equal(s.cards.angel.ownerPlayerId, "n");
  assert.equal(s.cards.angel.controllerPlayerId, "n");
  assert.ok(s.players.n.attack.includes("angel"));
  assert.ok(!s.players.o.attack.includes("angel"));
});

test("Angel of Crimea只能由Prep能力借出，不能作为普通攻击直接入场，并在关闭后回原技能区", () => {
  const s = state("nightingale-angel-prep", true);
  s.phase = "preparation";
  s.step = "player-window";
  s.players.n.flags.nightingaleAngelLastTargetPlayerId = "x";
  s.players.n.flags.nightingaleAngelLastTargetRound = s.round - 1;
  add(s, "n", "angel", NIGHTINGALE_ANGEL_ID);

  const result = useNightingaleAngel(ctx(s, NIGHTINGALE_ANGEL_ID, { abilityId: "angel-prep" }));
  assert.equal(result.targetPlayerId, "o");
  assert.equal(s.cards.angel.controllerPlayerId, "o");
  assert.ok(s.players.o.attack.includes("angel"));
  closePlayerCard(s, "o", "angel", definitions);
  assert.equal(s.cards.angel.controllerPlayerId, "n");
  assert.equal(s.cards.angel.zone, "servant-skills");
  assert.ok(s.players.n.servantSkills.includes("angel"));

  const blocked = state("nightingale-angel-normal-play");
  add(blocked, "n", "angel", NIGHTINGALE_ANGEL_ID);
  add(blocked, "n", "basic", testBasic.id, "hand", "down", false);
  assert.throws(() => commitStandardAttack(blocked, "n", ["angel", "basic"], [], definitions), /CARD_REQUIRES_ACTIVE_SKILL_ZONE_SOURCE/);
});

test("Angel部署工房奖励控制者与南丁格尔；Iron Nurse免费狂战士并在战败且有人更低时+3战果", () => {
  const s = state("nightingale-passives", true);
  add(s, "n", "angel", NIGHTINGALE_ANGEL_ID);
  lendSkillFromOwnerSkillZoneToPlayer(s, "n", "o", "angel", definitions);
  s.players.o.locationId = "workshop";
  s.board.locations.mountain = ["n"];
  s.board.locations.workshop = ["o"];
  const manaBefore = s.players.o.mana;
  const vpBefore = s.players.n.victoryPoints;
  useNightingaleAngel(ctx(s, NIGHTINGALE_ANGEL_ID, {
    eventType: "player.deployed", event: { playerId: "o", locationId: "workshop" },
  }));
  assert.equal(s.players.o.mana, manaBefore + 1);
  assert.equal(s.players.n.victoryPoints, vpBefore + 2);
  assert.equal(s.players.o.flags.movementBlockedBySourceInstanceId, "angel");

  useNightingaleIronNurse(ctx(s, NIGHTINGALE_IRON_NURSE_ID, { eventType: "game.started", event: {} }));
  add(s, "n", "berserker", "card.cardb5", "hand", "down", false);
  assert.equal(getCardPlayCost(s, definitions["card.cardb5"], s.players.n, s.cards.berserker, definitions), 0);
  s.players.o.locationId = "mountain";
  assert.ok(getCardPlayCost(s, definitions["card.cardb5"], s.players.n, s.cards.berserker, definitions) > 0);

  const beforeCombatVp = s.players.n.victoryPoints;
  useNightingaleIronNurse(ctx(s, NIGHTINGALE_IRON_NURSE_ID, {
    eventType: "combat.resolved",
    event: { powers: { n: 6, o: 3, x: 9 }, winnerIds: ["x"] },
  }));
  assert.equal(s.players.n.victoryPoints, beforeCombatVp + 3);
});
