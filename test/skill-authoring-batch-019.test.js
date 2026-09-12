import test from "node:test";
import assert from "node:assert/strict";

import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import authoringContent from "../src/content/authoring/cards.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createEvent } from "../src/match-engine/events.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

const IDS = [
  "servant.siegfried.skill.sc-siegfried-2",
  "servant.kama.skill.sc-kama-2",
  "servant.albion.skill.sc-albion-2",
  "servant.leonidas.skill.sc-leonidas-1",
];

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function activateSkillCard(state, playerId, skillId, { residual = false } = {}) {
  const instanceId = `${playerId}:${skillId}:active`;
  createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
    residual,
  });
  return instanceId;
}

function basicDefinition(id) {
  return { id, name: id, cost: 0, basePower: 1, typeLabel: "test", basic: true };
}

function legacySkillMap() {
  const result = new Map();
  for (const owner of legacyContent.servants ?? []) {
    for (const skill of owner.skills ?? []) result.set(skill.id, skill);
  }
  for (const owner of legacyContent.masters ?? []) {
    for (const skill of owner.skills ?? []) result.set(skill.id, skill);
  }
  return result;
}

test("batch019 authoring JSON preserves canonical source text and compiles to the generic structured handler", () => {
  const source = legacySkillMap();
  const built = buildStandardContent(legacyContent);
  const batchCards = authoringContent.skillCards.filter((card) => IDS.includes(card.id));
  assert.equal(batchCards.length, IDS.length);
  for (const card of batchCards) {
    assert.equal(card.printedText, source.get(card.id)?.text);
    assert.equal(card.name, source.get(card.id)?.name);
    assert.ok(card.abilities.length > 0);
    for (const ability of card.abilities) assert.ok(ability.printedClause.length > 0);

    const skill = built.skills.get(card.id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, "core.structured-skill");
    assert.equal(skill.rules?.schemaVersion, "fd-card-authoring-v1");
  }
});

test("structured movement emits player.moved as an authoritative event", () => {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "batch019-structured-move-event",
    players: [{ id: "kirei", name: "kirei" }, { id: "other", name: "other" }],
    seed: 1901,
  });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "kirei";
  state.players.kirei.masterId = "master.kirei";
  state.players.kirei.flags.kireiRole = "overseer";
  state.players.kirei.locationId = "mountain";
  state.players.kirei.mana = 2;
  state.players.other.locationId = "mountain";
  state.board.locations.mountain = ["kirei", "other"];

  const result = engine.execute(state, command(state, "batch019-kirei-move", CommandType.UseSkill, "kirei", {
    skillId: "master.kirei.skill.s2",
    data: { abilityId: "neutral-move" },
  }));

  assert.equal(result.state.players.kirei.locationId, "scouting");
  const moved = result.events.find((event) => event.type === "player.moved");
  assert.ok(moved);
  assert.deepEqual(moved.payload, {
    playerId: "kirei",
    previousLocationId: "mountain",
    locationId: "scouting",
    distance: 2,
    cost: 0,
  });
  assert.equal(result.state.players.kirei.flags.movementDistanceThisRound, 2);
});

test("Siegfried armor closes through the generic player.moved passive pipeline", () => {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "batch019-siegfried",
    players: [{ id: "sieg", name: "sieg" }, { id: "mover", name: "mover" }],
    seed: 1902,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "mover";
  state.players.sieg.servantId = "servant.siegfried";
  state.players.sieg.trueNameRevealed = true;
  state.players.sieg.locationId = "city";
  state.players.mover.locationId = "mountain";
  state.players.mover.mana = 4;
  state.board.locations.city = ["sieg"];
  state.board.locations.mountain = ["mover"];
  const sourceId = activateSkillCard(state, "sieg", "servant.siegfried.skill.sc-siegfried-2");

  const result = engine.execute(state, command(state, "batch019-sieg-enter", CommandType.MovePlayer, "mover", { locationId: "city" }));

  assert.equal(result.state.cards[sourceId].active, false);
  assert.equal(result.state.cards[sourceId].zone, "servant-skills");
  assert.ok(result.state.players.sieg.servantSkills.includes(sourceId));
});

