import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { drawCards, initializePlayerDeck, initializePlayerSkillCards } from "../src/rules-core/decks.ts";
import { listUnusedRandomServantIds } from "../src/rules-core/identity-replacement.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  RITSUKA_F_CHAIN_AGILITY,
  RITSUKA_F_CHAIN_ID,
  RITSUKA_F_CHAIN_MAGIC,
  RITSUKA_F_CHAIN_STRENGTH,
  RITSUKA_F_CHAIN_UNIQUE_GROUP,
  RITSUKA_F_GACHA_ID,
  RITSUKA_F_HANDLER,
  RITSUKA_F_TAG_ABILITY,
  RITSUKA_F_TAG_ID,
  useRitsukaFDualServant,
} from "../src/rules-core/ritsuka-f.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const runtimeCatalog = {
  servantDecks: Object.fromEntries(legacyContent.servants.map((servant) => [servant.id, [...servant.deck]])),
  skillDefinitions: built.skills.list(),
  masterInitialMana: Object.fromEntries(legacyContent.masters.map((master) => [master.id, Number(master.initialMana ?? 4)])),
};

function skill(id) { return built.skills.get(id); }

function initialServantSkills(servantId) {
  return built.skills.list().filter((candidate) => candidate.ownerType === "servant" && candidate.ownerId === servantId && candidate.initiallyOwned !== false)
    .map((candidate) => ({ id: candidate.id, ownerType: "servant" }));
}

function setup(id = "ritsuka-f") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "r", name: "Ritsuka" }, { id: "a", name: "A" }, { id: "b", name: "B" }],
    seed: 1701,
  });
  state.status = "playing";
  state.round = 1;
  state.phase = "preparation";
  state.step = "player-window";
  state.activePlayerId = "r";
  state.turnOrder = ["r", "a", "b"];
  state.players.r.masterId = "master.ritsuka-f";
  state.players.r.servantId = "servant.saber";
  state.players.r.mana = 10;
  state.players.a.masterId = "master.rin";
  state.players.a.servantId = "servant.gil";
  state.players.b.masterId = "master.kirei";
  state.players.b.servantId = "servant.cu";
  for (const player of Object.values(state.players)) player.locationId = "workshop";
  state.board.locations.workshop = ["r", "a", "b"];
  state.board.locations.mountain = [];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  initializePlayerDeck(state, "r", runtimeCatalog.servantDecks["servant.saber"], () => 0);
  initializePlayerSkillCards(state, "r", initialServantSkills("servant.saber"));
  drawCards(state, "r", 3, () => 0, definitions);
  return state;
}

function context(state, skillDefinition, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.r,
    skill: skillDefinition,
    payload,
    definitions,
    runtimeCatalog,
    randomInt: () => 0,
    openDecision() {},
    ...extra,
  };
}

function setPlayHistory(state, definitionIds) {
  state.modeState.cardPlayDefinitionHistory = { r: { [String(state.round)]: [...definitionIds] } };
}

test("Ritsuka F package is 3/3 FULL with one dedicated dual-Servant handler and a shared Command Chain usage group", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "master.ritsuka-f");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  assert.ok(skills.every((candidate) => candidate.handlerId === RITSUKA_F_HANDLER));
  assert.ok(skills.every((candidate) => built.skills.hasHandler(candidate.id)));
  assert.equal(skill(RITSUKA_F_CHAIN_ID).initiallyOwned, false);
  const chainAbilities = skill(RITSUKA_F_CHAIN_ID).abilities;
  assert.equal(chainAbilities.length, 3);
  assert.ok(chainAbilities.every((ability) => ability.uniqueGroup === RITSUKA_F_CHAIN_UNIQUE_GROUP));
  assert.ok(skills.every((candidate) => (candidate.rules?.ambiguities ?? []).length === 0 && (candidate.rules?.unmodeledClauses ?? []).length === 0));
});

test("Gacha Queen merges one unused Support deck before re-dealing the opening hand and keeps Support skills outside the game", () => {
  const state = setup("ritsuka-f-gacha");
  const expectedSupport = listUnusedRandomServantIds(state, runtimeCatalog)[0];
  const firstDeckSize = runtimeCatalog.servantDecks["servant.saber"].length;
  const supportDeckSize = runtimeCatalog.servantDecks[expectedSupport].length;
  const initialFighterSkillIds = [...state.players.r.servantSkills];
  const result = useRitsukaFDualServant(context(state, skill(RITSUKA_F_GACHA_ID), { eventType: "game.started", event: {} }));
  assert.equal(result.fighterServantId, "servant.saber");
  assert.equal(result.supportServantId, expectedSupport);
  assert.equal(state.players.r.flags.ritsukaFFighterServantId, "servant.saber");
  assert.equal(state.players.r.flags.ritsukaFSupportServantId, expectedSupport);
  assert.equal(state.players.r.servantId, "servant.saber");
  assert.equal(state.players.r.hand.length, 3);
  assert.equal(state.players.r.deck.length + state.players.r.hand.length, firstDeckSize + supportDeckSize);
  assert.equal(state.players.r.flags.startingDeckSize, firstDeckSize + supportDeckSize);
  assert.deepEqual(state.players.r.servantSkills, initialFighterSkillIds);
  assert.equal(Object.values(state.cards).some((card) => card.originServantId === expectedSupport && card.zone === "servant-skills"), false);
  assert.equal(result.addedDeckInstanceIds.length, supportDeckSize);
});

