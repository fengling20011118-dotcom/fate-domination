import test from "node:test";
import assert from "node:assert/strict";

import { GAME_STATUS } from "../src/core/constants.js";
import { createGameState } from "../src/core/createGameState.js";
import { SkillRegistry } from "../src/skills/SkillRegistry.js";
import { SkillRuntime } from "../src/skills/SkillRuntime.js";

function setup() {
  const state = createGameState({
    gameInstanceId: "skill-test",
    players: [{ id: "p1", name: "玩家" }],
    seed: 1,
  });
  state.status = GAME_STATUS.PLAYING;
  state.round = 1;
  state.activeSeat = 0;
  return state;
}

test("强制被动不会成为玩家可点击操作", () => {
  const registry = new SkillRegistry();
  registry.registerDefinition({
    id: "master.test.skill.passive",
    activation: { kind: "passive", event: "round.started", windows: [] },
    handler: "test.passive",
  });
  registry.registerHandler("test.passive", () => {});

  const runtime = new SkillRuntime(registry);
  const state = setup();
  assert.deepEqual(runtime.getLegalActivations(state, "p1", ["master.test.skill.passive"]), []);
});

test("被动/前哨阶段只在自己的前哨阶段显示为可选操作", () => {
  const registry = new SkillRegistry();
  registry.registerDefinition({
    id: "master.test.skill.optional-outpost",
    activation: { kind: "optional-trigger", windows: ["outpost"] },
    handler: "test.optional-outpost",
    cost: { mana: 1 },
    limit: "once-per-round",
  });
  registry.registerHandler("test.optional-outpost", () => {});
  const runtime = new SkillRuntime(registry);
  const state = setup();
  state.players.p1.mana = 1;

  state.phase = "action";
  assert.equal(
    runtime.getLegalActivations(state, "p1", ["master.test.skill.optional-outpost"]).length,
    0,
  );

  state.phase = "outpost";
  assert.equal(
    runtime.getLegalActivations(state, "p1", ["master.test.skill.optional-outpost"]).length,
    1,
  );

  state.players.p1.usage["master.test.skill.optional-outpost"] = { round: 1 };
  assert.equal(
    runtime.getLegalActivations(state, "p1", ["master.test.skill.optional-outpost"]).length,
    0,
  );
});
