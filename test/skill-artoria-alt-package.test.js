import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { isStructuredSkillUseForbidden } from "../src/rules-core/rule-modifiers.ts";

const EXCALIBUR = "servant.artoria-alt.skill.sc-artoria-alt-1";
const CURSE = "servant.artoria-alt.skill.sc-artoria-alt-2";
const SABER_CLASS = "servant.artoria-alt.skill.sc-artoria-alt-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "artoria-alt") {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Alter" }, { id: "o", name: "Opponent" }], seed: 144 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.servantId = "servant.artoria-alt";
  state.players.o.servantId = "servant.saber";
  state.players.a.mana = 12;
  state.players.o.mana = 12;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["a", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "mountain";
  return { built, engine, definitions, state };
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload = {}) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Artoria Alter package: all three skills are FULL", () => {
  const { built } = setup("artoria-alt-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.artoria-alt");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(EXCALIBUR).handlerId, "core.artoria-alt-excalibur-morgan");
  assert.equal(built.skills.get(CURSE).handlerId, "core.artoria-alt-blackening-curse");
  assert.equal(built.skills.get(SABER_CLASS).supportLevel, "FULL");
});

test("Excalibur Morgan ignores situation play bans and Vortigern's Hammer scales with consecutive played rounds", () => {
  const { built, engine, definitions, state } = setup("artoria-alt-excalibur");
  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  createOwnedCardInstance(state, "a", { instanceId: "excalibur", definitionId: EXCALIBUR, zone: "servant-skills", face: "down", active: false });
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "a", instanceId: "excalibur", definitions, faceDown: false }));

  state.cards.excalibur.zone = "attack";
  state.cards.excalibur.face = "up";
  state.cards.excalibur.active = true;
  state.players.a.servantSkills = state.players.a.servantSkills.filter((id) => id !== "excalibur");
  state.players.a.attack.push("excalibur");
  emitPassive(engine, state, definitions, "card.played", { playerId: "a", instanceId: "excalibur", definitionId: EXCALIBUR, face: "up" });
  assert.equal(state.players.a.flags.artoriaAltExcaliburConsecutiveRounds, 1);
  assert.ok(!built.skills.getLegalActions(state, "a", definitions).some((action) => action.payload?.data?.abilityId === "vortigerns-hammer"));
  state.modeState.situationRestrictions = {};

  let result = engine.execute(state, command(state, "hammer-1", CommandType.UseSkill, "a", {
    skillId: EXCALIBUR,
    data: { abilityId: "vortigerns-hammer" },
  }));
  assert.equal(result.state.players.a.mana, 8);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.a, "excalibur", definitions, "mountain"), 9);

  result.state.round = 5;
  result.state.players.a.usage = {};
  result.state.activeRuleModifiers = [];
  result.state.players.a.mana = 12;
  emitPassive(engine, result.state, definitions, "card.played", { playerId: "a", instanceId: "excalibur", definitionId: EXCALIBUR, face: "up" });
  assert.equal(result.state.players.a.flags.artoriaAltExcaliburConsecutiveRounds, 2);
  result = engine.execute(result.state, command(result.state, "hammer-2", CommandType.UseSkill, "a", {
    skillId: EXCALIBUR,
    data: { abilityId: "vortigerns-hammer" },
  }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.a, "excalibur", definitions, "mountain"), 12);
});

test("Blackening Curse at 7 or less mana blocks same-battlefield opponents from playing or using Noble Phantasms", () => {
  const { built, definitions, state } = setup("artoria-alt-curse-lock");
  state.players.a.mana = 7;
  createOwnedCardInstance(state, "a", { instanceId: "curse", definitionId: CURSE, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "o", { instanceId: "opponent-np", definitionId: EXCALIBUR, zone: "servant-skills", face: "down", active: false });

  assert.throws(
    () => assertCardCanEnterAttack({ state, playerId: "o", instanceId: "opponent-np", definitions, faceDown: false }),
    /CARD_PLAY_FORBIDDEN_BY_RULE/,
  );
  assert.equal(isStructuredSkillUseForbidden(state, "o", EXCALIBUR, definitions), true);

  state.players.a.mana = 8;
  assert.equal(isStructuredSkillUseForbidden(state, "o", EXCALIBUR, definitions), false);
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "o", instanceId: "opponent-np", definitions, faceDown: false }));
});

test("Blackening Curse survives a simultaneous attack-pair Noble Phantasm but closes on a later Noble Phantasm use", () => {
  const { engine, definitions, state } = setup("artoria-alt-curse-close");
  createOwnedCardInstance(state, "a", { instanceId: "curse", definitionId: CURSE, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "a", { instanceId: "excalibur", definitionId: EXCALIBUR, zone: "attack", face: "up", active: true });

  emitPassive(engine, state, definitions, "attack.committed", { playerId: "a", committed: ["curse", "excalibur"], paidMana: 2 });
  assert.equal(state.cards.curse.zone, "attack");
  assert.equal(state.cards.curse.active, true);

  emitPassive(engine, state, definitions, "attack.committed", { playerId: "a", committed: ["excalibur"], paidMana: 2 });
  assert.equal(state.cards.curse.zone, "servant-skills");
  assert.equal(state.cards.curse.active, false);
});

test("Blackening Curse closes when its controller uses a Noble Phantasm ability", () => {
  const { engine, definitions, state } = setup("artoria-alt-curse-ability");
  createOwnedCardInstance(state, "a", { instanceId: "curse", definitionId: CURSE, zone: "attack", face: "up", active: true, residual: true });
  emitPassive(engine, state, definitions, "card.used", {
    playerId: "a",
    instanceId: "excalibur",
    definitionId: EXCALIBUR,
    attributes: ["力量", "宝具"],
    method: "ability",
  });
  assert.equal(state.cards.curse.zone, "servant-skills");
  assert.equal(state.cards.curse.active, false);
});
