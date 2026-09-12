import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  NANAYA_DARK_COMPULSION_ID,
  NANAYA_DEATH_PERCEPTION_ID,
  NANAYA_DEMON_HUNTER_ID,
  NANAYA_FLASH_DRAW_ID,
  NANAYA_FLASH_STEP_ID,
  resolveNanayaDecision,
  useNanayaDarkCompulsion,
  useNanayaDeathPerception,
  useNanayaDemonHunter,
} from "../src/rules-core/nanaya.ts";

function setup(id = "nanaya-package") {
  const built = buildStandardContent(legacyContent);
  new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p", name: "七夜志贵" }, { id: "q", name: "对手" }],
    seed: 1489,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "p";
  state.turnOrder = ["p", "q"];
  state.players.p.masterId = "master.shiki-nanaya";
  state.players.p.mana = 20;
  state.players.p.victoryPoints = 10;
  state.players.p.locationId = "mountain";
  state.players.q.locationId = "mountain";
  state.board.locations.mountain = ["p", "q"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, state };
}

function skill(built, id) {
  return built.skills.list().find((candidate) => candidate.id === id);
}

function add(state, playerId, instanceId, definitionId, zone = "deck") {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: "down",
    active: false,
  });
}

function resolve(state, player, previous, selections, definitions, onDecision = () => undefined) {
  return resolveNanayaDecision({
    state,
    player,
    skill: { id: previous.sourceId ?? NANAYA_DEATH_PERCEPTION_ID },
    payload: { previous, decision: { status: "resolved", selections } },
    definitions,
    openDecision: onDecision,
  });
}

test("七夜志贵整包5/5 FULL且剩余三张技能使用专用处理器", () => {
  const { built } = setup("nanaya-full");
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.shiki-nanaya");
  assert.equal(skills.length, 5);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((candidate) => candidate.rules?.unmodeledClauses ?? []), []);
  assert.equal(skill(built, NANAYA_DEMON_HUNTER_ID).handlerId, "core.nanaya-demon-hunter");
  assert.equal(skill(built, NANAYA_DEATH_PERCEPTION_ID).handlerId, "core.nanaya-death-perception");
  assert.equal(skill(built, NANAYA_DARK_COMPULSION_ID).handlerId, "core.nanaya-dark-compulsion");
});

test("退魔者秘密替换至多4张原牌并遵守闪鞘/闪走各3张库存", () => {
  const { built, definitions, state } = setup("nanaya-demon-hunter");
  add(state, "p", "d1", "card.cardb1");
  add(state, "p", "d2", "card.cardq1");
  add(state, "p", "d3", "card.cardm1");
  let opened;
  useNanayaDemonHunter({
    state, player: state.players.p, skill: skill(built, NANAYA_DEMON_HUNTER_ID),
    payload: { eventType: "game.started" }, definitions,
    openDecision: (decision) => { opened = decision; },
  });
  assert.equal(opened.max, 3);

  let typeDecision;
  resolve(state, state.players.p, { stage: "replace-originals", candidates: ["d1", "d2", "d3"] }, ["d1", "d2"], definitions,
    (decision) => { typeDecision = decision; });
  assert.equal(typeDecision.min, 2);
  resolve(state, state.players.p, { stage: "replace-types", originalInstanceIds: ["d1", "d2"] }, ["draw-1", "step-1"], definitions);

  assert.equal(state.cards.d1.zone, "removed");
  assert.equal(state.cards.d2.zone, "removed");
  assert.equal(state.players.p.deck.length, 3);
  assert.equal(Object.values(state.cards).filter((card) => card.ownerPlayerId === "p" && card.definitionId === NANAYA_FLASH_DRAW_ID).length, 1);
  assert.equal(Object.values(state.cards).filter((card) => card.ownerPlayerId === "p" && card.definitionId === NANAYA_FLASH_STEP_ID).length, 1);
  assert.equal(state.players.p.flags.nanayaFlashDrawCreatedCount, 1);
  assert.equal(state.players.p.flags.nanayaFlashStepCreatedCount, 1);
});

