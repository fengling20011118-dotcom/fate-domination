import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CardAbilityRegistry } from "../src/rules-core/card-abilities.ts";
import { commitStandardAttack } from "../src/rules-core/card-play.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import {
  KOYANSKAYA_GOSPEL_ID,
  KOYANSKAYA_GOSPEL_NORMAL_ABILITY,
  KOYANSKAYA_GOSPEL_REVERSE_ABILITY,
  KOYANSKAYA_NF00_ID,
  KOYANSKAYA_NF00_REVERSE_ABILITY,
  KOYANSKAYA_NF14_ABILITY,
  KOYANSKAYA_NF14_TOKEN_ID,
  KOYANSKAYA_NF56_ID,
  KOYANSKAYA_NF56_MOVE_ABILITY,
  KOYANSKAYA_NFF_ID,
  KOYANSKAYA_PACKAGE_HANDLER,
  getKoyanskayaCardDefinitions,
  registerKoyanskayaCardAbilities,
  resolveKoyanskayaPackage,
  useKoyanskayaNff,
  useKoyanskayaPackage,
} from "../src/rules-core/koyanskaya.ts";
import { getCombatResponseResponderIds, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(), ...getKoyanskayaCardDefinitions() };

function state(id, third = false) {
  const players = [{ id: "k", name: "Koyanskaya" }, { id: "o", name: "Opponent" }];
  if (third) players.push({ id: "x", name: "Third" });
  const s = createGameState({ gameInstanceId: id, players, seed: 16 });
  s.status = "playing";
  s.round = 5;
  s.phase = "outpost";
  s.step = "player-window";
  s.activePlayerId = "k";
  s.turnOrder = third ? ["k", "o", "x"] : ["k", "o"];
  s.players.k.servantId = "servant.koyanskaya";
  s.players.k.mana = 20;
  s.players.o.mana = 10;
  s.players.k.locationId = "mountain";
  s.players.o.locationId = "city";
  s.board.locations.mountain = ["k"];
  s.board.locations.city = ["o"];
  if (third) {
    s.players.x.mana = 10;
    s.players.x.locationId = "city";
    s.board.locations.city.push("x");
  }
  return s;
}

function add(s, playerId, instanceId, definitionId, zone = "hand", face = "down", active = false) {
  createOwnedCardInstance(s, playerId, { instanceId, definitionId, zone, face, active });
}

function nffContext(s, payload, randomInt = () => 0) {
  return {
    state: s,
    player: s.players.k,
    skill: built.skills.get(KOYANSKAYA_NFF_ID),
    payload,
    definitions,
    openDecision: () => {},
    emitEvent: () => {},
    randomInt,
  };
}

function packageContext(s, skillId, payload, extras = {}) {
  return {
    state: s,
    player: s.players.k,
    skill: built.skills.get(skillId),
    payload,
    definitions,
    openDecision: () => {},
    emitEvent: () => {},
    randomInt: () => 0,
    ...extras,
  };
}

test("高扬斯卡娅整包已进入FULL，NF-00使用英文原卡的严格第二档战力条件", () => {
  const s2 = built.skills.get("servant.koyanskaya.skill.sc-koyanskaya-2");
  const s3 = built.skills.get(KOYANSKAYA_GOSPEL_ID);
  const s4 = built.skills.get("servant.koyanskaya.skill.sc-koyanskaya-4");
  const s5 = built.skills.get(KOYANSKAYA_NF56_ID);
  const s6 = built.skills.get(KOYANSKAYA_NF00_ID);
  assert.equal(s2.supportLevel, "FULL");
  assert.equal(s2.handlerId, "core.koyanskaya-nff");
  assert.equal(s3.supportLevel, "FULL");
  assert.equal(s3.handlerId, KOYANSKAYA_PACKAGE_HANDLER);
  assert.equal(s4.supportLevel, "FULL");
  assert.equal(s4.initiallyOwned, false);
  assert.equal(s5.supportLevel, "FULL");
  assert.equal(s5.handlerId, KOYANSKAYA_PACKAGE_HANDLER);
  assert.equal(s6.supportLevel, "FULL");
  assert.equal(s6.handlerId, KOYANSKAYA_PACKAGE_HANDLER);
  assert.deepEqual(s6.steps, ["post-power-response"]);
  assert.ok(built.skills.hasHandler(s2.id));
  assert.ok(built.skills.hasHandler(s3.id));
  assert.ok(built.skills.hasHandler(s4.id));
  assert.ok(built.skills.hasHandler(s5.id));
  assert.ok(built.skills.hasHandler(s6.id));
});

