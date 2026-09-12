import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance, closePlayerCard } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { movePlayerByEffect } from "../src/rules-core/board.ts";
import { isCardSourceAbilityActivationBlocked } from "../src/rules-core/ability-activation-restrictions.ts";
import { playerIgnoresDefeat } from "../src/rules-core/defeat.ts";
import { getStructuredCombatPower, getStructuredVictoryPointGainForSource } from "../src/rules-core/rule-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  RITSUKA_M_ASCENSION_ID,
  RITSUKA_M_CRAFT_ESSENCES,
  RITSUKA_M_DECEPTION_ABILITY,
  RITSUKA_M_ESSENCE_ID,
  RITSUKA_M_GACHA_ABILITY,
  RITSUKA_M_GACHA_ID,
  RITSUKA_M_HANDLER,
  resolveRitsukaMDecision,
  useRitsukaMCraftEssence,
} from "../src/rules-core/ritsuka-m.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const skill = (id) => built.skills.get(id);

function setup(id = "ritsuka-m") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "r", name: "Ritsuka" }, { id: "o", name: "Opponent" }, { id: "x", name: "Third" }],
    seed: 9701,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "r";
  state.turnOrder = ["r", "o", "x"];
  state.players.r.masterId = "master.ritsuka-m";
  state.players.r.servantId = "servant.cu";
  state.players.r.locationId = "mountain";
  state.players.r.mana = 20;
  state.players.r.victoryPoints = 5;
  state.players.o.locationId = "mountain";
  state.players.o.mana = 0;
  state.players.x.locationId = "city";
  state.players.x.mana = 0;
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["r", "o"];
  state.board.locations.city = ["x"];
  state.board.locations.scouting = [];
  state.players.r.flags.ritsukaMCraftEssenceSetupComplete = true;
  state.players.r.flags.ritsukaMCraftEssencePool = [...RITSUKA_M_CRAFT_ESSENCES];
  return state;
}

function context(state, skillDefinition, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.r,
    skill: skillDefinition,
    payload,
    definitions,
    randomInt: (max) => max - 1,
    openDecision() {},
    ...extra,
  };
}

function popPrevious(state, stage) {
  const frame = state.effectQueue.find((entry) => entry.handlerId === "core.ritsuka-m-craft-essence-resolve" && entry.payload?.stage === stage);
  assert.ok(frame, `missing ${stage}`);
  state.effectQueue = state.effectQueue.filter((entry) => entry !== frame);
  return frame.payload;
}

function setPool(state, ids) {
  state.players.r.flags.ritsukaMCraftEssencePool = [...ids];
}

function gacha(state, ids, selections, x = Math.max(0, selections.length - 1)) {
  setPool(state, ids);
  let decision;
  const pending = useRitsukaMCraftEssence(context(state, skill(RITSUKA_M_GACHA_ID), {
    abilityId: RITSUKA_M_GACHA_ABILITY,
    x,
  }, { openDecision(value) { decision = value; } }));
  assert.equal(pending.pending, true);
  const previous = popPrevious(state, "gacha-pick");
  const result = resolveRitsukaMDecision(context(state, skill(RITSUKA_M_GACHA_ID), {
    previous,
    decision: { status: "resolved", selections },
  }));
  return { decision, result };
}

function add(state, playerId, instanceId, definitionId, zone = "attack", overrides = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" ? "up" : zone.endsWith("skills") ? "up" : "down",
    active: zone === "attack",
    residual: false,
    ...overrides,
  });
}

test("Ritsuka-M package is 3/3 FULL with one dedicated handler", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.ritsuka-m");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === RITSUKA_M_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill(RITSUKA_M_ASCENSION_ID).initiallyOwned, false);
});

