import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { createOwnedCardInstance, drawCards } from "../src/rules-core/decks.ts";

const RHO_AIAS = "servant.emiya.skill.sc-emiya-1";
const FAKE_SPIRAL = "servant.emiya.skill.sc-emiya-2";
const UBW = "servant.emiya.skill.sc-emiya-np";
const BASIC = "card.cardb1";
const QUICK = "card.cardq3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setupBuilt() {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  return { built, engine, definitions };
}

function addCard(state, playerId, instanceId, definitionId, zone = "attack", active = true) {
  return createOwnedCardInstance(state, playerId, {
    instanceId,
    definitionId,
    zone,
    face: active ? "up" : "down",
    active,
    residual: definitionId === UBW && active,
  });
}

function ubwActionState(id, handCount, deckCount = 0) {
  const { definitions } = setupBuilt();
  const state = createGameState({ gameInstanceId: id, players: [{ id: "emiya", name: "Emiya" }], seed: 3101 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "emiya";
  state.players.emiya.servantId = "servant.emiya";
  state.players.emiya.locationId = "mountain";
  state.board.locations.mountain = ["emiya"];
  state.players.emiya.mana = 20;
  addCard(state, "emiya", "ubw", UBW, "attack", true);
  for (let index = 0; index < handCount; index += 1) addCard(state, "emiya", `hand-${index + 1}`, BASIC, "hand", false);
  for (let index = 0; index < deckCount; index += 1) addCard(state, "emiya", `deck-${index + 1}`, BASIC, "deck", false);
  return { state, definitions };
}

test("Emiya package: all three skills are FULL and UBW rebuilding is executable", () => {
  const { built } = setupBuilt();
  const rho = built.skills.get(RHO_AIAS);
  const spiral = built.skills.get(FAKE_SPIRAL);
  const ubw = built.skills.get(UBW);

  assert.equal(rho.supportLevel, "FULL");
  assert.equal(rho.handlerId, "core.zero-opponent-attribute");
  assert.equal(rho.requiresActiveCard, true);
  assert.equal(rho.combatPowerZeroAttribute, "迅捷");

  assert.equal(spiral.supportLevel, "FULL");
  assert.equal(spiral.handlerId, "core.emiya-fake-spiral-sword");
  assert.equal(spiral.abilities.find((ability) => ability.id === "fake-spiral-triple-advantage")?.requiresActiveCard, true);
  assert.equal(spiral.abilities.find((ability) => ability.id === "fake-spiral-victory-reward")?.requiresActiveCard, true);

  assert.equal(ubw.supportLevel, "FULL");
  assert.equal(ubw.handlerId, "core.structured-skill");
  assert.equal(ubw.cardResidual, true);
  assert.deepEqual(ubw.rules.ambiguities ?? [], []);
  const rebuild = ubw.rules.abilities.find((ability) => ability.id === "unlimited-blade-works-rebuild-hand");
  assert.equal(rebuild.execution.mode, "automatic");
  assert.ok(rebuild.effects.some((effect) => effect.type === "choose_cards" && effect.maxCount === 12));
  assert.ok(rebuild.effects.some((effect) => effect.type === "move_selected_cards" && effect.destination === "hand"));
  const residual = ubw.rules.abilities.find((ability) => ability.id === "unlimited-blade-works-residual");
  assert.equal(residual.execution.mode, "automatic");
  assert.ok(residual.ruleModifiers.some((modifier) => modifier.rule === "standard_attack_card_count" && modifier.operation === "replace"));
  assert.ok(residual.ruleModifiers.some((modifier) => modifier.rule === "card_draw" && modifier.operation === "forbid"));
});

test("Emiya package: UBW play trigger rebuilds up to 12 cards and leaves unselected cards in their original zones", () => {
  const { engine } = setupBuilt();
  const state = createGameState({ gameInstanceId: "emiya-ubw-rebuild", players: [{ id: "emiya", name: "Emiya" }], seed: 31015 });
  state.status = "playing";
  state.round = 4;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "emiya";
  state.players.emiya.servantId = "servant.emiya";
  state.players.emiya.locationId = "mountain";
  state.board.locations.mountain = ["emiya"];
  state.players.emiya.mana = 20;

  createOwnedCardInstance(state, "emiya", { instanceId: "ubw-card", definitionId: UBW, zone: "servant-skills", face: "up", active: false });
  createOwnedCardInstance(state, "emiya", { instanceId: "companion", definitionId: BASIC, zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "emiya", { instanceId: "existing", definitionId: "card.cardq1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "emiya", { instanceId: "skill-attack", definitionId: RHO_AIAS, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "emiya", { instanceId: "hand-picked", definitionId: "card.carda1", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "emiya", { instanceId: "hand-stay", definitionId: "card.cardq2", zone: "hand", face: "down", active: false });
  createOwnedCardInstance(state, "emiya", { instanceId: "deck-picked", definitionId: "card.cardb2", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "emiya", { instanceId: "deck-stay", definitionId: "card.carda2", zone: "deck", face: "down", active: false });
  createOwnedCardInstance(state, "emiya", { instanceId: "discard-picked", definitionId: "card.cardq3", zone: "discard", face: "up", active: false });
  createOwnedCardInstance(state, "emiya", { instanceId: "discard-stay", definitionId: "card.cardb3", zone: "discard", face: "up", active: false });

  let result = engine.execute(state, command(state, "ubw-play", CommandType.CommitAttack, "emiya", {
    faceUpInstanceIds: ["ubw-card", "companion"],
    faceDownInstanceIds: [],
  }));
  assert.equal(result.state.pendingDecision?.kind, "structured-private-card-choice");
  assert.equal(result.state.pendingDecision?.min, 0);
  assert.equal(result.state.pendingDecision?.max, 8);
  const options = new Set(result.state.pendingDecision?.options.map((option) => option.id));
  for (const expected of ["companion", "existing", "hand-picked", "hand-stay", "deck-picked", "deck-stay", "discard-picked", "discard-stay"]) assert.ok(options.has(expected));
  assert.equal(options.has("ubw-card"), false);
  assert.equal(options.has("skill-attack"), false);

  result = engine.execute(result.state, command(result.state, "ubw-rebuild-select", CommandType.ResolveDecision, "emiya", {
    decisionId: result.state.pendingDecision.decisionId,
    selections: ["companion", "existing", "hand-picked", "deck-picked", "discard-picked"],
  }));
  assert.equal(result.state.pendingDecision, null);
  for (const picked of ["companion", "existing", "hand-picked", "deck-picked", "discard-picked"]) {
    assert.ok(result.state.players.emiya.hand.includes(picked));
    assert.equal(result.state.cards[picked].zone, "hand");
    assert.equal(result.state.cards[picked].face, "down");
    assert.equal(result.state.cards[picked].active, false);
  }
  assert.ok(result.state.players.emiya.hand.includes("hand-stay"));
  assert.ok(result.state.players.emiya.deck.includes("deck-stay"));
  assert.ok(result.state.players.emiya.discard.includes("discard-stay"));
  assert.ok(result.state.players.emiya.attack.includes("skill-attack"));
  assert.ok(result.state.players.emiya.attack.includes("ubw-card"));
  assert.equal(result.state.cards["ubw-card"].active, true);
});

test("Emiya package: Rho Aias combat ability requires the active card and zeroes every same-battlefield Quick attack", () => {
  const { engine, definitions } = setupBuilt();
  const state = createGameState({ gameInstanceId: "emiya-rho-aias", players: [{ id: "emiya", name: "Emiya" }, { id: "opponent", name: "Opponent" }], seed: 3102 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "emiya";
  state.players.emiya.servantId = "servant.emiya";
  state.players.emiya.locationId = "mountain"; state.players.opponent.locationId = "mountain"; state.board.locations.mountain = ["emiya", "opponent"];
  addCard(state, "emiya", "rho", RHO_AIAS, "attack", true);
  addCard(state, "opponent", "quick", QUICK, "attack", true);

  const result = engine.execute(state, command(state, "emiya-rho-use", CommandType.UseSkill, "emiya", { skillId: RHO_AIAS }));
  assert.equal(calculateCombatCardPower(result.state, result.state.players.opponent, "quick", definitions, "mountain"), 0);
});

test("Emiya package: Fake Spiral Sword action ability follows the base rule requiring an active source and remains once per game", () => {
  const { engine } = setupBuilt();
  const state = createGameState({ gameInstanceId: "emiya-fake-spiral-action", players: [{ id: "emiya", name: "Emiya" }], seed: 3103 });
  state.status = "playing"; state.round = 4; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "emiya";
  state.players.emiya.servantId = "servant.emiya";
  state.players.emiya.flags.deploymentBonusActive = true; state.players.emiya.flags.deploymentBonus = 2;
  addCard(state, "emiya", "spiral-inactive", FAKE_SPIRAL, "servant-skills", false);

  assert.throws(() => engine.execute(state, command(state, "spiral-illegal", CommandType.UseSkill, "emiya", {
    skillId: FAKE_SPIRAL,
    data: { abilityId: "fake-spiral-triple-advantage" },
  })), /SKILL_(?:NOT_LEGAL|USE_FORBIDDEN)/);

  addCard(state, "emiya", "spiral-active", FAKE_SPIRAL, "attack", true);
  const result = engine.execute(state, command(state, "spiral-use", CommandType.UseSkill, "emiya", {
    skillId: FAKE_SPIRAL,
    data: { abilityId: "fake-spiral-triple-advantage" },
  }));
  assert.equal(result.state.players.emiya.flags.deploymentBonus, 6);
  assert.equal(result.state.players.emiya.flags.emiyaFakeSpiralSwordUsed, true);
  assert.throws(() => engine.execute(result.state, command(result.state, "spiral-repeat", CommandType.UseSkill, "emiya", {
    skillId: FAKE_SPIRAL,
    data: { abilityId: "fake-spiral-triple-advantage" },
  })), /SKILL_(?:NOT_LEGAL|USE_FORBIDDEN)/);
});

test("Emiya package: Fake Spiral Sword combat branch grants exactly four extra victory points after a win", () => {
  const { engine } = setupBuilt();
  const state = createGameState({ gameInstanceId: "emiya-fake-spiral-combat", players: [{ id: "emiya", name: "Emiya" }, { id: "opponent", name: "Opponent" }], seed: 3104 });
  state.status = "playing"; state.round = 4; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "emiya";
  state.players.emiya.servantId = "servant.emiya";
  state.players.emiya.locationId = "city"; state.players.opponent.locationId = "city"; state.board.locations.city = ["emiya", "opponent"]; state.board.currentEvents.city = [];
  addCard(state, "emiya", "spiral-combat", FAKE_SPIRAL, "attack", true);
  addCard(state, "opponent", "opponent-low", "card.cardq1", "attack", true);

  let result = engine.execute(state, command(state, "spiral-arm-reward", CommandType.UseSkill, "emiya", {
    skillId: FAKE_SPIRAL,
    data: { abilityId: "fake-spiral-victory-reward" },
  }));
  const before = result.state.players.emiya.victoryPoints;
  result.state.step = "settlement"; result.state.activePlayerId = null;
  result = engine.execute(result.state, command(result.state, "spiral-resolve-combat", CommandType.ResolveCombat, "emiya", { locationId: "city" }));
  const combat = result.events.find((event) => event.type === "combat.resolved");
  assert.ok(combat);
  const normalReward = Number(combat.payload.victoryPoints?.emiya ?? 0);
  assert.equal(result.state.players.emiya.victoryPoints - before, normalReward + 4);
  assert.equal(result.state.players.emiya.flags.emiyaFakeSpiralRewardRound, undefined);
});

test("Emiya package: UBW replaces the whole standard batch with 0-4 cards and rejects a fifth card", () => {
  {
    const { state, definitions } = ubwActionState("emiya-ubw-zero", 1);
    const result = commitStandardAttack(state, "emiya", [], [], definitions);
    assert.deepEqual(result.committed, []);
    assert.equal(state.step, "settlement");
  }
  {
    const { state, definitions } = ubwActionState("emiya-ubw-four", 5);
    const selected = state.players.emiya.hand.slice(0, 4);
    const result = commitStandardAttack(state, "emiya", selected, [], definitions);
    assert.equal(result.committed.length, 4);
  }
  {
    const { state, definitions } = ubwActionState("emiya-ubw-five", 5);
    assert.throws(() => commitStandardAttack(state, "emiya", [...state.players.emiya.hand], [], definitions), /STANDARD_ATTACK_CARD_COUNT_INVALID/);
  }
});

test("Emiya package: UBW forbids draws while hand remains nonempty, but hand zero closes UBW before the next draw resolves", () => {
  {
    const { state, definitions } = ubwActionState("emiya-ubw-no-draw", 1, 1);
    const deckBefore = [...state.players.emiya.deck];
    const drawn = drawCards(state, "emiya", 1, () => 0, definitions);
    assert.deepEqual(drawn, []);
    assert.deepEqual(state.players.emiya.deck, deckBefore);
    assert.equal(state.cards.ubw.active, true);
  }
  {
    const { state, definitions } = ubwActionState("emiya-ubw-empty-closes", 0, 1);
    const drawn = drawCards(state, "emiya", 1, () => 0, definitions);
    assert.deepEqual(drawn, ["deck-1"]);
    assert.equal(state.cards.ubw.active, false);
    assert.equal(state.cards.ubw.zone, "servant-skills");
    assert.deepEqual(state.players.emiya.hand, ["deck-1"]);
  }
});

test("Emiya package: playing the final hand card closes UBW in the same engine transaction", () => {
  const { engine } = setupBuilt();
  const { state } = ubwActionState("emiya-ubw-last-card", 1);
  const result = engine.execute(state, command(state, "emiya-play-last-card", CommandType.CommitAttack, "emiya", {
    faceUpInstanceIds: ["hand-1"],
    faceDownInstanceIds: [],
  }));
  assert.equal(result.state.players.emiya.hand.length, 0);
  assert.equal(result.state.cards.ubw.active, false);
  assert.equal(result.state.cards.ubw.zone, "servant-skills");
  assert.ok(result.events.some((event) => event.type === "card.closed" && event.payload.instanceId === "ubw"));
});
