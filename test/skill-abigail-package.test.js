import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers, useOuterGodLife } from "../src/rules-core/skill-handlers.ts";
import {
  ABIGAIL_FOREIGNER_CLASS_ID,
  ABIGAIL_GATE_ID,
  ABIGAIL_WITCHING_HOUR_ID,
  ABIGAIL_WITCH_TRIAL_ID,
  resolveAbigailGateToNowhere,
  useAbigailGateToNowhere,
  useAbigailWitchingHour,
} from "../src/rules-core/abigail.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

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
    players: [
      { id: "a", name: "Abigail" },
      { id: "o1", name: "Opponent 1" },
      { id: "o2", name: "Opponent 2" },
      { id: "w", name: "Workshop" },
    ],
    seed: 71,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.players.a.servantId = "servant.abigail";
  for (const player of Object.values(state.players)) player.mana = 20;
  putAt(state, "a", "mountain");
  putAt(state, "o1", "mountain");
  putAt(state, "o2", "mountain");
  putAt(state, "w", "workshop");
  return state;
}

function addCard(state, playerId, instanceId, definitionId, zone, face = "down", active = false) {
  createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function useSkill(state, playerId, skillId, payload, openDecision = () => {}, randomInt = () => 0, emitEvent = () => {}) {
  return built.skills.execute(state, playerId, skillId, payload, openDecision, randomInt, definitions, emitEvent);
}

function resolverContext(state, payload, emitEvent = () => {}) {
  return {
    state,
    player: state.players.a,
    skill: built.skills.get(ABIGAIL_GATE_ID),
    payload,
    definitions,
    openDecision: () => {},
    randomInt: () => 0,
    emitEvent,
  };
}

test("阿比盖尔技能包 4/4 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.abigail");
  assert.equal(skills.length, 4);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.equal(built.skills.get(ABIGAIL_GATE_ID).abilities.find((ability) => ability.id === "banish-life").requiresActiveCard, false);
  assert.equal(built.skills.get(ABIGAIL_GATE_ID).abilities.find((ability) => ability.id === "open-gate").requiresActiveCard, true);
});

test("理智丧失向同地点所有对手分发阿比盖尔领域外生命并累计X", () => {
  const state = makeState("abigail-creeping-dread");
  addCard(state, "a", "witching", ABIGAIL_WITCHING_HOUR_ID, "attack", "up", true);
  const result = useSkill(state, "a", ABIGAIL_WITCHING_HOUR_ID, { abilityId: "creeping-dread" });
  assert.equal(result.createdInstanceIds.length, 2);
  assert.equal(result.dealt, 2);
  for (const playerId of ["o1", "o2"]) {
    const instanceId = state.players[playerId].hand.find((id) => state.cards[id]?.definitionId === ABIGAIL_FOREIGNER_CLASS_ID);
    assert.ok(instanceId);
    assert.equal(state.cards[instanceId].ownerPlayerId, playerId);
    assert.equal(state.cards[instanceId].createdByPlayerId, "a");
  }
  assert.equal(state.players.w.hand.some((id) => state.cards[id]?.definitionId === ABIGAIL_FOREIGNER_CLASS_ID), false);
});

test("于深渊化作光仅在打出瞬间X恰为12时立即获胜", () => {
  const state = makeState("abigail-witching-win");
  state.players.a.flags.abigailWitchingHourDealtCount = 12;
  const events = [];
  useAbigailWitchingHour({
    state,
    player: state.players.a,
    skill: built.skills.get(ABIGAIL_WITCHING_HOUR_ID),
    payload: { eventType: "card.played", event: { playerId: "a", definitionId: ABIGAIL_WITCHING_HOUR_ID } },
    definitions,
    openDecision: () => {},
    randomInt: () => 0,
    emitEvent: (type, payload) => events.push({ type, payload }),
  });
  assert.equal(state.status, "finished");
  assert.deepEqual(state.modeState.instantVictoryIds, ["a"]);
  assert.equal(events.at(-1).type, "game.finished");

  const state13 = makeState("abigail-witching-no-win");
  state13.players.a.flags.abigailWitchingHourDealtCount = 13;
  useAbigailWitchingHour({
    state: state13,
    player: state13.players.a,
    skill: built.skills.get(ABIGAIL_WITCHING_HOUR_ID),
    payload: { eventType: "card.played", event: { playerId: "a", definitionId: ABIGAIL_WITCHING_HOUR_ID } },
    definitions,
    openDecision: () => {}, randomInt: () => 0, emitEvent: () => {},
  });
  assert.equal(state13.status, "playing");
});

