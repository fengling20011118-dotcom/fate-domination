import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { commitStandardAttack, addCardToAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardBasePower, calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const BLADE = "servant.muramasa.skill.sc-muramasa-1";
const EDGE = "servant.muramasa.skill.sc-muramasa-2";
const ALTER_EGO = "servant.muramasa.skill.sc-muramasa-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "muramasa") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Muramasa" }, { id: "o", name: "Opponent" }], seed: 1201 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.turnOrder = ["m", "o"];
  state.players.m.servantId = "servant.muramasa";
  state.players.m.locationId = "mountain";
  state.players.o.locationId = "city";
  state.players.m.mana = 20;
  state.players.o.mana = 20;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["m"];
  state.board.locations.city = ["o"];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

test("Muramasa package: all three skills are FULL", () => {
  const { built } = setup("muramasa-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.muramasa");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(BLADE).handlerId, "core.structured-skill");
  assert.equal(built.skills.get(EDGE).handlerId, "core.muramasa-imperfect-edge");
  assert.equal(built.skills.get(ALTER_EGO).handlerId, "core.alter-ego-transform");
  assert.equal(built.skills.get(BLADE).singleCardPlay, true);
  assert.equal(built.skills.get(BLADE).roundExclusivePlay, true);
});

test("Sword Trial removes up to three hand cards, adds their printed base power to Edge, and accumulates Unlimited Blade Works X", () => {
  const { engine, definitions, state } = setup("muramasa-trial");
  createOwnedCardInstance(state, "m", { instanceId: "edge", definitionId: EDGE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "m", { instanceId: "h2", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "m", { instanceId: "h3", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "m", { instanceId: "blade", definitionId: BLADE, zone: "servant-skills", face: "down", active: false });
  state.phase = "combat";
  state.step = "player-window";

  let result = engine.execute(state, command(state, "trial-use", CommandType.UseSkill, "m", {
    skillId: EDGE,
    data: { abilityId: "sword-trial" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "muramasa-sword-trial-remove");
  result = engine.execute(result.state, command(result.state, "trial-resolve", CommandType.ResolveDecision, "m", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["h2", "h3"],
  }));

  assert.equal(result.state.cards.h2.zone, "removed");
  assert.equal(result.state.cards.h3.zone, "removed");
  assert.equal(result.state.players.m.flags.muramasaSwordTrialExiledPower, 5);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.m, "edge", definitions, "mountain"), 8);
  assert.equal(calculateCombatCardBasePower(result.state, result.state.players.m, "blade", definitions), 5);
});

test("Unlimited Blade Works must be the only card in its batch and the only played card of the round", () => {
  const { definitions, state } = setup("muramasa-exclusive");
  createOwnedCardInstance(state, "m", { instanceId: "blade", definitionId: BLADE, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "m", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "m", { instanceId: "later", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  state.players.m.flags.muramasaSwordTrialExiledPower = 7;
  state.step = "play-batch-draft";

  assert.throws(() => commitStandardAttack(state, "m", ["blade", "basic"], [], definitions), /EXACTLY_ONE_CARD_REQUIRED/);
  const committed = commitStandardAttack(state, "m", ["blade"], [], definitions);
  assert.deepEqual(committed.committed, ["blade"]);
  assert.equal(state.players.m.flags.cardsPlayedThisRound, 1);
  assert.equal(state.players.m.flags.roundExclusiveCardPlayedRound, 4);
  assert.equal(calculateCombatCardBasePower(state, state.players.m, "blade", definitions), 7);
  assert.throws(() => addCardToAttack(state, "m", "later", definitions, { payCost: false, bypassTiming: true }), /ROUND_EXCLUSIVE_CARD_ALREADY_PLAYED/);
});

test("Unlimited Blade Works cannot be played after another card was already played this round", () => {
  const { definitions, state } = setup("muramasa-exclusive-prior");
  createOwnedCardInstance(state, "m", { instanceId: "blade", definitionId: BLADE, zone: "servant-skills", face: "down", active: false });
  createOwnedCardInstance(state, "m", { instanceId: "prior", definitionId: "card.cardb1", zone: "hand", face: "down", active: false });
  addCardToAttack(state, "m", "prior", definitions, { payCost: false, bypassTiming: true });
  assert.equal(state.players.m.flags.cardsPlayedThisRound, 1);
  assert.throws(() => addCardToAttack(state, "m", "blade", definitions, { payCost: false, bypassTiming: true }), /ROUND_EXCLUSIVE_CARD_REQUIRES_NO_PRIOR_PLAYS/);
});

test("reversed Imperfect Edge draws four in action then requires discarding exactly three", () => {
  const { engine, state } = setup("muramasa-reverse");
  createOwnedCardInstance(state, "m", { instanceId: "edge", definitionId: EDGE, zone: "attack", face: "up", active: true });
  state.cards.edge.reversed = true;
  for (let index = 1; index <= 5; index += 1) {
    createOwnedCardInstance(state, "m", { instanceId: `deck-${index}`, definitionId: index % 2 ? "card.cardb1" : "card.cardq2", zone: "deck", face: "down", active: false });
  }

  let result = engine.execute(state, command(state, "reverse-use", CommandType.UseSkill, "m", {
    skillId: EDGE,
    data: { abilityId: "alter-draw-discard" },
  }));
  assert.equal(result.state.players.m.hand.length, 4);
  assert.equal(result.state.pendingDecision?.kind, "muramasa-edge-discard-three");
  const selected = result.state.players.m.hand.slice(0, 3);
  result = engine.execute(result.state, command(result.state, "reverse-resolve", CommandType.ResolveDecision, "m", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: selected,
  }));
  assert.equal(result.state.players.m.hand.length, 1);
  assert.ok(selected.every((instanceId) => result.state.cards[instanceId].zone === "discard"));
  assert.equal(result.state.players.m.discard.length, 3);
});

test("normal and reversed faces expose only their matching Imperfect Edge abilities", () => {
  const { built, definitions, state } = setup("muramasa-face-gating");
  createOwnedCardInstance(state, "m", { instanceId: "edge", definitionId: EDGE, zone: "attack", face: "up", active: true });
  state.phase = "combat";
  let actions = built.skills.getLegalActions(state, "m", definitions).filter((action) => action.payload?.skillId === EDGE);
  assert.ok(actions.some((action) => action.payload?.data?.abilityId === "sword-trial"));
  assert.ok(!actions.some((action) => action.payload?.data?.abilityId === "alter-draw-discard"));

  state.cards.edge.reversed = true;
  state.phase = "action";
  state.activePlayerId = "m";
  actions = built.skills.getLegalActions(state, "m", definitions).filter((action) => action.payload?.skillId === EDGE);
  assert.ok(actions.some((action) => action.payload?.data?.abilityId === "alter-draw-discard"));
  assert.ok(!actions.some((action) => action.payload?.data?.abilityId === "sword-trial"));
});