test("直死之魔眼增加损伤，牌库顶3张可任意弃置并排序，且同一玩家不能再次捕捉", () => {
  const { built, definitions, state } = setup("nanaya-gaze");
  add(state, "q", "q1", "card.cardb1");
  add(state, "q", "q2", "card.cardq1");
  add(state, "q", "q3", "card.cardm1");
  add(state, "q", "q4", "card.carda1");

  let targetDecision;
  useNanayaDeathPerception({
    state, player: state.players.p, skill: skill(built, NANAYA_DEATH_PERCEPTION_ID),
    payload: { abilityId: "gaze-of-death" },
    openDecision: (decision) => { targetDecision = decision; },
  });
  assert.equal(state.players.p.flags.nanayaStrain, 1);
  assert.ok(targetDecision.options.some((option) => option.id === "q"));

  let discardDecision;
  resolve(state, state.players.p, { stage: "gaze-target" }, ["q"], definitions,
    (decision) => { discardDecision = decision; });
  assert.deepEqual(discardDecision.options.map((option) => option.id), ["q1", "q2", "q3"]);

  let orderDecision;
  resolve(state, state.players.p, { stage: "gaze-discard", targetPlayerId: "q", topInstanceIds: ["q1", "q2", "q3"] }, ["q2"], definitions,
    (decision) => { orderDecision = decision; });
  assert.equal(orderDecision.options.length, 2);
  resolve(state, state.players.p, { stage: "gaze-order", targetPlayerId: "q", remainingInstanceIds: ["q1", "q3"] }, ["order-1"], definitions);

  assert.equal(state.cards.q2.zone, "discard");
  assert.deepEqual(state.players.q.deck.slice(0, 3), ["q3", "q1", "q4"]);
  assert.deepEqual(state.players.p.flags.nanayaCapturedPlayerIds, ["q"]);

  let secondDecision;
  useNanayaDeathPerception({
    state, player: state.players.p, skill: skill(built, NANAYA_DEATH_PERCEPTION_ID),
    payload: { abilityId: "gaze-of-death" },
    openDecision: (decision) => { secondDecision = decision; },
  });
  assert.ok(!secondDecision.options.some((option) => option.id === "q"));
});

test("第9/11回合开始按损伤失去战果", () => {
  const { built, state } = setup("nanaya-strain");
  state.players.p.flags.nanayaStrain = 3;
  state.round = 9;
  useNanayaDeathPerception({
    state, player: state.players.p, skill: skill(built, NANAYA_DEATH_PERCEPTION_ID),
    payload: { eventType: "round.started", event: { round: 9 } }, openDecision: () => undefined,
  });
  assert.equal(state.players.p.victoryPoints, 7);
  state.round = 10;
  useNanayaDeathPerception({
    state, player: state.players.p, skill: skill(built, NANAYA_DEATH_PERCEPTION_ID),
    payload: { eventType: "round.started", event: { round: 10 } }, openDecision: () => undefined,
  });
  assert.equal(state.players.p.victoryPoints, 7);
});

test("歌月十夜解锁时洗入剩余闪卡，战斗中对已捕捉对手抽牌并真实打出，非基础牌增加损伤", () => {
  const { built, definitions, state } = setup("nanaya-dark-compulsion");
  state.players.p.flags.nanayaFlashDrawCreatedCount = 1;
  state.players.p.flags.nanayaFlashStepCreatedCount = 2;
  useNanayaDarkCompulsion({
    state, player: state.players.p, skill: skill(built, NANAYA_DARK_COMPULSION_ID), definitions,
    payload: { eventType: "skill.unlocked", event: { playerId: "p", skillId: NANAYA_DARK_COMPULSION_ID } },
    openDecision: () => undefined,
  });
  assert.equal(state.players.p.flags.nanayaFlashDrawCreatedCount, 3);
  assert.equal(state.players.p.flags.nanayaFlashStepCreatedCount, 3);
  assert.equal(Object.values(state.cards).filter((card) => card.ownerPlayerId === "p" && card.definitionId === NANAYA_FLASH_DRAW_ID).length, 2);
  assert.equal(Object.values(state.cards).filter((card) => card.ownerPlayerId === "p" && card.definitionId === NANAYA_FLASH_STEP_ID).length, 1);

  // Use a fresh known top non-basic card for the combat clause.
  const combat = setup("nanaya-dark-compulsion-play");
  combat.state.phase = "combat";
  combat.state.activePlayerId = "p";
  combat.state.players.p.flags.nanayaCapturedPlayerIds = ["q"];
  add(combat.state, "p", "flash", NANAYA_FLASH_STEP_ID);
  combat.state.players.p.flags.nanayaStrain = 1;
  useNanayaDarkCompulsion({
    state: combat.state, player: combat.state.players.p, skill: skill(combat.built, NANAYA_DARK_COMPULSION_ID), definitions: combat.definitions,
    payload: { abilityId: "dark-compulsion" }, openDecision: () => undefined,
  });
  assert.equal(combat.state.cards.flash.zone, "attack");
  assert.equal(combat.state.cards.flash.active, true);
  assert.equal(combat.state.players.p.flags.nanayaStrain, 2);
});
