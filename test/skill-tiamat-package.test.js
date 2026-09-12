import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import { deployPlayer, movePlayerByEffect } from "../src/rules-core/board.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { getCardCostForPlayer } from "../src/rules-core/card-rules.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import {
  TIAMAT_LIFE_SEA_ID,
  TIAMAT_MOTHER_ID,
  TIAMAT_TITAN_ID,
  ensureTiamatLifeSea,
  getTiamatCardDefinitions,
  resolveLifeSeaChoice,
  resolveTiamatMotherOfAll,
  registerTiamatSkill,
  useLifeSea,
  useTiamatMotherOfAll,
} from "../src/rules-core/tiamat-skill.ts";

const built = buildStandardContent(legacyContent);
registerTiamatSkill(built.skills, new EffectRuntime());
const dynamic = getTiamatCardDefinitions();
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  ...dynamic,
  "card.test.basic-a": { id: "card.test.basic-a", name: "基础A", cardType: "attack", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.basic-b": { id: "card.test.basic-b", name: "基础B", cardType: "attack", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
};

function makeState(id) {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "p", name: "提亚马特" }, { id: "o", name: "对手" }], seed: 2041 });
  state.status = "playing";
  state.round = 4;
  state.activePlayerId = "p";
  state.players.p.masterId = "master.tiamat";
  state.players.p.mana = 20;
  return state;
}

function add(state, playerId, instanceId, definitionId, zone, active = false, face = zone === "attack" ? "up" : "down") {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active, residual: false });
}

test("提亚马特角色包三项本体技能均为 FULL，泰坦模式追加 First Folio", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.tiamat" && skill.id.startsWith("master.tiamat.skill."));
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(TIAMAT_MOTHER_ID).handlerId, "core.tiamat-mother-of-all");
  assert.deepEqual(built.skills.get(TIAMAT_TITAN_ID).faceDownAttackFollowup, {
    exactCount: 2,
    definitionId: "servant.shakespeare.skill.sc-shakespeare-3",
  });
});

test("万物之母令提亚马特没有令咒，获得令咒时改为免费将魔兽加入场上", () => {
  const state = makeState("tiamat-mother");
  state.players.p.commandSeals = 3;
  useTiamatMotherOfAll({
    state,
    player: state.players.p,
    skill: built.skills.get(TIAMAT_MOTHER_ID),
    payload: { eventType: "game.started", event: {} },
    definitions,
    openDecision: () => {},
  });
  assert.equal(state.players.p.commandSeals, 0);
  assert.ok(state.players.p.masterSkills.some((id) => state.cards[id].definitionId === TIAMAT_LIFE_SEA_ID));

  let decision;
  useTiamatMotherOfAll({
    state,
    player: state.players.p,
    skill: built.skills.get(TIAMAT_MOTHER_ID),
    payload: { eventType: "player.command-seal-gain-replaced", event: { playerId: "p", replacementSourceId: TIAMAT_MOTHER_ID, amount: 1 } },
    definitions,
    openDecision: (value) => { decision = value; },
  });
  assert.equal(decision.kind, "tiamat-beast");
  const selected = decision.options[0].id;
  resolveTiamatMotherOfAll({
    state,
    player: state.players.p,
    skill: built.skills.get(TIAMAT_MOTHER_ID),
    definitions,
    payload: { previous: { stage: "beast-choice", count: 1, candidates: decision.options.map((option) => option.id) }, decision: { status: "resolved", selections: [selected] } },
  });
  const beast = state.players.p.attack.map((id) => state.cards[id]).find((card) => card.definitionId === selected);
  assert.ok(beast?.active);
  assert.equal(beast?.playedRound, undefined);
  assert.equal(state.players.p.commandSeals, 0);
});