test("game start creates the 15-CE private pool and removes exactly three chosen Essences", () => {
  const state = setup("ritsuka-m-setup");
  delete state.players.r.flags.ritsukaMCraftEssenceSetupComplete;
  delete state.players.r.flags.ritsukaMCraftEssencePool;
  let decision;
  const pending = useRitsukaMCraftEssence(context(state, skill(RITSUKA_M_GACHA_ID), {
    eventType: "game.started",
    event: {},
  }, { openDecision(value) { decision = value; } }));
  assert.equal(pending.pending, true);
  assert.equal(decision.min, 3);
  assert.equal(decision.max, 3);
  assert.equal(decision.options.length, 15);
  const previous = popPrevious(state, "setup-remove");
  const removed = ["destruction", "gloom", "combat"];
  const result = resolveRitsukaMDecision(context(state, skill(RITSUKA_M_GACHA_ID), {
    previous,
    decision: { status: "resolved", selections: removed },
  }));
  assert.equal(result.availableCount, 12);
  assert.deepEqual(new Set(state.players.r.flags.ritsukaMRemovedCraftEssences), new Set(removed));
  assert.ok(removed.every((id) => !state.players.r.flags.ritsukaMCraftEssencePool.includes(id)));
});

test("attribute/Flash/Combat/Gloom/Barrier/Tenacity CE effects use shared runtime modifiers", () => {
  const state = setup("ritsuka-m-common-effects");
  add(state, "r", "str", "card.cardb2");
  add(state, "r", "mag", "card.carda1");
  const baseStrength = calculateCombatCardPower(state, state.players.r, "str", definitions, "mountain");
  const baseMagic = calculateCombatCardPower(state, state.players.r, "mag", definitions, "mountain");
  gacha(state, ["destruction"], ["destruction"], 0);
  assert.equal(calculateCombatCardPower(state, state.players.r, "str", definitions, "mountain"), baseStrength + 2);
  assert.equal(calculateCombatCardPower(state, state.players.r, "mag", definitions, "mountain"), baseMagic - 1);

  state.players.r.usage = {};
  gacha(state, ["combat"], ["combat"], 0);
  assert.equal(getStructuredCombatPower(state, "r", definitions, 0), 1);
  assert.equal(state.players.r.flags.manaGainBlockedThroughRound, state.round);

  state.players.r.usage = {};
  gacha(state, ["gloom"], ["gloom"], 0);
  assert.equal(isCardSourceAbilityActivationBlocked(state, "o", { definitionId: "test", attributes: ["特殊"], basic: true }), true);
  assert.equal(isCardSourceAbilityActivationBlocked(state, "o", { definitionId: "test", attributes: ["特殊"], basic: false }), false);

  state.players.r.usage = {};
  gacha(state, ["barrier"], ["barrier"], 0);
  assert.equal(state.players.r.flags.terrainAdvantageContributionMultiplier, 2);
  assert.equal(state.players.r.flags.movementBlockedOwnTurnRound, state.round);
  assert.throws(() => movePlayerByEffect(state, "r", "city", definitions), /PLAYER_MOVEMENT_BLOCKED/);

  state.players.r.usage = {};
  gacha(state, ["tenacity"], ["tenacity"], 0);
  assert.equal(playerIgnoresDefeat(state, state.players.r, definitions), true);
  assert.equal(getStructuredCombatPower(state, "r", definitions, 10), 8);
});

test("Mapo Tofu modifies scouting VP and Priest's Blessing doubles permanently for every Mapo gained", () => {
  const state = setup("ritsuka-m-mapo");
  const ascension = add(state, "r", "blessing", `card.skill.${RITSUKA_M_ASCENSION_ID}`, "master-skills");
  const unlocked = useRitsukaMCraftEssence(context(state, skill(RITSUKA_M_ASCENSION_ID), {
    eventType: "skill.unlocked",
    event: { playerId: "r", skillId: RITSUKA_M_ASCENSION_ID },
  }));
  assert.equal(unlocked.instanceId, "blessing");
  assert.equal(ascension.zone, "attack");
  assert.equal(ascension.residual, true);
  assert.throws(() => closePlayerCard(state, "r", "blessing", definitions), /CARD_CLOSE_FORBIDDEN_BY_RULE/);

  state.players.r.usage = {};
  const { result } = gacha(state, ["opportunity", "mapo-tofu"], ["opportunity"], 0);
  assert.deepEqual(result.resolvedEssences, ["mapo-tofu", "mapo-tofu", "opportunity"]);
  assert.equal(state.players.r.flags.ritsukaMMapoTofuCount, 2);
  assert.equal(ascension.basePowerMultiplier, 4);
  assert.equal(getStructuredCombatPower(state, "r", definitions, 10), 6);
  assert.equal(getStructuredVictoryPointGainForSource(state, "r", definitions, "scouting", 2), 6);
});

