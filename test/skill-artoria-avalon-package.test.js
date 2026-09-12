import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { getCardRulePowerAdd } from "../src/rules-core/card-rule-modifiers.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  ARTORIA_AROUND_ID,
  ARTORIA_AROUND_RETURN,
  ARTORIA_AVALON_HANDLER,
  ARTORIA_CALL_ID,
  ARTORIA_CALL_MOVE,
  ARTORIA_DESTINY_ID,
  ARTORIA_RESPITE_GAIN,
  ARTORIA_RESPITE_ID,
  ARTORIA_ROUND_ID,
  resolveArtoriaAvalon,
  useArtoriaAvalon,
} from "../src/rules-core/artoria-avalon.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };

function setup(id = "artoria-avalon") {
  const state = createGameState({ gameInstanceId: id, players: [{ id: "a", name: "Artoria" }, { id: "o", name: "Other" }], seed: 42 });
  state.status = "playing";
  state.round = 3;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "a";
  state.turnOrder = ["a", "o"];
  state.players.a.servantId = "servant.artoriac";
  state.players.o.servantId = "servant.emiya";
  state.players.a.locationId = "mountain";
  state.players.o.locationId = "mountain";
  state.board.locations.mountain = ["a", "o"];
  state.board.locations.city = [];
  state.board.locations.workshop = [];
  state.board.locations.scouting = [];
  return state;
}

function ctx(state, skillId, payload = {}, extra = {}) {
  return {
    state,
    player: state.players.a,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision() {},
    randomInt: () => 0,
    emitEvent() {},
    ...extra,
  };
}

function addActive(state, definitionId, instanceId = `a:${definitionId}`) {
  return createOwnedCardInstance(state, "a", { instanceId, definitionId, originServantId: "servant.artoriac", zone: "attack", face: "up", active: true });
}

function resolveFrame(state, frame, selections, extra = {}) {
  return resolveArtoriaAvalon(ctx(state, frame.sourceId, { previous: frame.payload, decision: { status: "resolved", selections } }, extra));
}

test("Artoria Avalon package is 6/6 FULL and the three physical Pilgrim cards link to their executable skills", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.artoriac");
  assert.equal(skills.length, 6);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(built.skills.get("servant.artoriac.skill.sc-artoriac-2").handlerId, "core.structured-skill");
  for (const id of [ARTORIA_AROUND_ID, ARTORIA_ROUND_ID, ARTORIA_CALL_ID, ARTORIA_RESPITE_ID, ARTORIA_DESTINY_ID]) {
    assert.equal(built.skills.get(id).handlerId, ARTORIA_AVALON_HANDLER);
    assert.equal(built.skills.hasHandler(id), true);
  }
  assert.equal(definitions["card.x-pilgrimcall"].linkedSkillId, ARTORIA_CALL_ID);
  assert.equal(definitions["card.x-pilgrimrespite"].linkedSkillId, ARTORIA_RESPITE_ID);
  assert.equal(definitions["card.x-pilgrimdestiny"].linkedSkillId, ARTORIA_DESTINY_ID);
});

test("Around Caliburn lasts through the following round, buffs other Special attacks, and returns a current-round non-skill card", () => {
  const state = setup("artoria-around");
  const source = addActive(state, ARTORIA_AROUND_ID, "around");
  source.playedRound = state.round;
  useArtoriaAvalon(ctx(state, ARTORIA_AROUND_ID, { eventType: "card.played", event: { playerId: "a", instanceId: "around", definitionId: ARTORIA_AROUND_ID } }));
  assert.equal(source.residual, true);
  assert.equal(source.residualUntilRound, state.round + 1);

  const special = addActive(state, "card.x-pilgrimdestiny", "special");
  special.playedRound = state.round;
  assert.equal(getCardRulePowerAdd(state, state.players.a, special), 2);

  const ordinary = addActive(state, "card.carda2", "ordinary");
  ordinary.playedRound = state.round;
  let opened;
  const result = useArtoriaAvalon(ctx(state, ARTORIA_AROUND_ID, { abilityId: ARTORIA_AROUND_RETURN }, { openDecision(value) { opened = value; } }));
  assert.equal(result.pending, true);
  assert.ok(opened.options.some((option) => option.id === "ordinary"));
  const frame = state.effectQueue.shift();
  resolveFrame(state, frame, ["ordinary"]);
  assert.equal(state.cards.ordinary.zone, "hand");
});