test("NFF货箱可同地背面设置；进入地点随机获得，NF-56扣3魔力、NF-00施加败北，战斗结束归高扬斯卡娅弃牌", () => {
  const s = state("koyanskaya-nff", true);
  add(s, "k", "nf56", "card.x-nf56");
  add(s, "k", "nf00", "card.x-nf00");
  useKoyanskayaNff(nffContext(s, {
    placements: [
      { instanceId: "nf56", locationId: "city" },
      { instanceId: "nf00", locationId: "city" },
    ],
  }));
  assert.equal(s.cards.nf56.zone, "board");
  assert.equal(s.cards.nf56.face, "down");
  assert.equal(s.cards.nf00.boardLocationId, "city");

  useKoyanskayaNff(nffContext(s, { eventType: "player.entered-location", event: { playerId: "o", locationId: "city" } }, () => 0));
  assert.equal(s.cards.nf56.zone, "attack");
  assert.equal(s.cards.nf56.controllerPlayerId, "o");
  assert.equal(s.players.o.mana, 7);
  assert.ok(s.players.o.attack.includes("nf56"));

  useKoyanskayaNff(nffContext(s, { eventType: "player.entered-location", event: { playerId: "x", locationId: "city" } }, () => 0));
  assert.equal(s.cards.nf00.zone, "attack");
  assert.equal(s.cards.nf00.controllerPlayerId, "x");
  assert.equal(s.players.x.defeated, true);

  useKoyanskayaNff(nffContext(s, { eventType: "combat.ending", event: {} }));
  assert.ok(s.players.k.discard.includes("nf56"));
  assert.ok(s.players.k.discard.includes("nf00"));
  assert.equal(s.cards.nf56.controllerPlayerId, "k");
  assert.equal(s.cards.nf00.controllerPlayerId, "k");
  assert.equal(s.cards.nf56.zone, "discard");
  assert.equal(s.cards.nf00.zone, "discard");
});

test("NF-14本次作为标准攻击打出时立即将需求从2降为1", () => {
  const s = state("koyanskaya-nf14-count");
  s.phase = "action";
  s.step = "play-batch-draft";
  add(s, "k", "nf14", "card.x-nf14");
  const result = commitStandardAttack(s, "k", ["nf14"], [], definitions);
  assert.deepEqual(result.committed, ["nf14"]);
  assert.ok(s.players.k.attack.includes("nf14"));
});

test("NF-14反转创建3张威力2迅捷临时攻击，且不视为基础攻击", () => {
  const s = state("koyanskaya-nf14-reverse");
  s.phase = "combat";
  add(s, "k", "nf14", "card.x-nf14", "attack", "up", true);
  s.cards.nf14.reversed = true;
  const registry = new CardAbilityRegistry();
  registerKoyanskayaCardAbilities(registry);
  registry.execute(KOYANSKAYA_NF14_ABILITY, { state: s, playerId: "k", instanceId: "nf14", definitions });
  const tokens = s.players.k.attack.map((id) => s.cards[id]).filter((card) => card.definitionId === KOYANSKAYA_NF14_TOKEN_ID);
  assert.equal(tokens.length, 3);
  const tokenDefinition = definitions[KOYANSKAYA_NF14_TOKEN_ID];
  assert.equal(tokenDefinition.basePower, 2);
  assert.deepEqual(tokenDefinition.attributes, ["迅捷"]);
  assert.equal(tokenDefinition.basic, false);
  assert.ok(tokens.every((card) => card.temporary === true && card.active === true && card.face === "up"));
});

test("NF-00反转仅在自己处于严格第二战力档时响应，并击败所有并列最高威力对手", () => {
  const s = state("koyanskaya-nf00-reverse", true);
  s.board.locations.mountain = ["k", "o", "x"];
  s.board.locations.city = [];
  s.players.o.locationId = "mountain";
  s.players.x.locationId = "mountain";
  s.phase = "combat";
  s.step = "settlement";
  add(s, "k", "nf00", "card.x-nf00", "attack", "up", true);
  s.cards.nf00.reversed = true;

  const blockedSnapshot = {
    round: s.round,
    locationId: "mountain",
    participantIds: ["k", "o", "x"],
    powers: { k: 5, o: 8, x: 7 },
    attributes: { k: [], o: [], x: [] },
  };
  assert.deepEqual(getCombatResponseResponderIds(s, built.skills, blockedSnapshot, definitions), []);

  const snapshot = { ...blockedSnapshot, powers: { k: 5, o: 8, x: 8 } };
  assert.deepEqual(getCombatResponseResponderIds(s, built.skills, snapshot, definitions), ["k"]);
  s.step = "post-power-response";
  s.activePlayerId = "k";
  s.modeState.pendingCombatResolution = { snapshot, responderIds: ["k"], nextResponderIndex: 0 };
  const result = useKoyanskayaPackage(packageContext(s, KOYANSKAYA_NF00_ID, { abilityId: KOYANSKAYA_NF00_REVERSE_ABILITY }));
  assert.deepEqual(result.defeatedPlayerIds, ["o", "x"]);
  assert.equal(s.players.o.defeated, true);
  assert.equal(s.players.x.defeated, true);
  assert.equal(s.players.k.defeated, false);
});

