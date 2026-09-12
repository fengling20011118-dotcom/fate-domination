import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import {
  MIYU_CARD_SELECTION_ID,
  MIYU_INSTALL_ARCHER_ID,
  MIYU_INSTALL_ASSASSIN_ID,
  MIYU_INSTALL_CASTER_ID,
  MIYU_INSTALL_IDS,
  MIYU_INSTALL_LANCER_ID,
  MIYU_INSTALL_RIDER_ID,
  MIYU_INSTALL_SABER_ID,
  MIYU_SAPPHIRE_DECK,
  MIYU_SAPPHIRE_SERVANT_ID,
} from "../src/content/miyu-cards.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";
import {
  MIYU_ASCENSION_ID,
  MIYU_CARD_SELECTION_SKILL_ID,
  MIYU_HANDLER,
  MIYU_INSTALL_SKILL_ID,
  MIYU_SAPPHIRE_SKILL_ID,
  useMiyuSapphire,
} from "../src/rules-core/miyu.ts";

const built = buildStandardContent(legacyContent);
const engine = new StandardMatchEngine(built);
const definitions = {
  ...built.cards,
  ...Object.fromEntries(built.events.map((event) => [event.id, event])),
  ...built.skills.asCardDefinitions(),
};

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function manualState(id = "miyu-manual") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Miyu" }, { id: "o", name: "Opponent" }], seed: 901 });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.turnOrder = ["m", "o"];
  state.players.m.masterId = "master.miyu";
  state.players.m.servantId = MIYU_SAPPHIRE_SERVANT_ID;
  state.players.m.mana = 20;
  state.players.o.mana = 20;
  state.players.m.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["m", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return state;
}

function add(state, playerId, instanceId, definitionId, zone = "hand", face = "down", active = false) {
  return createOwnedCardInstance(state, playerId, { instanceId, definitionId, zone, face, active });
}

function startedMiyuGame(id = "miyu-start") {
  let state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Miyu" }, { id: "o", name: "Opponent" }], seed: 123 });
  state.players.m.masterId = "master.miyu";
  state.players.m.servantId = "servant.saber";
  state.players.o.masterId = "master.kirei";
  state.players.o.servantId = "servant.emiya";
  let result = engine.execute(state, command(state, `${id}:start`, CommandType.StartStandardGame, "host"));
  state = result.state;
  assert.equal(state.pendingDecision?.kind, "miyu-sapphire-skill-selection");
  const selectedSkillIds = state.pendingDecision.options.slice(0, 3).map((option) => option.id);
  result = engine.execute(state, command(state, `${id}:skills`, CommandType.ResolveDecision, "m", {
    decisionId: state.pendingDecision.decisionId,
    selections: selectedSkillIds,
  }));
  return { state: result.state, selectedSkillIds };
}

function miyuContext(state, skillId, payload, extra = {}) {
  return {
    state,
    player: state.players.m,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    runtimeCatalog: {
      servantDecks: built.playerDecks,
      servantClasses: built.servantClasses ?? {},
      skillDefinitions: built.skills.list(),
      masterInitialMana: built.masterInitialMana ?? {},
    },
    openDecision() {},
    emitEvent() {},
    randomInt: () => 0,
    ...extra,
  };
}

test("Miyu four-skill package is FULL and routes through the dedicated Sapphire handler", () => {
  for (const id of [MIYU_SAPPHIRE_SKILL_ID, MIYU_CARD_SELECTION_SKILL_ID, MIYU_INSTALL_SKILL_ID, MIYU_ASCENSION_ID]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, MIYU_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
    assert.deepEqual(skill.rules?.ambiguities ?? [], []);
    assert.deepEqual(skill.rules?.unmodeledClauses ?? [], []);
  }
  assert.deepEqual(built.skills.get(MIYU_SAPPHIRE_SKILL_ID).startingServantOverride, {
    servantId: MIYU_SAPPHIRE_SERVANT_ID,
    deckDefinitionIds: [...MIYU_SAPPHIRE_DECK],
  });
  for (const id of [MIYU_CARD_SELECTION_ID, ...MIYU_INSTALL_IDS]) assert.ok(built.cards[id]);
});

test("Magical Sapphire replaces the setup Servant before deck seeding and grants exactly three selected full-text skills", () => {
  const { state, selectedSkillIds } = startedMiyuGame("miyu-setup");
  assert.equal(state.players.m.servantId, MIYU_SAPPHIRE_SERVANT_ID);
  assert.equal(state.players.m.hand.length + state.players.m.deck.length, 12);
  assert.deepEqual(state.players.m.masterSkills.map((id) => state.cards[id].definitionId), [MIYU_SAPPHIRE_SKILL_ID]);
  assert.equal(state.players.m.servantIdentityAliases?.length, 3);
  assert.equal(new Set(state.players.m.servantIdentityAliases).size, 3);
  assert.ok((state.players.m.servantClassAliases?.length ?? 0) >= 1);
  assert.equal(state.players.m.servantSkills.length, 3);
  assert.deepEqual(new Set(state.players.m.servantSkills.map((id) => state.cards[id].fullSkillCopy?.sourceSkillId)), new Set(selectedSkillIds));
  assert.ok(state.players.m.servantSkills.every((id) => state.cards[id].fullSkillCopy?.rebindNamedOwnerToController === true));
});

