import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { movePlayerByEffect } from "../src/rules-core/board.ts";
import { finishEmbeddedActionPhase } from "../src/rules-core/embedded-action.ts";
import { hasSkillAbilityReuse, consumeSkillAbilityReuse } from "../src/rules-core/ability-reuse.ts";
import { ignoresSituationNoblePhantasmBan } from "../src/rules-core/situation-replacements.ts";
import {
  HIMIKO_HANDLER,
  HIMIKO_KIDOU_ID,
  HIMIKO_MIRROR_ID,
  HIMIKO_MIRROR_SHIELD_ABILITY,
  HIMIKO_ORACLE_ABILITY,
  HIMIKO_ORACLE_ID,
  HIMIKO_SACRED_LAND_ABILITY,
  resolveHimiko,
  useHimiko,
} from "../src/rules-core/himiko.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function state(id, third = false) {
  const players = [{ id: "h", name: "Himiko" }, { id: "o", name: "Opponent" }];
  if (third) players.push({ id: "x", name: "Third" });
  const s = createGameState({ gameInstanceId: id, players, seed: 25 });
  s.status = "playing";
  s.round = 4;
  s.phase = "outpost";
  s.step = "player-window";
  s.activePlayerId = "h";
  s.turnOrder = third ? ["h", "o", "x"] : ["h", "o"];
  s.players.h.servantId = "servant.himiko";
  s.players.h.locationId = "mountain";
  s.players.o.locationId = "city";
  s.board.locations.mountain = ["h"];
  s.board.locations.city = ["o"];
  if (third) {
    s.players.x.locationId = "city";
    s.board.locations.city.push("x");
  }
  return s;
}

function add(s, playerId, instanceId, definitionId, zone = "attack", face = "up", active = true) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(s, skillId, payload, extras = {}) {
  return {
    state: s,
    player: s.players.h,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision: () => {},
    emitEvent: () => {},
    randomInt: () => 0,
    ...extras,
  };
}

function resolve(s, previous, selections, extras = {}) {
  return resolveHimiko(ctx(s, HIMIKO_ORACLE_ID, {
    previous,
    decision: { status: "resolved", selections },
  }, extras));
}

test("卑弥呼三张技能均闭合为专用FULL handler", () => {
  for (const id of [HIMIKO_ORACLE_ID, HIMIKO_KIDOU_ID, HIMIKO_MIRROR_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, HIMIKO_HANDLER);
    assert.ok(built.skills.hasHandler(id));
  }
});

test("光之神谕由卑弥呼选模式/对手、由该对手选后果；地点禁止走公共移动规则", () => {
  const s = state("himiko-oracle-location");
  let outer;
  useHimiko(ctx(s, HIMIKO_ORACLE_ID, { abilityId: HIMIKO_ORACLE_ABILITY }, { openDecision(value) { outer = value; } }));
  assert.ok(outer.options.some((option) => option.id === "location:o"));
  const outerFrame = s.effectQueue.shift();
  let inner;
  resolve(s, outerFrame.payload, ["location:o"], { openDecision(value) { inner = value; } });
  assert.deepEqual(inner.chooserPlayerIds, ["o"]);
  const innerFrame = s.effectQueue.shift();
  resolve(s, innerFrame.payload, ["block-location"]);
  assert.throws(() => movePlayerByEffect(s, "o", "mountain", definitions), /FORBIDDEN|forbidden/i);
});

test("光之神谕的立即行动使用通用嵌入Action并能恢复被打断的前哨窗口", () => {
  const s = state("himiko-oracle-action");
  s.modeState.phaseStartPlayerId = "h";
  let outer;
  useHimiko(ctx(s, HIMIKO_ORACLE_ID, { abilityId: HIMIKO_ORACLE_ABILITY }, { openDecision(value) { outer = value; } }));
  const outerFrame = s.effectQueue.shift();
  let inner;
  resolve(s, outerFrame.payload, ["power:o"], { openDecision(value) { inner = value; } });
  assert.deepEqual(inner.chooserPlayerIds, ["o"]);
  const innerFrame = s.effectQueue.shift();
  resolve(s, innerFrame.payload, ["immediate-action"]);
  assert.equal(s.phase, "action");
  assert.equal(s.activePlayerId, "o");
  const embedded = s.modeState.embeddedPhaseSequence;
  assert.equal(embedded.actionOnly, true);
  finishEmbeddedActionPhase(s, embedded);
  assert.equal(s.phase, "outpost");
  assert.equal(s.step, "player-window");
  assert.equal(s.activePlayerId, "h");
  assert.equal(s.players.o.flags.actionTakenEarlyRound, s.round);
  assert.equal(s.players.o.flags.outpostTakenEarlyRound, undefined);
});

