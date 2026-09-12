import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { useRinCommandSealDuty, useRinJewelSword } from "../src/rules-core/skill-handlers.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function buildEngine() {
  return new StandardMatchEngine(buildStandardContent(content));
}

test("Rin package: all master skills are FULL except the already plain card-play Yinqi bullet", () => {
  const built = buildStandardContent(content);
  const ids = [
    "master.rin.skill.s1",
    "master.rin.skill.s2",
    "master.rin.skill.s3",
    "master.rin.skill.s4",
    "master.rin.skill.ascension",
  ];
  assert.deepEqual(ids.map((id) => built.skills.get(id).supportLevel), ["FULL", "FULL", "FULL", "FULL", "FULL"]);
  assert.equal(built.skills.get("master.rin.skill.s1").handlerId, "core.rin-gem-magic");
  assert.equal(built.skills.get("master.rin.skill.s2").handlerId, "core.rin-command-seal-duty");
  assert.equal(built.skills.get("master.rin.skill.s3").handlerId, "core.rin-gem");
  assert.equal(built.skills.get("master.rin.skill.ascension").handlerId, "core.rin-jewel-sword");
});

test("Rin package: game start grants ten gems and climax choices cap each option at three uses", () => {
  const engine = buildEngine();
  let state = createGameState({ gameInstanceId: "rin-gems", players: [{ id: "rin", name: "凛" }], seed: 701 });
  state.players.rin.masterId = "master.rin";
  let result = engine.execute(state, command(state, "start-rin", CommandType.StartStandardGame, "host", {}));
  state = result.state;
  assert.equal(state.players.rin.flags.rinGemCount, 10);

  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "rin";
  state.modeState.currentSituationClimax = true;
  for (const round of [8, 9, 10]) {
    state.round = round;
    result = engine.execute(state, command(state, `rin-gem-${round}`, CommandType.UseSkill, "rin", {
      skillId: "master.rin.skill.s3",
      data: { choiceId: "gain-mana" },
    }));
    state = result.state;
  }
  assert.equal(state.players.rin.flags.rinGemCount, 7);
  assert.equal(state.players.rin.flags["rinGemChoiceCount:gain-mana"], 3);
  state.round = 11;
  assert.throws(() => engine.execute(state, command(state, "rin-gem-fourth", CommandType.UseSkill, "rin", {
    skillId: "master.rin.skill.s3",
    data: { choiceId: "gain-mana" },
  })), /RIN_GEM_CHOICE_LIMIT_REACHED/);
});

test("Rin package: first-round command seal duty penalizes unused or mana-gaining seals", () => {
  const state = createGameState({ gameInstanceId: "rin-command-seal-duty", players: [{ id: "rin", name: "凛" }], seed: 702 });
  const player = state.players.rin;
  player.masterId = "master.rin";
  useRinCommandSealDuty({
    state,
    player,
    skill: { id: "master.rin.skill.s2" },
    payload: { eventType: "round.ended", event: { round: 1 } },
    openDecision: () => undefined,
  });
  assert.equal(player.commandSeals, 2);

  player.commandSeals = 3;
  player.flags.commandSealUsedRound = 1;
  player.flags.commandSealManaGainRound = 1;
  player.mana = 6;
  useRinCommandSealDuty({
    state,
    player,
    skill: { id: "master.rin.skill.s2" },
    payload: { eventType: "combat.ending", event: { round: 1 } },
    openDecision: () => undefined,
  });
  assert.equal(player.commandSeals, 3);
  assert.equal(player.mana, 2);
});

test("Rin package: Jewel Sword collects spent mana, boosts magic basics and Yinqi, then exiles after combat", () => {
  const built = buildStandardContent(content);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  let state = createGameState({ gameInstanceId: "rin-jewel-sword", players: [{ id: "rin", name: "凛" }, { id: "opp", name: "对手" }], seed: 703 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "rin";
  state.players.rin.masterId = "master.rin";
  state.players.rin.mana = 1;
  state.players.rin.flags.roundManaSpent = 3;
  state.players.opp.flags.roundManaSpent = 4;
  createOwnedCardInstance(state, "rin", { instanceId: "jewel-sword", definitionId: "master.rin.skill.ascension", zone: "master-skills" });
  createOwnedCardInstance(state, "rin", { instanceId: "magic-basic", definitionId: "card.carda1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "rin", { instanceId: "yinqi", definitionId: "card.card-yinqi", zone: "attack", face: "up", active: true });

  assert.equal(calculateCombatCardPower(state, state.players.rin, "magic-basic", definitions), 4);
  assert.equal(calculateCombatCardPower(state, state.players.rin, "yinqi", definitions), 3);

  let result = engine.execute(state, command(state, "rin-jewel-collect", CommandType.UseSkill, "rin", {
    skillId: "master.rin.skill.ascension",
  }));
  state = result.state;
  assert.equal(state.players.rin.mana, 8);

  useRinJewelSword({
    state,
    player: state.players.rin,
    skill: built.skills.get("master.rin.skill.ascension"),
    payload: { eventType: "combat.ending", event: { round: state.round } },
    definitions,
    openDecision: () => undefined,
  });
  assert.equal(state.cards["jewel-sword"].zone, "removed");
  assert.equal(calculateCombatCardPower(state, state.players.rin, "magic-basic", definitions), 2);
});
