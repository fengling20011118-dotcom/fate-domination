import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { getCardRulePowerAdd } from "../src/rules-core/card-rule-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  RYOUMA_BLADE_ID,
  RYOUMA_DRAGON_ID,
  RYOUMA_SOARING_ID,
  resolveRyoumaBladeRestoration,
  resolveRyoumaDragonRestoration,
  useRyoumaBladeRestoration,
  useRyoumaDragonRestoration,
  useRyoumaSoaringDragon,
} from "../src/rules-core/ryouma.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const strength = { id: "card.test.ryouma-strength", name: "力量3", cardType: "attack", cost: 2, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
const agility = { id: "card.test.ryouma-agility", name: "迅捷3", cardType: "attack", cost: 2, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const magic = { id: "card.test.ryouma-magic", name: "魔术2", cardType: "attack", cost: 4, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true };
const special = { id: "card.test.ryouma-special", name: "特殊2", cardType: "attack", cost: 3, basePower: 2, typeLabel: "特殊", attributes: ["特殊"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [strength.id]: strength, [agility.id]: agility, [magic.id]: magic, [special.id]: special };

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "r", name: "Ryouma" }, { id: "o", name: "Opponent" }], seed: 191 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "r";
  state.players.r.servantId = "servant.ryouma";
  state.players.r.mana = 20;
  state.players.r.locationId = "mountain";
  state.players.o.locationId = "city";
  state.board.locations.mountain = ["r"];
  state.board.locations.city = ["o"];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillId, payload, openDecision = () => {}, emitEvent = () => {}, randomInt = () => 0) {
  return { state, player: state.players.r, skill: built.skills.get(skillId), payload, definitions, openDecision, emitEvent, randomInt };
}

function committed(ids) {
  return { eventType: "attack.committed", event: { playerId: "r", faceUpInstanceIds: ids, faceDownInstanceIds: [], committed: ids.length } };
}

test("坂本龙马技能包3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.ryouma");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("如翱翔天际之龙打出时仅本回合+10，并令其他力量攻击费用/威力+3；魔力不足4时回合末关闭", () => {
  const state = makeState("ryouma-soaring");
  add(state, "r", "soaring", RYOUMA_SOARING_ID, "attack", "up", true);
  add(state, "r", "strength-hand", strength.id, "hand");
  add(state, "r", "strength-active", strength.id, "attack", "up", true);
  const result = useRyoumaSoaringDragon(ctx(state, RYOUMA_SOARING_ID, { eventType: "card.played", event: { playerId: "r", instanceId: "soaring", definitionId: RYOUMA_SOARING_ID, face: "up" } }));
  assert.equal(result.powerBonus, 10);
  assert.ok(state.cards.soaring.powerModifiers.some((modifier) => modifier.value === 10 && modifier.duration === "round"));
  assert.equal(getCardPlayCost(state, strength, state.players.r, state.cards["strength-hand"], definitions), 5);
  assert.equal(getCardRulePowerAdd(state, state.players.r, state.cards["strength-active"]), 3);
  state.players.r.mana = 3;
  const closing = useRyoumaSoaringDragon(ctx(state, RYOUMA_SOARING_ID, { eventType: "round.ending", event: { round: 5 } }));
  assert.equal(closing.closedInstanceId, "soaring");
  assert.equal(state.cards.soaring.active, false);
});

test("维新之刃Tag Team只在一次常规打牌恰好两张力量攻击后开放魔术/迅捷追加牌并真实支付", () => {
  const state = makeState("ryouma-blade-tag");
  add(state, "r", "blade", RYOUMA_BLADE_ID, "servant-skills", "down", false);
  add(state, "r", "s1", strength.id, "attack", "up", true);
  add(state, "r", "s2", strength.id, "attack", "up", true);
  add(state, "r", "m", magic.id, "hand");
  add(state, "r", "x", special.id, "hand");
  let opened;
  const pending = useRyoumaBladeRestoration(ctx(state, RYOUMA_BLADE_ID, committed(["s1", "s2"]), (decision) => { opened = decision; }));
  assert.equal(pending.pending, true);
  assert.deepEqual(new Set(opened.options.map((option) => option.id)), new Set(["m", "blade"]));
  const before = state.players.r.mana;
  const resolved = resolveRyoumaBladeRestoration(ctx(state, RYOUMA_BLADE_ID, {
    previous: { kind: "strength", candidates: ["m", "blade"] },
    decision: { status: "resolved", selections: ["m"] },
  }));
  assert.equal(resolved.played.instanceId, "m");
  assert.equal(state.players.r.mana, before - 4);
  assert.equal(state.cards.m.zone, "attack");
  assert.equal(state.cards.m.active, true);
});

