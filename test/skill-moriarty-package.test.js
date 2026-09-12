import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { attachCard, getTopAttachedCard } from "../src/rules-core/card-attachments.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { createOwnedCardInstance, restoreTemporaryCardDefinitionCopy } from "../src/rules-core/decks.ts";
import {
  MORIARTY_DYNAMICS_HANDLER,
  MORIARTY_DYNAMICS_ID,
  MORIARTY_SPIDER_HANDLER,
  MORIARTY_SPIDER_ID,
  MORIARTY_WICKED_HANDLER,
  MORIARTY_WICKED_ID,
  resolveMoriartyWickedCharisma,
  useMoriartyDynamics,
  useMoriartySpiderWeb,
  useMoriartyWickedCharisma,
} from "../src/rules-core/moriarty.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { createUsageRecord, isUsageAvailable } from "../src/rules-core/usage-limits.ts";

function setup(id, phase = "action") {
  const built = buildStandardContent(legacyContent);
  registerCoreSkillHandlers(built.skills);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Moriarty" }, { id: "o", name: "Other" }], seed: 93 });
  state.status = "playing";
  state.round = 5;
  state.phase = phase;
  state.step = "player-window";
  state.activePlayerId = "m";
  state.players.m.servantId = "servant.moriarty";
  state.players.o.servantId = "servant.test";
  state.players.m.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations = { workshop: [], mountain: ["m", "o"], city: [], scouting: [] };
  state.players.m.mana = 30;
  state.players.o.mana = 30;
  return { built, definitions, state };
}

function add(state, playerId, instanceId, definitionId, zone, options = {}) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, ...options });
}

function addCustomDefinitions(definitions) {
  definitions["card.test-enhance-host"] = {
    id: "card.test-enhance-host", name: "Test Servant Skill", cardType: "skill", isSkill: true,
    skillOwnerType: "servant", ownerDefinitionId: "servant.test", cost: 10, basePower: 2, typeLabel: "魔术", attributes: ["魔术"],
  };
  definitions["card.test-basic"] = {
    id: "card.test-basic", name: "Test Basic", cardType: "attack", basic: true, cost: 5, basePower: 4, typeLabel: "力量", attributes: ["力量"],
  };
}

test("莫里亚蒂整包 3/3 FULL 且使用专用 handler", () => {
  const { built } = setup("moriarty-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.moriarty");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(MORIARTY_WICKED_ID).handlerId, MORIARTY_WICKED_HANDLER);
  assert.equal(built.skills.get(MORIARTY_SPIDER_ID).handlerId, MORIARTY_SPIDER_HANDLER);
  assert.equal(built.skills.get(MORIARTY_DYNAMICS_ID).handlerId, MORIARTY_DYNAMICS_HANDLER);
});

test("邪智的魅力：真名公开先抽1，再将自己的基础牌实体附到该从者技能；增强继承印刷属性/威力/费用且总费用封顶12", () => {
  const { built, definitions, state } = setup("moriarty-enhance");
  addCustomDefinitions(definitions);
  const host = add(state, "o", "o:skill", "card.test-enhance-host", "attack", { face: "up", active: true });
  const basic = add(state, "m", "m:basic", "card.test-basic", "hand", { face: "down" });
  add(state, "m", "m:draw", "card.cardluck", "deck", { face: "down" });
  let decision;
  const result = useMoriartyWickedCharisma({
    state, player: state.players.m, skill: built.skills.get(MORIARTY_WICKED_ID),
    payload: { eventType: "servant.true-name-revealed", event: { playerId: "o", servantId: "servant.test" } },
    definitions, randomInt: () => 0, openDecision: (value) => { decision = value; },
  });
  assert.equal(result.enhanced, "pending");
  assert.ok(state.players.m.hand.includes("m:draw"));
  assert.ok(decision);
  const queued = state.effectQueue[0];
  resolveMoriartyWickedCharisma({
    state, player: state.players.m, skill: built.skills.get(MORIARTY_WICKED_ID), definitions,
    payload: { previous: queued.payload, decision: { status: "resolved", selections: [decision.options[0].id] } },
  });
  assert.equal(basic.zone, "attached");
  assert.equal(basic.attachedToInstanceId, host.instanceId);
  assert.equal(getTopAttachedCard(state, host.instanceId)?.instanceId, basic.instanceId);
  assert.deepEqual(new Set(getCardInstanceAttributes(host, definitions[host.definitionId], state, definitions)), new Set(["魔术", "力量"]));
  assert.equal(calculateCombatCardPower(state, state.players.o, host.instanceId, definitions), 6);
  assert.equal(getCardPlayCost(state, definitions[host.definitionId], state.players.o, host, definitions), 12);
});

