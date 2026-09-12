import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { listUnusedRandomServantIds } from "../src/rules-core/identity-replacement.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  KING_HASSAN_BELL_ABILITY,
  KING_HASSAN_BELL_HEAVY_ID,
  KING_HASSAN_BELL_LIGHT_ID,
  KING_HASSAN_CUT_FATE_ABILITY,
  KING_HASSAN_CUT_FATE_ID,
  KING_HASSAN_HANDLER,
  resolveKingHassanBell,
  useKingHassan,
} from "../src/rules-core/king-hassan.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const runtimeCatalog = {
  servantDecks: Object.fromEntries(legacyContent.servants.map((servant) => [servant.id, [...servant.deck]])),
  skillDefinitions: built.skills.list(),
  masterInitialMana: Object.fromEntries(legacyContent.masters.map((master) => [master.id, Number(master.initialMana ?? 4)])),
};

function skill(id) { return built.skills.get(id); }

function setup(gameInstanceId = "king-hassan") {
  const state = createGameState({
    gameInstanceId,
    players: [{ id: "k", name: "King Hassan" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 119,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "k";
  state.turnOrder = ["k", "a", "b"];
  state.players.k.masterId = "master.rin";
  state.players.k.servantId = "servant.kinghassan";
  state.players.k.flags.firstServantId = "servant.kinghassan";
  state.players.a.masterId = "master.sion";
  state.players.a.servantId = "servant.shakespeare";
  state.players.a.flags.firstServantId = "servant.shakespeare";
  state.players.b.masterId = "master.kirei";
  state.players.b.servantId = "servant.cu";
  state.players.b.flags.firstServantId = "servant.cu";
  for (const player of Object.values(state.players)) {
    player.locationId = "mountain";
    player.mana = 20;
  }
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["k", "a", "b"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "attack", options = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId, definitionId, zone,
    face: zone === "attack" || zone === "master-skills" ? "up" : "down",
    active: zone === "attack",
    ...options,
  });
}

function ctx(state, skillDefinition, payload, extra = {}) {
  return {
    state,
    player: state.players.k,
    skill: skillDefinition,
    payload,
    definitions,
    runtimeCatalog,
    randomInt: () => 0,
    openDecision() {},
    ...extra,
  };
}

test("King Hassan package is 3/3 FULL with one dedicated Azrael handler", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.kinghassan");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === KING_HASSAN_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill(KING_HASSAN_BELL_LIGHT_ID).standardAppend, true);
  for (const candidate of skills) {
    assert.deepEqual(candidate.rules?.ambiguities ?? [], []);
    assert.deepEqual(candidate.rules?.unmodeledClauses ?? [], []);
  }
});

test("light Final Bell Toll defeats only opponents rolling 6 when no Luck is available", () => {
  const state = setup("king-hassan-light");
  add(state, "k", "k:light", KING_HASSAN_BELL_LIGHT_ID);
  const rolls = [5, 4]; // d6 results 6 and 5
  const result = useKingHassan(ctx(state, skill(KING_HASSAN_BELL_LIGHT_ID), { abilityId: KING_HASSAN_BELL_ABILITY }, {
    randomInt() { return rolls.shift(); },
  }));
  assert.deepEqual(result.rolls, { a: 6, b: 5 });
  assert.deepEqual(result.defeatedPlayerIds, ["a"]);
  assert.equal(state.players.a.defeated, true);
  assert.equal(state.players.b.defeated, false);
});

test("Final Bell Toll exposes the rolls before King Hassan may discard one physical Luck to reroll one opponent", () => {
  const state = setup("king-hassan-reroll");
  add(state, "k", "k:light", KING_HASSAN_BELL_LIGHT_ID);
  add(state, "k", "k:luck", "card.cardluck", "hand");
  let decision;
  const initial = [5, 1]; // a=6, b=2
  const pending = useKingHassan(ctx(state, skill(KING_HASSAN_BELL_LIGHT_ID), { abilityId: KING_HASSAN_BELL_ABILITY }, {
    randomInt() { return initial.shift(); },
    openDecision(value) { decision = value; },
  }));
  assert.equal(pending.pending, true);
  assert.deepEqual(pending.rolls, { a: 6, b: 2 });
  assert.ok(decision.options.some((option) => option.id === "reroll:0:0"));
  const previous = state.effectQueue[0].payload;
  const resolved = resolveKingHassanBell(ctx(state, skill(KING_HASSAN_BELL_LIGHT_ID), {
    previous,
    decision: { status: "resolved", selections: ["reroll:0:0"] },
  }, { randomInt: () => 0 })); // reroll a -> 1
  assert.equal(state.cards["k:luck"].zone, "discard");
  assert.deepEqual(resolved.rolls, { a: 1, b: 2 });
  assert.deepEqual(resolved.defeatedPlayerIds, []);
  assert.equal(state.players.a.defeated, false);
});

test("heavy Final Bell Toll gains +1 power per defeated or eliminated opponent and defeats on 5+", () => {
  const state = setup("king-hassan-heavy");
  add(state, "k", "k:heavy", KING_HASSAN_BELL_HEAVY_ID);
  useKingHassan(ctx(state, skill(KING_HASSAN_BELL_HEAVY_ID), {
    eventType: "card.played", event: { playerId: "k", instanceId: "k:heavy", definitionId: KING_HASSAN_BELL_HEAVY_ID },
  }));
  const baseline = calculateCombatCardPower(state, state.players.k, "k:heavy", definitions, "mountain");
  assert.equal(baseline, 10);
  state.players.a.defeated = true;
  state.players.b.eliminated = true;
  assert.equal(calculateCombatCardPower(state, state.players.k, "k:heavy", definitions, "mountain"), 12);
  state.players.a.defeated = false;
  state.players.b.eliminated = false;
  const rolls = [4, 3]; // 5 and 4
  const result = useKingHassan(ctx(state, skill(KING_HASSAN_BELL_HEAVY_ID), { abilityId: KING_HASSAN_BELL_ABILITY }, {
    randomInt() { return rolls.shift(); },
  }));
  assert.deepEqual(result.defeatedPlayerIds, ["a"]);
});

test("Cut From Fate immediately removes only the target Servant package, preserves Master components, then gives a new unused Servant at round end", () => {
  const state = setup("king-hassan-cut");
  add(state, "k", "k:cut", KING_HASSAN_CUT_FATE_ID);
  add(state, "a", "a:servant-card", "card.carda2", "hand", { originServantId: "servant.shakespeare" });
  add(state, "a", "a:servant-skill", "servant.shakespeare.skill.sc-shakespeare-1", "servant-skills", { originServantId: "servant.shakespeare" });
  add(state, "a", "a:master-asc", "master.sion.skill.ascension", "master-skills", { originMasterId: "master.sion" });
  add(state, "a", "a:chaldea", "master.sion.skill.s5", "master-skills", { originMasterId: "master.sion" });
  const killed = useKingHassan(ctx(state, skill(KING_HASSAN_CUT_FATE_ID), { abilityId: KING_HASSAN_CUT_FATE_ABILITY, targetPlayerId: "a" }));
  assert.equal(killed.servantId, "servant.shakespeare");
  assert.equal(state.cards["a:servant-card"].zone, "removed");
  assert.equal(state.cards["a:servant-skill"].zone, "removed");
  assert.equal(state.cards["a:master-asc"].zone, "master-skills");
  assert.equal(state.cards["a:chaldea"].zone, "master-skills");
  assert.equal(state.players.a.defeated, true);
  assert.equal(state.players.a.flags.servantKilled, true);
  const expected = listUnusedRandomServantIds(state, runtimeCatalog)[0];
  const replaced = useKingHassan(ctx(state, skill(KING_HASSAN_CUT_FATE_ID), { eventType: "round.ending", event: { round: 5 } }, { randomInt: () => 0 }));
  assert.deepEqual(replaced.replaced, [{ targetPlayerId: "a", servantId: expected }]);
  assert.equal(state.players.a.servantId, expected);
  assert.notEqual(state.players.a.flags.servantKilled, true);
  assert.ok(state.players.a.servantSkills.length > 0);
  assert.ok(state.players.a.servantSkills.every((id) => state.cards[id].originServantId === expected));
  assert.equal(state.cards["a:master-asc"].zone, "master-skills");
});
