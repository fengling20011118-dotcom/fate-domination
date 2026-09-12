import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  BAOBHAN_FETCH_FAILNAUGHT_HANDLER,
  BAOBHAN_FETCH_FAILNAUGHT_ID,
  BAOBHAN_FETCH_FAILNAUGHT_RESOLVE,
  BAOBHAN_PART_COLLECTOR_HANDLER,
  BAOBHAN_PART_COLLECTOR_ID,
  BAOBHAN_PART_COLLECTOR_RESOLVE,
  getBaobhanFetches,
  getBaobhanPartCollectorCandidates,
  resolveBaobhanFetchFailnaught,
  resolveBaobhanPartCollector,
  useBaobhanFetchFailnaught,
  useBaobhanPartCollector,
} from "../src/rules-core/baobhan.ts";
import { ODYSSEUS_TROIA_HANDLER } from "../src/rules-core/odysseus.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const partSkill = built.skills.get(BAOBHAN_PART_COLLECTOR_ID);
const failnaughtSkill = built.skills.get(BAOBHAN_FETCH_FAILNAUGHT_ID);

function fresh(id = "baobhan") {
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "b", name: "Baobhan Sith" },
      { id: "t", name: "Target" },
      { id: "x", name: "Other" },
    ],
    seed: 411,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "b";
  state.players.b.servantId = "servant.baobhan";
  state.players.b.mana = 10;
  state.players.t.mana = 10;
  state.players.x.mana = 10;
  return state;
}

function putPlayer(state, playerId, locationId) {
  for (const occupants of Object.values(state.board.locations)) {
    const index = occupants.indexOf(playerId);
    if (index >= 0) occupants.splice(index, 1);
  }
  state.board.locations[locationId].push(playerId);
  state.players[playerId].locationId = locationId;
}

function activeSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "b", {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
  });
  return state.cards[instanceId];
}

function activeAttack(state, playerId, instanceId, definitionId) {
  createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone: "attack",
    face: "up",
    active: true,
  });
  return state.cards[instanceId];
}

function armPartCollector(state, selections) {
  let opened;
  useBaobhanPartCollector({
    state,
    player: state.players.b,
    skill: partSkill,
    payload: { abilityId: "part-collector" },
    definitions,
    openDecision: (decision) => { opened = decision; },
  });
  assert.ok(opened);
  const frame = state.effectQueue.shift();
  resolveBaobhanPartCollector({
    state,
    player: state.players.b,
    skill: partSkill,
    payload: { previous: frame.payload, decision: { status: "resolved", selections } },
    definitions,
    openDecision: () => {},
  });
  return opened;
}

function createWorkshopFetch(state, targetId = "t") {
  putPlayer(state, "b", "workshop");
  putPlayer(state, targetId, "workshop");
  activeSkill(state, "b:part", BAOBHAN_PART_COLLECTOR_ID);
  armPartCollector(state, [targetId]);
  useBaobhanPartCollector({
    state,
    player: state.players.b,
    skill: partSkill,
    payload: { eventType: "combat.ending", event: { round: state.round } },
    definitions,
    openDecision: () => {},
  });
  return getBaobhanFetches(state, "b").find((fetch) => fetch.targetPlayerId === targetId);
}

test("Baobhan Sith package is 3/3 FULL and passive/decision handlers are runtime-registered", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.baobhan");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(partSkill.handlerId, BAOBHAN_PART_COLLECTOR_HANDLER);
  assert.equal(failnaughtSkill.handlerId, BAOBHAN_FETCH_FAILNAUGHT_HANDLER);

  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  assert.equal(effects.has(BAOBHAN_PART_COLLECTOR_HANDLER), true);
  assert.equal(effects.has(BAOBHAN_PART_COLLECTOR_RESOLVE), true);
  assert.equal(effects.has(BAOBHAN_FETCH_FAILNAUGHT_HANDLER), true);
  assert.equal(effects.has(BAOBHAN_FETCH_FAILNAUGHT_RESOLVE), true);
  assert.equal(effects.has(ODYSSEUS_TROIA_HANDLER), true, "Odysseus passive handler must also be executable through EffectRuntime");
});

