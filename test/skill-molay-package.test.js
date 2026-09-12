import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";
import { registerCoreSkillHandlers, useOuterGodLife } from "../src/rules-core/skill-handlers.ts";
import {
  MOLAY_FOREIGNER_CLASS_ID,
  MOLAY_INVITATION_ID,
  MOLAY_MOTHER_ID,
  MOLAY_PILGRIM_ID,
  resolveMolayPilgrimsReward,
  useMolayGoatsInvitation,
  useMolayMotherOfGoats,
  useMolayPilgrimsReward,
} from "../src/rules-core/molay.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const basicSpecial = { id: "card.test.molay-special", name: "Test Special", cardType: "attack", cost: 2, basePower: 3, typeLabel: "特殊", attributes: ["特殊"], basic: true };
const basicLuckSpecial = { id: "card.test.molay-luck-special", name: "幸运", cardType: "attack", cost: 1, basePower: 0, typeLabel: "幸运", attributes: ["特殊"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [basicSpecial.id]: basicSpecial, [basicLuckSpecial.id]: basicLuckSpecial };

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function makeState(id) {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "m", name: "Molay" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }],
    seed: 97,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.players.m.servantId = "servant.molay";
  for (const player of Object.values(state.players)) player.mana = 20;
  putAt(state, "m", "mountain");
  putAt(state, "a", "mountain");
  putAt(state, "b", "mountain");
  putAt(state, "c", "city");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(state, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state, player: state.players.m, skill: built.skills.get(skillId), payload, definitions, openDecision, randomInt: () => 0, emitEvent };
}

test("雅克·德·莫莱技能包 4/4 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.molay");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(MOLAY_PILGRIM_ID).cardResidual, true);
  assert.equal(built.skills.get(MOLAY_MOTHER_ID).cardResidual, true);
});

test("堕落的授职劝诱所在地点所有玩家（包括自己），下回合生成激活临时领域外生命并仅令莫莱该回合成为Foreigner", () => {
  const state = makeState("molay-tempt");
  addCard(state, "m", "invite", MOLAY_INVITATION_ID, "attack", "up", true);
  const result = useMolayGoatsInvitation(ctx(state, MOLAY_INVITATION_ID, { abilityId: "tempt-all" }));
  assert.deepEqual(new Set(result.temptedPlayerIds), new Set(["m", "a", "b"]));
  assert.equal(state.players.c.flags["molayTemptedRound:m"], undefined);
  state.round = 5;
  state.phase = "preparation";
  const created = useMolayGoatsInvitation(ctx(state, MOLAY_INVITATION_ID, { eventType: "round.started", event: { round: 5 } }));
  assert.equal(created.created.length, 3);
  for (const playerId of ["m", "a", "b"]) {
    const instanceId = state.players[playerId].attack.find((id) => state.cards[id]?.definitionId === MOLAY_FOREIGNER_CLASS_ID);
    assert.ok(instanceId);
    assert.equal(state.cards[instanceId].temporary, true);
    assert.equal(state.cards[instanceId].temporaryCleanup, "round-end");
    assert.equal(state.cards[instanceId].active, true);
  }
  assert.equal(state.players.m.flags.molayForeignerRound, 5);
  assert.equal(state.players.m.flags.servantClassRule, undefined);
});

test("莫莱生成的临时领域外生命即使发动也不进入弃牌堆，回合末直接消失", () => {
  const state = makeState("molay-temp-life-cleanup");
  addCard(state, "m", "invite", MOLAY_INVITATION_ID, "attack", "up", true);
  useMolayGoatsInvitation(ctx(state, MOLAY_INVITATION_ID, { abilityId: "tempt-all" }));
  state.round = 5;
  state.phase = "preparation";
  useMolayGoatsInvitation(ctx(state, MOLAY_INVITATION_ID, { eventType: "round.started", event: { round: 5 } }));
  const lifeId = state.players.a.attack.find((id) => state.cards[id]?.definitionId === MOLAY_FOREIGNER_CLASS_ID);
  assert.ok(lifeId);
  state.phase = "combat";
  state.activePlayerId = "a";
  useOuterGodLife({ state, player: state.players.a, skill: built.skills.get(MOLAY_FOREIGNER_CLASS_ID), payload: {}, definitions, openDecision: () => {}, randomInt: () => 0, emitEvent: () => {} });
  assert.ok(state.players.a.flags[`outerGodLifeReturn:${lifeId}`]);
  useOuterGodLife({ state, player: state.players.a, skill: built.skills.get(MOLAY_FOREIGNER_CLASS_ID), payload: { eventType: "combat.resolved" }, definitions, openDecision: () => {}, randomInt: () => 0, emitEvent: () => {} });
  assert.ok(state.players.a.attack.includes(lifeId));
  assert.equal(state.players.m.discard.includes(lifeId), false);
  assert.equal(state.players.a.flags[`outerGodLifeReturn:${lifeId}`], undefined);
  endStandardRound(state, definitions);
  assert.equal(state.cards[lifeId].zone, "removed");
  assert.equal(state.players.a.attack.includes(lifeId), false);
});