test("Card Selection exchanges with the selected outside pool and its other Outpost mode discards itself to draw two", () => {
  let { state } = startedMiyuGame("miyu-selection");
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "m";
  const sapphire = state.modeState.miyuSapphireByPlayer.m;
  const selectionId = [...state.players.m.hand, ...state.players.m.deck].find((id) => state.cards[id].definitionId === MIYU_CARD_SELECTION_ID);
  assert.ok(selectionId);
  if (!state.players.m.hand.includes(selectionId)) movePlayerCard(state, "m", selectionId, "hand");
  const installId = sapphire.installInstanceIds.find((id) => state.cards[id].zone === "removed");
  assert.ok(installId);
  let result = engine.execute(state, command(state, "miyu-exchange", CommandType.UseCardAbility, "m", {
    instanceId: selectionId,
    ability: "miyu.card-selection-exchange",
    data: { outsideInstanceId: installId },
  }));
  state = result.state;
  assert.equal(state.cards[selectionId].zone, "removed");
  assert.equal(state.cards[installId].zone, "hand");

  const secondSelectionId = [...state.players.m.hand, ...state.players.m.deck].find((id) => state.cards[id].definitionId === MIYU_CARD_SELECTION_ID);
  assert.ok(secondSelectionId);
  if (!state.players.m.hand.includes(secondSelectionId)) movePlayerCard(state, "m", secondSelectionId, "hand");
  const handBefore = state.players.m.hand.length;
  result = engine.execute(state, command(state, "miyu-selection-draw", CommandType.UseCardAbility, "m", {
    instanceId: secondSelectionId,
    ability: "miyu.card-selection-draw",
  }));
  assert.equal(result.state.cards[secondSelectionId].zone, "discard");
  assert.equal(result.state.players.m.hand.length, handBefore + 1);
});

test("Saber, Lancer and Archer Installs execute their printed combat/movement/terrain effects", () => {
  {
    const state = manualState("miyu-saber");
    state.phase = "combat";
    add(state, "m", "saber", MIYU_INSTALL_SABER_ID, "attack", "up", true);
    add(state, "o", "magic", "card.carda2", "attack", "up", true);
    assert.ok(calculateCombatCardPower(state, state.players.o, "magic", definitions, "mountain") > 0);
    const result = engine.execute(state, command(state, "saber-use", CommandType.UseCardAbility, "m", { instanceId: "saber", ability: "miyu.install-saber" }));
    assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "magic", definitions, "mountain"), 0);
  }
  {
    const state = manualState("miyu-lancer");
    add(state, "m", "lancer", MIYU_INSTALL_LANCER_ID, "attack", "up", true);
    const result = engine.execute(state, command(state, "lancer-use", CommandType.UseCardAbility, "m", {
      instanceId: "lancer", ability: "miyu.install-lancer", data: { locationId: "city" },
    }));
    assert.equal(result.state.players.m.locationId, "city");
  }
  {
    const state = manualState("miyu-archer");
    state.players.m.flags.deploymentBonusActive = true;
    state.players.m.flags.deploymentBonus = 3;
    add(state, "m", "archer", MIYU_INSTALL_ARCHER_ID, "attack", "up", true);
    const result = engine.execute(state, command(state, "archer-use", CommandType.UseCardAbility, "m", { instanceId: "archer", ability: "miyu.install-archer" }));
    assert.equal(result.state.players.m.flags.deploymentBonus, 6);
  }
});

test("Rider Install plays up to three low-base-power hand cards and cannot chain another Install", () => {
  const state = manualState("miyu-rider");
  add(state, "m", "rider", MIYU_INSTALL_RIDER_ID, "attack", "up", true);
  add(state, "m", "low-a", "card.cardb1");
  add(state, "m", "low-b", "card.cardq2");
  let result = engine.execute(state, command(state, "rider-use", CommandType.UseCardAbility, "m", {
    instanceId: "rider", ability: "miyu.install-rider", data: { instanceIds: ["low-a", "low-b"] },
  }));
  assert.ok(result.state.players.m.attack.includes("low-a"));
  assert.ok(result.state.players.m.attack.includes("low-b"));

  const blocked = manualState("miyu-rider-install-block");
  add(blocked, "m", "rider", MIYU_INSTALL_RIDER_ID, "attack", "up", true);
  add(blocked, "m", "other-install", MIYU_INSTALL_CASTER_ID);
  assert.throws(() => engine.execute(blocked, command(blocked, "rider-install-block", CommandType.UseCardAbility, "m", {
    instanceId: "rider", ability: "miyu.install-rider", data: { instanceIds: ["other-install"] },
  })), /MIYU_RIDER_SELECTION_INVALID/);
});

