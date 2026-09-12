import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { gainMana, setManaGainBlockSource } from "../src/rules-core/resources.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  SKADI_WISDOM_ID, SKADI_RUNES_ID, SKADI_CASTLE_ID,
  useSkadiWisdom, resolveSkadiWisdom, useSkadiRunes, useSkadiCastle, resolveSkadiCastle,
} from "../src/rules-core/skadi.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function state(id) {
  const s = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Skadi" }, { id: "o", name: "Opponent" }], seed: 11 });
  s.status = "playing";
  s.round = 4;
  s.phase = "action";
  s.step = "player-window";
  s.activePlayerId = "s";
  s.turnOrder = ["s", "o"];
  s.players.s.servantId = "servant.skadi";
  s.players.s.mana = 20;
  s.players.s.victoryPoints = 2;
  s.players.s.locationId = "mountain";
  s.players.o.mana = 10;
  s.players.o.locationId = "mountain";
  s.board.locations.mountain = ["s", "o"];
  s.board.locations.city = [];
  s.board.locations.workshop = [];
  s.board.locations.scouting = [];
  return s;
}
function add(s, playerId, instanceId, definitionId, zone = "servant-skills", face = "up", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}
function ctx(s, skillId, payload, openDecision = () => {}, randomInt = () => 0) {
  return { state: s, player: s.players.s, skill: built.skills.get(skillId), payload, definitions, openDecision, randomInt };
}

test("Skadi技能包3/3 FULL并注册专用handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.skadi");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("大神的睿智前哨支付1魔力、抽1，再准确洗回2张手牌", () => {
  const s = state("skadi-wisdom-outpost");
  s.phase = "outpost";
  add(s, "s", "h1", "card.cardq1", "hand", "down", false);
  add(s, "s", "h2", "card.carda1", "hand", "down", false);
  add(s, "s", "draw", "card.cardluck", "deck", "down", false);
  s.players.s.deck = ["draw"];
  let decision;
  const beforeMana = s.players.s.mana;
  useSkadiWisdom(ctx(s, SKADI_WISDOM_ID, { abilityId: "wisdom-outpost" }, (value) => { decision = value; }));
  assert.equal(s.players.s.mana, beforeMana - 1);
  assert.ok(s.players.s.hand.includes("draw"));
  assert.equal(decision.min, 2);
  assert.equal(decision.max, 2);
  const frame = s.effectQueue[0];
  resolveSkadiWisdom(ctx(s, SKADI_WISDOM_ID, { previous: frame.payload, decision: { status: "resolved", selections: ["h1", "h2"] } }));
  assert.ok(s.players.s.deck.includes("h1"));
  assert.ok(s.players.s.deck.includes("h2"));
  assert.deepEqual(s.players.s.hand, ["draw"]);
});

test("大神的睿智按本回合两张基础攻击属性得到Ansuz并获得4战果", () => {
  const s = state("skadi-ansuz");
  add(s, "s", "luck", "card.cardluck", "attack", "up", true);
  add(s, "s", "prep", "card.cardpreparation", "attack", "up", true);
  s.cards.luck.playedRound = 4;
  s.cards.prep.playedRound = 4;
  let comboDecision;
  const beforeMana = s.players.s.mana;
  useSkadiWisdom(ctx(s, SKADI_WISDOM_ID, { abilityId: "wisdom-action" }, (value) => { comboDecision = value; }));
  assert.ok(comboDecision.options.some((option) => option.id === "特殊+特殊"));
  assert.equal(s.players.s.mana, beforeMana - 3);
  const frame = s.effectQueue[0];
  const beforeVp = s.players.s.victoryPoints;
  const result = resolveSkadiWisdom(ctx(s, SKADI_WISDOM_ID, { previous: frame.payload, decision: { status: "resolved", selections: ["特殊+特殊"] } }));
  assert.equal(result.effect, "ansuz");
  assert.equal(s.players.s.victoryPoints, beforeVp + 4);
});

test("Teiwaz由迅捷+特殊组合武装，战斗中恰好一名对手时令其败北", () => {
  const s = state("skadi-teiwaz");
  add(s, "s", "agi", "card.cardq1", "attack", "up", true);
  add(s, "s", "luck", "card.cardluck", "attack", "up", true);
  s.cards.agi.playedRound = 4;
  s.cards.luck.playedRound = 4;
  let comboDecision;
  useSkadiWisdom(ctx(s, SKADI_WISDOM_ID, { abilityId: "wisdom-action" }, (value) => { comboDecision = value; }));
  const combo = comboDecision.options.find((option) => option.id.includes("迅捷") && option.id.includes("特殊")).id;
  const frame = s.effectQueue[0];
  const armed = resolveSkadiWisdom(ctx(s, SKADI_WISDOM_ID, { previous: frame.payload, decision: { status: "resolved", selections: [combo] } }));
  assert.equal(armed.effect, "teiwaz");
  s.phase = "combat";
  const result = useSkadiRunes(ctx(s, SKADI_RUNES_ID, { abilityId: "teiwaz-combat" }));
  assert.equal(s.players.o.defeated, true);
  assert.ok(result);
});

test("影之城持续阻止同地点对手获得魔力，离开后仅移除自己的阻断来源", () => {
  const s = state("skadi-castle-mana");
  add(s, "s", "castle", SKADI_CASTLE_ID, "attack", "up", true);
  useSkadiCastle(ctx(s, SKADI_CASTLE_ID, { eventType: "card.played", event: { playerId: "s" } }));
  const before = s.players.o.mana;
  assert.equal(gainMana(s.players.o, 3), 0);
  assert.equal(s.players.o.mana, before);
  setManaGainBlockSource(s.players.o, "other-source", true);
  s.board.locations.mountain = ["s"];
  s.board.locations.city = ["o"];
  s.players.o.locationId = "city";
  useSkadiCastle(ctx(s, SKADI_CASTLE_ID, { eventType: "player.entered-location", event: { playerId: "o", locationId: "city" } }));
  assert.equal(gainMana(s.players.o, 1), 0);
  setManaGainBlockSource(s.players.o, "other-source", false);
  assert.equal(gainMana(s.players.o, 1), 1);
});

test("影之城选择属性后将同战斗该属性基础攻击的基本威力翻倍", () => {
  const s = state("skadi-castle-power");
  s.phase = "outpost";
  add(s, "s", "castle", SKADI_CASTLE_ID, "attack", "up", true);
  add(s, "s", "agi-s", "card.cardq1", "attack", "up", true);
  add(s, "o", "agi-o", "card.cardq2", "attack", "up", true);
  const beforeS = calculateCombatCardPower(s, s.players.s, "agi-s", definitions);
  const beforeO = calculateCombatCardPower(s, s.players.o, "agi-o", definitions);
  let decision;
  useSkadiCastle(ctx(s, SKADI_CASTLE_ID, { abilityId: "castle-type" }, (value) => { decision = value; }));
  const frame = s.effectQueue[0];
  resolveSkadiCastle(ctx(s, SKADI_CASTLE_ID, { previous: frame.payload, decision: { status: "resolved", selections: ["迅捷"] } }));
  const afterS = calculateCombatCardPower(s, s.players.s, "agi-s", definitions);
  const afterO = calculateCombatCardPower(s, s.players.o, "agi-o", definitions);
  assert.equal(afterS - beforeS, 2);
  assert.equal(afterO - beforeO, 3);
});