test("生命之海只在前哨阶段由激活实体关闭后打出并支付所选魔兽费用", () => {
  const state = makeState("tiamat-sea");
  state.phase = "outpost";
  ensureTiamatLifeSea(state, "p");
  const seaId = state.players.p.masterSkills.find((id) => state.cards[id].definitionId === TIAMAT_LIFE_SEA_ID);
  movePlayerCard(state, "p", seaId, "attack");
  state.cards[seaId].face = "up";
  state.cards[seaId].active = true;
  state.cards[seaId].residual = true;
  let decision;
  useLifeSea({ state, player: state.players.p, skill: built.skills.get(TIAMAT_LIFE_SEA_ID), definitions, openDecision: (value) => { decision = value; } });
  assert.equal(state.cards[seaId].active, false);
  const selected = "master.tiamat.beast.magic-pig";
  assert.ok(decision.options.some((option) => option.id === selected));
  const events = [];
  resolveLifeSeaChoice({
    state,
    player: state.players.p,
    skill: built.skills.get(TIAMAT_LIFE_SEA_ID),
    definitions,
    emitEvent: (type, payload) => { events.push({ type, payload }); },
    payload: { previous: { stage: "beast-choice", count: 1, candidates: decision.options.map((option) => option.id) }, decision: { status: "resolved", selections: [selected] } },
  });
  const beast = state.players.p.attack.map((id) => state.cards[id]).find((card) => card.definitionId === selected);
  assert.ok(beast?.active);
  assert.equal(beast?.paidCost, 1);
  assert.equal(state.players.p.mana, 19);
  assert.ok(events.some((event) => event.type === "card.played" && event.payload.definitionId === selected));
});

test("泰坦模式禁止进入工房，并使基础攻击费用+3、威力+5", () => {
  const state = makeState("tiamat-titan-rules");
  state.phase = "outpost";
  add(state, "p", "titan", TIAMAT_TITAN_ID, "master-skills", false, "up");
  assert.throws(() => deployPlayer(state, "p", "workshop", definitions), /DEPLOYMENT_DESTINATION_FORBIDDEN_BY_RULE/);
  deployPlayer(state, "p", "mountain", definitions);
  assert.throws(() => movePlayerByEffect(state, "p", "workshop", definitions), /MOVEMENT_DESTINATION_FORBIDDEN_BY_RULE/);

  add(state, "p", "basic", "card.test.basic-a", "hand");
  assert.equal(getCardCostForPlayer(state, "p", state.cards.basic, definitions), 3);
  movePlayerCard(state, "p", "basic", "attack");
  state.cards.basic.face = "up";
  state.cards.basic.active = true;
  assert.equal(calculateCombatCardPower(state, state.players.p, "basic", definitions, "mountain"), 7);
});

test("泰坦模式无视原始之龙的基础牌禁打，且原始之龙只强化实际满足费用的单张攻击", () => {
  const state = makeState("tiamat-titan-dragon");
  state.phase = "action";
  state.step = "play-batch-draft";
  state.players.p.locationId = "mountain";
  state.board.locations.mountain = ["p"];
  add(state, "p", "titan", TIAMAT_TITAN_ID, "master-skills", false, "up");
  add(state, "p", "dragon", "master.tiamat.beast.primitive-dragon", "attack", true, "up");
  add(state, "p", "a", "card.test.basic-a", "hand");
  add(state, "p", "b", "card.test.basic-b", "hand");
  const result = commitStandardAttack(state, "p", ["a", "b"], [], definitions);
  assert.equal(result.paidMana, 6);
  assert.equal(calculateCombatCardPower(state, state.players.p, "a", definitions, "mountain"), 9);
  assert.equal(calculateCombatCardPower(state, state.players.p, "b", definitions, "mountain"), 9);
  assert.equal(Number(state.players.p.flags.roundPowerBonus ?? 0), 0);
});

test("泰坦模式可暗置两张牌并将 First Folio 直接加入攻击，不把追加牌误记为打出", () => {
  const state = makeState("tiamat-titan-folio");
  state.phase = "action";
  state.step = "play-batch-draft";
  state.players.p.locationId = "mountain";
  state.board.locations.mountain = ["p"];
  add(state, "p", "titan", TIAMAT_TITAN_ID, "master-skills", false, "up");
  add(state, "p", "a", "card.test.basic-a", "hand");
  add(state, "p", "b", "card.test.basic-b", "hand");
  const result = commitStandardAttack(state, "p", [], ["a", "b"], definitions, { useFaceDownAttackFollowup: true });
  const folioId = result.committed.find((id) => state.cards[id].definitionId === "servant.shakespeare.skill.sc-shakespeare-3");
  assert.ok(folioId);
  assert.equal(state.cards[folioId].face, "up");
  assert.equal(state.cards[folioId].active, true);
  assert.equal(state.cards[folioId].joinedAttackRound, state.round);
  assert.equal(state.cards[folioId].playedRound, undefined);
  assert.equal(state.cards[folioId].playCount, undefined);
  assert.equal(state.players.p.trueNameRevealed, false);
});
