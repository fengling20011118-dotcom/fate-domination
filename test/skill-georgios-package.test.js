import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getStructuredCardResidualGrantSources } from "../src/rules-core/rule-modifiers.ts";
import { addDragonStatus, playerIsDragon } from "../src/rules-core/player-statuses.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  GEORGIOS_ASCALON_ID,
  GEORGIOS_BAYARD_ID,
  GEORGIOS_MARTYR_ID,
  resolveGeorgiosAscalon,
  resolveGeorgiosBayard,
  useGeorgiosAscalon,
  useGeorgiosBayard,
  useGeorgiosMartyrSoul,
} from "../src/rules-core/georgios.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const low = { id: "card.test.georgios-low", name: "Low", cardType: "attack", cost: 1, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
const high = { id: "card.test.georgios-high", name: "High", cardType: "attack", cost: 1, basePower: 4, typeLabel: "力量", attributes: ["力量"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [low.id]: low, [high.id]: high };

function stateOf(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "g", name: "Georgios" }, { id: "a", name: "A" }, { id: "b", name: "B" }], seed: 17 });
  state.status = "playing"; state.round = 4; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "g";
  state.players.g.servantId = "servant.georgios";
  for (const p of Object.values(state.players)) { p.mana = 20; p.victoryPoints = 5; }
  putAt(state, "g", "mountain"); putAt(state, "a", "city"); putAt(state, "b", "city");
  return state;
}
function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) { const i = ids.indexOf(playerId); if (i >= 0) ids.splice(i, 1); }
  state.players[playerId].locationId = locationId; state.board.locations[locationId].push(playerId);
}
function add(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}
function ctx(state, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state, player: state.players.g, skill: built.skills.get(skillId), payload, definitions, openDecision, emitEvent, randomInt: () => 0 };
}
function frame(state) { assert.ok(state.effectQueue.length); return state.effectQueue[0].payload; }

test("乔尔乔斯技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.georgios");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("殉教者之魂仅在技能区连续赋予幸运残留，来源离开技能区即失去该性质", () => {
  const state = stateOf("georgios-fortitude");
  add(state, "g", "martyr", GEORGIOS_MARTYR_ID, "servant-skills");
  add(state, "g", "luck", "card.cardluck", "attack", "up", true);
  const luck = state.cards.luck; const luckDef = definitions[luck.definitionId];
  assert.equal(getStructuredCardResidualGrantSources(state, "g", luck, luckDef, definitions).length, 1);
  movePlayerCard(state, "g", "martyr", "attack"); state.cards.martyr.face = "up"; state.cards.martyr.active = true;
  assert.equal(getStructuredCardResidualGrantSources(state, "g", luck, luckDef, definitions).length, 0);
});

test("圣洁将当前局势的宝具禁令替换为宝具/幸运+3，且不解除其他属性禁令", () => {
  const state = stateOf("georgios-sacredness");
  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具", "力量"] };
  add(state, "g", "martyr", GEORGIOS_MARTYR_ID, "servant-skills");
  add(state, "g", "ascalon", GEORGIOS_ASCALON_ID, "hand");
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "g", instanceId: "ascalon", definitions, faceDown: false }), /CARD_ATTRIBUTE_FORBIDDEN_BY_SITUATION/);
  useGeorgiosMartyrSoul(ctx(state, GEORGIOS_MARTYR_ID, { abilityId: "sacredness" }));
  // Ascalon still has Strength, so the independent Strength ban continues to apply.
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "g", instanceId: "ascalon", definitions, faceDown: false }), /CARD_ATTRIBUTE_FORBIDDEN_BY_SITUATION/);
  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "g", instanceId: "ascalon", definitions, faceDown: false }));
  movePlayerCard(state, "g", "ascalon", "attack"); state.cards.ascalon.face = "up"; state.cards.ascalon.active = true;
  assert.equal(calculateCombatCardPower(state, state.players.g, "ascalon", definitions, "mountain"), 13);
});

