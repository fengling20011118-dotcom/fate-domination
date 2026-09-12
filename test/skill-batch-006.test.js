import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { movePlayer, movePlayerByEffect } from "../src/rules-core/board.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { SkillRegistry } from "../src/rules-core/skill-registry.ts";

const emptyContent = { cards: {}, situations: [], events: [], playerDecks: {} };

function command(state, id, actorId, skillId, data) {
  return {
    commandId: id,
    gameInstanceId: state.gameInstanceId,
    actorId,
    expectedRevision: state.revision,
    type: CommandType.UseSkill,
    payload: { skillId, data },
  };
}

function actionState(id = "skills-006") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }, { id: "p3", name: "三" }],
    seed: 6,
  });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.davinci";
  state.players.p2.servantId = "servant.target";
  state.players.p3.servantId = "servant.other";
  return state;
}

function registerConsumable(id, handlerId) {
  const skills = new SkillRegistry();
  skills.register({
    id,
    name: id,
    ownerType: "servant",
    ownerId: "servant.davinci",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId,
    requiresActiveCard: false,
  });
  return skills;
}

test("skills-006 起源档案公开目标真名、移除自身并产生目标领域事件", () => {
  const skillId = "servant.davinci.skill.sc-davinci-5";
  const skills = registerConsumable(skillId, "core.reveal-target-true-name-and-exile");
  const engine = new StandardMatchEngine({ ...emptyContent, skills });
  const state = actionState("origin-record");
  createOwnedCardInstance(state, "p1", { instanceId: "origin", definitionId: skillId, zone: "servant-skills" });

  const result = engine.execute(state, command(state, "use-origin", "p1", skillId, { targetPlayerId: "p2" }));
  assert.equal(result.state.players.p2.trueNameRevealed, true);
  assert.equal(result.state.cards.origin.zone, "removed");
  assert.deepEqual(result.events.filter((event) => event.type === "servant.true-name-revealed").map((event) => event.payload), [
    { playerId: "p2", servantId: "servant.target" },
  ]);
  assert.throws(() => engine.execute(result.state, command(result.state, "origin-again", "p1", skillId, { targetPlayerId: "p3" })), /SKILL_USE_FORBIDDEN/);
});

test("skills-006 金苹果阻止本回合普通移动、效果移动并在新回合失效", () => {
  const skillId = "servant.davinci.skill.sc-davinci-16";
  const skills = registerConsumable(skillId, "core.block-movement-and-exile");
  const engine = new StandardMatchEngine({ ...emptyContent, skills });
  const state = actionState("golden-apple");
  createOwnedCardInstance(state, "p1", { instanceId: "apple", definitionId: skillId, zone: "servant-skills" });
  state.players.p2.locationId = "workshop";
  state.board.locations.workshop = ["p2"];

  const result = engine.execute(state, command(state, "use-apple", "p1", skillId, { targetPlayerId: "p2" }));
  assert.equal(result.state.players.p2.flags.movementBlockedRound, 2);
  assert.equal(result.state.cards.apple.zone, "removed");
  result.state.activePlayerId = "p2";
  result.state.step = "move-decision";
  assert.throws(() => movePlayer(result.state, "p2", "mountain"), /PLAYER_MOVEMENT_BLOCKED/);
  assert.throws(() => movePlayerByEffect(result.state, "p2", "city"), /PLAYER_MOVEMENT_BLOCKED/);
  result.state.round = 3;
  assert.doesNotThrow(() => movePlayerByEffect(result.state, "p2", "city"));
});

test("skills-006 梦幻召唤枪兵复用任意非工房移动并登记共享次数组", () => {
  const skillId = "servant.illya.skill.sc-illya-7";
  const skills = new SkillRegistry();
  skills.register({
    id: skillId,
    name: "梦幻召唤-枪兵",
    ownerType: "servant",
    ownerId: "servant.illya",
    activation: "phase",
    windows: ["action"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    handlerId: "core.move-to-non-workshop",
    requiresActiveCard: true,
    uniqueGroup: "illya-dream-summon",
  });
  const engine = new StandardMatchEngine({ ...emptyContent, skills });
  const state = actionState("illya-lancer");
  state.players.p1.servantId = "servant.illya";
  state.players.p1.locationId = "workshop";
  state.board.locations.workshop = ["p1"];
  createOwnedCardInstance(state, "p1", { instanceId: "lancer", definitionId: skillId, zone: "attack", face: "up", active: true });
  const result = engine.execute(state, command(state, "use-lancer", "p1", skillId, { locationId: "city" }));
  assert.equal(result.state.players.p1.locationId, "city");
  assert.equal(result.state.players.p1.usage["__unique:illya-dream-summon"].round, 2);
});
