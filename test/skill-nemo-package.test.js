import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower, calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  NEMO_BLESSING_ID,
  NEMO_SPLIT_ID,
  NEMO_NAUTILUS_ID,
  useNemoSeaGodBlessing,
  useNemoSplitThinking,
  useNemoNautilus,
} from "../src/rules-core/nemo.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);

const strength = { id: "card.test.nemo.strength", name: "Strength A", cardType: "attack", cost: 1, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
const strength2 = { id: "card.test.nemo.strength2", name: "Strength B", cardType: "attack", cost: 1, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const agility = { id: "card.test.nemo.agility", name: "Agility A", cardType: "attack", cost: 2, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const mountainEvent = { id: "event.test.nemo.mountain", name: "Mountain Test", combatPower: { cardAddByAttribute: { 力量: 2 } } };
const cityEvent = { id: "event.test.nemo.city", name: "City Test", combatPower: { cardAddByAttribute: { 力量: 3 } } };
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  [strength.id]: strength,
  [strength2.id]: strength2,
  [agility.id]: agility,
  [mountainEvent.id]: mountainEvent,
  [cityEvent.id]: cityEvent,
};

function state(id) {
  const result = createGameState({ gameInstanceId: id, players: [{ id: "n", name: "Nemo" }, { id: "o", name: "Opponent" }], seed: 311 });
  result.status = "playing";
  result.round = 4;
  result.phase = "action";
  result.step = "player-window";
  result.activePlayerId = "n";
  result.players.n.servantId = "servant.nemo";
  result.players.n.mana = 20;
  result.players.n.locationId = "mountain";
  result.players.o.locationId = "city";
  result.board.locations.mountain = ["n"];
  result.board.locations.city = ["o"];
  return result;
}

function add(s, id, definitionId, zone = "servant-skills", face = "up", active = false) {
  createOwnedCardInstance(s, "n", { instanceId: id, definitionId, zone, face, active });
}

function ctx(s, skillId, payload, emitEvent = () => {}, openDecision = () => {}) {
  return { state: s, player: s.players.n, skill: built.skills.get(skillId), payload, definitions, emitEvent, openDecision };
}

test("尼莫技能包3/3 FULL并注册专用handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.nemo");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.ok(built.skills.get(NEMO_BLESSING_ID).tags.includes("event-power-from-visited-locations"));
});

test("海神的加护读取本回合经过战场的事件威力并可在两战场间疏通航道", () => {
  const s = state("nemo-blessing");
  add(s, "blessing", NEMO_BLESSING_ID);
  add(s, "attack", strength.id, "attack", "up", true);
  s.players.n.locationsPassedThisRound = ["mountain", "city"];
  s.board.currentEvents.mountain = [mountainEvent.id];
  s.board.currentEvents.city = [cityEvent.id];
  assert.equal(calculateCombatCardPower(s, s.players.n, "attack", definitions, "city"), 8);
  const events = [];
  const movement = useNemoSeaGodBlessing(ctx(s, NEMO_BLESSING_ID, { abilityId: "open-channel" }, (type, payload) => events.push({ type, payload })));
  assert.equal(movement.locationId, "city");
  assert.equal(s.players.n.locationId, "city");
  assert.deepEqual(events.map((entry) => entry.type), ["player.moved", "player.entered-location"]);
});

test("分割思考按2X-1付费、记录放置回合，并禁止不同卡名但同属性的基础牌同时封存", () => {
  const s = state("nemo-split-store");
  add(s, "split", NEMO_SPLIT_ID);
  add(s, "str1", strength.id, "hand", "down", false);
  add(s, "str2", strength2.id, "hand", "down", false);
  add(s, "agi", agility.id, "hand", "down", false);
  assert.throws(() => useNemoSplitThinking(ctx(s, NEMO_SPLIT_ID, { abilityId: "split-store", instanceIds: ["str1", "str2"] })), /NEMO_SPLIT_DUPLICATE_NAME/);
  const before = s.players.n.mana;
  const result = useNemoSplitThinking(ctx(s, NEMO_SPLIT_ID, { abilityId: "split-store", instanceIds: ["str1", "agi"] }));
  assert.equal(result.paidMana, 3);
  assert.equal(s.players.n.mana, before - 3);
  assert.equal(s.cards.str1.zone, "attached");
  assert.equal(s.cards.agi.zone, "attached");
  assert.equal(s.cards.str1.attachmentPlacedRound, 4);
  assert.equal(s.cards.agi.attachmentPlacedRound, 4);
});

test("齐心协力不能打出本回合新放置的牌，下回合原子支付并打出全部成熟附件", () => {
  const s = state("nemo-split-teamwork");
  add(s, "split", NEMO_SPLIT_ID);
  add(s, "str", strength.id, "hand", "down", false);
  add(s, "agi", agility.id, "hand", "down", false);
  useNemoSplitThinking(ctx(s, NEMO_SPLIT_ID, { abilityId: "split-store", instanceIds: ["str", "agi"] }));
  assert.throws(() => useNemoSplitThinking(ctx(s, NEMO_SPLIT_ID, { abilityId: "split-teamwork" })), /NEMO_SPLIT_NO_MATURE_CARDS/);
  s.round = 5;
  s.players.n.mana = 10;
  const events = [];
  const result = useNemoSplitThinking(ctx(s, NEMO_SPLIT_ID, { abilityId: "split-teamwork" }, (type, payload) => events.push({ type, payload })));
  assert.equal(result.played.length, 2);
  assert.equal(s.players.n.mana, 7);
  assert.deepEqual(new Set(s.players.n.attack), new Set(["str", "agi"]));
  assert.equal(s.cards.str.attachedToInstanceId, undefined);
  assert.equal(s.cards.str.attachmentPlacedRound, undefined);
  assert.equal(events.filter((entry) => entry.type === "card.played").length, 2);
});

test("鹦鹉螺号部署工房累积威力直至关闭，大冲角把当前威力加入地利并在战斗结束关闭", () => {
  const s = state("nemo-nautilus");
  add(s, "nautilus", NEMO_NAUTILUS_ID, "attack", "up", true);
  useNemoNautilus(ctx(s, NEMO_NAUTILUS_ID, { eventType: "player.deployed", event: { playerId: "n", locationId: "workshop" } }));
  useNemoNautilus(ctx(s, NEMO_NAUTILUS_ID, { eventType: "player.deployed", event: { playerId: "n", locationId: "workshop" } }));
  assert.equal(s.cards.nautilus.untilClosePowerBonus, 2);
  assert.equal(calculateCombatCardPower(s, s.players.n, "nautilus", definitions, "mountain"), 2);
  const ram = useNemoNautilus(ctx(s, NEMO_NAUTILUS_ID, { abilityId: "great-ram" }));
  assert.equal(ram.terrainGain, 2);
  assert.equal(calculateTerrainAdvantage(s, s.players.n, definitions, "mountain"), 2);
  assert.equal(s.players.n.trueNameRevealed, true);
  s.phase = "combat";
  useNemoNautilus(ctx(s, NEMO_NAUTILUS_ID, { eventType: "combat.ending", event: { round: 4 } }));
  assert.equal(s.cards.nautilus.zone, "servant-skills");
  assert.equal(s.cards.nautilus.untilClosePowerBonus, undefined);
});