test("鬼道·镜之盾将战斗中一张激活攻击威力减半并向下取整", () => {
  const s = state("himiko-mirror-shield");
  s.phase = "action";
  s.board.locations.mountain = ["h", "o"];
  s.board.locations.city = [];
  s.players.o.locationId = "mountain";
  add(s, "h", "kidou", HIMIKO_KIDOU_ID);
  const odd = Object.values(definitions).find((definition) => definition.cardType === "attack" && definition.basic === true && definition.basePower === 5);
  assert.ok(odd);
  add(s, "o", "odd", odd.id);
  assert.equal(calculateCombatCardPower(s, s.players.o, "odd", definitions, "mountain"), 5);
  let decision;
  useHimiko(ctx(s, HIMIKO_KIDOU_ID, { abilityId: HIMIKO_MIRROR_SHIELD_ABILITY }, { openDecision(value) { decision = value; } }));
  assert.ok(decision.options.some((option) => option.id === "odd"));
  const frame = s.effectQueue.shift();
  resolveHimiko(ctx(s, HIMIKO_KIDOU_ID, { previous: frame.payload, decision: { status: "resolved", selections: ["odd"] } }));
  assert.equal(calculateCombatCardPower(s, s.players.o, "odd", definitions, "mountain"), 2);
});

test("鬼道·圣洁之土准确武装下一回合的地利翻倍与局势宝具禁用豁免", () => {
  const s = state("himiko-sacred-land");
  s.phase = "combat";
  add(s, "h", "kidou", HIMIKO_KIDOU_ID);
  const result = useHimiko(ctx(s, HIMIKO_KIDOU_ID, { abilityId: HIMIKO_SACRED_LAND_ABILITY }));
  assert.equal(result.round, 5);
  assert.equal(s.players.h.flags.terrainAdvantageContributionMultiplierRound, 5);
  assert.equal(s.players.h.flags.terrainAdvantageContributionMultiplier, 2);
  assert.equal(s.players.h.flags.situationNoblePhantasmBanIgnoreRound, 5);
  s.round = 5;
  s.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  assert.equal(ignoresSituationNoblePhantasmBan(s, s.players.h), true);
});

test("久远镜为下回合光之神谕精确提供2次额外重用，并启用同玩家同模式不可重复", () => {
  const s = state("himiko-eternal-mirror", true);
  const armed = useHimiko(ctx(s, HIMIKO_MIRROR_ID, {
    eventType: "card.played", event: { playerId: "h", definitionId: HIMIKO_MIRROR_ID, face: "up" },
  }));
  assert.deepEqual(armed, { round: 5, extraOracleUses: 2 });
  s.round = 5;
  assert.equal(hasSkillAbilityReuse(s.players.h, 5, HIMIKO_ORACLE_ID, HIMIKO_ORACLE_ABILITY), true);
  assert.equal(s.players.h.abilityReuseGrants[0].remainingUses, 2);
  assert.equal(consumeSkillAbilityReuse(s.players.h, 5, HIMIKO_ORACLE_ID, HIMIKO_ORACLE_ABILITY), true);
  assert.equal(s.players.h.abilityReuseGrants[0].remainingUses, 1);
  assert.equal(consumeSkillAbilityReuse(s.players.h, 5, HIMIKO_ORACLE_ID, HIMIKO_ORACLE_ABILITY), true);
  assert.equal(hasSkillAbilityReuse(s.players.h, 5, HIMIKO_ORACLE_ID, HIMIKO_ORACLE_ABILITY), false);

  let outer;
  useHimiko(ctx(s, HIMIKO_ORACLE_ID, { abilityId: HIMIKO_ORACLE_ABILITY }, { openDecision(value) { outer = value; } }));
  const frame = s.effectQueue.shift();
  let inner;
  resolve(s, frame.payload, ["location:o"], { openDecision(value) { inner = value; } });
  const response = s.effectQueue.shift();
  resolve(s, response.payload, ["steal-vp"]);
  let nextOuter;
  useHimiko(ctx(s, HIMIKO_ORACLE_ID, { abilityId: HIMIKO_ORACLE_ABILITY }, { openDecision(value) { nextOuter = value; } }));
  assert.equal(nextOuter.options.some((option) => option.id === "location:o"), false);
  assert.equal(nextOuter.options.some((option) => option.id === "power:o"), true);
});
