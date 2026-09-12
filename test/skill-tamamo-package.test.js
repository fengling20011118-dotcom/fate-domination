import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { attachCard } from "../src/rules-core/card-attachments.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  TAMAMO_CASCADE_ID,
  TAMAMO_TRANSCENDENCE_ID,
  TAMAMO_WITCHCRAFT_ID,
  resolveTamamoCascade,
  useTamamoCascade,
  useTamamoTranscendence,
  useTamamoWitchcraft,
} from "../src/rules-core/tamamo.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);

const magic = { id: "card.test.tamamo.magic", name: "Test Magic", cardType: "attack", cost: 2, basePower: 5, typeLabel: "魔术", attributes: ["魔术"], basic: true };
const opponentReduction = { id: "servant.test-opponent.skill.reduce", name: "Opponent Reduction", cardType: "skill", cost: 0, basePower: 0, typeLabel: "被动", attributes: [], isSkill: true, ownerType: "servant", ownerDefinitionId: "servant.test-opponent" };
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  [magic.id]: magic,
  [opponentReduction.id]: opponentReduction,
};

function state(id) {
  const result = createGameState({ gameInstanceId: id, players: [{ id: "t", name: "Tamamo" }, { id: "o", name: "Opponent" }], seed: 412 });
  result.status = "playing";
  result.round = 4;
  result.phase = "action";
  result.step = "player-window";
  result.activePlayerId = "t";
  result.players.t.servantId = "servant.tamamo";
  result.players.o.servantId = "servant.test-opponent";
  result.players.t.mana = 20;
  result.players.o.mana = 20;
  result.players.t.locationId = "mountain";
  result.players.o.locationId = "mountain";
  result.board.locations.mountain = ["t", "o"];
  result.board.locations.city = [];
  return result;
}

function add(s, playerId, id, definitionId, zone = "servant-skills", face = "up", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId: id, definitionId, zone, face, active });
}

function ctx(s, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state: s, player: s.players.t, skill: built.skills.get(skillId), payload, definitions, openDecision, emitEvent };
}

test("玉藻前技能包3/3 FULL并注册专用handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.tamamo");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Witchcraft变化让幸运/远隔操作本回合失去特殊并获得魔术", () => {
  const s = state("tamamo-weirding");
  add(s, "t", "witch", TAMAMO_WITCHCRAFT_ID);
  add(s, "t", "luck", "card.cardluck", "hand", "down", false);
  add(s, "t", "prep", "card.cardpreparation", "deck", "down", false);
  useTamamoWitchcraft(ctx(s, TAMAMO_WITCHCRAFT_ID, { eventType: "game.started", event: {} }));
  useTamamoWitchcraft(ctx(s, TAMAMO_WITCHCRAFT_ID, { abilityId: "weirding-hex" }));
  assert.deepEqual(getCardInstanceAttributes(s.cards.luck, definitions["card.cardluck"], s, definitions), ["魔术"]);
  assert.deepEqual(getCardInstanceAttributes(s.cards.prep, definitions["card.cardpreparation"], s, definitions), ["魔术"]);
});

test("Magic Penetration只阻止其他玩家的减威和关闭，不阻止自己的效果", () => {
  const s = state("tamamo-penetration");
  add(s, "t", "witch", TAMAMO_WITCHCRAFT_ID);
  add(s, "t", "magic-a", magic.id, "attack", "up", true);
  add(s, "t", "magic-b", magic.id, "attack", "up", true);
  useTamamoWitchcraft(ctx(s, TAMAMO_WITCHCRAFT_ID, { eventType: "game.started", event: {} }));

  s.cards["magic-a"].powerModifiers = [
    { id: "opp-cut", sourceId: opponentReduction.id, kind: "add", value: -3, duration: "round" },
    { id: "self-cut", sourceId: TAMAMO_CASCADE_ID, kind: "add", value: -1, duration: "round" },
  ];
  assert.equal(calculateCombatCardPower(s, s.players.t, "magic-a", definitions, "mountain"), 4);
  assert.throws(() => closePlayerCard(s, "t", "magic-a", definitions, { closedByPlayerId: "o" }), /CARD_CLOSE_PROTECTED/);
  closePlayerCard(s, "t", "magic-b", definitions, { closedByPlayerId: "t" });
  assert.equal(s.cards["magic-b"].zone, "attack");
  assert.equal(s.cards["magic-b"].face, "down");
  assert.equal(s.cards["magic-b"].active, false);
});