test("贝亚德在龙移动至战场后可真实打出并跟随移动", () => {
  const state = stateOf("georgios-bayard-follow");
  add(state, "g", "bayard", GEORGIOS_BAYARD_ID, "servant-skills");
  addDragonStatus(state.players.a, "test-dragon");
  let decision;
  const opened = useGeorgiosBayard(ctx(state, GEORGIOS_BAYARD_ID, { eventType: "player.moved", event: { playerId: "a", previousLocationId: "mountain", locationId: "city", method: "effect" } }, (d) => { decision = d; }));
  assert.equal(opened.pending, true); assert.deepEqual(decision.options.map((o) => o.id), ["play", "skip"]);
  const before = state.players.g.mana;
  const result = resolveGeorgiosBayard(ctx(state, GEORGIOS_BAYARD_ID, { previous: frame(state), decision: { status: "resolved", selections: ["play"] } }));
  assert.equal(result.played, true); assert.equal(state.cards.bayard.zone, "attack"); assert.equal(state.players.g.locationId, "city");
  assert.equal(state.players.g.mana, before - 3);
});

test("贝亚德打出时只抽1张一次，并可追加至多3张印刷基础威力3以下的真实出牌", () => {
  const state = stateOf("georgios-bayard-onplay");
  add(state, "g", "bayard", GEORGIOS_BAYARD_ID, "attack", "up", true);
  add(state, "g", "drawn-high", high.id, "deck");
  add(state, "g", "low-1", low.id, "hand"); add(state, "g", "low-2", low.id, "hand"); add(state, "g", "high", high.id, "hand");
  let decision;
  const opened = useGeorgiosBayard(ctx(state, GEORGIOS_BAYARD_ID, { eventType: "card.played", event: { playerId: "g", instanceId: "bayard", definitionId: GEORGIOS_BAYARD_ID, face: "up" } }, (d) => { decision = d; }));
  assert.equal(opened.drawnInstanceIds.length, 1); assert.equal(state.players.g.hand.includes("drawn-high"), true);
  assert.deepEqual(new Set(decision.options.map((o) => o.id)), new Set(["low-1", "low-2"]));
  const before = state.players.g.mana;
  const result = resolveGeorgiosBayard(ctx(state, GEORGIOS_BAYARD_ID, { previous: frame(state), decision: { status: "resolved", selections: ["low-1", "low-2"] } }));
  assert.equal(result.appended.length, 2); assert.equal(state.players.g.mana, before - 2);
  assert.equal(state.cards["low-1"].zone, "attack"); assert.equal(state.cards["low-2"].zone, "attack"); assert.equal(state.cards.high.zone, "hand");
});

test("你也是龙只在至少两名对手参与的争夺战后标记获胜对手，再发动会移动本来源标记", () => {
  const state = stateOf("georgios-ascalon-mark");
  add(state, "g", "ascalon", GEORGIOS_ASCALON_ID, "servant-skills");
  let decision;
  const opened = useGeorgiosAscalon(ctx(state, GEORGIOS_ASCALON_ID, { eventType: "combat.resolved", event: { participantIds: ["a", "b"], winnerIds: ["a"], locationId: "city" } }, (d) => { decision = d; }));
  assert.equal(opened.pending, true);
  resolveGeorgiosAscalon(ctx(state, GEORGIOS_ASCALON_ID, { previous: frame(state), decision: { status: "resolved", selections: ["a"] } }));
  assert.equal(playerIsDragon(state.players.a), true); assert.equal(playerIsDragon(state.players.b), false);
  useGeorgiosAscalon(ctx(state, GEORGIOS_ASCALON_ID, { eventType: "combat.resolved", event: { participantIds: ["a", "b"], winnerIds: ["b"], locationId: "city" } }));
  resolveGeorgiosAscalon(ctx(state, GEORGIOS_ASCALON_ID, { previous: frame(state), decision: { status: "resolved", selections: ["b"] } }));
  assert.equal(playerIsDragon(state.players.a), false); assert.equal(playerIsDragon(state.players.b), true);
});

test("Ascalon 仅在同战场与龙战斗时自身+5", () => {
  const state = stateOf("georgios-ascalon-power");
  putAt(state, "a", "mountain"); addDragonStatus(state.players.a, "test-dragon");
  add(state, "g", "ascalon", GEORGIOS_ASCALON_ID, "attack", "up", true);
  assert.equal(calculateCombatCardPower(state, state.players.g, "ascalon", definitions, "mountain"), 15);
  putAt(state, "a", "city");
  assert.equal(calculateCombatCardPower(state, state.players.g, "ascalon", definitions, "mountain"), 10);
});
