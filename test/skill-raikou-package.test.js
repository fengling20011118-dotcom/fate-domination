import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { getCardPlayCost } from "../src/rules-core/costs.ts";
import { isPlayerUnaffectedBySituation } from "../src/rules-core/situation-immunity.ts";

const OX_KING = "servant.raikou.skill.sc-raikou-1";
const CLEANSING_WAVE = "servant.raikou.skill.sc-raikou-2";
const ONI_SLAYER = "servant.raikou.skill.sc-raikou-3";

function command(state, commandId, type, payload = {}) {
  return {
    commandId,
    gameInstanceId: state.gameInstanceId,
    actorId: "raikou",
    expectedRevision: state.revision,
    type,
    payload,
  };
}

function setup(id = "raikou-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [
      { id: "raikou", name: "Raikou" },
      { id: "other", name: "Other" },
    ],
    seed: 6701,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "raikou";
  state.turnOrder = ["raikou", "other"];
  state.players.raikou.servantId = "servant.raikou";
  state.players.raikou.mana = 8;
  state.players.raikou.locationId = "workshop";
  state.players.other.locationId = "workshop";
  state.board.locations.workshop = ["raikou", "other"];
  state.board.locations.mountain = [];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

test("Raikou package: all three skills are FULL with reviewed structured handlers", () => {
  const { built } = setup("raikou-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.raikou");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));

  const oxKing = built.skills.get(OX_KING);
  assert.equal(oxKing.activation, "phase");
  assert.deepEqual(oxKing.windows, ["outpost"]);
  assert.equal(oxKing.limit, "twice-per-game");
  assert.equal(oxKing.requiresActiveCard, false);
  assert.equal(oxKing.revealsTrueNameOnSkillUse, true);
  assert.equal(oxKing.handlerId, "core.raikou-ox-king");

  const cleansing = built.skills.get(CLEANSING_WAVE);
  assert.equal(cleansing.activation, "play");
  assert.deepEqual(cleansing.situationForbiddenAttributeCostReduction, { attribute: "宝具", amount: 6 });
  assert.equal(cleansing.otherPlayersIgnoreSituationEffects, true);
  assert.equal(cleansing.handlerId, "core.card-play");

  assert.equal(built.skills.get(ONI_SLAYER).handlerId, "core.raikou-mystery-killer");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
});

test("Ox-King Storm Call requires 8 mana, reveals True Name, and is usable exactly twice per game", () => {
  const { engine, state } = setup("raikou-ox-usage");
  state.players.raikou.mana = 7;
  assert.ok(!engine.getLegalActions(state, "raikou").some((action) => action.type === CommandType.UseSkill && action.payload?.skillId === OX_KING));

  state.players.raikou.mana = 8;
  let result = engine.execute(state, command(state, "ox-first", CommandType.UseSkill, {
    skillId: OX_KING,
    data: { abilityId: "ox-king-storm-call" },
  }));
  assert.equal(result.state.players.raikou.trueNameRevealed, true);
  assert.equal(result.state.players.raikou.flags.optionalExtraStandardAttackCards, 2);
  assert.equal(result.state.players.raikou.flags.optionalFreeExtraStandardAttackCards, 1);

  result.state.round = 5;
  result.state.phase = "outpost";
  result.state.step = "player-window";
  result.state.activePlayerId = "raikou";
  result = engine.execute(result.state, command(result.state, "ox-second", CommandType.UseSkill, {
    skillId: OX_KING,
    data: { abilityId: "ox-king-storm-call" },
  }));
  assert.equal(result.state.players.raikou.usage[`${OX_KING}:ox-king-storm-call`].count, 2);

  result.state.round = 6;
  result.state.phase = "outpost";
  result.state.step = "player-window";
  result.state.activePlayerId = "raikou";
  assert.ok(!engine.getLegalActions(result.state, "raikou").some((action) => action.type === CommandType.UseSkill && action.payload?.skillId === OX_KING));
});

test("Ox-King Storm Call allows up to two extra attacks and one selected extra batch card to be free", () => {
  const { definitions, engine, state } = setup("raikou-ox-batch");
  let result = engine.execute(state, command(state, "ox-arm", CommandType.UseSkill, {
    skillId: OX_KING,
    data: { abilityId: "ox-king-storm-call" },
  }));
  result.state.phase = "action";
  result.state.step = "play-batch-draft";
  result.state.activePlayerId = "raikou";

  createOwnedCardInstance(result.state, "raikou", { instanceId: "b1", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(result.state, "raikou", { instanceId: "q1", definitionId: "card.cardq1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(result.state, "raikou", { instanceId: "a1", definitionId: "card.carda1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(result.state, "raikou", { instanceId: "oni", definitionId: ONI_SLAYER, zone: "hand", face: "down", active: false });

  const committed = commitStandardAttack(
    result.state,
    "raikou",
    ["b1", "q1", "a1", "oni"],
    [],
    definitions,
    { freeOptionalExtraAttackInstanceId: "oni" },
  );
  assert.equal(committed.committed.length, 4);
  assert.equal(committed.paidMana, 0);
  assert.equal(result.state.players.raikou.flags.optionalFreeExtraStandardAttackUsedRound, 4);
  assert.equal(result.state.cards.oni.zone, "attack");
  assert.equal(result.state.cards.oni.active, true);
});

test("Cleansing Wave grants situation immunity only to other players and costs 1 when Noble Phantasms are forbidden", () => {
  const { definitions, state } = setup("raikou-cleansing");
  createOwnedCardInstance(state, "raikou", {
    instanceId: "cleansing",
    definitionId: CLEANSING_WAVE,
    zone: "attack",
    face: "up",
    active: true,
  });

  state.modeState.situationRestrictions = { forbiddenAttributes: ["宝具"] };
  assert.equal(isPlayerUnaffectedBySituation(state, "other", definitions), true);
  assert.equal(isPlayerUnaffectedBySituation(state, "raikou", definitions), false);
  assert.equal(getCardPlayCost(state, definitions[CLEANSING_WAVE], state.players.raikou, state.cards.cleansing, definitions), 1);

  state.modeState.situationRestrictions = {};
  assert.equal(getCardPlayCost(state, definitions[CLEANSING_WAVE], state.players.raikou, state.cards.cleansing, definitions), 7);
});
