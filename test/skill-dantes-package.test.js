import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { closePlayerCard, createOwnedCardInstance, lendSkillToPlayerSkillZone } from "../src/rules-core/decks.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import {
  DANTES_ATTENDRE_ID,
  DANTES_ENFER_ID,
  DANTES_KING_ID,
  resolveDantesEnfer,
  useDantesAttendre,
  useDantesEnfer,
  useDantesKing,
} from "../src/rules-core/dantes.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const basic = { id: "card.test.dantes.basic", name: "Test Basic", cardType: "attack", cost: 1, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true };
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), [basic.id]: basic };

function state(id, third = false) {
  const players = [{ id: "d", name: "Dantes" }, { id: "o", name: "Opponent" }];
  if (third) players.push({ id: "x", name: "Third" });
  const s = createGameState({ gameInstanceId: id, players, seed: 1986 });
  s.status = "playing";
  s.round = 5;
  s.phase = "action";
  s.step = "player-window";
  s.activePlayerId = "d";
  s.turnOrder = third ? ["d", "o", "x"] : ["d", "o"];
  s.players.d.servantId = "servant.dantes";
  s.players.d.mana = 20;
  s.players.d.locationId = "mountain";
  s.players.o.mana = 20;
  s.players.o.locationId = "mountain";
  s.board.locations.mountain = ["d", "o"];
  s.board.locations.city = [];
  if (third) {
    s.players.x.mana = 20;
    s.players.x.locationId = "city";
    s.board.locations.city = ["x"];
  }
  return s;
}

function add(s, playerId, instanceId, definitionId, zone = "servant-skills", face = "up", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}

function ctx(s, skillId, payload, openDecision = () => {}, emitEvent = () => {}) {
  return { state: s, player: s.players.d, skill: built.skills.get(skillId), payload, definitions, openDecision, emitEvent };
}

test("爱德蒙·唐泰斯技能包3/3 FULL并注册专用handler", () => {
  const skills = built.skills.list().filter((skill) => skill.ownerId === "servant.dantes");
  assert.equal(skills.length, 3);
  assert.ok(skills.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(skills.every((skill) => built.skills.hasHandler(skill.id)));
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.ambiguities ?? []), []);
  assert.deepEqual(skills.flatMap((skill) => skill.rules?.unmodeledClauses ?? []), []);
});

test("King of the Cavern战败后进入胜者技能区，胜者可正常打出，关闭后回Dantes技能区", () => {
  const s = state("dantes-king-lifecycle");
  add(s, "d", "king", DANTES_KING_ID, "attack", "up", true);
  const transfer = useDantesKing(ctx(s, DANTES_KING_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["d", "o"], winnerIds: ["o"], locationId: "mountain" },
  }));
  assert.equal(transfer.targetPlayerId, "o");
  assert.equal(s.cards.king.ownerPlayerId, "d");
  assert.equal(s.cards.king.controllerPlayerId, "o");
  assert.equal(s.cards.king.zone, "servant-skills");
  assert.ok(s.players.o.servantSkills.includes("king"));

  s.phase = "action";
  s.step = "play-batch-draft";
  s.activePlayerId = "o";
  add(s, "o", "basic-o", basic.id, "hand", "down", false);
  const play = commitStandardAttack(s, "o", ["king", "basic-o"], [], definitions);
  assert.ok(play.cards.some((card) => card.instanceId === "king"));
  assert.equal(s.cards.king.ownerPlayerId, "d");
  assert.equal(s.cards.king.controllerPlayerId, "o");
  assert.equal(s.cards.king.zone, "attack");
  closePlayerCard(s, "o", "king", definitions);
  assert.equal(s.cards.king.ownerPlayerId, "d");
  assert.equal(s.cards.king.controllerPlayerId, "d");
  assert.equal(s.cards.king.zone, "servant-skills");
  assert.ok(s.players.d.servantSkills.includes("king"));
});

test("King由借用者打出后，以当前控制者的胜负判定The Grudge", () => {
  const s = state("dantes-king-controller-loss", true);
  add(s, "d", "king", DANTES_KING_ID);
  lendSkillToPlayerSkillZone(s, "d", "o", "king", definitions);
  s.phase = "action";
  s.step = "play-batch-draft";
  s.activePlayerId = "o";
  add(s, "o", "basic-o", basic.id, "hand", "down", false);
  commitStandardAttack(s, "o", ["king", "basic-o"], [], definitions);
  const transfer = useDantesKing(ctx(s, DANTES_KING_ID, {
    eventType: "combat.resolved",
    event: { participantIds: ["o", "x"], winnerIds: ["x"], locationId: "city" },
  }));
  assert.equal(transfer.targetPlayerId, "x");
  assert.equal(s.cards.king.ownerPlayerId, "d");
  assert.equal(s.cards.king.controllerPlayerId, "x");
  assert.equal(s.cards.king.zone, "servant-skills");
  assert.ok(s.players.x.servantSkills.includes("king"));
});

