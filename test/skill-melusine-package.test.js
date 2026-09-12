import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import {
  createOwnedCardInstance,
  initializePlayerDeck,
  initializePlayerSkillCards,
  movePlayerCard,
} from "../src/rules-core/decks.ts";
import {
  ALBION_SERVANT_ID,
  MELUSINE_PERL_DANCER_ID,
  MELUSINE_RAY_HORIZON_ID,
  MELUSINE_SERVANT_ID,
  resolveMelusinePerlDancer,
  useMelusinePerlDancer,
  useMelusineRayHorizon,
} from "../src/rules-core/melusine.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
const melusineDeck = legacyContent.servants.find((servant) => servant.id === MELUSINE_SERVANT_ID).deck;
const melusineSkills = built.skills.list()
  .filter((skill) => skill.ownerType === "servant" && skill.ownerId === MELUSINE_SERVANT_ID && skill.initiallyOwned !== false)
  .map((skill) => ({ id: skill.id, ownerType: "servant" }));

function fresh(id = "melusine") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "m", name: "Melusine" }, { id: "o", name: "Opponent" }], seed: 7788 });
  state.status = "playing";
  state.round = 1;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "m";
  state.players.m.servantId = MELUSINE_SERVANT_ID;
  state.players.m.mana = 20;
  initializePlayerDeck(state, "m", melusineDeck, () => 0);
  initializePlayerSkillCards(state, "m", melusineSkills);
  return state;
}

function ray(state, event = { playerId: "m" }) {
  return useMelusineRayHorizon({
    state,
    player: state.players.m,
    skill: built.skills.get(MELUSINE_RAY_HORIZON_ID),
    payload: { eventType: "player.defeated", event },
    definitions,
    randomInt: () => 0,
    openDecision: () => {},
    emitEvent: () => {},
  });
}

test("Melusine 3/3 FULL，Ray Horizon 与 Perl Dancer 均有可执行 handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === MELUSINE_SERVANT_ID);
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get(MELUSINE_RAY_HORIZON_ID).handlerId, "core.melusine-ray-horizon");
  assert.equal(built.skills.get(MELUSINE_PERL_DANCER_ID).handlerId, "core.melusine-perl-dancer");
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.ok(built.skills.get(MELUSINE_RAY_HORIZON_ID).tags.includes("cannot-copy"));
  assert.ok(built.skills.get(MELUSINE_RAY_HORIZON_ID).tags.includes("cannot-steal"));
});

test("初始牌库与从者技能带 originServantId；后来加入的同名牌不会被误认作原从者牌", () => {
  const state = fresh("melusine-provenance");
  const player = state.players.m;
  assert.ok(player.deck.every((id) => state.cards[id].originServantId === MELUSINE_SERVANT_ID));
  assert.ok(player.servantSkills.every((id) => state.cards[id].originServantId === MELUSINE_SERVANT_ID));
  const later = createOwnedCardInstance(state, "m", { instanceId: "later-same-card", definitionId: "card.cardq4", zone: "hand" });
  assert.equal(later.originServantId, undefined);
});

test("第一次战败只展示 Ray Horizon，不真名解放也不替换/移除任何原从者牌", () => {
  const state = fresh("melusine-first-loss");
  const beforeZones = Object.fromEntries(Object.values(state.cards)
    .filter((card) => card.originServantId === MELUSINE_SERVANT_ID)
    .map((card) => [card.instanceId, card.zone]));
  const rayId = state.players.m.servantSkills.find((id) => state.cards[id].definitionId === MELUSINE_RAY_HORIZON_ID);
  assert.ok(rayId);
  assert.equal(state.cards[rayId].face, "down");

  const result = ray(state);
  assert.equal(result.transformed, false);
  assert.equal(state.cards[rayId].face, "up");
  assert.equal(state.players.m.servantId, MELUSINE_SERVANT_ID);
  assert.equal(state.players.m.trueNameRevealed, false);
  for (const [instanceId, zone] of Object.entries(beforeZones)) assert.equal(state.cards[instanceId].zone, zone);
});