test("维新之刃Focus只强化打出的基础迅捷攻击+2，并在该回合结束关闭自身", () => {
  const state = makeState("ryouma-focus");
  add(state, "r", "blade", RYOUMA_BLADE_ID, "attack", "up", true);
  add(state, "r", "a", agility.id, "attack", "up", true);
  const boost = useRyoumaBladeRestoration(ctx(state, RYOUMA_BLADE_ID, { eventType: "card.played", event: { playerId: "r", instanceId: "a", definitionId: agility.id, face: "up" } }));
  assert.equal(boost.boostedInstanceId, "a");
  assert.ok(state.cards.a.powerModifiers.some((modifier) => modifier.value === 2 && modifier.duration === "round"));
  assert.equal(state.players.r.flags.ryoumaBladeFocusCloseRound, 5);
  const closing = useRyoumaBladeRestoration(ctx(state, RYOUMA_BLADE_ID, { eventType: "round.ending", event: { round: 5 } }));
  assert.equal(closing.closedInstanceId, "blade");
});

test("维新之龙Tag Team在恰好两张迅捷攻击后只开放力量/特殊追加牌", () => {
  const state = makeState("ryouma-dragon-tag");
  add(state, "r", "dragon", RYOUMA_DRAGON_ID, "servant-skills", "down", false);
  add(state, "r", "a1", agility.id, "attack", "up", true);
  add(state, "r", "a2", agility.id, "attack", "up", true);
  add(state, "r", "s", strength.id, "hand");
  add(state, "r", "x", special.id, "hand");
  add(state, "r", "m", magic.id, "hand");
  let opened;
  const pending = useRyoumaDragonRestoration(ctx(state, RYOUMA_DRAGON_ID, committed(["a1", "a2"]), (decision) => { opened = decision; }));
  assert.equal(pending.pending, true);
  assert.deepEqual(new Set(opened.options.map((option) => option.id)), new Set(["s", "x", "dragon"]));
  const resolved = resolveRyoumaDragonRestoration(ctx(state, RYOUMA_DRAGON_ID, {
    previous: { kind: "agility", candidates: ["s", "x", "dragon"] },
    decision: { status: "resolved", selections: ["x"] },
  }));
  assert.equal(resolved.played.instanceId, "x");
  assert.equal(state.cards.x.zone, "attack");
});

test("龙神之怒支付3魔力抽2张后可弃任意张；每张实际弃掉的力量牌使本牌本回合+2", () => {
  const state = makeState("ryouma-rampage");
  add(state, "r", "dragon", RYOUMA_DRAGON_ID, "attack", "up", true);
  add(state, "r", "deck-strength", strength.id, "deck");
  add(state, "r", "deck-magic", magic.id, "deck");
  add(state, "r", "hand-strength", strength.id, "hand");
  const before = state.players.r.mana;
  const result = useRyoumaDragonRestoration(ctx(state, RYOUMA_DRAGON_ID, { abilityId: "rampage", discardInstanceIds: ["deck-strength", "hand-strength", "deck-magic"] }));
  assert.equal(state.players.r.mana, before - 3);
  assert.deepEqual(new Set(result.drawnInstanceIds), new Set(["deck-strength", "deck-magic"]));
  assert.equal(result.strengthCount, 2);
  assert.equal(result.powerBonus, 4);
  assert.ok(state.cards.dragon.powerModifiers.some((modifier) => modifier.value === 4 && modifier.duration === "round"));
  for (const id of ["deck-strength", "hand-strength", "deck-magic"]) assert.equal(state.cards[id].zone, "discard");
});

test("Tag Team不是累计回合计数：非恰好两张同属性的一次提交不会开放", () => {
  const state = makeState("ryouma-tag-negative");
  add(state, "r", "blade", RYOUMA_BLADE_ID, "servant-skills", "down", false);
  add(state, "r", "s1", strength.id, "attack", "up", true);
  add(state, "r", "m", magic.id, "hand");
  let opened = false;
  const result = useRyoumaBladeRestoration(ctx(state, RYOUMA_BLADE_ID, committed(["s1"]), () => { opened = true; }));
  assert.equal(result, undefined);
  assert.equal(opened, false);
});
