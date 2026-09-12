import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { spendNormalCommandSeal, spendRulerCommandSeal } from "../src/rules-core/command-seals.ts";
import { grantRulerSeal, listRulerSealsControlledBy } from "../src/rules-core/ruler-seals.ts";

const REBELLION = "servant.spartacus.skill.sc-spartacus-1";
const WOUNDED_BEAST_ROAR = "servant.spartacus.skill.sc-spartacus-2";
const FREE_SPIRIT = "servant.spartacus.skill.sc-spartacus-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "spartacus-package") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "s", name: "Spartacus" }, { id: "o", name: "Opponent" }, { id: "f", name: "Far" }],
    seed: 7331,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "s";
  state.turnOrder = ["s", "o", "f"];
  state.players.s.servantId = "servant.spartacus";
  state.players.s.commandSeals = 3;
  state.players.o.commandSeals = 2;
  state.players.f.commandSeals = 3;
  state.players.s.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.players.f.locationId = "city";
  state.board.locations.mountain = ["s", "o"];
  state.board.locations.city = ["f"];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return { built, definitions, engine, state };
}

test("Spartacus package: all three skills are FULL and use concrete handlers", () => {
  const { built } = setup("spartacus-full");
  const skills = [REBELLION, WOUNDED_BEAST_ROAR, FREE_SPIRIT].map((id) => built.skills.get(id));
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
  assert.equal(skills[0].handlerId, "core.combat-power-from-command-seal-users");
  assert.equal(skills[1].handlerId, "core.structured-skill");
  assert.equal(skills[2].handlerId, "core.spartacus-free-spirit");
  assert.deepEqual(skills[2].abilities?.map((ability) => ability.id), [
    "free-spirit-use-command-seal",
    "free-spirit-use-ruler-seal",
    "free-spirit-unused-seal-aura",
  ]);
});

test("Wounded Beast Roar chooses only resolved-combat opponents and gains floor(selected power / 5)", () => {
  const { engine, state } = setup("spartacus-roar");
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.players.f.locationId = "mountain";
  state.board.locations.mountain = ["s", "o", "f"];
  state.board.locations.city = [];
  state.players.s.victoryPoints = 0;
  createOwnedCardInstance(state, "s", { instanceId: "roar", definitionId: WOUNDED_BEAST_ROAR, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o-attack", definitionId: "card.cardb6", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "f", { instanceId: "f-attack", definitionId: "card.carda4", zone: "attack", face: "up", active: true });

  const opened = engine.execute(state, command(state, "roar-combat", CommandType.ResolveCombat, "s", { locationId: "mountain" }));
  assert.equal(opened.state.pendingDecision?.kind, "structured-player-choice");
  assert.deepEqual(new Set(opened.state.pendingDecision?.options.map((option) => option.id)), new Set(["o", "f"]));
  const combat = opened.events.find((event) => event.type === "combat.resolved");
  assert.ok(combat);
  const expected = Math.floor(Number(combat.payload.powers.o) / 5);
  const before = opened.state.players.s.victoryPoints;
  const resolved = engine.execute(opened.state, command(opened.state, "roar-choice", CommandType.ResolveDecision, "s", {
    decisionId: opened.state.pendingDecision.decisionId,
    selections: ["o"],
  }));
  assert.equal(resolved.state.players.s.victoryPoints - before, expected);
});

test("Free Spirit normal Command Seals are repeatable physical resources and each grants +4 total power", () => {
  const { engine, state } = setup("spartacus-normal-seal");
  let result = engine.execute(state, command(state, "seal-1", CommandType.UseSkill, "s", {
    skillId: FREE_SPIRIT,
    data: { abilityId: "free-spirit-use-command-seal" },
  }));
  assert.equal(result.state.players.s.commandSeals, 2);
  assert.equal(result.state.players.s.flags.commandSealRoundPowerBonus, 4);
  assert.equal(result.state.players.s.flags.commandSealUsedRound, 4);

  result = engine.execute(result.state, command(result.state, "seal-2", CommandType.UseSkill, "s", {
    skillId: FREE_SPIRIT,
    data: { abilityId: "free-spirit-use-command-seal" },
  }));
  assert.equal(result.state.players.s.commandSeals, 1);
  assert.equal(result.state.players.s.flags.commandSealRoundPowerBonus, 8);
  assert.equal(result.state.players.s.flags.commandSealUsesThisRound, 2);
});

test("Free Spirit can consume a Ruler Command Seal controlled by Spartacus for +4 total power", () => {
  const { engine, state } = setup("spartacus-ruler-seal");
  grantRulerSeal(state, "s", "o", "test-ruler-seal");
  const result = engine.execute(state, command(state, "ruler-seal", CommandType.UseSkill, "s", {
    skillId: FREE_SPIRIT,
    data: { abilityId: "free-spirit-use-ruler-seal" },
  }));
  assert.equal(listRulerSealsControlledBy(result.state, "s").length, 0);
  assert.equal(result.state.players.s.flags.commandSealRoundPowerBonus, 4);
  assert.equal(result.state.players.s.flags.rulerCommandSealUsedRound, 4);
});

test("Free Spirit serializes a choice when Spartacus controls multiple Ruler Command Seals", () => {
  const { engine, state } = setup("spartacus-ruler-choice");
  const first = grantRulerSeal(state, "s", "o", "ruler-a");
  const second = grantRulerSeal(state, "s", "f", "ruler-b");
  const opened = engine.execute(state, command(state, "ruler-open", CommandType.UseSkill, "s", {
    skillId: FREE_SPIRIT,
    data: { abilityId: "free-spirit-use-ruler-seal" },
  }));
  assert.equal(opened.state.pendingDecision?.kind, "spartacus-free-spirit-ruler-seal");
  assert.deepEqual(new Set(opened.state.pendingDecision?.options.map((option) => option.id)), new Set([first.sealId, second.sealId]));
  const resolved = engine.execute(opened.state, command(opened.state, "ruler-pick", CommandType.ResolveDecision, "s", {
    decisionId: opened.state.pendingDecision.decisionId,
    selections: [second.sealId],
  }));
  assert.equal(listRulerSealsControlledBy(resolved.state, "s").length, 1);
  assert.equal(listRulerSealsControlledBy(resolved.state, "s")[0].sealId, first.sealId);
  assert.equal(resolved.state.players.s.flags.commandSealRoundPowerBonus, 4);
});

test("Free Spirit unused-seal aura is live: only engaged opponents count and later seal spending immediately lowers power", () => {
  const { engine, definitions, state } = setup("spartacus-live-aura");
  const opponentRulerSeal = grantRulerSeal(state, "o", "f", "opponent-ruler-seal");
  grantRulerSeal(state, "f", "o", "far-ruler-seal");
  const before = calculateCombatPower(state, state.players.s, definitions);

  const result = engine.execute(state, command(state, "aura", CommandType.UseSkill, "s", {
    skillId: FREE_SPIRIT,
    data: { abilityId: "free-spirit-unused-seal-aura" },
  }));
  const activated = calculateCombatPower(result.state, result.state.players.s, definitions);
  assert.equal(activated, before + 3); // engaged opponent: 2 normal + 1 controlled Ruler seal; far player is excluded

  spendNormalCommandSeal(result.state, "o");
  assert.equal(calculateCombatPower(result.state, result.state.players.s, definitions), activated - 1);

  spendRulerCommandSeal(result.state, "o", opponentRulerSeal.sealId);
  assert.equal(calculateCombatPower(result.state, result.state.players.s, definitions), activated - 2);
});