test("魔女审判只让交战对手随机弃牌，按最多领域外生命并列败北并全部收归阿比盖尔弃牌堆", () => {
  const state = makeState("abigail-witch-trial");
  state.phase = "combat";
  state.players.a.trueNameRevealed = true;
  addCard(state, "a", "trial", ABIGAIL_WITCH_TRIAL_ID, "attack", "up", true);
  addCard(state, "o1", "life-o1-a", ABIGAIL_FOREIGNER_CLASS_ID, "discard", "up", false);
  addCard(state, "o2", "life-o2-a", ABIGAIL_FOREIGNER_CLASS_ID, "discard", "up", false);
  addCard(state, "o1", "life-o1-hand", ABIGAIL_FOREIGNER_CLASS_ID, "hand");
  addCard(state, "o2", "life-o2-hand", ABIGAIL_FOREIGNER_CLASS_ID, "hand");
  addCard(state, "a", "abigail-hand", ABIGAIL_FOREIGNER_CLASS_ID, "hand");

  const result = useSkill(state, "a", ABIGAIL_WITCH_TRIAL_ID, { abilityId: "silver-key" }, () => {}, () => 0);
  assert.equal(state.players.a.trueNameRevealed, false);
  assert.deepEqual(new Set(result.defeatedPlayerIds), new Set(["o1", "o2"]));
  assert.equal(state.players.o1.defeated, true);
  assert.equal(state.players.o2.defeated, true);
  assert.equal(result.transferredInstanceIds.length, 4);
  for (const instanceId of result.transferredInstanceIds) {
    assert.ok(state.players.a.discard.includes(instanceId));
    assert.equal(state.cards[instanceId].ownerPlayerId, "a");
  }
  assert.ok(state.players.a.hand.includes("abigail-hand"));
});

test("Gate被动/行动能力无需激活：移除手牌领域外生命后获得2魔力", () => {
  const state = makeState("abigail-gate-banish");
  state.players.a.mana = 3;
  addCard(state, "a", "gate", ABIGAIL_GATE_ID, "servant-skills", "up", false);
  addCard(state, "a", "life-hand", ABIGAIL_FOREIGNER_CLASS_ID, "hand");
  const result = useSkill(state, "a", ABIGAIL_GATE_ID, { abilityId: "banish-life" });
  assert.equal(result.instanceId, "life-hand");
  assert.equal(state.cards["life-hand"].zone, "removed");
  assert.equal(state.players.a.mana, 5);
});

test("Gate从弃牌堆任意数量真实付费打出，并在战斗阶段末优先洗回牌库而非被领域外生命自身回收", () => {
  const state = makeState("abigail-gate-play-cleanup");
  state.players.a.mana = 10;
  addCard(state, "a", "gate", ABIGAIL_GATE_ID, "attack", "up", true);
  addCard(state, "a", "life-d1", ABIGAIL_FOREIGNER_CLASS_ID, "discard", "up", false);
  addCard(state, "a", "life-d2", ABIGAIL_FOREIGNER_CLASS_ID, "discard", "up", false);
  let decision;
  const result = useSkill(state, "a", ABIGAIL_GATE_ID, { abilityId: "open-gate" }, (value) => { decision = value; });
  assert.equal(result.pending, true);
  assert.equal(decision.min, 0);
  assert.equal(decision.max, 2);
  const previous = state.effectQueue[0].payload;
  const events = [];
  const resolved = resolveAbigailGateToNowhere(resolverContext(state, {
    previous,
    decision: { status: "resolved", selections: ["life-d1", "life-d2"] },
  }, (type, payload) => events.push({ type, payload })));
  assert.equal(resolved.played.length, 2);
  assert.equal(state.players.a.mana, 8);
  assert.ok(state.players.a.attack.includes("life-d1"));
  assert.ok(state.players.a.attack.includes("life-d2"));
  assert.equal(state.players.a.trueNameRevealed, true);
  assert.equal(events.filter((event) => event.type === "card.played").length, 2);

  state.phase = "combat";
  state.activePlayerId = "a";
  useOuterGodLife({
    state,
    player: state.players.a,
    skill: built.skills.get(ABIGAIL_FOREIGNER_CLASS_ID),
    payload: {}, definitions, openDecision: () => {}, randomInt: () => 0, emitEvent: () => {},
  });
  assert.equal(state.players.a.flags["outerGodLifeReturn:life-d1"], `${state.round}|a`);
  useOuterGodLife({
    state,
    player: state.players.a,
    skill: built.skills.get(ABIGAIL_FOREIGNER_CLASS_ID),
    payload: { eventType: "combat.resolved" }, definitions, openDecision: () => {}, randomInt: () => 0, emitEvent: () => {},
  });
  assert.ok(state.players.a.attack.includes("life-d1"));

  const cleanup = useAbigailGateToNowhere({
    state,
    player: state.players.a,
    skill: built.skills.get(ABIGAIL_GATE_ID),
    payload: { eventType: "combat.ending" }, definitions, openDecision: () => {}, randomInt: () => 0, emitEvent: () => {},
  });
  assert.deepEqual(new Set(cleanup.shuffledInstanceIds), new Set(["life-d1", "life-d2"]));
  assert.ok(state.players.a.deck.includes("life-d1"));
  assert.ok(state.players.a.deck.includes("life-d2"));
  assert.equal(state.players.a.discard.includes("life-d1"), false);
  assert.equal(state.players.a.flags.outerGodLifeDeckCleanupRound, undefined);
  assert.equal(state.players.a.flags["outerGodLifeReturn:life-d1"], undefined);
});
