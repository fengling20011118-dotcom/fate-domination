import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { executeStructuredGrantedCardAbility } from "../src/rules-core/card-transforms.ts";
import { getStructuredPostPowerDefeatTargetIds } from "../src/rules-core/rule-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { RYOUGI_SEVER_ID, resolveRyougiSeverLife, useRyougiSeverLife } from "../src/rules-core/ryougi.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const VOID = "master.shiki-ryougi.skill.s1b";
const GRASP = "master.shiki-ryougi.skill.s3";
const BOUNDARY = "master.shiki-ryougi.skill.ascension";

function state(id) {
  const s = createGameState({ gameInstanceId: id, players: [{ id: "r", name: "Ryougi" }, { id: "o", name: "Opponent" }], seed: 42 });
  s.status = "playing";
  s.round = 5;
  s.phase = "action";
  s.step = "play-batch-draft";
  s.activePlayerId = "r";
  s.turnOrder = ["r", "o"];
  s.players.r.masterId = "master.shiki-ryougi";
  s.players.r.mana = 30;
  s.players.o.mana = 30;
  s.players.r.locationId = "mountain";
  s.players.o.locationId = "mountain";
  s.board.locations.mountain = ["r", "o"];
  s.board.locations.city = [];
  return s;
}
function add(s, playerId, instanceId, definitionId, zone = "hand", face = "down", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}
function ctx(s, skillId, payload, openDecision = () => {}) {
  return { state: s, player: s.players.r, skill: built.skills.get(skillId), payload, definitions, openDecision };
}

test("两仪式技能包6/6 FULL且新增三张均可执行", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "master.shiki-ryougi");
  assert.equal(skills.length, 6);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("生·切断与死·紧握可同时追加，生·切断自身费用额外+2", () => {
  const s = state("ryougi-paired-cost");
  add(s, "r", "b1", "card.cardq1");
  add(s, "r", "b2", "card.carda1");
  add(s, "r", "sever", RYOUGI_SEVER_ID, "master-skills", "up", false);
  add(s, "r", "grasp", GRASP, "master-skills", "up", false);
  const before = s.players.r.mana;
  const result = commitStandardAttack(s, "r", ["b1", "b2", "sever", "grasp"], [], definitions);
  assert.equal(result.cards.find((card) => card.instanceId === "sever").paidMana, 4);
  assert.equal(result.cards.find((card) => card.instanceId === "grasp").paidMana, 1);
  assert.equal(s.players.r.mana, before - result.paidMana);
});

test("生·切断按印刷威力匹配并弃置攻击与其所有者牌库底牌", () => {
  const s = state("ryougi-sever");
  s.phase = "combat";
  s.step = "player-window";
  add(s, "r", "sever", RYOUGI_SEVER_ID, "attack", "up", true);
  add(s, "o", "target", "card.cardq1", "attack", "up", true);
  add(s, "o", "bottom", "card.carda1", "deck", "down", false);
  s.players.o.deck = ["bottom"];
  let decision;
  useRyougiSeverLife(ctx(s, RYOUGI_SEVER_ID, { abilityId: "sever-life" }, (value) => { decision = value; }));
  assert.ok(decision.options.some((option) => option.id === "target"));
  const frame = s.effectQueue[0];
  const result = resolveRyougiSeverLife(ctx(s, RYOUGI_SEVER_ID, { previous: frame.payload, decision: { status: "resolved", selections: ["target"] } }));
  assert.equal(result.matched, true);
  assert.equal(s.cards.target.zone, "discard");
  assert.equal(s.cards.bottom.zone, "discard");
});

test("虚无在战力结算后规则中令同战斗空牌库玩家败北", () => {
  const s = state("ryougi-void");
  add(s, "r", "void", VOID, "master-skills", "up", false);
  s.players.o.deck = [];
  const targets = getStructuredPostPowerDefeatTargetIds(s, ["r", "o"], { r: {}, o: {} }, definitions);
  assert.ok(targets.includes("o"));
});

test("空之境界给迅捷攻击+2并授予弃置交战玩家牌库底牌的Combat能力", () => {
  const s = state("ryougi-boundary");
  s.phase = "combat";
  s.step = "player-window";
  add(s, "r", "boundary", BOUNDARY, "master-skills", "up", false);
  add(s, "r", "agi", "card.cardq1", "attack", "up", true);
  add(s, "o", "bottom", "card.carda1", "deck", "down", false);
  s.players.o.deck = ["bottom"];
  const power = calculateCombatCardPower(s, s.players.r, "agi", definitions);
  assert.equal(power, 4);
  executeStructuredGrantedCardAbility(s, "r", "agi", "ryougi-boundary-bottom-discard", definitions, undefined, "o");
  assert.equal(s.cards.bottom.zone, "discard");
});
