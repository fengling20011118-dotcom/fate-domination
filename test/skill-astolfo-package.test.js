import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  ASTOLFO_CASSEUR_ID,
  ASTOLFO_TRAP_ID,
  resolveAstolfoCasseurDeLogistille,
  resolveAstolfoTrapOfArgalia,
  useAstolfoCasseurDeLogistille,
  useAstolfoTrapOfArgalia,
} from "../src/rules-core/astolfo.ts";

const built = buildStandardContent(legacyContent);
const definitions = {
  ...built.cards,
  ...built.skills.asCardDefinitions(),
  "card.test.str": { id: "card.test.str", name: "力量攻击", cardType: "attack", cost: 2, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.agi": { id: "card.test.agi", name: "迅捷攻击", cardType: "attack", cost: 4, basePower: 3, typeLabel: "迅捷", attributes: ["迅捷"], basic: true },
};

function makeState(id, count = 4) {
  const players = Array.from({ length: count }, (_, i) => ({ id: i === 0 ? "a" : `p${i}`, name: `P${i}` }));
  const state = createGameState({ gameInstanceId: id, players, seed: 13 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.players.a.servantId = "servant.astolfo";
  for (const id of Object.keys(state.players)) putAt(state, id, "mountain");
  return state;
}

function putAt(state, playerId, locationId) {
  for (const ids of Object.values(state.board.locations)) {
    const at = ids.indexOf(playerId); if (at >= 0) ids.splice(at, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}
function add(state, playerId, instanceId, definitionId, zone = "attack", active = true, face = "up") {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, active, face });
}

test("阿斯托尔福技能包 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.astolfo");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
});

test("一碰就倒逐张让控制者选择支付3魔力保护或关闭并返还费用+1", () => {
  const state = makeState("astolfo-trap", 3);
  add(state, "a", "trap", ASTOLFO_TRAP_ID);
  add(state, "p1", "agi", "card.test.agi");
  add(state, "p2", "str", "card.test.str");
  state.players.p1.mana = 5;
  state.players.p2.mana = 0;
  let decision;
  useAstolfoTrapOfArgalia({ state, player: state.players.a, skill: built.skills.get(ASTOLFO_TRAP_ID), definitions,
    payload: { abilityId: "forced-spiritform" }, openDecision: (d) => { decision = d; } });
  assert.equal(decision.kind, "astolfo-trap-card");
  assert.equal(decision.chooserPlayerIds[0], "p1");
  const previous = state.effectQueue[0].payload;
  resolveAstolfoTrapOfArgalia({ state, player: state.players.a, skill: built.skills.get(ASTOLFO_TRAP_ID), definitions,
    payload: { previous, decision: { status: "resolved", selections: ["pay-protect"] } }, openDecision: () => {} });
  assert.equal(state.players.p1.mana, 2);
  assert.equal(state.cards.agi.zone, "attack");
  assert.equal(state.cards.str.zone, "attack");
  assert.equal(state.cards.str.face, "down");
  assert.equal(state.cards.str.active, false);
  assert.equal(state.players.p2.mana, 3);
});

test("破咒一击由其他玩家各至多帮助1魔力，实际帮助者获得1战果", () => {
  const state = makeState("astolfo-casseur", 4);
  add(state, "a", "casseur", ASTOLFO_CASSEUR_ID);
  add(state, "p1", "target", "servant.astolfo.skill.sc-astolfo-1");
  state.players.a.mana = 2;
  state.players.p2.mana = 1;
  state.players.p3.mana = 1;
  state.players.p1.mana = 0;
  let decision;
  useAstolfoCasseurDeLogistille({ state, player: state.players.a, skill: built.skills.get(ASTOLFO_CASSEUR_ID), definitions,
    payload: { abilityId: "spellbreaker", targetInstanceId: "target" }, openDecision: (d) => { decision = d; } });
  assert.equal(decision.kind, "astolfo-casseur-help");
  const previous = state.effectQueue[0].payload;
  resolveAstolfoCasseurDeLogistille({ state, player: state.players.a, skill: built.skills.get(ASTOLFO_CASSEUR_ID), definitions,
    payload: { previous, decision: { status: "resolved", submissions: { p2: ["help"], p3: ["help"] } } }, openDecision: () => {} });
  assert.equal(state.players.a.mana, 0);
  assert.equal(state.players.p2.mana, 0);
  assert.equal(state.players.p3.mana, 0);
  assert.equal(state.players.p2.victoryPoints, 1);
  assert.equal(state.players.p3.victoryPoints, 1);
  assert.equal(state.cards.target.zone, "servant-skills");
});
