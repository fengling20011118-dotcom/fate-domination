import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  REINES_ALCHEMIST_ABILITY,
  REINES_ALCHEMIST_ID,
  REINES_ASCENSION_ID,
  REINES_CONFESSION_ABILITY,
  REINES_HANDLER,
  REINES_LITTLE_DEVIL_ID,
  REINES_MANA_HAND_ABILITY,
  REINES_MANA_ID,
  REINES_MOVEMENT_ID,
  REINES_POWER_HAND_ABILITY,
  REINES_POWER_ID,
  REINES_SCALP_ABILITY,
  REINES_WING_ACTION_ABILITY,
  REINES_WING_HAND_ABILITY,
  useReinesTrimmau,
} from "../src/rules-core/reines.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function skill(id) { return built.skills.get(id); }

function setup(gameInstanceId = "reines", playerCount = 3) {
  const specs = Array.from({ length: playerCount }, (_, index) => ({
    id: index === 0 ? "r" : String.fromCharCode(96 + index),
    name: index === 0 ? "Reines" : `P${index}`,
  }));
  const state = createGameState({ gameInstanceId, players: specs, seed: 441 });
  state.status = "playing";
  state.round = 5;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "r";
  state.turnOrder = specs.map((entry) => entry.id);
  state.players.r.masterId = "master.reines";
  state.players.r.servantId = "servant.saber";
  const otherMasters = ["master.rin", "master.kirei", "master.shirou", "master.waver"];
  const otherServants = ["servant.gil", "servant.cu", "servant.emiya", "servant.medusa"];
  let offset = 0;
  for (const player of Object.values(state.players)) {
    player.locationId = "mountain";
    player.mana = 20;
    player.victoryPoints = player.id === "r" ? 10 : 3;
    if (player.id !== "r") {
      player.masterId = otherMasters[offset] ?? "master.rin";
      player.servantId = otherServants[offset] ?? "servant.cu";
      offset += 1;
    }
  }
  state.board.locations.workshop = [];
  state.board.locations.mountain = specs.map((entry) => entry.id);
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "hand", options = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" || zone === "master-skills" || zone === "servant-skills" ? "up" : "down",
    active: zone === "attack",
    ...options,
  });
}

function ctx(state, skillDefinition, payload, extra = {}) {
  return {
    state,
    player: state.players.r,
    skill: skillDefinition,
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    ...extra,
  };
}

function addActiveTrimmau(state, skillId, suffix = "source") {
  return add(state, "r", `r:${suffix}`, `card.skill.${skillId}`, "attack", { originMasterId: "master.reines" });
}

function addHandTrimmau(state, skillId, suffix = "hand") {
  return add(state, "r", `r:${suffix}`, `card.skill.${skillId}`, "hand", { originMasterId: "master.reines" });
}