test("Round of Avalon derives X from Luck in discard, reveals true name, then unpreventably recycles the whole discard after a win", () => {
  const state = setup("artoria-round");
  addActive(state, ARTORIA_ROUND_ID, "avalon");
  for (const [id, definitionId] of [["luck1", "card.cardluck"], ["luck2", "card.cardluck"], ["other", "card.carda2"]]) {
    createOwnedCardInstance(state, "a", { instanceId: id, definitionId, zone: "discard", face: "down", active: false });
  }
  const reveals = [];
  const synced = useArtoriaAvalon(ctx(state, ARTORIA_ROUND_ID, { eventType: "card.zone.changed", event: {} }, { emitEvent(type, payload) { reveals.push([type, payload]); } }));
  assert.equal(synced.x, 10);
  assert.equal(state.players.a.trueNameRevealed, true);
  assert.equal(state.players.a.flags.artoriaAvalonDiscardPublic, true);
  assert.ok(reveals.some(([type]) => type === "servant.true-name-revealed"));

  const result = useArtoriaAvalon(ctx(state, ARTORIA_ROUND_ID, { eventType: "combat.resolved", event: { winnerIds: ["a"], participantIds: ["a", "o"] } }));
  assert.deepEqual(new Set(result.recycledInstanceIds), new Set(["luck1", "luck2", "other"]));
  assert.equal(state.players.a.discard.length, 0);
  assert.ok(state.players.a.deck.includes("luck1") && state.players.a.deck.includes("luck2") && state.players.a.deck.includes("other"));
});

test("Pilgrim's Call grants Recon VP and can move along up to two arrows", () => {
  const state = setup("artoria-call");
  state.phase = "action";
  state.players.a.locationId = "scouting";
  state.players.o.locationId = "city";
  state.board.locations.mountain = [];
  state.board.locations.city = ["o"];
  state.board.locations.scouting = ["a"];
  addActive(state, "card.x-pilgrimcall", "call");
  const before = state.players.a.victoryPoints;
  let opened;
  const result = useArtoriaAvalon(ctx(state, ARTORIA_CALL_ID, { abilityId: ARTORIA_CALL_MOVE }, { openDecision(value) { opened = value; } }));
  assert.equal(result.pending, true);
  assert.equal(state.players.a.victoryPoints, before + 2);
  const moving = opened.options.find((option) => option.id !== "scouting");
  assert.ok(moving);
  const frame = state.effectQueue.shift();
  const moved = resolveFrame(state, frame, [moving.id]);
  assert.equal(state.players.a.locationId, moving.id);
  assert.ok(moved.movements.length <= 2);
});

test("Pilgrim's Respite gains 2 mana, or 2 VP when mana gain is blocked", () => {
  const state = setup("artoria-respite");
  state.phase = "action";
  addActive(state, "card.x-pilgrimrespite", "respite");
  state.players.a.mana = 3;
  let result = useArtoriaAvalon(ctx(state, ARTORIA_RESPITE_ID, { abilityId: ARTORIA_RESPITE_GAIN }));
  assert.equal(result.manaGained, 2);
  assert.equal(state.players.a.mana, 5);
  state.players.a.flags.manaGainBlocked = true;
  const before = state.players.a.victoryPoints;
  result = useArtoriaAvalon(ctx(state, ARTORIA_RESPITE_ID, { abilityId: ARTORIA_RESPITE_GAIN }));
  assert.equal(result.manaGained, 0);
  assert.equal(result.victoryPointsGained, 2);
  assert.equal(state.players.a.victoryPoints, before + 2);
});

test("Pilgrim's Destiny rewards a shared win and each Pilgrim hand card independently converts into Luck after winning", () => {
  const state = setup("artoria-destiny");
  addActive(state, "card.x-pilgrimdestiny", "destiny");
  const before = state.players.a.victoryPoints;
  const shared = useArtoriaAvalon(ctx(state, ARTORIA_DESTINY_ID, { eventType: "combat.resolved", event: { winnerIds: ["a", "o"], participantIds: ["a", "o"] } }));
  assert.equal(shared.victoryPointsGained, 2);
  assert.equal(state.players.a.victoryPoints, before + 2);

  createOwnedCardInstance(state, "a", { instanceId: "call-hand", definitionId: "card.x-pilgrimcall", zone: "hand", face: "down", active: false });
  let opened;
  const trigger = useArtoriaAvalon(ctx(state, ARTORIA_CALL_ID, { eventType: "combat.resolved", event: { winnerIds: ["a"], participantIds: ["a", "o"] } }, { openDecision(value) { opened = value; } }));
  assert.equal(trigger.pending, true);
  assert.deepEqual(opened.options.map((option) => option.id), ["decline", "call-hand"]);
  const frame = state.effectQueue.shift();
  const converted = resolveFrame(state, frame, ["call-hand"]);
  assert.equal(converted.converted, true);
  assert.equal(state.cards["call-hand"].zone, "removed");
  assert.equal(state.cards[converted.luckInstanceId].definitionId, "card.cardluck");
  assert.ok(state.players.a.deck.includes(converted.luckInstanceId));
});
