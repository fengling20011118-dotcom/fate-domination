import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { attachCard } from "../src/rules-core/card-attachments.ts";
import { getCardInstanceAttributes } from "../src/rules-core/card-instance-attributes.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getNamedSideDeck } from "../src/rules-core/named-side-decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  DAVINCI_GENIUS_ID,
  DAVINCI_GENIUS_MANA_ABILITY,
  DAVINCI_GENIUS_POWER_ABILITY,
  DAVINCI_HANDLER,
  DAVINCI_MONA_LISA_ID,
  DAVINCI_STORE_DECK_ID,
  DAVINCI_STORE_ITEM_SKILL_IDS,
  DAVINCI_UOMO_ID,
  DAVINCI_WORKSHOP_ID,
  initializeDavinciStoreForTest,
  resolveDavinciDecision,
  useDavinciPackage,
} from "../src/rules-core/davinci.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
function skill(id) { return built.skills.get(id); }

function setup(id = "davinci") {
  const state = createGameState({
    gameInstanceId: id,
    players: [{ id: "d", name: "Da Vinci" }, { id: "o", name: "Opponent" }, { id: "x", name: "Other" }],
    seed: 9911,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "d";
  state.turnOrder = ["d", "o", "x"];
  state.players.d.masterId = "master.rin";
  state.players.d.servantId = "servant.davinci";
  state.players.d.locationId = "workshop";
  state.players.d.mana = 20;
  state.players.d.victoryPoints = 1;
  state.players.o.masterId = "master.kirei";
  state.players.o.servantId = "servant.cu";
  state.players.o.locationId = "mountain";
  state.players.o.victoryPoints = 5;
  state.players.x.masterId = "master.waver";
  state.players.x.servantId = "servant.emiya";
  state.players.x.locationId = "city";
  state.players.x.victoryPoints = 5;
  state.board.locations.workshop = ["d"];
  state.board.locations.mountain = ["o"];
  state.board.locations.city = ["x"];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "servant-skills", options = {}) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: zone === "attack" || zone.endsWith("skills") ? "up" : "down",
    active: zone === "attack",
    residual: zone === "attack" && definitions[definitionId]?.residual === true,
    ...options,
  });
}

function ctx(state, playerId, skillDefinition, payload = {}, extra = {}) {
  return {
    state,
    player: state.players[playerId],
    skill: skillDefinition,
    payload,
    definitions,
    randomInt: () => 0,
    openDecision() {},
    ...extra,
  };
}

function popPrevious(state, stage) {
  const frame = state.effectQueue.find((entry) => entry.handlerId === "core.davinci-package-resolve" && entry.payload?.stage === stage);
  assert.ok(frame, `missing ${stage} frame`);
  state.effectQueue = state.effectQueue.filter((entry) => entry !== frame);
  return frame.payload;
}

test("Da Vinci package is 17/17 FULL; only the three real Servant skills start owned and all Store Items are outside-game definitions", () => {
  const skills = built.skills.list().filter((candidate) => candidate.ownerId === "servant.davinci");
  assert.equal(skills.length, 17);
  assert.ok(skills.every((candidate) => candidate.supportLevel === "FULL"));
  for (const id of [DAVINCI_UOMO_ID, DAVINCI_WORKSHOP_ID, DAVINCI_GENIUS_ID]) {
    assert.equal(skill(id).handlerId, DAVINCI_HANDLER);
    assert.equal(skill(id).initiallyOwned, true);
    assert.equal(built.skills.hasHandler(id), true);
  }
  for (const id of DAVINCI_STORE_ITEM_SKILL_IDS) assert.equal(skill(id).initiallyOwned, false, id);
  assert.equal(skill(DAVINCI_MONA_LISA_ID).handlerId, DAVINCI_HANDLER);
});