test("Kama residual transfers actual victory points and closes on the recorded round end", () => {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "batch019-kama",
    players: [{ id: "kama", name: "kama" }, { id: "mover", name: "mover" }],
    seed: 1903,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "mover";
  state.players.kama.servantId = "servant.kama";
  state.players.kama.locationId = "mountain";
  state.players.kama.victoryPoints = 0;
  state.players.mover.locationId = "workshop";
  state.players.mover.victoryPoints = 2;
  state.players.mover.mana = 8;
  state.board.locations.mountain = ["kama"];
  state.board.locations.workshop = ["mover"];
  const sourceId = activateSkillCard(state, "kama", "servant.kama.skill.sc-kama-2", { residual: true });

  const moved = engine.execute(state, command(state, "batch019-kama-enter-other", CommandType.MovePlayer, "mover", { locationId: "city" }));
  assert.equal(moved.state.players.kama.victoryPoints, 1);
  assert.equal(moved.state.players.mover.victoryPoints, 1);
  assert.equal(moved.state.players.kama.flags.kamaBurningLoveCloseRound, 4);
  assert.equal(moved.state.cards[sourceId].active, true);

  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCoreSkillHandlers(built.skills);
  registerCorePassiveHandlers(built.skills, passives, effects);
  const roundEnded = createEvent(moved.state, "batch019-kama-round-end", 0, "round.ended", { round: 4 });
  enqueuePassiveEffects(moved.state, passives, roundEnded);
  effects.drain(moved.state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });

  assert.equal(moved.state.cards[sourceId].active, false);
  assert.equal(moved.state.cards[sourceId].zone, "servant-skills");
  assert.equal(moved.state.players.kama.flags.kamaBurningLoveCloseRound, undefined);
});

test("Kama desire universe treats deployment as entering a location per FQA", () => {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "batch019-kama-deploy-entry",
    players: [{ id: "kama", name: "kama" }, { id: "deployer", name: "deployer" }],
    seed: 19031,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "deployer";
  state.players.kama.servantId = "servant.kama";
  state.players.kama.locationId = "mountain";
  state.players.kama.victoryPoints = 0;
  state.players.deployer.victoryPoints = 2;
  state.board.locations.mountain = ["kama"];
  activateSkillCard(state, "kama", "servant.kama.skill.sc-kama-2", { residual: true });

  const deployed = engine.execute(state, command(state, "batch019-kama-deploy-city", CommandType.DeployPlayer, "deployer", { locationId: "city" }));

  assert.equal(deployed.state.players.kama.victoryPoints, 1);
  assert.equal(deployed.state.players.deployer.victoryPoints, 1);
  assert.equal(deployed.state.players.kama.flags.kamaBurningLoveCloseRound, 4);
});

test("Albion gains permanent power only from the first movement of each round", () => {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch019-albion", players: [{ id: "albion", name: "albion" }], seed: 1904 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "albion";
  state.players.albion.servantId = "servant.albion";
  state.players.albion.locationId = "workshop";
  state.players.albion.mana = 10;
  state.board.locations.workshop = ["albion"];
  const sourceId = activateSkillCard(state, "albion", "servant.albion.skill.sc-albion-2");

  const first = engine.execute(state, command(state, "batch019-albion-first", CommandType.MovePlayer, "albion", { locationId: "city" }));
  const firstModifiers = first.state.cards[sourceId].powerModifiers ?? [];
  assert.equal(first.state.players.albion.flags.movementDistanceThisRound, 2);
  assert.equal(first.state.players.albion.flags.albionFlameDisasterRound, 5);
  assert.equal(firstModifiers.filter((modifier) => modifier.sourceId === "servant.albion.skill.sc-albion-2").reduce((sum, modifier) => sum + modifier.value, 0), 2);
  assert.ok(firstModifiers.some((modifier) => modifier.duration === "game"));

  first.state.step = "move-decision";
  first.state.activePlayerId = "albion";
  const second = engine.execute(first.state, command(first.state, "batch019-albion-second", CommandType.MovePlayer, "albion", { locationId: "scouting" }));
  const secondModifiers = second.state.cards[sourceId].powerModifiers ?? [];
  assert.equal(second.state.players.albion.flags.movementDistanceThisRound, 3);
  assert.equal(secondModifiers.filter((modifier) => modifier.sourceId === "servant.albion.skill.sc-albion-2").reduce((sum, modifier) => sum + modifier.value, 0), 2);
});

