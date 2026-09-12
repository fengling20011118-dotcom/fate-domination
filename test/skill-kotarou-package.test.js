import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  KOTAROU_CHAOS_BRIGADE_ID,
  KOTAROU_SHINOBI_SABOTAGE_ID,
  resolveKotarouDecision,
  useKotarouChaosBrigade,
} from "../src/rules-core/kotarou.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const actionCard = {
  id: "card.test.kotarou-action",
  name: "测试行动攻击",
  cardType: "attack",
  cost: 1,
  basePower: 3,
  typeLabel: "力量",
  attributes: ["力量"],
  basic: true,
  phases: ["action"],
  cardAbilityIds: ["test.kotarou-action"],
};
const strongPloy = { id: "card.test.kotarou-strong", name: "强策", cardType: "attack", cost: 0, basePower: 5, typeLabel: "力量", attributes: ["力量"], basic: true };
const weakPloy = { id: "card.test.kotarou-weak", name: "弱策", cardType: "attack", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true };
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  [actionCard.id]: actionCard,
  [strongPloy.id]: strongPloy,
  [weakPloy.id]: weakPloy,
};

function stateOf(id, players = ["k", "o"]) {
  const state = createGameState({ gameInstanceId: id, players: players.map((pid) => ({ id: pid, name: pid })), seed: 44 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.players.k.servantId = "servant.kotarou";
  state.players.k.mana = 20;
  for (const pid of players) {
    state.players[pid].locationId = "mountain";
    state.players[pid].victoryPoints = 5;
  }
  state.board.locations.mountain = [...players];
  return state;
}

function activeSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "k", { instanceId, definitionId, zone: "attack", face: "up", active: true, residual: true });
}

test("风魔小太郎技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.kotarou");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("不灭的混沌旅团支付2魔力激活暗置攻击，并令其行动能力在战斗阶段最多使用两次", () => {
  const state = stateOf("kotarou-chaos");
  activeSkill(state, "chaos", KOTAROU_CHAOS_BRIGADE_ID);
  createOwnedCardInstance(state, "k", { instanceId: "hidden", definitionId: actionCard.id, zone: "attack", face: "down", active: false });
  const cardAbilities = new CardAbilityRegistry();
  cardAbilities.register("test.kotarou-action", ({ state: s, playerId }) => {
    s.players[playerId].flags.kotarouTestActionUses = Number(s.players[playerId].flags.kotarouTestActionUses ?? 0) + 1;
  });

  built.skills.execute(state, "k", KOTAROU_CHAOS_BRIGADE_ID,
    { abilityId: "chaos-brigade-activate", targetInstanceId: "hidden" }, () => {}, () => 0, definitions);
  assert.equal(state.players.k.mana, 18);
  assert.equal(state.cards.hidden.face, "up");
  assert.equal(state.cards.hidden.active, true);

  cardAbilities.execute("test.kotarou-action", { state, playerId: "k", instanceId: "hidden", definitions });
  cardAbilities.execute("test.kotarou-action", { state, playerId: "k", instanceId: "hidden", definitions });
  assert.equal(state.players.k.flags.kotarouTestActionUses, 2);
  assert.throws(() => cardAbilities.execute("test.kotarou-action", { state, playerId: "k", instanceId: "hidden", definitions }), /CARD_ABILITY_LIMIT_REACHED/);
});

test("本回合使用气息遮断后，不灭的混沌旅团在战斗结束关闭并公开真名", () => {
  const state = stateOf("kotarou-chaos-close");
  activeSkill(state, "chaos", KOTAROU_CHAOS_BRIGADE_ID);
  state.players.k.trueNameRevealed = false;
  state.players.k.flags.presenceConcealmentUsedRound = 4;
  useKotarouChaosBrigade({
    state,
    player: state.players.k,
    skill: built.skills.get(KOTAROU_CHAOS_BRIGADE_ID),
    payload: { eventType: "combat.ending", event: {} },
    openDecision: () => {},
    definitions,
  });
  assert.equal(state.players.k.trueNameRevealed, true);
  assert.equal(state.cards.chaos.active, false);
  assert.equal(state.cards.chaos.zone, "servant-skills");
});

test("破坏工作按回合顺位逐人私有选择策，并允许技能牌被该效果暗置", () => {
  const state = stateOf("kotarou-plant", ["k", "o"]);
  state.phase = "action";
  activeSkill(state, "shinobi", KOTAROU_SHINOBI_SABOTAGE_ID);
  createOwnedCardInstance(state, "k", { instanceId: "k-skill", definitionId: "servant.kotarou.skill.sc-kotarou-1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "o-card", definitionId: weakPloy.id, zone: "hand", face: "down", active: false });
  let decision;
  built.skills.execute(state, "k", KOTAROU_SHINOBI_SABOTAGE_ID,
    { abilityId: "shinobi-plant-ploys" }, (value) => { decision = value; }, () => 0, definitions);
  assert.deepEqual(decision.chooserPlayerIds, ["k"]);
  assert.deepEqual(decision.options.map((option) => option.id), ["k-skill"]);
  const firstFrame = state.effectQueue.shift();
  resolveKotarouDecision({
    state, player: state.players.k, skill: built.skills.get(KOTAROU_SHINOBI_SABOTAGE_ID), definitions,
    payload: { previous: firstFrame.payload, decision: { status: "resolved", selections: ["k-skill"] } },
    openDecision: (value) => { decision = value; },
  });
  assert.equal(state.cards["k-skill"].face, "down");
  assert.equal(state.cards["k-skill"].zone, "attack");
  assert.deepEqual(decision.chooserPlayerIds, ["o"]);
  assert.deepEqual(decision.options.map((option) => option.id), ["o-card"]);
});

test("破坏工作战斗时激活策，以实际威力比较偷取战果并弃置所有策；没有策视为0", () => {
  const state = stateOf("kotarou-resolve", ["k", "o", "n"]);
  activeSkill(state, "shinobi", KOTAROU_SHINOBI_SABOTAGE_ID);
  createOwnedCardInstance(state, "k", { instanceId: "k-ploy", definitionId: strongPloy.id, zone: "attack", face: "down", active: false });
  createOwnedCardInstance(state, "o", { instanceId: "o-ploy", definitionId: weakPloy.id, zone: "attack", face: "down", active: false });
  const marker = `ploy:${KOTAROU_SHINOBI_SABOTAGE_ID}:4`;
  state.cards["k-ploy"].modifiers.push(marker);
  state.cards["o-ploy"].modifiers.push(marker);
  state.players.o.victoryPoints = 1;
  state.players.n.victoryPoints = 5;

  const result = built.skills.execute(state, "k", KOTAROU_SHINOBI_SABOTAGE_ID,
    { abilityId: "shinobi-resolve-ploys" }, () => {}, () => 0, definitions);
  assert.equal(result.ownPower, 5);
  assert.equal(result.stolen.o, 1);
  assert.equal(result.stolen.n, 2);
  assert.equal(state.players.k.victoryPoints, 8);
  assert.equal(state.players.o.victoryPoints, 0);
  assert.equal(state.players.n.victoryPoints, 3);
  for (const id of ["k-ploy", "o-ploy"]) {
    assert.equal(state.cards[id].zone, "discard");
    assert.equal(state.cards[id].active, false);
    assert.ok(!state.cards[id].modifiers.some((value) => value.startsWith("ploy:")));
  }
});