test("Uomo Universale copies a revealed Noble Phantasm without copying runtime stacks, gains +1 and Magic, and restores at round cleanup lifecycle", () => {
  const state = setup("davinci-uomo");
  const uomo = add(state, "d", "uomo", DAVINCI_UOMO_ID, "attack", { face: "up", active: true });
  uomo.playedRound = state.round;
  const targetDefinitionId = "card.skill.servant.saber.skill.sc-saber-np";
  const target = add(state, "o", "np", targetDefinitionId, "attack", { face: "up", active: true });
  target.powerModifiers = [{ id: "target-stack", sourceId: "test", kind: "add", value: 99, duration: "round" }];
  const result = useDavinciPackage(ctx(state, "d", skill(DAVINCI_UOMO_ID), {
    eventType: "card.played",
    event: { playerId: "d", instanceId: "uomo", definitionId: DAVINCI_UOMO_ID, face: "up" },
  }));
  assert.equal(result.targetInstanceId, "np");
  assert.equal(state.cards.uomo.definitionId, targetDefinitionId);
  assert.equal(state.cards.uomo.temporaryDefinitionCopy.originalDefinitionId, DAVINCI_UOMO_ID);
  assert.equal(state.cards.uomo.powerModifiers.some((modifier) => modifier.value === 99), false);
  assert.equal(state.cards.uomo.powerModifiers.some((modifier) => modifier.sourceId === DAVINCI_UOMO_ID && modifier.value === 1), true);
  assert.ok(getCardInstanceAttributes(state.cards.uomo, definitions[targetDefinitionId], state, definitions).includes("魔术"));
});

test("Workshop uses an isolated non-recycling 14-item deck; selected item can be bought for exactly 2 VP and becomes master-owned", () => {
  const state = setup("davinci-workshop");
  const workshop = add(state, "d", "workshop", DAVINCI_WORKSHOP_ID, "attack", { face: "up", active: true, residual: true });
  workshop.playedRound = state.round;
  initializeDavinciStoreForTest(state, "d", definitions, () => 0);
  const side = getNamedSideDeck(state, "d", DAVINCI_STORE_DECK_ID);
  assert.equal(side.deck.length, 14);
  assert.equal(side.recycleDiscard, false);

  let decision;
  const start = useDavinciPackage(ctx(state, "d", skill(DAVINCI_WORKSHOP_ID), {
    eventType: "player.deployed",
    event: { playerId: "d", locationId: "workshop" },
  }, { openDecision(value) { decision = value; } }));
  assert.equal(start.pending, true);
  assert.equal(start.drawnInstanceIds.length, 3);
  assert.equal(decision.kind, "davinci-workshop-pick");
  const chosen = start.drawnInstanceIds[0];
  const beforeDiscard = side.discard.length;
  const pickPrevious = popPrevious(state, "workshop-pick");
  let bidDecision;
  const picked = resolveDavinciDecision(ctx(state, "d", skill(DAVINCI_WORKSHOP_ID), {
    previous: pickPrevious,
    decision: { status: "resolved", selections: [chosen] },
  }, { openDecision(value) { bidDecision = value; } }));
  assert.equal(picked.pending, true);
  assert.equal(side.discard.length, beforeDiscard + 2);
  assert.equal(bidDecision.kind, "davinci-auction-bid");
  assert.equal(bidDecision.ownerPlayerId, "o");
  const bidPrevious = popPrevious(state, "auction-bid");
  const bought = resolveDavinciDecision(ctx(state, "d", skill(DAVINCI_WORKSHOP_ID), {
    previous: bidPrevious,
    decision: { status: "resolved", selections: ["buy"] },
  }));
  assert.equal(bought.acquiredByPlayerId, "o");
  assert.equal(state.players.o.victoryPoints, 3);
  assert.equal(state.players.d.victoryPoints, 3);
  assert.ok(state.players.o.masterSkills.includes(chosen));
  assert.equal(state.cards[chosen].ownerPlayerId, "o");
  assert.equal(state.cards[chosen].originServantId, undefined);
  assert.equal(state.cards[chosen].namedSideDeckId, undefined);
});

