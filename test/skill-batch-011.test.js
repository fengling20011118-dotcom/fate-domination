import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { buildStandardContent } from "../src/content/content-package.ts";
import { useIllyaDreamArcher, useIllyaDreamAssassin } from "../src/rules-core/skill-handlers.ts";

function skill(id, handlerId) {
  return {
    id,
    name: id,
    ownerType: "servant",
    ownerId: "servant.illya",
    activation: "phase",
    windows: ["combat"],
    cost: 0,
    text: "",
    supportLevel: "FULL",
    uniqueGroup: "illya-dream-summon",
    handlerId,
  };
}

test("skills-011 梦幻召唤弓兵在本战场获胜后按当前顺位之后的存活玩家数获得战果", () => {
  const state = createGameState({
    gameInstanceId: "dream-archer",
    players: [
      { id: "p3", name: "P3" },
      { id: "illya", name: "伊莉雅" },
      { id: "p2", name: "P2" },
      { id: "p4", name: "P4" },
    ],
    seed: 1,
  });
  state.round = 4;
  state.turnOrder = ["p3", "illya", "p2", "p4"];
  state.players.p4.eliminated = true;
  const archer = skill("servant.illya.skill.sc-illya-6", "core.illya-dream-archer");
  useIllyaDreamArcher({ state, player: state.players.illya, skill: archer, payload: undefined, openDecision: () => undefined });
  useIllyaDreamArcher({
    state,
    player: state.players.illya,
    skill: archer,
    payload: { eventType: "combat.resolved", event: { powers: { illya: 5, p2: 3 }, winnerIds: ["illya"] } },
    openDecision: () => undefined,
  });
  assert.equal(state.players.illya.victoryPoints, 1);
  assert.equal(state.players.illya.flags.illyaDreamArcherRound, undefined);
});

test("skills-011 梦幻召唤暗杀者按交战对手本回合技能使用数偷取战果", () => {
  const state = createGameState({
    gameInstanceId: "dream-assassin",
    players: [
      { id: "illya", name: "伊莉雅" },
      { id: "opponentA", name: "A" },
      { id: "opponentB", name: "B" },
    ],
    seed: 1,
  });
  state.round = 3;
  state.players.opponentA.victoryPoints = 3;
  state.players.opponentB.victoryPoints = 1;
  const assassin = skill("servant.illya.skill.sc-illya-8", "core.illya-dream-assassin");
  useIllyaDreamAssassin({ state, player: state.players.illya, skill: assassin, payload: { eventType: "skill.used", event: { playerId: "opponentA", skillId: "skill.a" } }, openDecision: () => undefined });
  useIllyaDreamAssassin({ state, player: state.players.illya, skill: assassin, payload: { eventType: "skill.used", event: { playerId: "opponentA", skillId: "skill.b" } }, openDecision: () => undefined });
  useIllyaDreamAssassin({ state, player: state.players.illya, skill: assassin, payload: { eventType: "card.played", event: { playerId: "opponentB", definitionId: "skill.c", face: "up" } }, openDecision: () => undefined });
  useIllyaDreamAssassin({ state, player: state.players.illya, skill: assassin, payload: undefined, openDecision: () => undefined });
  useIllyaDreamAssassin({
    state,
    player: state.players.illya,
    skill: assassin,
    payload: { eventType: "combat.resolved", event: { powers: { illya: 4, opponentA: 2, opponentB: 1 }, winnerIds: ["opponentA"] } },
    openDecision: () => undefined,
  });
  assert.equal(state.players.illya.victoryPoints, 3);
  assert.equal(state.players.opponentA.victoryPoints, 1);
  assert.equal(state.players.opponentB.victoryPoints, 0);
  assert.equal(state.players.illya.flags.illyaDreamAssassinRound, undefined);
});

test("skills-011 弓兵和暗杀者梦幻召唤达到FULL且仍共享梦幻召唤唯一组", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const built = buildStandardContent(raw);
  for (const id of ["servant.illya.skill.sc-illya-6", "servant.illya.skill.sc-illya-8"]) {
    const definition = built.skills.get(id);
    assert.equal(definition.supportLevel, "FULL", id);
    assert.equal(definition.uniqueGroup, "illya-dream-summon", id);
    assert.equal(definition.windows.includes("combat"), true, id);
  }
});