test("Transcendence在Combat后封印同地点的他人魔术基础攻击并保留原所有者", () => {
  const s = state("tamamo-transcendence");
  s.phase = "combat";
  add(s, "t", "trans", TAMAMO_TRANSCENDENCE_ID, "attack", "up", true);
  add(s, "o", "opp-magic", magic.id, "attack", "up", true);
  useTamamoTranscendence(ctx(s, TAMAMO_TRANSCENDENCE_ID, { abilityId: "transcendence" }));
  const result = useTamamoTranscendence(ctx(s, TAMAMO_TRANSCENDENCE_ID, { eventType: "combat.ending", event: {} }));
  assert.equal(result.lockedInstanceId, "opp-magic");
  assert.equal(s.cards["opp-magic"].zone, "attached");
  assert.equal(s.cards["opp-magic"].attachedToInstanceId, "trans");
  assert.equal(s.cards["opp-magic"].ownerPlayerId, "o");
  assert.ok(!s.players.o.attack.includes("opp-magic"));
});

test("Cascade原子支付并打出全部封印牌，战后可重封或转入玉藻前弃牌", () => {
  const s = state("tamamo-cascade");
  add(s, "t", "cascade", TAMAMO_CASCADE_ID, "attack", "up", true);
  add(s, "t", "trans", TAMAMO_TRANSCENDENCE_ID);
  add(s, "t", "luck", "card.cardluck", "hand", "down", false);
  add(s, "o", "opp-magic", magic.id, "attack", "up", true);
  attachCard(s, "luck", "trans", "up");
  attachCard(s, "opp-magic", "trans", "up");
  const before = s.players.t.mana;
  const events = [];
  const played = useTamamoCascade(ctx(s, TAMAMO_CASCADE_ID, { abilityId: "cascade" }, () => {}, (type, payload) => events.push({ type, payload })));
  assert.equal(played.played.length, 2);
  assert.equal(s.players.t.mana, before - 2);
  assert.ok(s.players.t.attack.includes("luck"));
  assert.ok(s.players.t.attack.includes("opp-magic"));
  assert.equal(s.cards["opp-magic"].ownerPlayerId, "o");
  assert.equal(s.cards["opp-magic"].controllerPlayerId, "t");
  assert.equal(events.filter((entry) => entry.type === "card.played").length, 2);

  s.phase = "combat";
  let decision;
  const pending = useTamamoCascade(ctx(s, TAMAMO_CASCADE_ID, { eventType: "combat.ending", event: {} }, (value) => { decision = value; }));
  assert.equal(pending.pending, true);
  assert.equal(decision.kind, "tamamo-cascade-reseal");
  const frame = s.effectQueue[0];
  const result = resolveTamamoCascade(ctx(s, TAMAMO_CASCADE_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["luck"] },
  }));
  assert.deepEqual(result.resealedInstanceIds, ["luck"]);
  assert.deepEqual(result.discardedInstanceIds, ["opp-magic"]);
  assert.equal(result.paidMana, 1);
  assert.equal(s.cards.luck.zone, "attached");
  assert.equal(s.cards.luck.attachedToInstanceId, "trans");
  assert.equal(s.cards["opp-magic"].zone, "discard");
  assert.equal(s.cards["opp-magic"].ownerPlayerId, "t");
  assert.ok(s.players.t.discard.includes("opp-magic"));
  assert.ok(!s.players.o.discard.includes("opp-magic"));
});
