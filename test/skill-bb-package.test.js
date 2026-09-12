import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getMoonCellState, isPlayerInMoonCell, setMoonCellState } from "../src/rules-core/moon-cell.ts";
import { MOON_CANCER_HANDLER } from "../src/rules-core/moon-cancer.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  BB_CCC_ID,
  BB_HANDLER,
  BB_MOON_CANCER_ID,
  BB_PRIVILEGE_ABILITY,
  BB_PRIVILEGE_ID,
  BB_SLOT_ABILITY,
  BB_SLOT_ID,
  resolveBbDecision,
  useBb,
} from "../src/rules-core/bb.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "bb") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "b", name: "BB" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 31,
  });
  state.status = "playing";
  state.round = 6;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "b";
  state.turnOrder = ["b", "o", "x"];
  state.players.b.servantId = "servant.bb";
  state.players.b.locationId = "mountain";
  state.players.o.locationId = "city";
  state.players.x.locationId = "city";
  state.board.locations.mountain = ["b"];
  state.board.locations.city = ["o", "x"];
  state.players.b.mana = 10;
  return state;
}

function ctx(state, skillId, payload = {}, extras = {}) {
  return {
    state,
    player: state.players.b,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extras,
  };
}

function activeSkill(state, skillId, instanceId = `b:${skillId}`) {
  return createOwnedCardInstance(state, "b", {
    instanceId,
    definitionId: skillId,
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });
}

function handCard(state, playerId, instanceId, definitionId) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone: "hand",
    face: "down",
    active: false,
  });
}

test("BB package is 4/4 FULL with three dedicated skills and shared Moon Cancer", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.bb");
  assert.equal(skills.length, 4);
  assert.equal(skills.filter((skill) => skill.supportLevel === "FULL").length, 4);
  assert.deepEqual(skills.filter((skill) => skill.supportLevel === "PARTIAL"), []);
  assert.equal(built.skills.get(BB_PRIVILEGE_ID).handlerId, BB_HANDLER);
  assert.equal(built.skills.get(BB_SLOT_ID).handlerId, BB_HANDLER);
  assert.equal(built.skills.get(BB_CCC_ID).handlerId, BB_HANDLER);
  assert.equal(built.skills.get(BB_MOON_CANCER_ID).handlerId, MOON_CANCER_HANDLER);
});

test("Privilege Access pays 3 mana each way and restores retained terrain when leaving Moon Cell", () => {
  const state = setup("bb-privilege");
  state.players.b.flags.deploymentLocationId = "mountain";
  state.players.b.flags.deploymentBonus = 3;
  state.players.b.flags.deploymentBonusActive = true;

  const entered = useBb(ctx(state, BB_PRIVILEGE_ID, { abilityId: BB_PRIVILEGE_ABILITY }));
  assert.equal(entered.direction, "enter");
  assert.equal(entered.retainedTerrain, 3);
  assert.equal(state.players.b.mana, 7);
  assert.equal(state.players.b.locationId, null);
  assert.equal(isPlayerInMoonCell(state, "b"), true);
  assert.equal(getMoonCellState(state).retainedTerrainByPlayer.b, 3);
  assert.equal(state.board.locations.mountain.includes("b"), false);

  const exited = useBb(ctx(state, BB_PRIVILEGE_ID, { abilityId: BB_PRIVILEGE_ABILITY, targetLocationId: "city" }));
  assert.equal(exited.direction, "exit");
  assert.equal(exited.restoredTerrain, 3);
  assert.equal(state.players.b.mana, 4);
  assert.equal(state.players.b.locationId, "city");
  assert.equal(isPlayerInMoonCell(state, "b"), false);
  assert.equal(state.players.b.flags.deploymentBonusActive, true);
  assert.equal(state.players.b.flags.deploymentBonus, 3);
});

test("Privilege Access cannot leave Moon Cell while another living player is there", () => {
  const state = setup("bb-privilege-engaged");
  state.players.b.locationId = null;
  state.board.locations.mountain = [];
  state.players.o.locationId = null;
  state.board.locations.city = ["x"];
  setMoonCellState(state, { playerIds: ["b", "o"] });
  assert.throws(() => useBb(ctx(state, BB_PRIVILEGE_ID, { abilityId: BB_PRIVILEGE_ABILITY, targetLocationId: "mountain" })), /BB_PRIVILEGE_MOON_CELL_ENGAGED/);
  assert.equal(state.players.b.mana, 10);
});

test("B.B. Slot Machine resolves three Strength discards as +6 power and +3 VP", () => {
  const state = setup("bb-slot-strength");
  activeSkill(state, BB_SLOT_ID);
  handCard(state, "b", "b:strength", "card.cardb1");
  handCard(state, "o", "o:strength", "card.cardb2");
  handCard(state, "x", "x:strength", "card.cardb3");
  let opened;
  useBb(ctx(state, BB_SLOT_ID, { abilityId: BB_SLOT_ABILITY }, { openDecision(decision) { opened = decision; } }));
  assert.equal(opened.kind, "bb-slot-targets");
  const frame = state.effectQueue[0];
  const result = resolveBbDecision(ctx(state, BB_SLOT_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["b", "o", "x"] },
  }, { randomInt: () => 0 }));
  assert.equal(result.discarded.length, 3);
  assert.equal(state.players.b.flags.roundPowerBonus, 6);
  assert.equal(state.players.b.victoryPoints, 3);
  assert.ok(state.players.b.discard.includes("b:strength"));
  assert.ok(state.players.o.discard.includes("o:strength"));
  assert.ok(state.players.x.discard.includes("x:strength"));
});

test("C.C.C. merges Moon Cell players into BB's battlefield until round end", () => {
  const state = setup("bb-ccc-merge");
  const source = activeSkill(state, BB_CCC_ID, "b:ccc");
  state.players.o.locationId = null;
  state.board.locations.city = ["x"];
  setMoonCellState(state, { playerIds: ["o"] });
  const result = useBb(ctx(state, BB_CCC_ID, {
    eventType: "card.played",
    event: { playerId: "b", instanceId: source.instanceId, definitionId: BB_CCC_ID, face: "up" },
  }));
  assert.equal(result.mergedLocationId, "mountain");
  assert.equal(state.players.o.locationId, "mountain");
  assert.ok(state.board.locations.mountain.includes("o"));
  assert.equal(isPlayerInMoonCell(state, "o"), true);

  const cleanup = useBb(ctx(state, BB_CCC_ID, { eventType: "round.ending", event: {} }));
  assert.deepEqual(cleanup.restoredPlayerIds, ["o"]);
  assert.equal(state.players.o.locationId, null);
  assert.equal(state.board.locations.mountain.includes("o"), false);
  assert.equal(isPlayerInMoonCell(state, "o"), true);
});

test("C.C.C. gets +5 power while BB is only in Moon Cell", () => {
  const state = setup("bb-ccc-power");
  state.players.b.locationId = null;
  state.board.locations.mountain = [];
  setMoonCellState(state, { playerIds: ["b"] });
  const source = activeSkill(state, BB_CCC_ID, "b:ccc");
  const result = useBb(ctx(state, BB_CCC_ID, {
    eventType: "card.played",
    event: { playerId: "b", instanceId: source.instanceId, definitionId: BB_CCC_ID, face: "up" },
  }));
  assert.equal(result.moonCellOnly, true);
  assert.ok(source.powerModifiers.some((modifier) => modifier.sourceId === BB_CCC_ID && modifier.value === 5));
});