test("第二次战败移除所有 Melusine 原牌，旧手牌/弃牌/场上攻击均清除；后来加入的牌原区域保留", () => {
  const state = fresh("melusine-second-loss");
  const player = state.players.m;
  const rayId = player.servantSkills.find((id) => state.cards[id].definitionId === MELUSINE_RAY_HORIZON_ID);
  assert.ok(rayId);
  state.cards[rayId].face = "up";

  const oldHand = player.deck[0];
  const oldDiscard = player.deck[1];
  const oldAttack = player.deck[2];
  movePlayerCard(state, "m", oldHand, "hand");
  movePlayerCard(state, "m", oldDiscard, "discard");
  movePlayerCard(state, "m", oldAttack, "attack");
  state.cards[oldAttack].face = "up";
  state.cards[oldAttack].active = true;

  createOwnedCardInstance(state, "m", { instanceId: "later-hand", definitionId: state.cards[oldHand].definitionId, zone: "hand" });
  createOwnedCardInstance(state, "m", { instanceId: "later-discard", definitionId: state.cards[oldDiscard].definitionId, zone: "discard" });
  createOwnedCardInstance(state, "m", { instanceId: "later-attack", definitionId: state.cards[oldAttack].definitionId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "m", { instanceId: "later-deck-a", definitionId: "card.cardluck", zone: "deck" });
  createOwnedCardInstance(state, "m", { instanceId: "later-deck-b", definitionId: "card.cardsurveil", zone: "deck" });
  const survivingDeckPrefix = player.deck.filter((id) => id.startsWith("later-deck-"));

  state.activeRuleModifiers.push({ id: "old-rule", sourceId: MELUSINE_PERL_DANCER_ID, controllerPlayerId: "m", operation: "add", rule: "card_power", scope: { subject: "controller" }, value: 99, duration: "round", createdRound: state.round });
  player.cardRuleModifiers.push({ id: "old-card-rule", sourceId: MELUSINE_PERL_DANCER_ID, controllerPlayerId: "m", targetDefinitionIds: ["card.cardq4"], powerAdd: 99, duration: "round", createdRound: state.round });

  const oldOriginalIds = Object.values(state.cards).filter((card) => card.originServantId === MELUSINE_SERVANT_ID).map((card) => card.instanceId);
  player.defeated = true; // actual trigger arrives after the defeat state transition
  const result = ray(state);
  assert.equal(result.transformed, true);
  assert.equal(player.servantId, ALBION_SERVANT_ID);
  assert.equal(player.trueNameRevealed, true);
  assert.equal(player.defeated, true); // replacing the Servant does not erase this round's defeat

  for (const instanceId of oldOriginalIds) {
    assert.equal(state.cards[instanceId].zone, "removed", instanceId);
    assert.equal(state.cards[instanceId].active, false, instanceId);
  }
  assert.equal(state.cards[oldHand].zone, "removed");
  assert.equal(state.cards[oldDiscard].zone, "removed");
  assert.equal(state.cards[oldAttack].zone, "removed");
  assert.equal(state.cards["later-hand"].zone, "hand");
  assert.equal(state.cards["later-discard"].zone, "discard");
  assert.equal(state.cards["later-attack"].zone, "attack");
  assert.deepEqual(player.deck.slice(0, survivingDeckPrefix.length), survivingDeckPrefix);
  assert.equal(state.activeRuleModifiers.some((modifier) => modifier.sourceId === MELUSINE_PERL_DANCER_ID), false);
  assert.equal(player.cardRuleModifiers.some((modifier) => modifier.sourceId === MELUSINE_PERL_DANCER_ID), false);

  const albionDeck = player.deck.filter((id) => state.cards[id].originServantId === ALBION_SERVANT_ID);
  assert.equal(albionDeck.length, 12);
  const counts = Object.fromEntries([...new Set(albionDeck.map((id) => state.cards[id].definitionId))].map((definitionId) => [definitionId, albionDeck.filter((id) => state.cards[id].definitionId === definitionId).length]));
  assert.deepEqual(counts, {
    "card.cardb4": 3,
    "card.cardq4": 4,
    "card.carda4": 2,
    "card.cardluck": 1,
    "card.cardsurveil": 2,
  });
  const albionSkills = player.servantSkills.filter((id) => state.cards[id].originServantId === ALBION_SERVANT_ID);
  assert.equal(albionSkills.length, 3);
  assert.ok(albionSkills.every((id) => state.cards[id].face === "up"));
  assert.deepEqual(new Set(albionSkills.map((id) => state.cards[id].definitionId)), new Set([
    "servant.albion.skill.sc-albion-1",
    "servant.albion.skill.sc-albion-2",
    "servant.albion.skill.sc-albion-3",
  ]));
});

function setupPerl(id, moved = false) {
  const state = fresh(id);
  const player = state.players.m;
  const perlId = player.servantSkills.find((instanceId) => state.cards[instanceId].definitionId === MELUSINE_PERL_DANCER_ID);
  assert.ok(perlId);
  movePlayerCard(state, "m", perlId, "attack");
  state.cards[perlId].face = "up";
  state.cards[perlId].active = true;
  if (moved) player.flags.movedOrRedeployedRound = state.round;
  const basicIds = player.deck.slice(0, 4);
  for (const instanceId of basicIds) movePlayerCard(state, "m", instanceId, "hand");
  return { state, player, basicIds };
}

function invokePerl(state) {
  let decision;
  useMelusinePerlDancer({
    state,
    player: state.players.m,
    skill: built.skills.get(MELUSINE_PERL_DANCER_ID),
    payload: { abilityId: "perl-dancer-play" },
    definitions,
    openDecision: (value) => { decision = value; },
  });
  assert.ok(decision);
  return decision;
}

function resolvePerl(state, decision, selections, openDecision = () => {}) {
  const frame = state.effectQueue.find((effect) => effect.effectId === decision.continuationEffectId);
  assert.ok(frame);
  state.effectQueue = state.effectQueue.filter((effect) => effect.effectId !== frame.effectId);
  return resolveMelusinePerlDancer({
    state,
    player: state.players.m,
    skill: built.skills.get(MELUSINE_PERL_DANCER_ID),
    payload: { previous: frame.payload, decision: { status: "resolved", selections } },
    definitions,
    randomInt: () => 0,
    openDecision,
    emitEvent: () => {},
  });
}

test("Perl Dancer 未移动分支可支付正常费用打出至多2张基础攻击", () => {
  const { state, player, basicIds } = setupPerl("melusine-perl-base", false);
  const decision = invokePerl(state);
  assert.equal(decision.kind, "melusine-perl-dancer-cards");
  assert.equal(decision.max, 2);
  const selected = basicIds.slice(0, 2);
  const expectedCost = selected.reduce((sum, id) => sum + definitions[state.cards[id].definitionId].cost, 0);
  const beforeMana = player.mana;
  resolvePerl(state, decision, selected);
  assert.equal(player.mana, beforeMana - expectedCost);
  assert.ok(selected.every((id) => player.attack.includes(id) && state.cards[id].active));
});

test("Perl Dancer 已移动分支先选择替换效果，抽1张后才开放至多3张基础攻击选择", () => {
  const { state, player } = setupPerl("melusine-perl-moved", true);
  const initialHand = player.hand.length;
  const modeDecision = invokePerl(state);
  assert.equal(modeDecision.kind, "melusine-perl-dancer-mode");
  let cardDecision;
  resolvePerl(state, modeDecision, ["moved"], (value) => { cardDecision = value; });
  assert.equal(player.hand.length, initialHand + 1);
  assert.ok(cardDecision);
  assert.equal(cardDecision.kind, "melusine-perl-dancer-cards");
  assert.equal(cardDecision.max, 3);
  assert.ok(cardDecision.options.every((option) => definitions[state.cards[option.id].definitionId].basic === true));
});