test("屠戮的福音由货箱持有者自行选择保留，未关闭且获胜者令高扬斯卡娅获得2战果", () => {
  const s = state("koyanskaya-gospel-normal");
  add(s, "k", "cargo", "card.x-nf56");
  add(s, "k", "spare", "card.cardb1");
  useKoyanskayaNff(nffContext(s, { placements: [
    { instanceId: "cargo", locationId: "city" },
    { instanceId: "spare", locationId: "mountain" },
  ] }));
  useKoyanskayaNff(nffContext(s, { eventType: "player.entered-location", event: { playerId: "o", locationId: "city" } }));
  s.board.locations.mountain = [];
  s.board.locations.city = ["k", "o"];
  s.players.k.locationId = "city";
  s.phase = "combat";
  add(s, "k", "gospel", KOYANSKAYA_GOSPEL_ID, "attack", "up", true);
  let opened;
  useKoyanskayaPackage(packageContext(s, KOYANSKAYA_GOSPEL_ID, { abilityId: KOYANSKAYA_GOSPEL_NORMAL_ABILITY }, {
    openDecision(decision) { opened = decision; },
  }));
  assert.equal(opened.ownerPlayerId, "o");
  assert.deepEqual(opened.chooserPlayerIds, ["o"]);
  const frame = s.effectQueue[0];
  resolveKoyanskayaPackage(packageContext(s, KOYANSKAYA_GOSPEL_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["keep"] },
  }));
  const before = s.players.k.victoryPoints;
  const result = useKoyanskayaPackage(packageContext(s, KOYANSKAYA_GOSPEL_ID, {
    eventType: "combat.resolved",
    event: { locationId: "city", winnerIds: ["o"] },
  }));
  assert.deepEqual(result.rewardedWinnerIds, ["o"]);
  assert.equal(s.players.k.victoryPoints, before + 2);
});

test("屠戮的福音反转可夺回对手控制的货箱攻击并赋予反转状态", () => {
  const s = state("koyanskaya-gospel-reverse");
  add(s, "k", "cargo", "card.x-nf56");
  add(s, "k", "spare", "card.cardb1");
  useKoyanskayaNff(nffContext(s, { placements: [
    { instanceId: "cargo", locationId: "city" },
    { instanceId: "spare", locationId: "mountain" },
  ] }));
  useKoyanskayaNff(nffContext(s, { eventType: "player.entered-location", event: { playerId: "o", locationId: "city" } }));
  s.board.locations.mountain = [];
  s.board.locations.city = ["k", "o"];
  s.players.k.locationId = "city";
  s.phase = "combat";
  add(s, "k", "gospel", KOYANSKAYA_GOSPEL_ID, "attack", "up", true);
  s.cards.gospel.reversed = true;
  let opened;
  useKoyanskayaPackage(packageContext(s, KOYANSKAYA_GOSPEL_ID, { abilityId: KOYANSKAYA_GOSPEL_REVERSE_ABILITY }, {
    openDecision(decision) { opened = decision; },
  }));
  assert.ok(opened.options.some((option) => option.id === "cargo"));
  const frame = s.effectQueue[0];
  const result = resolveKoyanskayaPackage(packageContext(s, KOYANSKAYA_GOSPEL_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["cargo"] },
  }));
  assert.deepEqual(result.seizedInstanceIds, ["cargo"]);
  assert.equal(s.cards.cargo.controllerPlayerId, "k");
  assert.equal(s.cards.cargo.reversed, true);
  assert.ok(s.players.k.attack.includes("cargo"));
  assert.equal(s.players.o.attack.includes("cargo"), false);
});

test("NF-56反转在战斗阶段选择任意当前可达地点并通过效果移动", () => {
  const s = state("koyanskaya-nf56-reverse");
  s.phase = "combat";
  add(s, "k", "nf56", "card.x-nf56", "attack", "up", true);
  s.cards.nf56.reversed = true;
  let opened;
  const emitted = [];
  useKoyanskayaPackage(packageContext(s, KOYANSKAYA_NF56_ID, { abilityId: KOYANSKAYA_NF56_MOVE_ABILITY }, {
    openDecision(decision) { opened = decision; },
  }));
  assert.ok(opened.options.some((option) => option.id === "city"));
  const frame = s.effectQueue[0];
  const result = resolveKoyanskayaPackage(packageContext(s, KOYANSKAYA_NF56_ID, {
    previous: frame.payload,
    decision: { status: "resolved", selections: ["city"] },
  }, { emitEvent(type, payload) { emitted.push({ type, payload }); } }));
  assert.equal(result.previousLocationId, "mountain");
  assert.equal(result.locationId, "city");
  assert.equal(s.players.k.locationId, "city");
  assert.ok(emitted.some((item) => item.type === "player.moved"));
  assert.ok(emitted.some((item) => item.type === "player.entered-location"));
});
