import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

const PAPIYAS = "servant.nobunaga.skill.sc-nobunaga-1";
const THREE_LINE = "servant.nobunaga.skill.sc-nobunaga-2";
const FOOL = "servant.nobunaga.skill.sc-nobunaga-3";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup(id = "nobunaga") {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: id, players: [{ id: "n", name: "Nobunaga" }, { id: "o", name: "Opponent" }], seed: 2601 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "n";
  state.turnOrder = ["n", "o"];
  state.players.n.servantId = "servant.nobunaga";
  state.players.n.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.workshop = [];
  state.board.locations.mountain = ["n", "o"];
  state.board.locations.city = [];
  state.board.locations.scouting = [];
  state.board.currentEvents.mountain = [];
  state.board.currentEvents.city = [];
  return { built, definitions, engine, state };
}

let passiveCounter = 0;
function emitPassive(engine, state, definitions, type, payload = {}) {
  passiveCounter += 1;
  enqueuePassiveEffects(state, engine.passives, {
    eventId: `${state.gameInstanceId}:${type}:${passiveCounter}`,
    sourceCommandId: "test",
    revision: state.revision,
    type,
    payload,
  });
  engine.effects.drain(state, 1000, definitions);
}

test("Nobunaga package: all three skills are FULL", () => {
  const { built } = setup("nobunaga-full");
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.nobunaga");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(PAPIYAS).handlerId, "core.nobunaga-papiyas");
  assert.equal(built.skills.get(THREE_LINE).handlerId, "core.nobunaga-three-line-formation");
  assert.equal(built.skills.get(FOOL).handlerId, "core.structured-skill");
});

test("Papiyas upkeep requires paying 2 mana or closes automatically when payment is impossible", () => {
  const { engine, definitions, state } = setup("nobunaga-upkeep");
  state.phase = "preparation";
  state.players.n.mana = 2;
  createOwnedCardInstance(state, "n", { instanceId: "papiyas", definitionId: PAPIYAS, zone: "attack", face: "up", active: true, residual: true });
  emitPassive(engine, state, definitions, "round.started", { round: 4, phase: "preparation", activePlayerId: "n" });
  assert.equal(state.pendingDecision?.kind, "nobunaga-papiyas-upkeep");
  let result = engine.execute(state, command(state, "nobu-upkeep-pay", CommandType.ResolveDecision, "n", {
    decisionId: state.pendingDecision.decisionId,
    selections: ["pay"],
  }));
  assert.equal(result.state.players.n.mana, 0);
  assert.equal(result.state.cards.papiyas.zone, "attack");
  assert.equal(result.state.cards.papiyas.active, true);

  result.state.round = 5;
  result.state.phase = "preparation";
  result.state.step = "player-window";
  result.state.activePlayerId = "n";
  result.state.players.n.mana = 1;
  emitPassive(engine, result.state, definitions, "round.started", { round: 5, phase: "preparation", activePlayerId: "n" });
  assert.equal(result.state.pendingDecision, null);
  assert.equal(result.state.cards.papiyas.zone, "servant-skills");
  assert.equal(result.state.cards.papiyas.active, false);
});

test("Papiyas grows for defeat/elimination facts, caps at +7, and Desecration defeats Luck controllers then closes Luck", () => {
  const { engine, definitions, state } = setup("nobunaga-papiyas-growth");
  createOwnedCardInstance(state, "n", { instanceId: "papiyas", definitionId: PAPIYAS, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(state, "o", { instanceId: "luck", definitionId: "card.cardluck", zone: "attack", face: "up", active: true });
  emitPassive(engine, state, definitions, "player.defeated", { playerId: "x" });
  emitPassive(engine, state, definitions, "round.ended", { round: 4, eliminatedThisRound: ["x", "y", "z"] });
  assert.equal(calculateCombatCardPower(state, state.players.n, "papiyas", definitions, "mountain"), 7);
  for (let index = 0; index < 10; index += 1) emitPassive(engine, state, definitions, "player.defeated", { playerId: `extra-${index}` });
  assert.equal(calculateCombatCardPower(state, state.players.n, "papiyas", definitions, "mountain"), 10);

  const result = engine.execute(state, command(state, "nobu-desecration", CommandType.UseSkill, "n", {
    skillId: PAPIYAS,
    data: { abilityId: "desecration" },
  }));
  assert.equal(result.state.players.o.defeated, true);
  assert.equal(result.state.cards.luck.zone, "attack");
  assert.equal(result.state.cards.luck.face, "down");
  assert.equal(result.state.cards.luck.active, false);
});

test("Three Line Formation subtracts 2 from non-Magic card power but not Magic card power", () => {
  const { engine, definitions, state } = setup("nobunaga-three-line-power");
  const nonMagic = { id: "test.non-magic-two", name: "Non Magic", cardType: "attack", ownerType: "common", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true, isSkill: false, requiresEightMana: false, residual: false };
  const magic = { id: "test.magic-two", name: "Magic", cardType: "attack", ownerType: "common", cost: 0, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true, isSkill: false, requiresEightMana: false, residual: false };
  definitions[nonMagic.id] = nonMagic;
  definitions[magic.id] = magic;
  engine.dynamicCards[nonMagic.id] = nonMagic;
  engine.dynamicCards[magic.id] = magic;
  createOwnedCardInstance(state, "n", { instanceId: "three-line", definitionId: THREE_LINE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "nonmagic", definitionId: nonMagic.id, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "magic", definitionId: magic.id, zone: "attack", face: "up", active: true });

  const result = engine.execute(state, command(state, "nobu-three-line-use", CommandType.UseSkill, "n", {
    skillId: THREE_LINE,
    data: { abilityId: "three-thousand-worlds" },
  }));
  const liveDefinitions = { ...definitions };
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "nonmagic", liveDefinitions, "mountain"), 0);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.o, "magic", liveDefinitions, "mountain"), 2);
});