test("Caster Install supplies a generic next-non-basic cost/power choice and closes after consumption", () => {
  {
    const state = manualState("miyu-caster-power");
    state.step = "play-batch-draft";
    add(state, "m", "caster", MIYU_INSTALL_CASTER_ID, "attack", "up", true).residual = true;
    const localDefinitions = {
      ...definitions,
      "test.miyu.nonbasic-power": { id: "test.miyu.nonbasic-power", name: "Target", cost: 0, basePower: 2, typeLabel: "特殊", attributes: ["特殊"], basic: false, phases: ["action"] },
    };
    add(state, "m", "selection", "test.miyu.nonbasic-power");
    add(state, "m", "basic", "card.cardb1");
    commitStandardAttack(state, "m", ["selection", "basic"], [], localDefinitions, {
      cardDataByInstanceId: { selection: { sourceAdjustmentChoice: "power" } },
    });
    assert.equal(state.cards.selection.powerModifiers?.some((modifier) => modifier.sourceId === "caster" && modifier.value === 2), true);
    assert.equal(state.cards.caster.zone, "attack");
    assert.equal(state.cards.caster.face, "down");
    assert.equal(state.cards.caster.active, false);
  }
  {
    const state = manualState("miyu-caster-cost");
    state.step = "play-batch-draft";
    add(state, "m", "caster", MIYU_INSTALL_CASTER_ID, "attack", "up", true).residual = true;
    const localDefinitions = {
      ...definitions,
      "test.miyu.nonbasic-cost4": { id: "test.miyu.nonbasic-cost4", name: "Target", cost: 4, basePower: 2, typeLabel: "特殊", attributes: ["特殊"], basic: false },
    };
    add(state, "m", "target", "test.miyu.nonbasic-cost4");
    add(state, "m", "basic", "card.cardb1");
    const result = commitStandardAttack(state, "m", ["target", "basic"], [], localDefinitions, {
      cardDataByInstanceId: { target: { sourceAdjustmentChoice: "cost" } },
    });
    assert.equal(result.paidMana, 1);
    assert.equal(state.cards.target.paidCost, 1);
    assert.equal(state.cards.caster.zone, "attack");
    assert.equal(state.cards.caster.face, "down");
    assert.equal(state.cards.caster.active, false);
  }
});

test("Assassin Install steals VP for each distinct opponent skill used this round", () => {
  const state = manualState("miyu-assassin");
  state.phase = "combat";
  state.players.m.victoryPoints = 0;
  state.players.o.victoryPoints = 5;
  const opponentSkills = built.skills.list().filter((skill) => skill.ownerType === "servant" && skill.ownerId === "servant.emiya").slice(0, 2);
  assert.equal(opponentSkills.length, 2);
  for (const skill of opponentSkills) state.players.o.usage[skill.id] = { round: state.round, used: true };
  add(state, "m", "assassin", MIYU_INSTALL_ASSASSIN_ID, "attack", "up", true);
  const result = engine.execute(state, command(state, "assassin-use", CommandType.UseCardAbility, "m", { instanceId: "assassin", ability: "miyu.install-assassin" }));
  assert.equal(result.state.players.m.victoryPoints, 2);
  assert.equal(result.state.players.o.victoryPoints, 3);
});

test("Spoilt for Choice moves all remaining Installs to hand and its Outpost action discards one card to draw two", () => {
  let { state } = startedMiyuGame("miyu-ascension");
  const sapphire = state.modeState.miyuSapphireByPlayer.m;
  useMiyuSapphire(miyuContext(state, MIYU_ASCENSION_ID, {
    eventType: "skill.unlocked",
    event: { playerId: "m", skillId: MIYU_ASCENSION_ID },
  }));
  const movedInstalls = sapphire.installInstanceIds.filter((id) => state.cards[id].zone === "hand");
  assert.equal(movedInstalls.length, 6);

  add(state, "m", "ascension", MIYU_ASCENSION_ID, "master-skills", "up", false);
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "m";
  let result = engine.execute(state, command(state, "ascension-draw-open", CommandType.UseSkill, "m", {
    skillId: MIYU_ASCENSION_ID,
    data: { abilityId: "spoilt-for-choice-draw" },
  }));
  assert.equal(result.state.pendingDecision?.kind, "miyu-spoilt-for-choice-discard");
  const discardId = result.state.pendingDecision.options[0].id;
  const handBefore = result.state.players.m.hand.length;
  result = engine.execute(result.state, command(result.state, "ascension-draw-resolve", CommandType.ResolveDecision, "m", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: [discardId],
  }));
  assert.equal(result.state.cards[discardId].zone, "discard");
  assert.equal(result.state.players.m.hand.length, handBefore + 1);
});
