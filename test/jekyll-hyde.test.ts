import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { applyJekyllHydeRoundStart, isHyde, isJekyll, useJekyllLycanthropy } from "../src/rules-core/jekyll-hyde.ts";
import { movePlayer } from "../src/rules-core/board.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { assertCardCanEnterAttack } from "../src/rules-core/card-rules.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { resolveCombat } from "../src/rules-core/combat.ts";
import { playerIgnoresDefeat } from "../src/rules-core/defeat.ts";

const beastRules = {
  schemaVersion: "fd-card-authoring-v1" as const,
  abilities: [{
    id: "lycanthropy-class-power",
    kind: "residual" as const,
    conditions: [{ type: "source_active" }],
    ruleModifiers: [{
      id: "lycanthropy-class-power",
      operation: "add" as const,
      rule: "card_power",
      scope: { subject: "controller", cards: { tagsAny: ["assassin-class", "berserker-attack"] } },
      value: 3,
      lifecycle: { duration: "while_active" },
    }],
    execution: { mode: "automatic" as const },
  }],
  ambiguities: [],
  unmodeledClauses: [],
};

const baseCards = {
  "servant.jekyll.skill.sc-jekyll-2": {
    id: "servant.jekyll.skill.sc-jekyll-2", name: "Dangerous Game", cost: 5, basePower: 5,
    typeLabel: "宝具", attributes: ["宝具"], isSkill: true, skillOwnerType: "servant" as const,
    ownerDefinitionId: "servant.jekyll", requiresEightMana: true, revealsTrueNameOnPlay: false,
    optionalFreePlay: { waiveEightMana: true, revealTrueName: true, nextRoundCombatPowerOverride: 0, requireSourcePresent: true },
    playerDefeatIgnoreCondition: { playerFlagEquals: { key: "jekyllForm", value: "hyde" } }, rules: beastRules,
  },
  "card.normal": { id: "card.normal", name: "普通攻击", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.low": { id: "card.low", name: "低位攻击", cost: 0, basePower: 1, typeLabel: "力量", attributes: ["力量"], basic: true },
  "card.berserker": { id: "card.berserker", name: "任意显示名", cost: 0, basePower: 2, typeLabel: "力量", attributes: ["力量"], basic: true, tags: ["berserker-attack"] },
  "card.assassin": { id: "card.assassin", name: "Assassin Class", cost: 0, basePower: 2, typeLabel: "迅捷", attributes: ["迅捷"], tags: ["assassin-class"] },
  "card.master-nonbasic": { id: "card.master-nonbasic", name: "Master non-basic", cost: 0, basePower: 2, typeLabel: "特殊", attributes: ["特殊"], basic: false, ownerDefinitionId: "master.other" },
};

function card(instanceId: string, definitionId: string, ownerPlayerId = "p1", zone: "hand" | "servant-skills" | "attack" = "hand") {
  return { instanceId, definitionId, ownerPlayerId, controllerPlayerId: ownerPlayerId, zone, face: zone === "attack" ? "up" as const : "down" as const, active: zone === "attack", residual: false, temporary: false, modifiers: [] };
}

test("Dangerous Game form state uses generic movement/card/skill restriction flags", () => {
  const state = createGameState({ gameInstanceId: "jekyll-forms", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 1 });
  state.players.p1.servantId = "servant.jekyll";
  state.round = 1;
  applyJekyllHydeRoundStart(state, "p1");
  assert.equal(state.players.p1.form, "hyde");
  assert.equal(isHyde(state.players.p1), true);
  assert.equal(state.players.p1.flags.skillUseForbiddenTag, "assassin-class");
  assert.equal(state.players.p1.flags.cardPlayForbiddenTag, undefined);
  state.round = 2;
  applyJekyllHydeRoundStart(state, "p1");
  assert.equal(state.players.p1.form, "jekyll");
  assert.equal(isJekyll(state.players.p1), true);
  assert.equal(state.players.p1.flags.cardPlayForbiddenTag, "berserker-attack");
  assert.equal(state.players.p1.flags.movementManaDiscountPerSpace, 1);
  assert.equal(state.players.p2.form, null);
});

test("Jekyll form blocks the Berserker class by authored tag, while Hyde does not", () => {
  const state = createGameState({ gameInstanceId: "jekyll-berserker", players: [{ id: "p1", name: "一" }], seed: 5 });
  state.status = "playing"; state.phase = "action"; state.step = "play-batch-draft"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.jekyll";
  state.cards.berserker = card("berserker", "card.berserker"); state.players.p1.hand = ["berserker"];
  state.round = 2; applyJekyllHydeRoundStart(state, "p1");
  assert.throws(() => assertCardCanEnterAttack({ state, playerId: "p1", instanceId: "berserker", definitions: baseCards, faceDown: false }), /CARD_PLAY_FORBIDDEN_BY_PLAYER_STATE/);
  state.round = 1; applyJekyllHydeRoundStart(state, "p1");
  assert.doesNotThrow(() => assertCardCanEnterAttack({ state, playerId: "p1", instanceId: "berserker", definitions: baseCards, faceDown: false }));
});

test("Jekyll movement discount is generic and applies once per traversed space", () => {
  const state = createGameState({ gameInstanceId: "jekyll-move", players: [{ id: "p1", name: "一" }], seed: 2 });
  state.status = "playing"; state.round = 2; state.phase = "action"; state.step = "move-decision"; state.activePlayerId = "p1";
  state.players.p1.servantId = "servant.jekyll"; applyJekyllHydeRoundStart(state, "p1"); state.players.p1.mana = 2;
  state.players.p1.locationId = "workshop"; state.board.locations.workshop = ["p1"];
  const cost = movePlayer(state, "p1", "city");
  assert.equal(cost, 2);
  assert.equal(state.players.p1.mana, 0);
});

test("Dangerous Game Noble Phantasm free play is explicit; normal play remains paid", () => {
  const freeState = createGameState({ gameInstanceId: "jekyll-free", players: [{ id: "p1", name: "一" }], seed: 3 });
  freeState.status = "playing"; freeState.round = 1; freeState.phase = "action"; freeState.step = "play-batch-draft"; freeState.activePlayerId = "p1";
  freeState.players.p1.servantId = "servant.jekyll"; applyJekyllHydeRoundStart(freeState, "p1"); freeState.players.p1.mana = 0;
  freeState.cards.beast = card("beast", "servant.jekyll.skill.sc-jekyll-2", "p1", "servant-skills");
  freeState.cards.berserker = card("berserker", "card.berserker");
  freeState.players.p1.servantSkills = ["beast"]; freeState.players.p1.hand = ["berserker"];
  const freeResult = commitStandardAttack(freeState, "p1", ["beast", "berserker"], [], baseCards, { cardDataByInstanceId: { beast: { freePlay: true } } });
  assert.equal(freeResult.paidMana, 0);
  assert.equal(freeResult.cards.find((entry) => entry.instanceId === "beast")?.revealsTrueName, true);
  assert.equal(freeState.players.p1.flags.combatPowerOverrideRound, 2);
  assert.equal(calculateCombatPower(freeState, freeState.players.p1, baseCards), 10); // 5 + (2+3)
  freeState.round = 2;
  assert.equal(calculateCombatPower(freeState, freeState.players.p1, baseCards), 0);
  freeState.cards.beast.zone = "removed";
  assert.notEqual(calculateCombatPower(freeState, freeState.players.p1, baseCards), 0);

  const paidState = createGameState({ gameInstanceId: "jekyll-paid", players: [{ id: "p1", name: "一" }], seed: 4 });
  paidState.status = "playing"; paidState.round = 2; paidState.phase = "action"; paidState.step = "play-batch-draft"; paidState.activePlayerId = "p1";
  paidState.players.p1.servantId = "servant.jekyll"; applyJekyllHydeRoundStart(paidState, "p1"); paidState.players.p1.mana = 8;
  paidState.cards.beast = card("beast", "servant.jekyll.skill.sc-jekyll-2", "p1", "servant-skills");
  paidState.cards.normal = card("normal", "card.normal"); paidState.players.p1.servantSkills = ["beast"]; paidState.players.p1.hand = ["normal"];
  const paidResult = commitStandardAttack(paidState, "p1", ["beast", "normal"], [], baseCards);
  assert.equal(paidResult.paidMana, 5);
  assert.equal(paidResult.cards.find((entry) => entry.instanceId === "beast")?.revealsTrueName, false);
  assert.equal(paidState.players.p1.flags.combatPowerOverrideRound, undefined);
});

test("Lycanthropy buffs Assassin/Berserker class attacks but not unrelated Master non-basic attacks", () => {
  const state = createGameState({ gameInstanceId: "jekyll-lycanthropy", players: [{ id: "p1", name: "一" }], seed: 6 });
  state.status = "playing"; state.round = 1; state.players.p1.servantId = "servant.jekyll"; applyJekyllHydeRoundStart(state, "p1");
  for (const [id, def] of [["beast", "servant.jekyll.skill.sc-jekyll-2"], ["berserker", "card.berserker"], ["assassin", "card.assassin"], ["master", "card.master-nonbasic"]] as const) state.cards[id] = card(id, def, "p1", "attack");
  state.players.p1.attack = ["beast", "berserker", "assassin", "master"];
  assert.equal(calculateCombatPower(state, state.players.p1, baseCards), 5 + 5 + 5 + 2);
});

test("Hyde ignores defeat only while Lycanthropy source is active", () => {
  const state = createGameState({ gameInstanceId: "jekyll-defeat", players: [{ id: "p1", name: "一" }], seed: 7 });
  state.round = 1; state.players.p1.servantId = "servant.jekyll"; applyJekyllHydeRoundStart(state, "p1");
  assert.equal(playerIgnoresDefeat(state, state.players.p1, baseCards), false);
  state.cards.beast = card("beast", "servant.jekyll.skill.sc-jekyll-2", "p1", "attack"); state.players.p1.attack = ["beast"];
  assert.equal(playerIgnoresDefeat(state, state.players.p1, baseCards), true);
  state.cards.beast.active = false;
  assert.equal(playerIgnoresDefeat(state, state.players.p1, baseCards), false);
});

test("Jekyll gains Lycanthropy's +1 VP only when he wins with the source active", () => {
  const state = createGameState({ gameInstanceId: "jekyll-score", players: [{ id: "p1", name: "一" }, { id: "p2", name: "二" }], seed: 8 });
  state.status = "playing"; state.round = 2; state.phase = "combat"; state.step = "settlement";
  state.players.p1.servantId = "servant.jekyll"; applyJekyllHydeRoundStart(state, "p1"); state.players.p1.locationId = "mountain";
  state.players.p2.locationId = "mountain"; state.board.locations.mountain = ["p1", "p2"];
  state.cards.beast = card("beast", "servant.jekyll.skill.sc-jekyll-2", "p1", "attack");
  state.cards.p1 = card("p1", "card.normal", "p1", "attack"); state.cards.p2 = card("p2", "card.low", "p2", "attack");
  state.players.p1.attack = ["beast", "p1"]; state.players.p2.attack = ["p2"];
  const result = resolveCombat(state, "mountain", baseCards, {});
  assert.deepEqual(result.winnerIds, ["p1"]);
  const before = state.players.p1.victoryPoints;
  useJekyllLycanthropy({ state, player: state.players.p1, skill: { id: "servant.jekyll.skill.sc-jekyll-2" } as never, payload: { event: result }, definitions: baseCards });
  assert.equal(state.players.p1.victoryPoints, before + 1);
});