test("Three Line Formation uses frozen card power: zero non-Permanent defeats before winner selection, zero Permanent does not", () => {
  const { engine, state } = setup("nobunaga-three-line-defeat");
  const zeroTarget = { id: "test.zero-target", name: "Zero Target", cardType: "attack", ownerType: "common", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true, isSkill: false, requiresEightMana: false, residual: false };
  const permanentZero = { id: "test.permanent-zero", name: "Permanent Zero", cardType: "attack", ownerType: "common", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: false, isSkill: false, requiresEightMana: false, residual: true };
  engine.dynamicCards[zeroTarget.id] = zeroTarget;
  engine.dynamicCards[permanentZero.id] = permanentZero;
  createOwnedCardInstance(state, "n", { instanceId: "three-line", definitionId: THREE_LINE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "zero-target", definitionId: zeroTarget.id, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "permanent-zero", definitionId: permanentZero.id, zone: "attack", face: "up", active: true, residual: true });

  let result = engine.execute(state, command(state, "nobu-three-line-arm", CommandType.UseSkill, "n", {
    skillId: THREE_LINE,
    data: { abilityId: "three-thousand-worlds" },
  }));
  result.state.step = "settlement";
  result.state.activePlayerId = null;
  result = engine.execute(result.state, command(result.state, "nobu-three-line-resolve", CommandType.ResolveCombat, "n", { locationId: "mountain" }));
  assert.equal(result.state.players.o.defeated, true);
  const combat = result.events.find((event) => event.type === "combat.resolved");
  assert.ok(combat);
  assert.ok(!combat.payload.winnerIds.includes("o"));
  assert.ok(combat.payload.defeatedPlayerIds.includes("o"));

  const second = setup("nobunaga-three-line-permanent-only");
  const safeMagic = { id: "test.safe-magic", name: "Safe Magic", cardType: "attack", ownerType: "common", cost: 0, basePower: 20, typeLabel: "魔术", attributes: ["魔术"], basic: true, isSkill: false, requiresEightMana: false, residual: false };
  second.engine.dynamicCards[permanentZero.id] = permanentZero;
  second.engine.dynamicCards[safeMagic.id] = safeMagic;
  createOwnedCardInstance(second.state, "n", { instanceId: "three-line", definitionId: THREE_LINE, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(second.state, "o", { instanceId: "permanent-zero", definitionId: permanentZero.id, zone: "attack", face: "up", active: true, residual: true });
  createOwnedCardInstance(second.state, "o", { instanceId: "safe-magic", definitionId: safeMagic.id, zone: "attack", face: "up", active: true });
  let onlyPermanent = second.engine.execute(second.state, command(second.state, "nobu-permanent-arm", CommandType.UseSkill, "n", { skillId: THREE_LINE, data: { abilityId: "three-thousand-worlds" } }));
  onlyPermanent.state.step = "settlement";
  onlyPermanent.state.activePlayerId = null;
  onlyPermanent = second.engine.execute(onlyPermanent.state, command(onlyPermanent.state, "nobu-permanent-resolve", CommandType.ResolveCombat, "n", { locationId: "mountain" }));
  assert.equal(onlyPermanent.state.players.o.defeated, false);
});
