import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { runWithOtherPlayerAbilityImmunity } from "../src/rules-core/ability-immunity.ts";
import {
  beginSkillUseReactions,
  clearSkillUseReactionImmunity,
  resolveSkillUseReactionDecision,
} from "../src/rules-core/skill-use-reactions.ts";
import {
  BRADAMANTE_ANGELICA_ID,
  BRADAMANTE_ATLANTE_ID,
  resolveBradamanteAngelicaCathay,
  resolveBradamanteBouclierAtlante,
  useBradamanteAngelicaCathay,
} from "../src/rules-core/bradamante.ts";

const built = buildStandardContent(legacyContent);
new StandardMatchEngine(built); // registers the package's core skill handlers
const eventCards = Object.fromEntries(built.events.map((event) => [event.id, {
  ...event,
  name: event.id,
  cardType: "event",
  cost: 0,
  basePower: 0,
  typeLabel: "特殊",
}]));
const definitions = {
  ...built.cards,
  ...eventCards,
  ...built.skills.asCardDefinitions(),
  "card.test.str-basic": { id: "card.test.str-basic", name: "Strength Basic", cardType: "attack", cost: 1, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.test.magic-basic": { id: "card.test.magic-basic", name: "Magic Basic", cardType: "attack", cost: 1, basePower: 2, typeLabel: "魔术", attributes: ["魔术"], basic: true },
  "card.test.magic-two": { id: "card.test.magic-two", name: "Magic Two", cardType: "attack", cost: 2, basePower: 4, typeLabel: "魔术", attributes: ["魔术"] },
  "card.test.magic-zero": { id: "card.test.magic-zero", name: "Magic Zero", cardType: "attack", cost: 0, basePower: 4, typeLabel: "魔术", attributes: ["魔术"] },
};

function makeState(id, players = ["b", "o", "x"]) {
  const state = createGameState({ gameInstanceId: id, players: players.map((playerId) => ({ id: playerId, name: playerId })), seed: 1632 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = players[0];
  state.players.b.servantId = "servant.bradamante";
  return state;
}

function putAt(state, playerId, locationId = "mountain") {
  for (const ids of Object.values(state.board.locations)) {
    const index = ids.indexOf(playerId);
    if (index >= 0) ids.splice(index, 1);
  }
  state.players[playerId].locationId = locationId;
  state.board.locations[locationId].push(playerId);
}

function addSkill(state, skillId, instanceId, zone = "servant-skills", active = false) {
  createOwnedCardInstance(state, "b", { instanceId, definitionId: skillId, zone, face: "up", active });
}

test("Bradamante package is 3/3 FULL", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.bradamante");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(built.skills.get(BRADAMANTE_ANGELICA_ID).handlerId);
  assert.ok(built.skills.get(BRADAMANTE_ATLANTE_ID).handlerId);
});

test("Curse Ward is live from the skill zone, asks before resolution, and declining protects only Bradamante from that skill use", () => {
  const state = makeState("bradamante-ward");
  addSkill(state, BRADAMANTE_ANGELICA_ID, "angelica");
  const opponentSkillId = "master.kiritsugu.skill.s2";
  assert.equal(beginSkillUseReactions(state, "o", opponentSkillId, {}, definitions), true);
  assert.equal(state.pendingDecision.kind, "opponent-skill-ward-invoke");
  assert.equal(state.pendingDecision.ownerPlayerId, "b");

  const invoke = state.pendingDecision;
  state.pendingDecision = null;
  const first = resolveSkillUseReactionDecision(state, invoke, ["ask"], definitions);
  assert.equal(first.ready, undefined);
  assert.equal(state.pendingDecision.kind, "opponent-skill-ward-payment");
  const payment = state.pendingDecision;
  state.pendingDecision = null;
  const second = resolveSkillUseReactionDecision(state, payment, ["decline"], definitions);
  assert.ok(second.ready);

  runWithOtherPlayerAbilityImmunity(state, "o", () => {
    state.players.b.victoryPoints += 5;
    state.players.x.victoryPoints += 5;
  }, opponentSkillId);
  assert.equal(state.players.b.victoryPoints, 0);
  assert.equal(state.players.x.victoryPoints, 5);
  clearSkillUseReactionImmunity(state, second.ready.temporaryImmunityModifierIds);
  assert.equal(state.activeRuleModifiers.length, 0);

  // The once-per-round ward was consumed even though the opponent declined.
  assert.equal(beginSkillUseReactions(state, "o", opponentSkillId, {}, definitions), false);
});

test("Magic Canceler excludes zero-cost Magic, pays the target's non-zero cost and deactivates the selected attack", () => {
  const state = makeState("bradamante-canceler", ["b", "o"]);
  putAt(state, "b"); putAt(state, "o");
  state.players.b.mana = 6;
  addSkill(state, BRADAMANTE_ANGELICA_ID, "angelica", "attack", true);
  createOwnedCardInstance(state, "o", { instanceId: "magic-two", definitionId: "card.test.magic-two", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "magic-zero", definitionId: "card.test.magic-zero", zone: "attack", face: "up", active: true });
  let decision;
  useBradamanteAngelicaCathay({ state, player: state.players.b, skill: built.skills.get(BRADAMANTE_ANGELICA_ID), definitions, payload: { abilityId: "magic-canceler" }, openDecision: (value) => { decision = value; } });
  assert.deepEqual(decision.options.map((option) => option.id), ["magic-two"]);
  resolveBradamanteAngelicaCathay({
    state,
    player: state.players.b,
    skill: built.skills.get(BRADAMANTE_ANGELICA_ID),
    definitions,
    payload: { previous: { candidateIds: ["magic-two"] }, decision: { selections: ["magic-two"] } },
  });
  assert.equal(state.players.b.mana, 4);
  assert.equal(state.cards["magic-two"].active, false);
  assert.equal(state.cards["magic-two"].face, "down");
  assert.equal(state.cards["magic-two"].zone, "attack");
  assert.equal(state.cards["magic-zero"].active, true);
});

test("Bouclier passive works from the skill zone and blocks only positive Situation/Event increases on matching opponent attacks", () => {
  const state = makeState("bradamante-shield", ["b", "o"]);
  putAt(state, "b"); putAt(state, "o");
  addSkill(state, BRADAMANTE_ATLANTE_ID, "atlante");
  createOwnedCardInstance(state, "b", { instanceId: "b-str", definitionId: "card.test.str-basic", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o-str", definitionId: "card.test.str-basic", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "o", { instanceId: "o-mag", definitionId: "card.test.magic-basic", zone: "attack", face: "up", active: true });
  state.modeState.situationRestrictions = { combatPower: { cardAddByAttribute: { 力量: 3, 魔术: 3 }, locations: ["mountain"] } };
  assert.equal(calculateCombatCardPower(state, state.players.o, "o-str", definitions, "mountain"), 2);
  assert.equal(calculateCombatCardPower(state, state.players.o, "o-mag", definitions, "mountain"), 5);
  state.modeState.situationRestrictions = { combatPower: { cardAddByAttribute: { 力量: -2 }, locations: ["mountain"] } };
  assert.equal(calculateCombatCardPower(state, state.players.o, "o-str", definitions, "mountain"), 0);
});

test("Bouclier active ability pays 4, reveals Bradamante, then plays a basic attack and pays that card's cost", () => {
  const state = makeState("bradamante-atlante-play", ["b", "o"]);
  putAt(state, "b"); putAt(state, "o");
  state.players.b.mana = 10;
  addSkill(state, BRADAMANTE_ATLANTE_ID, "atlante", "attack", true);
  createOwnedCardInstance(state, "b", { instanceId: "basic", definitionId: "card.test.str-basic", zone: "hand", face: "down", active: false });
  let decision;
  built.skills.execute(state, "b", BRADAMANTE_ATLANTE_ID, { abilityId: "atlante-basic-play" }, (value) => { decision = value; }, () => 0, definitions);
  assert.ok(decision);
  assert.equal(state.players.b.mana, 6);
  assert.equal(state.players.b.trueNameRevealed, true);
  resolveBradamanteBouclierAtlante({
    state,
    player: state.players.b,
    skill: built.skills.get(BRADAMANTE_ATLANTE_ID),
    definitions,
    payload: { previous: { candidateIds: ["basic"] }, decision: { selections: ["basic"] } },
  });
  assert.equal(state.players.b.mana, 5);
  assert.equal(state.cards.basic.zone, "attack");
  assert.equal(state.cards.basic.active, true);
  assert.equal(state.cards.basic.paidCost, 1);
});