test("Linkage makes the next Gacha pick up to two; Ley Line and Preemption resolve exactly from chosen stacks", () => {
  const state = setup("ritsuka-m-linkage");
  gacha(state, ["linkage"], ["linkage"], 0);
  assert.equal(state.players.r.flags.ritsukaMLinkageReady, true);
  state.players.r.usage = {};
  const beforeR = state.players.r.mana;
  const beforeO = state.players.o.mana;
  const { decision } = gacha(state, ["ley-line", "preemption"], ["ley-line", "preemption"], 1);
  assert.equal(decision.max, 2);
  assert.equal(state.players.r.mana, beforeR - 1 + 3);
  assert.equal(state.players.o.mana, beforeO + 1);
  assert.equal(state.players.r.flags.ritsukaMPreemptionStacks, 1);
  state.players.r.flags.combatWinRound = state.round;
  const vpBefore = state.players.r.victoryPoints;
  const reward = useRitsukaMCraftEssence(context(state, skill(RITSUKA_M_ESSENCE_ID), { eventType: "combat.ending", event: {} }));
  assert.equal(reward.won, true);
  assert.equal(state.players.r.victoryPoints, vpBefore + 2);
});

test("Meditation permanently shrinks the available CE pool", () => {
  const state = setup("ritsuka-m-meditation");
  setPool(state, ["meditation", "destruction", "technique"]);
  const manaBefore = state.players.r.mana;
  let firstDecision;
  useRitsukaMCraftEssence(context(state, skill(RITSUKA_M_GACHA_ID), { abilityId: RITSUKA_M_GACHA_ABILITY, x: 0 }, { openDecision(value) { firstDecision = value; } }));
  const gachaPrevious = popPrevious(state, "gacha-pick");
  let removeDecision;
  const pending = resolveRitsukaMDecision(context(state, skill(RITSUKA_M_GACHA_ID), {
    previous: gachaPrevious,
    decision: { status: "resolved", selections: ["meditation"] },
  }, { openDecision(value) { removeDecision = value; } }));
  assert.equal(pending.pending, true);
  assert.equal(state.players.r.mana, manaBefore + 1);
  assert.equal(removeDecision.kind, "ritsuka-m-meditation-remove");
  const removePrevious = popPrevious(state, "meditation-remove");
  resolveRitsukaMDecision(context(state, skill(RITSUKA_M_GACHA_ID), {
    previous: removePrevious,
    decision: { status: "resolved", selections: ["destruction"] },
  }));
  assert.deepEqual(state.players.r.flags.ritsukaMCraftEssencePool, ["meditation", "technique"]);
});

test("Deception pays the printed cost and activates one face-down basic attack", () => {
  const state = setup("ritsuka-m-deception");
  gacha(state, ["deception"], ["deception"], 0);
  const hidden = add(state, "r", "hidden", "card.cardq2", "attack", { face: "down", active: false });
  state.phase = "combat";
  state.activePlayerId = "r";
  const manaBefore = state.players.r.mana;
  const result = useRitsukaMCraftEssence(context(state, skill(RITSUKA_M_ESSENCE_ID), {
    abilityId: RITSUKA_M_DECEPTION_ABILITY,
    targetInstanceId: "hidden",
  }));
  assert.equal(hidden.face, "up");
  assert.equal(hidden.active, true);
  assert.equal(state.players.r.mana, manaBefore - result.paidMana);
  assert.equal(state.players.r.flags.ritsukaMDeceptionRemaining, 0);
});
