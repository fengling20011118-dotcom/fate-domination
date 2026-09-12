import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function buildEngine() {
  return new StandardMatchEngine(buildStandardContent(content));
}

test("Dan package: all master skills are FULL and ascension uses attached supply append handler", () => {
  const built = buildStandardContent(content);
  const ids = ["master.dan.skill.s1", "master.dan.skill.s1a", "master.dan.skill.ascension"];
  assert.deepEqual(ids.map((id) => built.skills.get(id).supportLevel), ["FULL", "FULL", "FULL"]);
  assert.equal(built.skills.get("master.dan.skill.s1").handlerId, "core.dan-sniper");
  assert.equal(built.skills.get("master.dan.skill.s1a").handlerId, "core.dan-honor");
  const ascension = built.skills.get("master.dan.skill.ascension");
  assert.equal(ascension.handlerId, "core.attached-supply-append");
  assert.deepEqual(ascension.attachedSupplyAppend.definitionIds, [
    "card.cardpreparation",
    "card.cardpreparation",
    "card.cardpreparation",
    "card.cardsurveil",
    "card.cardsurveil",
  ]);
});

test("Dan package: May Day Knight seeds attached cards, append-plays one per round, pays cost and draws", () => {
  const engine = buildEngine();
  let state = createGameState({ gameInstanceId: "dan-mayday", players: [{ id: "dan", name: "丹" }], seed: 801 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "dan";
  state.players.dan.masterId = "master.dan";
  state.players.dan.mana = 10;
  createOwnedCardInstance(state, "dan", { instanceId: "mayday", definitionId: "master.dan.skill.ascension", zone: "master-skills", face: "up" });
  createOwnedCardInstance(state, "dan", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand" });
  createOwnedCardInstance(state, "dan", { instanceId: "draw-card", definitionId: "card.cardb2", zone: "deck" });

  let result = engine.execute(state, command(state, "play-mayday", CommandType.CommitAttack, "dan", {
    faceUpInstanceIds: ["mayday", "basic"],
    faceDownInstanceIds: [],
  }));
  state = result.state;

  const attached = Object.values(state.cards).filter((card) => card.zone === "attached" && card.attachedToInstanceId === "mayday");
  assert.equal(attached.length, 5);
  assert.equal(attached.filter((card) => card.definitionId === "card.cardpreparation").length, 3);
  assert.equal(attached.filter((card) => card.definitionId === "card.cardsurveil").length, 2);

  state.step = "player-window";
  result = engine.execute(state, command(state, "append-remote", CommandType.UseSkill, "dan", {
    skillId: "master.dan.skill.ascension",
    data: { abilityId: "append-supplied-basic", instanceId: attached[0].instanceId },
  }));
  state = result.state;

  assert.equal(state.cards[attached[0].instanceId].zone, "attack");
  assert.equal(state.cards[attached[0].instanceId].active, true);
  assert.equal(state.cards[attached[0].instanceId].paidCost, 1);
  assert.equal(state.players.dan.mana, 9);
  assert.equal(state.players.dan.flags.roundManaSpent, 1);
  assert.ok(state.players.dan.hand.includes("draw-card"));
  assert.equal(Object.values(state.cards).filter((card) => card.zone === "attached" && card.attachedToInstanceId === "mayday").length, 4);
  assert.ok(result.events.some((event) => event.type === "card.played" && event.payload.instanceId === attached[0].instanceId));

  assert.throws(() => engine.execute(state, command(state, "append-again", CommandType.UseSkill, "dan", {
    skillId: "master.dan.skill.ascension",
    data: { abilityId: "append-supplied-basic", instanceId: attached[1].instanceId },
  })), /SKILL_USE_FORBIDDEN/);
});