test("Leonidas face-up card cap is enforced by the generic card-play rule modifier", () => {
  const built = buildStandardContent(legacyContent);
  const cards = {
    ...built.cards,
    "test.basic.a": basicDefinition("test.basic.a"),
    "test.basic.b": basicDefinition("test.basic.b"),
    "test.basic.c": basicDefinition("test.basic.c"),
    "test.basic.d": basicDefinition("test.basic.d"),
  };
  const engine = new StandardMatchEngine({ ...built, cards });
  const state = createGameState({
    gameInstanceId: "batch019-leonidas-limit",
    players: [{ id: "leo", name: "leo" }, { id: "other", name: "other" }],
    seed: 1905,
  });
  state.status = "playing";
  state.round = 6;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "other";
  state.players.leo.servantId = "servant.leonidas";
  state.players.leo.locationId = "city";
  state.players.other.locationId = "city";
  state.players.other.mana = 10;
  state.board.locations.city = ["leo", "other"];
  activateSkillCard(state, "leo", "servant.leonidas.skill.sc-leonidas-1", { residual: true });
  for (const id of ["a", "b", "c", "d"]) createOwnedCardInstance(state, "other", { instanceId: id, definitionId: `test.basic.${id}`, zone: "hand" });

  assert.throws(() => engine.execute(state, command(state, "batch019-leo-two-up", CommandType.CommitAttack, "other", {
    faceUpInstanceIds: ["a", "b"], faceDownInstanceIds: [],
  })), /FACE_UP_PLAY_LIMIT_EXCEEDED/);

  const first = engine.execute(state, command(state, "batch019-leo-one-up", CommandType.CommitAttack, "other", {
    faceUpInstanceIds: ["a"], faceDownInstanceIds: ["b"],
  }));
  assert.equal(first.state.players.other.flags.faceUpCardsPlayedThisRound, 1);

  first.state.step = "play-batch-draft";
  first.state.activePlayerId = "other";
  assert.throws(() => engine.execute(first.state, command(first.state, "batch019-leo-second-up", CommandType.CommitAttack, "other", {
    faceUpInstanceIds: ["c"], faceDownInstanceIds: ["d"],
  })), /FACE_UP_PLAY_LIMIT_EXCEEDED/);
});

test("Leonidas residual source closes when its controller moves", () => {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch019-leonidas-close", players: [{ id: "leo", name: "leo" }], seed: 1906 });
  state.status = "playing";
  state.round = 6;
  state.phase = "action";
  state.step = "move-decision";
  state.activePlayerId = "leo";
  state.players.leo.servantId = "servant.leonidas";
  state.players.leo.locationId = "city";
  state.players.leo.mana = 4;
  state.board.locations.city = ["leo"];
  const sourceId = activateSkillCard(state, "leo", "servant.leonidas.skill.sc-leonidas-1", { residual: true });

  const result = engine.execute(state, command(state, "batch019-leo-move", CommandType.MovePlayer, "leo", { locationId: "scouting" }));
  assert.equal(result.state.cards[sourceId].active, false);
  assert.equal(result.state.cards[sourceId].zone, "servant-skills");
});