test("Mona Lisa owner can remove the acquired item to end Da Vinci's next auction and take the item without bidding", () => {
  const state = setup("davinci-mona");
  const workshop = add(state, "d", "workshop", DAVINCI_WORKSHOP_ID, "attack", { face: "up", active: true, residual: true });
  workshop.playedRound = state.round;
  add(state, "o", "mona", `card.skill.${DAVINCI_MONA_LISA_ID}`, "master-skills", { originServantId: undefined });
  initializeDavinciStoreForTest(state, "d", definitions, () => 0);
  let pickDecision;
  const start = useDavinciPackage(ctx(state, "d", skill(DAVINCI_WORKSHOP_ID), {
    eventType: "player.deployed",
    event: { playerId: "d", locationId: "workshop" },
  }, { openDecision(value) { pickDecision = value; } }));
  const chosen = start.drawnInstanceIds[0];
  const pickPrevious = popPrevious(state, "workshop-pick");
  let monaDecision;
  resolveDavinciDecision(ctx(state, "d", skill(DAVINCI_WORKSHOP_ID), {
    previous: pickPrevious,
    decision: { status: "resolved", selections: [chosen] },
  }, { openDecision(value) { monaDecision = value; } }));
  assert.equal(monaDecision.kind, "davinci-mona-lisa");
  assert.equal(monaDecision.ownerPlayerId, "o");
  const monaPrevious = popPrevious(state, "mona-lisa");
  const resolved = resolveDavinciDecision(ctx(state, "d", skill(DAVINCI_WORKSHOP_ID), {
    previous: monaPrevious,
    decision: { status: "resolved", selections: ["use"] },
  }));
  assert.equal(resolved.acquiredByPlayerId, "o");
  assert.equal(state.cards.mona.zone, "removed");
  assert.ok(state.players.o.masterSkills.includes(chosen));
  assert.equal(state.players.o.victoryPoints, 5);
  assert.equal(state.players.d.victoryPoints, 1);
});

test("Natural Born Genius lasts through next round, doubles Level Up attachment power, supports both Action choices, and loses 6 mana when closed", () => {
  const state = setup("davinci-genius");
  const genius = add(state, "d", "genius", DAVINCI_GENIUS_ID, "attack", { face: "up", active: true, residual: true });
  genius.playedRound = state.round;
  useDavinciPackage(ctx(state, "d", skill(DAVINCI_GENIUS_ID), {
    eventType: "card.played",
    event: { playerId: "d", instanceId: "genius", definitionId: DAVINCI_GENIUS_ID, face: "up" },
  }));
  assert.equal(genius.residualUntilRound, state.round + 1);
  const level = add(state, "d", "level", "card.skill.servant.davinci.skill.sc-davinci-17", "master-skills");
  attachCard(state, level.instanceId, genius.instanceId);
  const basePower = definitions[DAVINCI_GENIUS_ID].basePower;
  assert.equal(calculateCombatCardPower(state, state.players.d, genius.instanceId, definitions, "workshop"), basePower + 2);
  const manaBefore = state.players.d.mana;
  const mana = useDavinciPackage(ctx(state, "d", skill(DAVINCI_GENIUS_ID), { abilityId: DAVINCI_GENIUS_MANA_ABILITY }));
  assert.equal(mana.manaGained, 2);
  const power = useDavinciPackage(ctx(state, "d", skill(DAVINCI_GENIUS_ID), { abilityId: DAVINCI_GENIUS_POWER_ABILITY }));
  assert.equal(power.powerGained, 2);
  assert.equal(state.players.d.flags.roundPowerBonus, 2);
  closePlayerCard(state, "d", "genius", definitions);
  const lost = useDavinciPackage(ctx(state, "d", skill(DAVINCI_GENIUS_ID), {
    eventType: "card.closed",
    event: { playerId: "d", instanceId: "genius", definitionId: DAVINCI_GENIUS_ID },
  }));
  assert.equal(lost.manaLost, 6);
  assert.equal(state.players.d.mana, manaBefore + 2 - 6);
});