test("Conspiracy由Dantes支付4魔力并真名解放，在Combat开始时击败King持有者", () => {
  const s = state("dantes-conspiracy");
  add(s, "d", "king", DANTES_KING_ID);
  lendSkillToPlayerSkillZone(s, "d", "o", "king", definitions);
  const before = s.players.d.mana;
  const armed = useDantesKing(ctx(s, DANTES_KING_ID, { abilityId: "conspiracy" }));
  assert.equal(armed.holderPlayerId, "o");
  assert.equal(s.players.d.mana, before - 4);
  assert.equal(s.players.d.trueNameRevealed, true);
  assert.equal(s.players.o.defeated, false);

  s.phase = "combat";
  const result = useDantesKing(ctx(s, DANTES_KING_ID, {
    eventType: "phase.transitioned",
    event: { previousPhase: "action", transition: "next-phase" },
  }));
  assert.equal(result.targetPlayerId, "o");
  assert.equal(s.players.o.defeated, true);
});

test("Attendre支付6魔力召回外借King；Determination奖励所有败者并在回合结束奖励最低战果", () => {
  const s = state("dantes-attendre", true);
  add(s, "d", "king", DANTES_KING_ID);
  lendSkillToPlayerSkillZone(s, "d", "o", "king", definitions);
  add(s, "d", "attendre", DANTES_ATTENDRE_ID, "attack", "up", true);
  const before = s.players.d.mana;
  const recall = useDantesAttendre(ctx(s, DANTES_ATTENDRE_ID, { abilityId: "attendre-recall" }));
  assert.equal(recall.instanceId, "king");
  assert.equal(s.players.d.mana, before - 6);
  assert.equal(s.cards.king.ownerPlayerId, "d");
  assert.equal(s.cards.king.controllerPlayerId, "d");
  assert.equal(s.cards.king.zone, "attack");

  s.phase = "combat";
  useDantesAttendre(ctx(s, DANTES_ATTENDRE_ID, { abilityId: "determination-of-steel" }));
  s.players.o.flags.combatLossRound = s.round;
  s.players.x.flags.combatLossRound = s.round;
  s.players.d.victoryPoints = 9;
  s.players.o.victoryPoints = 2;
  s.players.x.victoryPoints = 2;
  useDantesAttendre(ctx(s, DANTES_ATTENDRE_ID, { eventType: "combat.ending", event: {} }));
  assert.equal(s.players.o.victoryPoints, 3);
  assert.equal(s.players.x.victoryPoints, 3);
  const end = useDantesAttendre(ctx(s, DANTES_ATTENDRE_ID, { eventType: "round.ending", event: {} }));
  assert.deepEqual(end.lastPlacePlayerIds.sort(), ["o", "x"]);
  assert.equal(s.players.o.victoryPoints, 5);
  assert.equal(s.players.x.victoryPoints, 5);
  assert.equal(s.players.d.victoryPoints, 9);
});

test("Enfer逐人翻至Special：普通牌弃置，Luck/Avenger各自选择打出或弃置", () => {
  const s = state("dantes-enfer");
  add(s, "d", "enfer", DANTES_ENFER_ID, "attack", "up", true);
  add(s, "d", "d-normal", basic.id, "deck", "down", false);
  add(s, "d", "d-luck", "card.cardluck", "deck", "down", false);
  add(s, "o", "o-normal", basic.id, "deck", "down", false);
  add(s, "o", "o-avenger", "card.card-avenger", "deck", "down", false);
  s.players.d.deck = ["d-normal", "d-luck"];
  s.players.o.deck = ["o-normal", "o-avenger"];
  let decision;
  const events = [];
  const result = useDantesEnfer(ctx(s, DANTES_ENFER_ID, { abilityId: "enfer-hope" }, (value) => { decision = value; }, (type, payload) => events.push({ type, payload })));
  assert.equal(result.pending, true);
  assert.deepEqual(decision.chooserPlayerIds, ["d", "o"]);
  assert.ok(s.players.d.discard.includes("d-normal"));
  assert.ok(s.players.o.discard.includes("o-normal"));
  assert.ok(s.players.d.hand.includes("d-luck"));
  assert.ok(s.players.o.hand.includes("o-avenger"));
  assert.equal(s.players.d.trueNameRevealed, true);
  assert.equal(events.filter((event) => event.type === "card.revealed").length, 4);

  const frame = s.effectQueue[0];
  const resolved = resolveDantesEnfer(ctx(s, DANTES_ENFER_ID, {
    previous: frame.payload,
    decision: { status: "resolved", submissions: { d: ["play"], o: ["discard"] } },
  }, () => {}, (type, payload) => events.push({ type, payload })));
  assert.deepEqual(resolved.playedInstanceIds, ["d-luck"]);
  assert.deepEqual(resolved.discardedInstanceIds, ["o-avenger"]);
  assert.ok(s.players.d.attack.includes("d-luck"));
  assert.ok(s.players.o.discard.includes("o-avenger"));
  assert.equal(s.cards["d-luck"].publiclyRevealed, undefined);
  assert.equal(s.cards["o-avenger"].publiclyRevealed, undefined);
});