test("Tag discards the whole hand, draws 3, swaps Fighter/Support skills without deleting either ordinary deck, and can swap back using the same physical skills", () => {
  const state = setup("ritsuka-f-tag");
  const originalSkillIds = [...state.players.r.servantSkills];
  const init = useRitsukaFDualServant(context(state, skill(RITSUKA_F_GACHA_ID), { eventType: "game.started", event: {} }));
  const support = init.supportServantId;
  const ordinaryIds = Object.values(state.cards).filter((card) => card.ownerPlayerId === "r" && (card.originServantId === "servant.saber" || card.originServantId === support)
    && !built.skills.has(card.definitionId)).map((card) => card.instanceId);
  const oldHand = [...state.players.r.hand];
  state.phase = "outpost";
  const tagged = useRitsukaFDualServant(context(state, skill(RITSUKA_F_TAG_ID), { abilityId: RITSUKA_F_TAG_ABILITY }));
  assert.equal(tagged.fighterServantId, support);
  assert.equal(tagged.supportServantId, "servant.saber");
  assert.equal(state.players.r.servantId, support);
  assert.ok(oldHand.every((id) => state.cards[id].zone === "discard"));
  assert.equal(state.players.r.hand.length, 3);
  assert.ok(originalSkillIds.every((id) => state.cards[id].zone === "removed"));
  assert.ok(state.players.r.servantSkills.length > 0);
  assert.ok(state.players.r.servantSkills.every((id) => state.cards[id].originServantId === support));
  assert.ok(ordinaryIds.every((id) => state.cards[id].zone !== "removed"));

  const second = useRitsukaFDualServant(context(state, skill(RITSUKA_F_TAG_ID), { abilityId: RITSUKA_F_TAG_ABILITY }));
  assert.equal(second.fighterServantId, "servant.saber");
  assert.equal(state.players.r.servantId, "servant.saber");
  assert.ok(originalSkillIds.every((id) => state.players.r.servantSkills.includes(id)));
  assert.ok(ordinaryIds.every((id) => state.cards[id].zone !== "removed"));
});

test("Command Chain Strength, Agility and Magic use stable current-round play history", () => {
  const strength = setup("ritsuka-f-chain-strength");
  strength.phase = "action";
  setPlayHistory(strength, ["card.cardb1", "card.cardb2"]);
  const strengthResult = useRitsukaFDualServant(context(strength, skill(RITSUKA_F_CHAIN_ID), { abilityId: RITSUKA_F_CHAIN_STRENGTH }));
  assert.equal(strengthResult.powerBonus, 3);
  assert.equal(strength.players.r.flags.roundPowerBonus, 3);

  const agility = setup("ritsuka-f-chain-agility");
  agility.phase = "action";
  setPlayHistory(agility, ["card.cardq1", "card.cardq2"]);
  const agilityResult = useRitsukaFDualServant(context(agility, skill(RITSUKA_F_CHAIN_ID), { abilityId: RITSUKA_F_CHAIN_AGILITY }));
  assert.equal(agilityResult.nextRoundPowerBonus, 5);
  assert.equal(agility.players.r.flags.nextRoundTotalPowerBonus, 5);

  const magic = setup("ritsuka-f-chain-magic");
  magic.phase = "action";
  magic.players.r.mana = 4;
  setPlayHistory(magic, ["card.carda1", "card.carda2"]);
  const magicResult = useRitsukaFDualServant(context(magic, skill(RITSUKA_F_CHAIN_ID), { abilityId: RITSUKA_F_CHAIN_MAGIC }));
  assert.equal(magicResult.manaGained, 2);
  assert.equal(magic.players.r.mana, 6);
  assert.throws(() => useRitsukaFDualServant(context(magic, skill(RITSUKA_F_CHAIN_ID), { abilityId: RITSUKA_F_CHAIN_STRENGTH })), /RITSUKA_F_CHAIN_SHARED_ATTRIBUTE_REQUIRED/);
});
