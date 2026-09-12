import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { drawCards } from "../src/rules-core/decks.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { PassiveRuntime } from "../src/rules-core/passives.ts";
import {
  SUZUKA_HANDLER,
  SUZUKA_RESOLVE,
  SUZUKA_SUN_SHOWER_ABILITY,
  SUZUKA_SUN_SHOWER_ID,
  SUZUKA_TRICHILIOCOSM_ID,
  SUZUKA_WISE_FOX_DEFEAT_ABILITY,
  SUZUKA_WISE_FOX_ID,
  SUZUKA_WISDOM_RESOURCE,
  resolveSuzukaPackage,
  useSuzukaPackage,
} from "../src/rules-core/suzuka.ts";
import { getCustomResource, setCustomResource } from "../src/rules-core/resources.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function makeState(id = "suzuka") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "s", name: "Suzuka" }, { id: "o", name: "Opponent" }], seed: 404 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o"];
  state.players.s.servantId = "servant.suzuka";
  state.players.s.mana = 30;
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "hand", face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function context(state, skillId, payload, extra = {}) {
  return {
    state,
    player: state.players.s,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    emitEvent() {},
    ...extra,
  };
}

test("铃鹿御前三张技能整包FULL并接专用handler", () => {
  for (const id of [SUZUKA_WISE_FOX_ID, SUZUKA_SUN_SHOWER_ID, SUZUKA_TRICHILIOCOSM_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, SUZUKA_HANDLER);
    assert.ok(built.skills.hasHandler(id));
  }
  assert.equal(definitions[SUZUKA_WISE_FOX_ID].automaticDeckRecycleKeepMax, 3);
});

test("公共自动重洗边界先选择保留弃牌，再重放原命令并触发Wise Fox才智", () => {
  const cardAbilities = new CardAbilityRegistry();
  cardAbilities.register("test.draw-one", ({ state, playerId, definitions: defs }) => {
    drawCards(state, playerId, 1, () => 0, defs);
  });
  const cards = {
    ...built.cards,
    "test.draw-source": { id: "test.draw-source", name: "Draw Source", cardType: "attack", cost: 0, basePower: 0, typeLabel: "特殊", attributes: ["特殊"], cardAbilityIds: ["test.draw-one"], phases: ["action"] },
  };
  const engine = new StandardMatchEngine({ ...built, cards, cardAbilities });
  const state = makeState("suzuka-recycle-replay");
  add(state, "s", "wise", SUZUKA_WISE_FOX_ID, "servant-skills", "up", false);
  add(state, "s", "draw-source", "test.draw-source", "attack", "up", true);
  for (const [id, definitionId] of [["d1", "card.carda1"], ["d2", "card.cardb1"], ["d3", "card.carda3"], ["d4", "card.cardb3"]]) add(state, "s", id, definitionId, "discard", "up", false);

  const opened = engine.execute(state, command(state, "draw-attempt", CommandType.UseCardAbility, "s", { instanceId: "draw-source", ability: "test.draw-one" }));
  assert.equal(opened.state.pendingDecision?.kind, "automatic-deck-recycle-keep");
  assert.equal(opened.state.pendingDecision?.max, 3);
  assert.deepEqual(opened.state.players.s.discard, ["d1", "d2", "d3", "d4"]);
  assert.equal(opened.state.players.s.hand.length, 0);

  const resolved = engine.execute(opened.state, command(opened.state, "choose-kept", CommandType.ResolveDecision, "s", {
    decisionId: opened.state.pendingDecision.decisionId,
    selections: ["d3", "d4"],
  }));
  assert.equal(resolved.state.pendingDecision, null);
  assert.deepEqual(resolved.state.players.s.discard, ["d3", "d4"]);
  assert.equal(resolved.state.players.s.hand.length, 1);
  assert.equal(resolved.state.players.s.deck.length, 1);
  assert.equal(getCustomResource(resolved.state.players.s, SUZUKA_WISDOM_RESOURCE), 1);
  assert.ok(resolved.events.some((event) => event.type === "player.deck-shuffled" && event.payload.reason === "automatic-recycle"));
});