test("Part Collector can create multiple Workshop Fetches from current total power and excludes players whose Fetch already exists", () => {
  const state = fresh("baobhan-workshop");
  putPlayer(state, "b", "workshop");
  putPlayer(state, "t", "workshop");
  putPlayer(state, "x", "workshop");
  activeSkill(state, "b:part", BAOBHAN_PART_COLLECTOR_ID);
  activeAttack(state, "t", "t:luck", "card.cardluck");
  activeAttack(state, "x", "x:surveil", "card.cardsurveil");

  const opened = armPartCollector(state, ["t", "x"]);
  assert.equal(opened.min, 0);
  assert.equal(opened.max, 2);
  const created = useBaobhanPartCollector({
    state,
    player: state.players.b,
    skill: partSkill,
    payload: { eventType: "combat.ending", event: { round: state.round } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(created.length, 2);
  const fetches = getBaobhanFetches(state, "b");
  assert.deepEqual(fetches.map((fetch) => [fetch.targetPlayerId, fetch.power]).sort(), [["t", 4], ["x", 3]]);

  state.round += 1;
  assert.deepEqual(getBaobhanPartCollectorCandidates(state, "b"), []);
});

test("Part Collector uses battlefield settlement power, and leaving the armed location or Baobhan being defeated prevents creation", () => {
  const battlefield = fresh("baobhan-battlefield");
  putPlayer(battlefield, "b", "city");
  putPlayer(battlefield, "t", "city");
  putPlayer(battlefield, "x", "mountain");
  activeSkill(battlefield, "b:part", BAOBHAN_PART_COLLECTOR_ID);
  activeAttack(battlefield, "t", "t:luck", "card.cardluck");
  armPartCollector(battlefield, ["t"]);
  useBaobhanPartCollector({
    state: battlefield,
    player: battlefield.players.b,
    skill: partSkill,
    payload: { eventType: "combat.resolved", event: { locationId: "city", powers: { b: 5, t: 9 }, winnerIds: ["t"] } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(getBaobhanFetches(battlefield, "b")[0].power, 9, "captured power is the settled snapshot, not a later recalculation");

  const moved = fresh("baobhan-moved");
  putPlayer(moved, "b", "workshop");
  putPlayer(moved, "t", "workshop");
  putPlayer(moved, "x", "mountain");
  activeSkill(moved, "b:part", BAOBHAN_PART_COLLECTOR_ID);
  activeAttack(moved, "t", "t:luck", "card.cardluck");
  armPartCollector(moved, ["t"]);
  putPlayer(moved, "t", "city");
  useBaobhanPartCollector({ state: moved, player: moved.players.b, skill: partSkill, payload: { eventType: "combat.ending", event: {} }, definitions, openDecision: () => {} });
  assert.equal(getBaobhanFetches(moved, "b").length, 0);

  const defeated = fresh("baobhan-defeated");
  putPlayer(defeated, "b", "workshop");
  putPlayer(defeated, "t", "workshop");
  putPlayer(defeated, "x", "mountain");
  activeSkill(defeated, "b:part", BAOBHAN_PART_COLLECTOR_ID);
  activeAttack(defeated, "t", "t:luck", "card.cardluck");
  armPartCollector(defeated, ["t"]);
  defeated.players.b.defeated = true;
  useBaobhanPartCollector({ state: defeated, player: defeated.players.b, skill: partSkill, payload: { eventType: "combat.ending", event: {} }, definitions, openDecision: () => {} });
  assert.equal(getBaobhanFetches(defeated, "b").length, 0);
});

test("Fetch Failnaught chooses exactly one shown Fetch, reaches its body across locations, requires strict greater power, and consumes the Fetch at round end", () => {
  const state = fresh("baobhan-failnaught");
  putPlayer(state, "x", "mountain");
  activeAttack(state, "t", "t:luck", "card.cardluck");
  const fetch = createWorkshopFetch(state, "t");
  assert.ok(fetch);
  assert.equal(fetch.power, 4);

  // The body is allowed to be somewhere else when Failnaught is selected/resolved.
  putPlayer(state, "t", "mountain");
  putPlayer(state, "b", "city");
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  activeSkill(state, "b:failnaught", BAOBHAN_FETCH_FAILNAUGHT_ID);
  let opened;
  useBaobhanFetchFailnaught({
    state,
    player: state.players.b,
    skill: failnaughtSkill,
    payload: { abilityId: "fetch-failnaught" },
    definitions,
    openDecision: (decision) => { opened = decision; },
  });
  assert.equal(opened.min, 1);
  assert.equal(opened.max, 1);
  assert.deepEqual(opened.options.map((option) => option.id), [fetch.id]);
  const frame = state.effectQueue.shift();
  resolveBaobhanFetchFailnaught({
    state,
    player: state.players.b,
    skill: failnaughtSkill,
    payload: { previous: frame.payload, decision: { status: "resolved", selections: [fetch.id] } },
    definitions,
    openDecision: () => {},
  });
  const shown = getBaobhanFetches(state, "b")[0];
  assert.equal(shown.revealedRound, state.round);
  assert.equal(shown.removeAtRoundEndRound, state.round);

  state.phase = "combat";
  const events = [];
  const result = useBaobhanFetchFailnaught({
    state,
    player: state.players.b,
    skill: failnaughtSkill,
    payload: { eventType: "combat.resolved", event: { locationId: "city", powers: { b: 8 }, winnerIds: ["b"] } },
    definitions,
    openDecision: () => {},
    emitEvent: (type, payload) => events.push({ type, payload }),
  });
  assert.equal(result.exceeded, true);
  assert.equal(state.players.t.defeated, true, "original body is defeated even though it is at another location");
  assert.ok(events.some((event) => event.type === "player.defeated" && event.payload.playerId === "t"));

  useBaobhanFetchFailnaught({
    state,
    player: state.players.b,
    skill: failnaughtSkill,
    payload: { eventType: "round.ending", event: { round: state.round } },
    definitions,
    openDecision: () => {},
  });
  assert.equal(getBaobhanFetches(state, "b").length, 0);
});

test("Fetch Failnaught does not defeat the original player on an exact power tie", () => {
  const state = fresh("baobhan-tie");
  putPlayer(state, "b", "city");
  putPlayer(state, "t", "city");
  putPlayer(state, "x", "mountain");
  activeSkill(state, "b:part", BAOBHAN_PART_COLLECTOR_ID);
  armPartCollector(state, ["t"]);
  useBaobhanPartCollector({
    state,
    player: state.players.b,
    skill: partSkill,
    payload: { eventType: "combat.resolved", event: { locationId: "city", powers: { b: 7, t: 8 }, winnerIds: ["t"] } },
    definitions,
    openDecision: () => {},
  });
  const fetch = getBaobhanFetches(state, "b")[0];
  assert.equal(fetch.power, 8);

  state.phase = "action";
  state.activePlayerId = "b";
  activeSkill(state, "b:failnaught", BAOBHAN_FETCH_FAILNAUGHT_ID);
  let opened;
  useBaobhanFetchFailnaught({ state, player: state.players.b, skill: failnaughtSkill, payload: { abilityId: "fetch-failnaught" }, definitions, openDecision: (decision) => { opened = decision; } });
  const frame = state.effectQueue.shift();
  resolveBaobhanFetchFailnaught({ state, player: state.players.b, skill: failnaughtSkill, payload: { previous: frame.payload, decision: { status: "resolved", selections: [fetch.id] } }, definitions, openDecision: () => {} });
  state.phase = "combat";
  const result = useBaobhanFetchFailnaught({ state, player: state.players.b, skill: failnaughtSkill, payload: { eventType: "combat.resolved", event: { locationId: "city", powers: { b: 8 }, winnerIds: ["b"] } }, definitions, openDecision: () => {} });
  assert.equal(result.exceeded, false);
  assert.equal(state.players.t.defeated, false);
});
