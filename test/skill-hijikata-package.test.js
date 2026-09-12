import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  HIJIKATA_COAT_ID,
  HIJIKATA_FLAG_ID,
  HIJIKATA_LAW_ID,
  resolveHijikataRally,
  useHijikataCoat,
  useHijikataFlag,
  useHijikataLaw,
} from "../src/rules-core/hijikata.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function state(id, third = false) {
  const players = [{ id: "h", name: "Hijikata" }, { id: "o", name: "Opponent" }];
  if (third) players.push({ id: "x", name: "Third" });
  const s = createGameState({ gameInstanceId: id, players, seed: 1869 });
  s.status = "playing";
  s.round = 4;
  s.phase = "action";
  s.step = "player-window";
  s.activePlayerId = "h";
  s.turnOrder = third ? ["h", "o", "x"] : ["h", "o"];
  s.players.h.servantId = "servant.hijikata";
  s.players.h.mana = 20;
  s.players.h.locationId = "mountain";
  s.players.o.mana = 20;
  s.players.o.locationId = "mountain";
  s.board.locations.mountain = ["h", "o"];
  s.board.locations.city = [];
  if (third) {
    s.players.x.locationId = "city";
    s.board.locations.city = ["x"];
  }
  return s;
}

function add(s, playerId, instanceId, definitionId, zone = "servant-skills", face = "up", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(s, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state: s, player: s.players.h, skill: built.skills.get(skillId), payload, definitions, openDecision, emitEvent };
}

test("土方岁三技能包3/3 FULL并注册专用handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.hijikata");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("法度·律：自己回合进入唯一垫底对手战场时破戒并将手牌替换为两张3/7狂战士", () => {
  const s = state("hijikata-responsibility", true);
  add(s, "h", "coat", HIJIKATA_COAT_ID);
  add(s, "h", "old-hand", "card.cardq1", "hand", "down", false);
  s.players.o.victoryPoints = 1;
  s.players.x.victoryPoints = 4;
  const result = useHijikataCoat(ctx(s, HIJIKATA_COAT_ID, {
    eventType: "player.entered-location",
    event: { playerId: "h", locationId: "mountain" },
  }));
  assert.equal(result.broken, true);
  assert.equal(s.cards.coat.zone, "removed");
  assert.ok(s.players.h.discard.includes("old-hand"));
  assert.equal(s.players.h.hand.length, 2);
  assert.ok(s.players.h.hand.every((id) => s.cards[id].definitionId === "card.cardb5"));
});

test("誓言羽织激活时前哨支付1魔力获得+4合计威力", () => {
  const s = state("hijikata-coat-power");
  s.phase = "outpost";
  add(s, "h", "coat", HIJIKATA_COAT_ID, "attack", "up", true);
  const before = s.players.h.mana;
  const result = useHijikataCoat(ctx(s, HIJIKATA_COAT_ID, { abilityId: "responsibility-power" }));
  assert.equal(result.powerGained, 4);
  assert.equal(s.players.h.mana, before - 1);
  assert.equal(s.players.h.flags.roundPowerBonus, 4);
});

test("法度·诚：在战场暗置攻击时破戒；激烈行进抽1并打2，狂战士费用-1", () => {
  const broken = state("hijikata-honesty");
  add(broken, "h", "flag", HIJIKATA_FLAG_ID);
  add(broken, "h", "old-hand", "card.carda1", "hand", "down", false);
  const result = useHijikataFlag(ctx(broken, HIJIKATA_FLAG_ID, {
    eventType: "card.played",
    event: { playerId: "h", face: "down", locationId: "mountain" },
  }));
  assert.equal(result.broken, true);
  assert.equal(broken.cards.flag.zone, "removed");
  assert.equal(broken.players.h.hand.length, 2);

  const s = state("hijikata-rally");
  add(s, "h", "flag", HIJIKATA_FLAG_ID, "attack", "up", true);
  add(s, "h", "berserker", "card.cardb5", "hand", "down", false);
  add(s, "h", "quick", "card.cardq1", "hand", "down", false);
  add(s, "h", "drawn", "card.carda1", "deck", "down", false);
  s.players.h.deck = ["drawn"];
  let decision;
  useHijikataFlag(ctx(s, HIJIKATA_FLAG_ID, { abilityId: "rally" }, (value) => { decision = value; }));
  assert.ok(decision.options.some((option) => option.id === "drawn"));
  const frame = s.effectQueue[0];
  const beforeMana = s.players.h.mana;
  const played = resolveHijikataRally(ctx(s, HIJIKATA_FLAG_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["berserker", "quick"] },
  }));
  assert.equal(played.played.length, 2);
  assert.equal(s.players.h.mana, beforeMana - 2);
  assert.equal(s.cards.berserker.paidCost, 2);
  assert.equal(s.cards.quick.paidCost, 0);
  assert.ok(s.players.h.attack.includes("berserker"));
  assert.ok(s.players.h.attack.includes("quick"));
});

test("法度·和：控制两张不共享属性的基础攻击时破戒，Shinsengumi Law自身移除后替手效果仍结算", () => {
  const s = state("hijikata-harmony");
  add(s, "h", "law", HIJIKATA_LAW_ID);
  add(s, "h", "strength", "card.cardb5", "attack", "up", true);
  add(s, "h", "quick", "card.cardq1", "attack", "up", true);
  add(s, "h", "old-hand", "card.carda1", "hand", "down", false);
  const result = useHijikataLaw(ctx(s, HIJIKATA_LAW_ID, { eventType: "attack.committed", event: { playerId: "h" } }));
  assert.equal(result.broken, true);
  assert.equal(s.cards.law.zone, "removed");
  assert.ok(s.players.h.discard.includes("old-hand"));
  assert.equal(s.players.h.hand.length, 2);
  assert.ok(s.players.h.hand.every((id) => s.cards[id].definitionId === "card.cardb5"));
});
