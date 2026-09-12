import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const HELM = "servant.mordred.skill.sc-mordred-1";
const CLARENT = "servant.mordred.skill.sc-mordred-2";
const SABER = "servant.mordred.skill.sc-mordred-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "mordred") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Mordred" }, { id: "o", name: "Opponent" }], seed: 2101 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.turnOrder = ["m", "o"];
  state.players.m.servantId = "servant.mordred";
  state.players.m.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["m", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
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

test("Mordred package: all three skills are FULL", () => {
  const { built } = setup("mordred-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.mordred");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(HELM).handlerId, "core.mordred-hidden-helm");
  assert.equal(built.skills.get(CLARENT).handlerId, "core.mordred-clarent");
  assert.equal(built.skills.get(SABER).handlerId, "core.saber-magic-resistance");
});

test("Helm action hides Mordred's true name without closing the active Helm", () => {
  const { engine, state } = setup("mordred-hide");
  state.players.m.trueNameRevealed = true;
  createOwnedCardInstance(state, "m", { instanceId: "helm", definitionId: HELM, zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "mordred-hide-use", CommandType.UseSkill, "m", {
    skillId: HELM,
    data: { abilityId: "hide-true-name" },
  }));
  assert.equal(result.state.players.m.trueNameRevealed, false);
  assert.equal(result.state.cards.helm.zone, "attack");
  assert.equal(result.state.cards.helm.active, true);
});

test("Helm combat ability closes itself, pays and plays Clarent in combat, and grants Clarent's Action ability in combat", () => {
  const { engine, definitions, state } = setup("mordred-helm-clarent");
  state.phase = "combat";
  state.players.m.mana = 10;
  state.players.m.trueNameRevealed = false;
  createOwnedCardInstance(state, "m", { instanceId: "helm", definitionId: HELM, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "m", { instanceId: "clarent", definitionId: CLARENT, zone: "servant-skills", face: "down", active: false });

  let result = engine.execute(state, command(state, "mordred-helm-open", CommandType.UseSkill, "m", {
    skillId: HELM,
    data: { abilityId: "combat-play" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "mordred-helm-combat-play");
  assert.ok(result.state.pendingDecision?.options.some((option) => option.id === "clarent"));

  result = engine.execute(result.state, command(result.state, "mordred-helm-pick", CommandType.ResolveDecision, "m", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["clarent"],
  }));
  assert.equal(result.state.cards.helm.zone, "servant-skills");
  assert.equal(result.state.cards.helm.active, false);
  assert.equal(result.state.cards.clarent.zone, "attack");
  assert.equal(result.state.cards.clarent.active, true);
  assert.equal(result.state.cards.clarent.paidCost, 1);
  assert.equal(result.state.players.m.mana, 9);
  assert.equal(result.state.players.m.trueNameRevealed, true);
  assert.ok(result.state.players.m.cardRuleModifiers?.some((modifier) => modifier.targetInstanceIds?.includes("clarent") && modifier.allowActionAbilityInCombat === true));

  result = engine.execute(result.state, command(result.state, "mordred-clarent-combat", CommandType.UseSkill, "m", {
    skillId: CLARENT,
    data: { abilityId: "mana-burst" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "mordred-clarent-mana-burst");
  result = engine.execute(result.state, command(result.state, "mordred-clarent-combat-pay", CommandType.ResolveDecision, "m", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["4"],
  }));
  assert.equal(result.state.players.m.mana, 5);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.m, "clarent", definitions, "mountain"), 9);
});

test("Clarent Mana Burst pays chosen X, gains +2X power, and unpreventably restores half rounded up after a loss", () => {
  const { engine, definitions, state } = setup("mordred-clarent-refund");
  state.players.m.mana = 7;
  createOwnedCardInstance(state, "m", { instanceId: "clarent", definitionId: CLARENT, zone: "attack", face: "up", active: true });

  let result = engine.execute(state, command(state, "mordred-clarent-open", CommandType.UseSkill, "m", {
    skillId: CLARENT,
    data: { abilityId: "mana-burst" },
  }));
  result = engine.execute(result.state, command(result.state, "mordred-clarent-pay", CommandType.ResolveDecision, "m", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["5"],
  }));
  assert.equal(result.state.players.m.mana, 2);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.m, "clarent", definitions, "mountain"), 11);

  result.state.players.m.flags.roundManaGainCap = 0;
  result.state.players.m.flags.manaGainReplacementSourceInstanceId = "blocked-normal-gain";
  result.state.phase = "combat";
  emitPassive(engine, result.state, definitions, "combat.resolved", {
    locationId: "mountain",
    powers: { m: 11, o: 12 },
    winnerIds: ["o"],
  });
  assert.equal(result.state.players.m.mana, 5);
  assert.equal(result.state.players.m.flags.mordredClarentRefundedRound, 4);
  assert.equal(result.state.players.m.flags.manaGainReplacementPower, undefined);
});
