import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { calculateCombatSnapshot } from "../src/rules-core/combat.ts";
import { calculateTerrainAdvantage } from "../src/rules-core/combat-power.ts";
import {
  ALICE_CYBER_GHOST_ID,
  ALICE_DEPLOY_ABILITY,
  ALICE_HANDLER,
  ALICE_PHANTOM_ID,
  ALICE_QUEENSIDE_DEFEAT_ABILITY,
  ALICE_QUEENSIDE_ID,
  alicePhantomPresenceId,
  useAlicePackage,
} from "../src/rules-core/alice.ts";
import { getExtraPlayerPresence } from "../src/rules-core/player-presences.ts";

const built = buildStandardContent(legacyContent);
new StandardMatchEngine(built);
const definitions = {
  ...built.cards,
  ...Object.fromEntries(built.events.map((event) => [event.id, event])),
  ...built.skills.asCardDefinitions(),
};

function state(id = "alice") {
  const value = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Alice" }, { id: "o", name: "Opponent" }], seed: 78 });
  value.status = "playing";
  value.round = 4;
  value.phase = "outpost";
  value.step = "player-window";
  value.activePlayerId = "a";
  value.turnOrder = ["a", "o"];
  value.players.a.masterId = "master.alice";
  value.players.a.mana = 20;
  value.players.a.locationId = "mountain";
  value.players.o.locationId = "city";
  value.board.locations.mountain = ["a"];
  value.board.locations.city = ["o"];
  value.board.locations.workshop = [];
  value.board.locations.scouting = [];
  value.players.a.flags.deploymentLocationId = "mountain";
  value.players.a.flags.deploymentBonus = 1;
  value.players.a.flags.deploymentBonusActive = true;
  return value;
}

function context(value, skillId, payload) {
  return {
    state: value,
    player: value.players.a,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    emitEvent() {},
    randomInt: () => 0,
  };
}

function deployCity(value) {
  return useAlicePackage(context(value, ALICE_CYBER_GHOST_ID, { abilityId: ALICE_DEPLOY_ABILITY, locationId: "city" }));
}

test("Alice package is FULL and routed through the dedicated phantom-player handler", () => {
  for (const id of [ALICE_CYBER_GHOST_ID, ALICE_PHANTOM_ID, ALICE_QUEENSIDE_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, ALICE_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
    assert.deepEqual(skill.rules?.ambiguities ?? [], []);
    assert.deepEqual(skill.rules?.unmodeledClauses ?? [], []);
  }
});

test("Cyber Ghost deploys Phantom Alice as the same player's extra battlefield presence and combat freezes power independently", () => {
  const value = state("alice-presence");
  const deployed = deployCity(value);
  assert.equal(deployed.locationId, "city");
  assert.equal(deployed.terrainAdvantage, 3);
  const presence = getExtraPlayerPresence(value, alicePhantomPresenceId("a"));
  assert.equal(presence?.playerId, "a");
  assert.equal(presence?.locationId, "city");
  const snapshot = calculateCombatSnapshot(value, "city", definitions);
  assert.deepEqual(new Set(snapshot.participantIds), new Set(["a", "o"]));
  assert.equal(snapshot.powers.a, 3);
  assert.equal(value.players.a.locationId, "mountain");
});

test("Cyber Ghost mirrors movement when Phantom Alice is unengaged and charges half the committed card cost rounded up", () => {
  const value = state("alice-follow-tax");
  value.players.o.locationId = "mountain";
  value.board.locations.city = [];
  value.board.locations.mountain = ["a", "o"];
  deployCity(value);
  const follow = useAlicePackage(context(value, ALICE_CYBER_GHOST_ID, {
    eventType: "player.moved",
    event: { playerId: "a", previousLocationId: "mountain", locationId: "city", distance: 1 },
  }));
  assert.equal(follow.followed, true);
  assert.equal(getExtraPlayerPresence(value, alicePhantomPresenceId("a"))?.locationId, "scouting");
  value.players.a.mana = 10;
  const tax = useAlicePackage(context(value, ALICE_CYBER_GHOST_ID, {
    eventType: "attack.committed",
    event: { playerId: "a", paidMana: 5, committed: [] },
  }));
  assert.equal(tax.manaLost, 3);
  assert.equal(value.players.a.mana, 7);
});

test("Queenside Castle shares terrain across Alice presences, then removes the phantom before defeating its battlefield", () => {
  const value = state("alice-queenside");
  deployCity(value);
  useAlicePackage(context(value, ALICE_QUEENSIDE_ID, {
    eventType: "skill.unlocked",
    event: { playerId: "a", skillId: ALICE_QUEENSIDE_ID },
  }));
  assert.equal(value.players.a.flags.sharePresenceTerrainAdvantage, true);
  assert.equal(calculateTerrainAdvantage(value, value.players.a, definitions, "mountain"), 4);
  assert.equal(calculateTerrainAdvantage(value, value.players.a, definitions, "city"), 4);

  value.phase = "action";
  value.activePlayerId = "a";
  const result = useAlicePackage(context(value, ALICE_QUEENSIDE_ID, { abilityId: ALICE_QUEENSIDE_DEFEAT_ABILITY }));
  assert.equal(getExtraPlayerPresence(value, alicePhantomPresenceId("a")), undefined);
  assert.deepEqual(result.targetPlayerIds, ["o"]);
  assert.equal(value.players.o.defeated, true);
  assert.equal(value.players.a.defeated, false);
});
