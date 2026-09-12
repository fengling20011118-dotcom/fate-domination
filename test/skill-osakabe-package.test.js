import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardBasePower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance, placeOwnedCardOnBoard } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  OSAKABE_APPARITION_ID,
  OSAKABE_BATS_ID,
  OSAKABE_CASTLE_ID,
  useOsakabeCastleApparition,
  useOsakabeChiyogamiBats,
  useOsakabeHakuroCastle,
} from "../src/rules-core/osakabe.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const basicA = { id: "card.test.osakabe-a", name: "A", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true };
const basicB = { id: "card.test.osakabe-b", name: "B", cardType: "attack", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [basicA.id]: basicA, [basicB.id]: basicB };

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}
function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "o", name: "Osakabe" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }], seed: 101 });
  state.status = "playing"; state.round = 4; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "o";
  state.players.o.servantId = "servant.osakabe";
  for (const p of Object.values(state.players)) { p.mana = 20; p.victoryPoints = 5; }
  putAt(state, "o", "mountain"); putAt(state, "a", "mountain"); putAt(state, "b", "city"); putAt(state, "c", "city");
  return state;
}
function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}
function ctx(state, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state, player: state.players.o, skill: built.skills.get(skillId), payload, definitions, openDecision, randomInt: () => 0, emitEvent };
}

test("刑部姬技能包 3/3 FULL并传播条件追加/动态基础威力元数据", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.osakabe");
  assert.equal(skills.length, 3); assert.ok(skills.every((s) => s.supportLevel === "FULL")); assert.ok(skills.every((s) => built.skills.hasHandler(s.id)));
  assert.deepEqual(built.skills.get(OSAKABE_APPARITION_ID).standardAppendIfBoardDefinitionAtControllerLocation, [OSAKABE_CASTLE_ID]);
  assert.equal(built.skills.get(OSAKABE_BATS_ID).basePowerPerSameLocationOpponent, 3);
  assert.deepEqual(built.skills.get(OSAKABE_BATS_ID).basePowerZeroIfBoardDefinitionAtControllerLocation, [OSAKABE_CASTLE_ID]);
});

test("千代纸操法基础威力=同地点对手数×3，同地点附着姬路城时为0", () => {
  const state = makeState("osakabe-bats-power"); addCard(state, "o", "bats", OSAKABE_BATS_ID, "attack", "up", true);
  assert.equal(calculateCombatCardBasePower(state, state.players.o, "bats", definitions), 3);
  putAt(state, "b", "mountain"); assert.equal(calculateCombatCardBasePower(state, state.players.o, "bats", definitions), 6);
  addCard(state, "o", "castle", OSAKABE_CASTLE_ID, "servant-skills", "up", false); placeOwnedCardOnBoard(state, "o", "castle", "mountain");
  assert.equal(calculateCombatCardBasePower(state, state.players.o, "bats", definitions), 0);
});

test("城中妖怪只在同地点附着姬路城时可作为第三张追加到标准攻击", () => {
  const state = makeState("osakabe-append"); putAt(state, "a", "city");
  addCard(state, "o", "a1", basicA.id, "hand"); addCard(state, "o", "a2", basicB.id, "hand"); addCard(state, "o", "app", OSAKABE_APPARITION_ID, "servant-skills", "up", false);
  assert.throws(() => commitStandardAttack(structuredClone(state), "o", ["a1", "a2", "app"], [], definitions), /EXACTLY_TWO_CARDS_REQUIRED|STANDARD/);
  addCard(state, "o", "castle", OSAKABE_CASTLE_ID, "servant-skills", "up", false); placeOwnedCardOnBoard(state, "o", "castle", "mountain");
  const result = commitStandardAttack(state, "o", ["a1", "a2", "app"], [], definitions);
  assert.equal(result.committed.length, 3); assert.ok(state.players.o.attack.includes("app"));
});

test("城中妖怪行动阶段翻倍地利；被动/战斗阶段在技能区也可独处得1VP", () => {
  const state = makeState("osakabe-apparition");
  state.players.o.flags.deploymentLocationId = "mountain"; state.players.o.flags.deploymentBonus = 3; state.players.o.flags.deploymentBonusActive = true;
  addCard(state, "o", "app", OSAKABE_APPARITION_ID, "attack", "up", true);
  const before = calculateCombatPower(state, state.players.o, definitions, "mountain");
  useOsakabeCastleApparition(ctx(state, OSAKABE_APPARITION_ID, { abilityId: "double-terrain" }));
  const after = calculateCombatPower(state, state.players.o, definitions, "mountain"); assert.equal(after - before, 3);
  state.phase = "combat"; putAt(state, "a", "city");
  state.players.o.attack = state.players.o.attack.filter((id) => id !== "app"); state.players.o.servantSkills.push("app"); state.cards.app.zone = "servant-skills"; state.cards.app.active = false; state.cards.app.face = "down";
  const vp = state.players.o.victoryPoints; const result = useOsakabeCastleApparition(ctx(state, OSAKABE_APPARITION_ID, { abilityId: "reclusive-hermit" }));
  assert.equal(result.victoryPointsGained, 1); assert.equal(state.players.o.victoryPoints, vp + 1);
});

test("千代纸操法仅在正常移动边相通时偷相邻地点每名对手1VP，人数容量不阻止判定", () => {
  const state = makeState("osakabe-bats-steal"); putAt(state, "a", "workshop"); putAt(state, "o", "workshop"); putAt(state, "b", "mountain"); putAt(state, "c", "mountain");
  state.phase = "combat"; state.activePlayerId = "o"; addCard(state, "o", "bats", OSAKABE_BATS_ID, "attack", "up", true);
  const result = useOsakabeChiyogamiBats(ctx(state, OSAKABE_BATS_ID, { abilityId: "paper-manipulation" }));
  assert.equal(result.locationId, "mountain"); assert.equal(result.victoryPointsStolen, 2); assert.equal(state.players.o.victoryPoints, 7); assert.equal(state.players.b.victoryPoints, 4); assert.equal(state.players.c.victoryPoints, 4);
});

test("姬路城On Play仅击败同地点地利>=3对手，战后附着并持续接下来两回合后返回技能区", () => {
  const state = makeState("osakabe-castle"); state.phase = "combat"; state.activePlayerId = "o";
  state.players.a.flags.deploymentLocationId = "mountain"; state.players.a.flags.deploymentBonus = 3; state.players.a.flags.deploymentBonusActive = true;
  addCard(state, "o", "castle", OSAKABE_CASTLE_ID, "attack", "up", true);
  const drop = useOsakabeHakuroCastle(ctx(state, OSAKABE_CASTLE_ID, { eventType: "card.played", event: { playerId: "o", definitionId: OSAKABE_CASTLE_ID } }));
  assert.equal(drop.targetPlayerId, "a"); assert.equal(state.players.a.defeated, true);
  const attached = useOsakabeHakuroCastle(ctx(state, OSAKABE_CASTLE_ID, { eventType: "combat.ending", event: {} })); assert.equal(attached.expiresAfterRound, 6); assert.equal(state.cards.castle.zone, "board");
  state.round = 5; let r = useOsakabeHakuroCastle(ctx(state, OSAKABE_CASTLE_ID, { eventType: "round.ending", event: {} })); assert.deepEqual(r.returnedInstanceIds, []); assert.equal(state.cards.castle.zone, "board");
  state.round = 6; r = useOsakabeHakuroCastle(ctx(state, OSAKABE_CASTLE_ID, { eventType: "round.ending", event: {} })); assert.deepEqual(r.returnedInstanceIds, ["castle"]); assert.equal(state.cards.castle.zone, "servant-skills");
});