test("Reines package is 6/6 FULL and the three Trimmau attacks start outside the game", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.reines");
  assert.equal(skills.length, 6);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === REINES_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  for (const id of [REINES_POWER_ID, REINES_MOVEMENT_ID, REINES_MANA_ID]) assert.equal(skill(id).initiallyOwned, false);
  for (const candidate of skills) {
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("Alchemist chooses one remaining outside-game Trimmau and adds the physical card to hand without duplicating it", () => {
  const state = setup("reines-alchemist");
  const first = useReinesTrimmau(ctx(state, skill(REINES_ALCHEMIST_ID), {
    abilityId: REINES_ALCHEMIST_ABILITY,
    trimmauSkillId: REINES_POWER_ID,
  }));
  assert.equal(first.definitionId, `card.skill.${REINES_POWER_ID}`);
  assert.ok(state.players.r.hand.includes(first.instanceId));
  assert.equal(state.cards[first.instanceId].face, "down");
  assert.throws(() => useReinesTrimmau(ctx(state, skill(REINES_ALCHEMIST_ID), {
    abilityId: REINES_ALCHEMIST_ABILITY,
    trimmauSkillId: REINES_POWER_ID,
  })), /REINES_ALCHEMIST_SELECTION_INVALID/);
  const second = useReinesTrimmau(ctx(state, skill(REINES_ALCHEMIST_ID), {
    abilityId: REINES_ALCHEMIST_ABILITY,
    trimmauSkillId: REINES_MOVEMENT_ID,
  }));
  assert.ok(state.players.r.hand.includes(second.instanceId));
});

test("Trimmau power card works from hand in Combat and Scalp plays one paid attack from hand while active", () => {
  const state = setup("reines-power");
  addHandTrimmau(state, REINES_POWER_ID, "power-hand");
  state.phase = "combat";
  const handResult = useReinesTrimmau(ctx(state, skill(REINES_POWER_ID), { abilityId: REINES_POWER_HAND_ABILITY }));
  assert.equal(handResult.powerBonus, 2);
  assert.equal(state.players.r.flags.roundPowerBonus, 2);

  state.phase = "action";
  state.players.r.hand = [];
  delete state.cards["r:power-hand"];
  addActiveTrimmau(state, REINES_POWER_ID, "power-active");
  add(state, "r", "r:basic", "card.cardb1", "hand");
  const beforeMana = state.players.r.mana;
  const scalp = useReinesTrimmau(ctx(state, skill(REINES_POWER_ID), { abilityId: REINES_SCALP_ABILITY, instanceId: "r:basic" }));
  assert.equal(scalp.instanceId, "r:basic");
  assert.ok(state.players.r.attack.includes("r:basic"));
  assert.equal(state.cards["r:basic"].active, true);
  assert.equal(state.players.r.mana, beforeMana - scalp.paidMana);
});

test("Trimmau wing moves forward from hand in Combat and backward while active in Action", () => {
  const forward = setup("reines-wing-forward");
  addHandTrimmau(forward, REINES_MOVEMENT_ID, "wing-hand");
  forward.phase = "combat";
  useReinesTrimmau(ctx(forward, skill(REINES_MOVEMENT_ID), { abilityId: REINES_WING_HAND_ABILITY }));
  assert.equal(forward.players.r.locationId, "city");

  const backward = setup("reines-wing-backward");
  addActiveTrimmau(backward, REINES_MOVEMENT_ID, "wing-active");
  backward.phase = "action";
  useReinesTrimmau(ctx(backward, skill(REINES_MOVEMENT_ID), { abilityId: REINES_WING_ACTION_ABILITY }));
  assert.equal(backward.players.r.locationId, "workshop");
});

test("Trimmau confession gains mana from hand; active Confession privately inspects hidden skills or gives +4 if the target name is already revealed", () => {
  const state = setup("reines-confession");
  addHandTrimmau(state, REINES_MANA_ID, "mana-hand");
  state.phase = "combat";
  state.players.r.mana = 4;
  const mana = useReinesTrimmau(ctx(state, skill(REINES_MANA_ID), { abilityId: REINES_MANA_HAND_ABILITY }));
  assert.equal(mana.manaGained, 1);
  assert.equal(state.players.r.mana, 5);

  state.phase = "action";
  state.players.r.hand = [];
  delete state.cards["r:mana-hand"];
  addActiveTrimmau(state, REINES_MANA_ID, "mana-active");
  add(state, "a", "a:master-skill", "master.rin.skill.s1", "master-skills", { originMasterId: "master.rin" });
  const hidden = useReinesTrimmau(ctx(state, skill(REINES_MANA_ID), { abilityId: REINES_CONFESSION_ABILITY, targetPlayerId: "a" }));
  assert.equal(hidden.inspectedSkillZone, true);
  assert.deepEqual(hidden.skillZone, [{ instanceId: "a:master-skill", definitionId: "master.rin.skill.s1" }]);
  assert.equal(Number(state.players.r.flags.roundPowerBonus ?? 0), 0);

  state.players.a.trueNameRevealed = true;
  const revealed = useReinesTrimmau(ctx(state, skill(REINES_MANA_ID), { abilityId: REINES_CONFESSION_ABILITY, targetPlayerId: "a" }));
  assert.equal(revealed.inspectedSkillZone, false);
  assert.equal(revealed.powerBonus, 4);
  assert.equal(state.players.r.flags.roundPowerBonus, 4);
});

test("Little Devil steals 1 VP from an eligible losing player after a win and discards the whole hand after a loss", () => {
  const win = setup("reines-sadistic", 5);
  win.round = 7;
  win.players.r.victoryPoints = 10;
  win.players.a.victoryPoints = 1;
  win.players.b.victoryPoints = 5;
  win.players.c.victoryPoints = 4;
  win.players.d.victoryPoints = 3;
  const stolen = useReinesTrimmau(ctx(win, skill(REINES_LITTLE_DEVIL_ID), {
    eventType: "combat.resolved",
    event: { participantIds: ["r", "a"], winnerIds: ["r"], powers: { r: 8, a: 3 }, round: 7 },
  }));
  assert.equal(stolen.targetPlayerId, "a");
  assert.equal(stolen.stolenVictoryPoints, 1);
  assert.equal(win.players.r.victoryPoints, 11);
  assert.equal(win.players.a.victoryPoints, 0);

  const loss = setup("reines-petty");
  add(loss, "r", "r:h1", "card.cardb1", "hand");
  add(loss, "r", "r:h2", "card.cardq1", "hand");
  const petty = useReinesTrimmau(ctx(loss, skill(REINES_LITTLE_DEVIL_ID), {
    eventType: "combat.resolved",
    event: { participantIds: ["r", "a"], winnerIds: ["a"], powers: { r: 2, a: 5 } },
  }));
  assert.deepEqual(new Set(petty.discardedInstanceIds), new Set(["r:h1", "r:h2"]));
  assert.equal(loss.players.r.hand.length, 0);
  assert.ok(loss.players.r.discard.includes("r:h1") && loss.players.r.discard.includes("r:h2"));
});

test("Fervor counts Trimmau attacks played before Ascension, grants Strength and permanently tracks later Trimmau plays", () => {
  const state = setup("reines-ascension");
  useReinesTrimmau(ctx(state, skill(REINES_ALCHEMIST_ID), {
    eventType: "card.played",
    event: { playerId: "r", definitionId: `card.skill.${REINES_POWER_ID}`, instanceId: "old-trimmau" },
  }));
  assert.equal(state.players.r.flags.reinesTrimmauPlayedCount, 1);

  add(state, "r", "r:ascension", REINES_ASCENSION_ID, "master-skills", { originMasterId: "master.reines" });
  useReinesTrimmau(ctx(state, skill(REINES_ASCENSION_ID), {
    eventType: "skill.unlocked",
    event: { playerId: "r", skillId: REINES_ASCENSION_ID },
  }));
  const active = addActiveTrimmau(state, REINES_POWER_ID, "power-upgraded");
  const attrs = getCardInstanceAttributes(active, definitions[active.definitionId], state, definitions);
  assert.ok(attrs.includes("力量"));
  assert.equal(calculateCombatCardPower(state, state.players.r, active.instanceId, definitions, "mountain"), 4);

  useReinesTrimmau(ctx(state, skill(REINES_ALCHEMIST_ID), {
    eventType: "card.played",
    event: { playerId: "r", definitionId: `card.skill.${REINES_MOVEMENT_ID}`, instanceId: "later-trimmau" },
  }));
  assert.equal(state.players.r.flags.reinesTrimmauPlayedCount, 2);
  assert.equal(calculateCombatCardPower(state, state.players.r, active.instanceId, definitions, "mountain"), 5);
});
