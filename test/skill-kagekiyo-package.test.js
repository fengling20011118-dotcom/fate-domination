import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { getPrintedCardBasePower } from "../src/rules-core/card-values.ts";
import { getStructuredCardBasePower } from "../src/rules-core/rule-modifiers.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";

const AZAMARU = "servant.kagekiyo.skill.sc-kagekiyo-1";
const OBLIVION = "servant.kagekiyo.skill.sc-kagekiyo-2";
const NEVER_DIES = "servant.kagekiyo.skill.sc-kagekiyo-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "kagekiyo-package", players = [{ id: "k", name: "Kagekiyo" }, { id: "o", name: "Opponent" }]) {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players, seed: 9101 });
  state.status = "playing";
  state.round = 4;
  state.turnOrder = players.map((player) => player.id);
  state.players.k.servantId = "servant.kagekiyo";
  state.players.k.mana = 10;
  state.players.k.locationId = "mountain";
  if (state.players.o) state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = players.map((player) => player.id);
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

function hidden(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "k", { instanceId, definitionId, zone: "attack", face: "down", active: false });
}

function activeSkill(state, instanceId, definitionId) {
  createOwnedCardInstance(state, "k", { instanceId, definitionId, zone: "attack", face: "up", active: true });
  state.cards[instanceId].playedRound = state.round;
}

test("Kagekiyo package is 3/3 FULL", () => {
  const { built } = setup("kagekiyo-full");
  const skills = [AZAMARU, OBLIVION, NEVER_DIES].map((id) => built.skills.get(id));
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(skills[0].handlerId, "core.kagekiyo-azamaru");
  assert.equal(skills[1].handlerId, "core.structured-skill");
  assert.equal(skills[2].handlerId, "core.kagekiyo-never-dies");
});

test("Azamaru X is twice controlled attacks and only X<=4 waives the 8-mana play gate", () => {
  const { definitions, state } = setup("kagekiyo-x-waiver");
  createOwnedCardInstance(state, "k", { instanceId: "azamaru", definitionId: AZAMARU, zone: "servant-skills", face: "down", active: false });
  state.players.k.mana = 4;
  hidden(state, "h1", "card.cardb1");
  hidden(state, "h2", "card.cardb2");
  const definition = definitions[AZAMARU];
  assert.equal(getPrintedCardBasePower(state, state.players.k, definition), 4);
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "k", instanceId: "azamaru", definitions, faceDown: false }));
  hidden(state, "h3", "card.cardq2");
  assert.equal(getPrintedCardBasePower(state, state.players.k, definition), 6);
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "k", instanceId: "azamaru", definitions, faceDown: false }), /SKILL_REQUIRES_EIGHT_MANA/);
});

test("Azamaru activates every hidden attack atomically and insufficient total mana changes none", () => {
  const { engine, state } = setup("kagekiyo-azamaru-atomic");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "k";
  activeSkill(state, "azamaru", AZAMARU);
  hidden(state, "quick", "card.cardsurveil");
  hidden(state, "slash", "card.cardq4");
  state.players.k.mana = 1;
  const before = structuredClone(state);
  assert.throws(() => engine.execute(state, command(state, "azamaru-too-poor", CommandType.UseSkill, "k", {
    skillId: AZAMARU, data: { abilityId: "azamaru-activate-hidden" },
  })), /(SKILL_USE_FORBIDDEN|SKILL_NOT_AVAILABLE|KAGEKIYO_AZAMARU_MANA_INSUFFICIENT)/);
  assert.deepEqual(state, before);

  state.players.k.mana = 2;
  const result = engine.execute(state, command(state, "azamaru-all", CommandType.UseSkill, "k", {
    skillId: AZAMARU, data: { abilityId: "azamaru-activate-hidden" },
  }));
  assert.equal(result.state.players.k.mana, 0);
  for (const id of ["quick", "slash"]) {
    assert.equal(result.state.cards[id].face, "up");
    assert.equal(result.state.cards[id].active, true);
  }
});

test("Azamaru requires activated Action abilities before Kagekiyo may leave the combat player window", () => {
  const { engine, state } = setup("kagekiyo-azamaru-mandatory");
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.modeState.phaseStartPlayerId = "k";
  activeSkill(state, "azamaru", AZAMARU);
  hidden(state, "quick", "card.cardsurveil");
  state.players.k.mana = 3;
  let result = engine.execute(state, command(state, "azamaru-mandatory", CommandType.UseSkill, "k", {
    skillId: AZAMARU, data: { abilityId: "azamaru-activate-hidden" },
  }));
  assert.throws(() => engine.execute(result.state, command(result.state, "leave-too-soon", CommandType.CompletePlayerWindow, "k", {})), /MANDATORY_CARD_ABILITY_PENDING/);
  result = engine.execute(result.state, command(result.state, "forced-quick", CommandType.UseCardAbility, "k", {
    instanceId: "quick", ability: "basic.quick-march", targetLocationId: "city",
  }));
  assert.equal(result.state.players.k.locationId, "city");
  assert.doesNotThrow(() => engine.execute(result.state, command(result.state, "leave-after-action", CommandType.CompletePlayerWindow, "k", {})));
});

test("Kagekiyo Never Dies outpost ability pays 3 then plays up to two drawn cards face-down", () => {
  const { engine, state } = setup("kagekiyo-never-dies-draw");
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.players.k.mana = 5;
  createOwnedCardInstance(state, "k", { instanceId: "never", definitionId: NEVER_DIES, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "k", { instanceId: "draw1", definitionId: "card.cardb2", zone: "deck" });
  createOwnedCardInstance(state, "k", { instanceId: "draw2", definitionId: "card.cardq2", zone: "deck" });
  const result = engine.execute(state, command(state, "never-dies-draw", CommandType.UseSkill, "k", {
    skillId: NEVER_DIES, data: { abilityId: "vengeful-grudge-facedown" },
  }));
  assert.equal(result.state.players.k.mana, 2);
  for (const id of ["draw1", "draw2"]) {
    assert.equal(result.state.cards[id].zone, "attack");
    assert.equal(result.state.cards[id].face, "down");
    assert.equal(result.state.cards[id].active, false);
    assert.equal(result.state.cards[id].paidCost, 0);
  }
});

test("Never Dies makes hidden printed power zero and reveals only when cleanup preserves the hidden attack", () => {
  const { definitions, state } = setup("kagekiyo-never-dies-cleanup");
  createOwnedCardInstance(state, "k", { instanceId: "never", definitionId: NEVER_DIES, zone: "servant-skills", face: "down", active: false });
  hidden(state, "hidden", "card.cardb2");
  const card = state.cards.hidden;
  const definition = definitions[card.definitionId];
  const printed = getPrintedCardBasePower(state, state.players.k, definition);
  assert.equal(printed, 3);
  assert.equal(getStructuredCardBasePower(state, "k", card, definition, definitions, printed), 0);
  assert.equal(state.cards.never.face, "down");

  endStandardRound(state, definitions);
  assert.equal(state.cards.hidden.zone, "attack");
  assert.equal(state.cards.hidden.face, "down");
  assert.equal(state.cards.hidden.active, false);
  assert.equal(state.cards.hidden.residual, false); // grant is continuous, not permanently written onto the instance
  assert.equal(state.cards.never.face, "up");
});