test("Wise Fox前哨花1才智令本回合无视败北", () => {
  const state = makeState("suzuka-wise-defeat");
  state.phase = "outpost";
  state.activePlayerId = "s";
  setCustomResource(state.players.s, SUZUKA_WISDOM_RESOURCE, 2);
  const result = useSuzukaPackage(context(state, SUZUKA_WISE_FOX_ID, { abilityId: SUZUKA_WISE_FOX_DEFEAT_ABILITY }));
  assert.deepEqual(result, { ignoreDefeatRound: 4 });
  assert.equal(getCustomResource(state.players.s, SUZUKA_WISDOM_RESOURCE), 1);
  assert.equal(state.players.s.flags.ignoreDefeatRound, 4);
});

test("Demonic Sun-Shower按才智上限从弃牌打出基础攻击并在战斗后洗回牌库", () => {
  const state = makeState("suzuka-sun-shower");
  setCustomResource(state.players.s, SUZUKA_WISDOM_RESOURCE, 2);
  for (const [id, definitionId] of [["b1", "card.carda1"], ["b2", "card.cardb1"], ["b3", "card.carda3"], ["b4", "card.cardb3"], ["b5", "card.carda4"]]) add(state, "s", id, definitionId, "discard", "up", false);
  let decision;
  useSuzukaPackage(context(state, SUZUKA_SUN_SHOWER_ID, { abilityId: SUZUKA_SUN_SHOWER_ABILITY }, { openDecision(value) { decision = value; } }));
  assert.equal(decision.kind, "suzuka-sun-shower");
  assert.equal(state.effectQueue[0].handlerId, SUZUKA_RESOLVE);
  const previous = state.effectQueue.shift().payload;
  const emitted = [];
  const result = resolveSuzukaPackage(context(state, SUZUKA_SUN_SHOWER_ID, {
    previous,
    decision: { status: "resolved", selections: ["wisdom:2", "b1", "b2", "b3", "b4", "b5"] },
  }, { emitEvent(type, payload) { emitted.push({ type, payload }); }, randomInt: () => 0 }));
  assert.equal(result.wisdomSpent, 2);
  assert.equal(result.playedInstanceIds.length, 5);
  assert.equal(getCustomResource(state.players.s, SUZUKA_WISDOM_RESOURCE), 0);
  assert.equal(emitted.filter((event) => event.type === "card.played").length, 5);
  state.phase = "combat";
  const settled = useSuzukaPackage(context(state, SUZUKA_SUN_SHOWER_ID, { eventType: "combat.ending", event: { round: state.round } }, { randomInt: () => 0 }));
  assert.equal(settled.returnedInstanceIds.length, 5);
  assert.equal(state.players.s.deck.length, 5);
  assert.equal(state.players.s.attack.length, 0);
});

test("Trichiliocosm每次打出永久+1消耗，弃牌含印刷4则按新消耗加威力", () => {
  const state = makeState("suzuka-trichiliocosm");
  add(state, "s", "tri", SUZUKA_TRICHILIOCOSM_ID, "attack", "up", true);
  state.cards.tri.playCount = 1;
  for (const [id, definitionId] of [["top1", "card.carda3"], ["top2", "card.carda2"], ["top3", "card.cardb2"]]) add(state, "s", id, definitionId, "deck", "down", false);
  const beforeCost = getCardPlayCost(state, definitions[SUZUKA_TRICHILIOCOSM_ID], state.players.s, state.cards.tri, definitions);
  const result = useSuzukaPackage(context(state, SUZUKA_TRICHILIOCOSM_ID, {
    eventType: "card.played",
    event: { playerId: "s", instanceId: "tri", definitionId: SUZUKA_TRICHILIOCOSM_ID },
  }));
  assert.equal(result.currentCost, beforeCost + 1);
  assert.equal(result.powerBonus, result.currentCost);
  assert.equal(state.cards.tri.costModifiers.filter((modifier) => modifier.duration === "game").length, 1);
  assert.equal(state.cards.tri.powerModifiers.at(-1).value, result.currentCost);
  assert.deepEqual(state.players.s.discard, ["top1", "top2", "top3"]);
});