test("13号星期五在Foreigner战败时自动真名解放并激活，Permanent令莫莱成为女性Foreigner且所有攻击费用+3", () => {
  const state = makeState("molay-mother-transform");
  addCard(state, "m", "mother", MOLAY_MOTHER_ID, "servant-skills", "down", false);
  addCard(state, "m", "basic", basicSpecial.id, "hand", "down", false);
  state.players.m.flags.molayForeignerRound = state.round;
  const result = useMolayMotherOfGoats(ctx(state, MOLAY_MOTHER_ID, { eventType: "combat.resolved", event: { powers: { m: 4, a: 8 }, winnerIds: ["a"], locationId: "mountain" } }));
  assert.equal(result.activatedInstanceId, "mother");
  assert.equal(state.players.m.trueNameRevealed, true);
  assert.equal(state.cards.mother.active, true);
  assert.equal(state.cards.mother.residual, true);
  assert.equal(state.players.m.flags.servantClassRule, "foreigner");
  assert.equal(state.players.m.flags.servantGenderRule, "female");
  assert.equal(getCardPlayCost(state, definitions[basicSpecial.id], state.players.m, state.cards.basic, definitions), 5);
});

test("Mother准备阶段只给回合顺位前两名玩家生成激活临时Foreigner Class", () => {
  const state = makeState("molay-mother-prep");
  state.turnOrder = ["a", "c", "m", "b"];
  state.phase = "preparation";
  state.activePlayerId = "m";
  addCard(state, "m", "mother", MOLAY_MOTHER_ID, "attack", "up", true);
  const result = useMolayMotherOfGoats(ctx(state, MOLAY_MOTHER_ID, { abilityId: "mother-prep" }));
  assert.deepEqual(result.targetPlayerIds, ["a", "c"]);
  assert.ok(state.players.a.attack.some((id) => state.cards[id]?.definitionId === MOLAY_FOREIGNER_CLASS_ID));
  assert.ok(state.players.c.attack.some((id) => state.cards[id]?.definitionId === MOLAY_FOREIGNER_CLASS_ID));
  assert.equal(state.players.m.attack.filter((id) => state.cards[id]?.definitionId === MOLAY_FOREIGNER_CLASS_ID).length, 0);
});

test("Pilgrim's Reward在Foreigner形态进入战斗前必须关闭自身或受控Foreigner Class", () => {
  const state = makeState("molay-pilgrim-upkeep");
  state.phase = "combat";
  state.players.m.flags.molayForeignerRound = state.round;
  addCard(state, "m", "pilgrim", MOLAY_PILGRIM_ID, "attack", "up", true);
  addCard(state, "m", "life", MOLAY_FOREIGNER_CLASS_ID, "attack", "up", true);
  let decision;
  const opened = useMolayPilgrimsReward(ctx(state, MOLAY_PILGRIM_ID, { eventType: "phase.transitioned", event: { previousPhase: "action", transition: "next-phase" } }, (value) => { decision = value; }));
  assert.equal(opened.pending, true);
  assert.deepEqual(new Set(decision.options.map((option) => option.id)), new Set(["pilgrim", "life"]));
  const previous = state.effectQueue[0].payload;
  const result = resolveMolayPilgrimsReward(ctx(state, MOLAY_PILGRIM_ID, { previous, decision: { status: "resolved", selections: ["life"] } }));
  assert.equal(result.closedInstanceId, "life");
  assert.equal(state.cards.life.active, false);
  assert.ok(state.players.m.servantSkills.includes("life"));
  assert.equal(state.cards.pilgrim.active, true);
});

test("所罗门火炬只让同战斗控制非幸运特殊攻击的玩家-5合计威力", () => {
  const state = makeState("molay-torch");
  addCard(state, "m", "pilgrim", MOLAY_PILGRIM_ID, "attack", "up", true);
  addCard(state, "a", "special", basicSpecial.id, "attack", "up", true);
  addCard(state, "b", "luck-special", basicLuckSpecial.id, "attack", "up", true);
  addCard(state, "c", "city-special", basicSpecial.id, "attack", "up", true);
  const result = useMolayPilgrimsReward(ctx(state, MOLAY_PILGRIM_ID, { abilityId: "solomons-torch" }));
  assert.deepEqual(result.affectedPlayerIds, ["a"]);
  assert.equal(state.players.a.flags.roundPowerBonus, -5);
  assert.equal(state.players.b.flags.roundPowerBonus, undefined);
  assert.equal(state.players.c.flags.roundPowerBonus, undefined);
});