test("蛛丝的尽头：同地点控制激活增强技能的对手被偷1战果；莫里亚蒂获胜后永久牌关闭", () => {
  const { built, definitions, state } = setup("moriarty-spider-debt");
  addCustomDefinitions(definitions);
  const spider = add(state, "m", "m:spider", MORIARTY_SPIDER_ID, "attack", { face: "up", active: true, residual: true });
  const host = add(state, "o", "o:skill", "card.test-enhance-host", "attack", { face: "up", active: true });
  const basic = add(state, "m", "m:basic", "card.test-basic", "hand", { face: "down" });
  attachCard(state, basic.instanceId, host.instanceId);
  host.copyTopAttachmentTraits = { sourceId: MORIARTY_WICKED_ID, maxTotalCost: 12 };
  state.players.m.victoryPoints = 2;
  state.players.o.victoryPoints = 5;
  const result = useMoriartySpiderWeb({
    state, player: state.players.m, skill: built.skills.get(MORIARTY_SPIDER_ID),
    payload: { abilityId: "debt-collection" }, definitions, openDecision: () => {},
  });
  assert.equal(result.stolen.o, 1);
  assert.equal(state.players.m.victoryPoints, 3);
  assert.equal(state.players.o.victoryPoints, 4);
  useMoriartySpiderWeb({
    state, player: state.players.m, skill: built.skills.get(MORIARTY_SPIDER_ID),
    payload: { eventType: "combat.resolved", event: { winnerIds: ["m"], locationId: "mountain" } }, definitions, openDecision: () => {},
  });
  assert.equal(spider.active, false);
});

test("蛛丝的尽头·背叛：移除自己附加的基础牌并免费直接加入自己的攻击", () => {
  const { built, definitions, state } = setup("moriarty-double-cross", "combat");
  addCustomDefinitions(definitions);
  add(state, "m", "m:spider", MORIARTY_SPIDER_ID, "attack", { face: "up", active: true, residual: true });
  const host = add(state, "o", "o:skill", "card.test-enhance-host", "servant-skills", { face: "down" });
  const basic = add(state, "m", "m:basic", "card.test-basic", "hand", { face: "down" });
  attachCard(state, basic.instanceId, host.instanceId);
  host.copyTopAttachmentTraits = { sourceId: MORIARTY_WICKED_ID, maxTotalCost: 12 };
  useMoriartySpiderWeb({
    state, player: state.players.m, skill: built.skills.get(MORIARTY_SPIDER_ID),
    payload: { abilityId: "double-cross", attachmentInstanceId: basic.instanceId }, definitions, openDecision: () => {},
  });
  assert.equal(basic.zone, "attack");
  assert.equal(basic.active, true);
  assert.equal(basic.face, "up");
  assert.equal(basic.paidCost, 0);
  assert.ok(state.players.m.attack.includes(basic.instanceId));
  assert.equal(getTopAttachedCard(state, host.instanceId), undefined);
});

test("终极犯罪：仅复制不激活的增强技能及其印刷增强，不复制 tokens/stacks；原实体本回合禁用，附加牌战后弃置", () => {
  const { built, definitions, state } = setup("moriarty-dynamics");
  addCustomDefinitions(definitions);
  const dynamics = add(state, "m", "m:dynamics", MORIARTY_DYNAMICS_ID, "attack", { face: "up", active: true });
  const host = add(state, "o", "o:skill", "card.test-enhance-host", "servant-skills", { face: "down" });
  const basic = add(state, "o", "o:basic", "card.test-basic", "hand", { face: "down" });
  attachCard(state, basic.instanceId, host.instanceId);
  host.copyTopAttachmentTraits = { sourceId: MORIARTY_WICKED_ID, maxTotalCost: 12 };
  host.powerModifiers = [{ id: "stacked-power", sourceId: "test", kind: "add", value: 99, duration: "game" }];
  host.modifiers.push("token-stack:9");
  basic.attributeOverrides = ["宝具"];

  useMoriartyDynamics({
    state, player: state.players.m, skill: built.skills.get(MORIARTY_DYNAMICS_ID),
    payload: { abilityId: "villainous-masterstroke", targetInstanceId: host.instanceId }, definitions, openDecision: () => {},
  });
  assert.equal(dynamics.definitionId, host.definitionId);
  assert.equal(dynamics.temporaryDefinitionCopy?.copiedFromInstanceId, host.instanceId);
  assert.equal(dynamics.modifiers.includes("token-stack:9"), false);
  assert.equal(dynamics.powerModifiers?.some((modifier) => modifier.value === 99) ?? false, false);
  const copiedAttrs = getCardInstanceAttributes(dynamics, definitions[dynamics.definitionId], state, definitions);
  assert.ok(copiedAttrs.includes("力量"));
  assert.ok(!copiedAttrs.includes("宝具"));
  assert.equal(getCardPlayCost(state, definitions[dynamics.definitionId], state.players.m, dynamics, definitions), 12);
  assert.ok(state.players.o.skillUseBlocks?.some((block) => block.instanceIds?.includes(host.instanceId) && block.throughRound === state.round));

  useMoriartyDynamics({
    state, player: state.players.m, skill: built.skills.get(MORIARTY_DYNAMICS_ID),
    payload: { eventType: "combat.ending", event: {} }, definitions, openDecision: () => {},
  });
  assert.equal(basic.zone, "discard");
  assert.ok(state.players.o.discard.includes(basic.instanceId));
  restoreTemporaryCardDefinitionCopy(dynamics);
  assert.equal(dynamics.definitionId, MORIARTY_DYNAMICS_ID);
  assert.equal(dynamics.copyTopAttachmentTraits, undefined);
});

test("通用 usage-limit 支持 three-per-round：同回合恰好三次，第四次不可用", () => {
  let usage;
  for (let i = 0; i < 3; i += 1) {
    assert.equal(isUsageAvailable(usage, "three-per-round", 7, "action"), true);
    usage = createUsageRecord("three-per-round", 7, "action", usage);
  }
  assert.equal(isUsageAvailable(usage, "three-per-round", 7, "action"), false);
  assert.equal(isUsageAvailable(usage, "three-per-round", 8, "action"), true);
});
