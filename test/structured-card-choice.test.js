import test from "node:test";
import assert from "node:assert/strict";
import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { projectPublicState as projectState } from "../src/projection/project-state.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { getEffectiveCardCost } from "../src/rules-core/card-rule-modifiers.ts";

function setup(masterId = "master.waver") {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-choice", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }, { id: "r", name: "R" }], seed: 1610 });
  state.status = "playing"; state.round = 3; state.phase = masterId === "master.waver" ? "outpost" : "action";
  state.step = "player-window"; state.activePlayerId = "p"; state.players.p.masterId = masterId;
  let seq = 0;
  const send = (type, payload, actorId = "p") => {
    const result = engine.execute(state, { commandId: `choice-${++seq}`, gameInstanceId: state.gameInstanceId, expectedRevision: state.revision, actorId, type, payload });
    Object.assign(state, result.state);
    return result;
  };
  const add = (id, owner, definitionId = "card.cardluck", zone = "hand") => createOwnedCardInstance(state, owner, { instanceId: id, definitionId, zone, face: zone === "attack" ? "up" : "down", active: zone === "attack" });
  const use = (skillId, data = {}) => send(CommandType.UseSkill, { skillId, data });
  const resolve = (selections, actorId = "p") => send(CommandType.ResolveDecision, { decisionId: state.pendingDecision.decisionId, selections }, actorId);
  return { state, built, engine, add, use, resolve };
}

function setupMedea() {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-medea", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }], seed: 1611 });
  state.status = "playing"; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.medea"; state.players.p.locationId = "mountain"; state.players.q.locationId = "mountain";
  state.board.locations.mountain = ["p", "q"];
  createOwnedCardInstance(state, "p", { instanceId: "divine-words", definitionId: "servant.medea.skill.sc-medea-1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p", { instanceId: "rule-breaker", definitionId: "servant.medea.skill.sc-medea-np", zone: "removed", face: "down" });
  let eventSequence = 0;
  const emit = (type, payload) => {
    enqueuePassiveEffects(state, engine.passives, { eventId: `${type}-${eventSequence++}`, type, revision: state.revision, sourceCommandId: "test", payload });
    engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });
  };
  return { state, emit };
}

function setupMedeaNoblePhantasm(commandSeals = 3) {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-medea-np", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }, { id: "r", name: "R" }], seed: 1612 });
  state.status = "playing"; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.medea"; state.players.p.locationId = "mountain";
  state.players.q.locationId = "mountain"; state.players.q.commandSeals = commandSeals;
  state.players.r.locationId = "city"; state.players.r.commandSeals = commandSeals;
  state.board.locations.mountain = ["p", "q"]; state.board.locations.city = ["r"];
  createOwnedCardInstance(state, "p", { instanceId: "rule-breaker-active", definitionId: "servant.medea.skill.sc-medea-np", zone: "attack", face: "up", active: true });
  let seq = 0;
  const use = (targetPlayerId = "q") => {
    const result = engine.execute(state, {
      commandId: `medea-np-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.UseSkill,
      payload: { skillId: "servant.medea.skill.sc-medea-np", data: { targetPlayerId } },
    });
    Object.assign(state, result.state);
    return result;
  };
  return { state, use };
}

function setupFrank() {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-frank", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }, { id: "r", name: "R" }], seed: 1613 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.frank"; state.players.p.locationId = "mountain"; state.players.p.mana = 0;
  state.players.q.locationId = "mountain"; state.players.r.locationId = "city";
  state.board.locations.mountain = ["p", "q"]; state.board.locations.city = ["r"];
  createOwnedCardInstance(state, "p", { instanceId: "galvanism", definitionId: "servant.frank.skill.sc-frank-1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "q", { instanceId: "magic-basic", definitionId: "card.carda3", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "q", { instanceId: "strength-basic", definitionId: "card.cardb3", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "r", { instanceId: "remote-magic", definitionId: "card.carda2", zone: "attack", face: "up", active: true });
  let seq = 0;
  const use = (targetInstanceId = "magic-basic") => {
    const result = engine.execute(state, {
      commandId: `frank-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.UseSkill,
      payload: { skillId: "servant.frank.skill.sc-frank-1", data: { targetInstanceId } },
    });
    Object.assign(state, result.state);
    return result;
  };
  return { state, use };
}

function setupChiron(ownDefinitionId = "card.carda3", opponentDefinitionId = "card.carda2") {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-chiron", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }, { id: "r", name: "R" }], seed: 1616 });
  state.status = "playing"; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.chiron"; state.players.p.locationId = "mountain";
  state.players.q.locationId = "mountain"; state.players.r.locationId = "city";
  state.board.locations.mountain = ["p", "q"]; state.board.locations.city = ["r"];
  createOwnedCardInstance(state, "p", { instanceId: "chiron-own", definitionId: ownDefinitionId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "q", { instanceId: "chiron-opponent", definitionId: opponentDefinitionId, zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "r", { instanceId: "remote-same-attr", definitionId: "card.carda2", zone: "attack", face: "up", active: true });
  let seq = 0;
  const emit = (payload = { locationId: "mountain", powers: { p: 4, q: 3 }, winnerIds: ["p"] }) => {
    enqueuePassiveEffects(state, engine.passives, { eventId: `chiron-${++seq}`, type: "combat.resolved", revision: state.revision, sourceCommandId: "test", payload });
    engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });
  };
  const resolve = (selections) => {
    const result = engine.execute(state, {
      commandId: `chiron-decision-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.ResolveDecision,
      payload: { decisionId: state.pendingDecision.decisionId, selections },
    });
    Object.assign(state, result.state);
    return result;
  };
  return { state, emit, resolve };
}

function setupArthur() {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-arthur", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }], seed: 1617 });
  state.status = "playing"; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.arthur"; state.players.p.locationId = "mountain";
  state.players.q.locationId = "mountain"; state.board.locations.mountain = ["p", "q"];
  createOwnedCardInstance(state, "p", { instanceId: "contract", definitionId: "servant.arthur.skill.sc-arthur-1", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p", { instanceId: "windbreaker", definitionId: "servant.arthur.skill.sc-arthur-2", zone: "servant-skills", face: "up" });
  createOwnedCardInstance(state, "p", { instanceId: "magic-resistance", definitionId: "servant.arthur.skill.sc-arthur-3", zone: "servant-skills", face: "up" });
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  let seq = 0;
  const use = () => {
    const result = engine.execute(state, {
      commandId: `arthur-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.UseSkill,
      payload: { skillId: "servant.arthur.skill.sc-arthur-1", data: {} },
    });
    Object.assign(state, result.state);
    return result;
  };
  const resolve = (selections) => {
    const result = engine.execute(state, {
      commandId: `arthur-decision-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.ResolveDecision,
      payload: { decisionId: state.pendingDecision.decisionId, selections },
    });
    Object.assign(state, result.state);
    return result;
  };
  return { state, definitions, use, resolve };
}

function setupDonquixote() {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-donquixote", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }], seed: 1618 });
  state.status = "playing"; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.donquixote"; state.players.p.locationId = "city";
  state.players.q.locationId = "mountain"; state.board.locations.city = ["p"]; state.board.locations.mountain = ["q"];
  createOwnedCardInstance(state, "p", { instanceId: "windmill", definitionId: "servant.donquixote.skill.sc-donquixote-1", zone: "attack", face: "up", active: true });
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  let seq = 0;
  const use = () => {
    const result = engine.execute(state, {
      commandId: `donquixote-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.UseSkill,
      payload: { skillId: "servant.donquixote.skill.sc-donquixote-1", data: {} },
    });
    Object.assign(state, result.state);
    return result;
  };
  const emitLostCombat = () => {
    enqueuePassiveEffects(state, engine.passives, {
      eventId: `donquixote-lost-${++seq}`,
      type: "combat.resolved",
      revision: state.revision,
      sourceCommandId: "test",
      payload: { locationId: "city", powers: { p: 2, q: 5 }, winnerIds: ["q"] },
    });
    engine.effects.drain(state, 1000, definitions);
  };
  return { state, definitions, use, emitLostCombat };
}

function setupSemiramis() {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-semiramis", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }, { id: "r", name: "R" }, { id: "s", name: "S" }], seed: 1619 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.semiramis"; state.players.p.locationId = "city";
  state.players.q.locationId = "city"; state.players.q.flags.deploymentLocationId = "city";
  state.players.r.locationId = "city"; state.players.r.flags.deploymentLocationId = "mountain";
  state.players.s.locationId = "mountain"; state.players.s.flags.deploymentLocationId = "mountain";
  state.board.locations.city = ["p", "q", "r"]; state.board.locations.mountain = ["s"];
  createOwnedCardInstance(state, "p", { instanceId: "poison-dragon", definitionId: "servant.semiramis.skill.sc-semiramis-3", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p", { instanceId: "territory", definitionId: "servant.semiramis.skill.sc-semiramis-2", zone: "attack", face: "up", active: true, residual: true });
  let seq = 0;
  const use = () => {
    const result = engine.execute(state, {
      commandId: `semiramis-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.UseSkill,
      payload: { skillId: "servant.semiramis.skill.sc-semiramis-3", data: {} },
    });
    Object.assign(state, result.state);
    return result;
  };
  return { state, use };
}

function setupKintoki(mana = 7) {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-kintoki", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }], seed: 1614 });
  state.status = "playing"; state.phase = "combat"; state.step = "player-window"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.kintoki"; state.players.p.locationId = "mountain"; state.players.p.mana = mana;
  state.players.q.locationId = "mountain"; state.board.locations.mountain = ["p", "q"];
  createOwnedCardInstance(state, "p", { instanceId: "golden-eater", definitionId: "servant.kintoki.skill.sc-kintoki-3", zone: "attack", face: "up", active: true });
  createOwnedCardInstance(state, "p", { instanceId: "golden-one", definitionId: "servant.kintoki.skill.sc-kintoki-1", zone: "removed", face: "down" });
  createOwnedCardInstance(state, "p", { instanceId: "golden-two", definitionId: "servant.kintoki.skill.sc-kintoki-2", zone: "removed", face: "down" });
  let seq = 0;
  const use = (choiceId = "one") => {
    const result = engine.execute(state, {
      commandId: `kintoki-${++seq}`,
      gameInstanceId: state.gameInstanceId,
      expectedRevision: state.revision,
      actorId: "p",
      type: CommandType.UseSkill,
      payload: { skillId: "servant.kintoki.skill.sc-kintoki-3", data: { choiceId } },
    });
    Object.assign(state, result.state);
    return result;
  };
  return { state, use };
}

function setupHassan() {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-hassan", players: [{ id: "p", name: "P" }, { id: "q", name: "Q" }, { id: "r", name: "R" }], seed: 1615 });
  state.status = "playing"; state.phase = "combat"; state.step = "settlement"; state.activePlayerId = "p";
  state.players.p.servantId = "servant.hassan"; state.players.p.locationId = "mountain"; state.players.p.trueNameRevealed = true;
  state.players.q.locationId = "mountain"; state.players.r.locationId = "city";
  state.board.locations.mountain = ["p", "q"]; state.board.locations.city = ["r"];
  createOwnedCardInstance(state, "p", { instanceId: "self-modification", definitionId: "servant.hassan.skill.sc-hassan-2", zone: "attack", face: "up", active: true });
  let eventSequence = 0;
  const emit = (type, payload) => {
    enqueuePassiveEffects(state, engine.passives, { eventId: `${type}-${eventSequence++}`, type, revision: state.revision, sourceCommandId: "test", payload });
    engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });
  };
  return { state, emit };
}

test("调查通过私有选牌继续结算，移至牌库顶并仅禁止下回合", () => {
  const { state, add, use, resolve } = setup();
  add("chosen", "q"); add("rest", "q", "card.normal", "deck");
  use("master.waver.skill.s3", { targetPlayerId: "q" });
  assert.equal(state.pendingDecision.options.length, 1);
  assert.equal(projectState(state, "r").pendingDecision.options.length, 0);
  assert.equal(projectState(state, "p").pendingDecision.options.length, 1);
  assert.deepEqual(state.players.q.hand, ["chosen"]);
  assert.throws(() => resolve(["chosen"], "q"), /DECISION_WRONG_PLAYER/);
  resolve(["chosen"]);
  assert.equal(state.pendingDecision, null);
  assert.deepEqual(state.players.q.deck, ["chosen", "rest"]);
  assert.equal(state.players.p.flags.investigationBlockedRound, 4);
  assert.equal(state.cards.chosen.face, "down");
  state.round = 4;
  assert.throws(() => use("master.waver.skill.s3", { targetPlayerId: "q" }), /SKILL_USE_FORBIDDEN/);
  state.round = 5;
  use("master.waver.skill.s3", { targetPlayerId: "q" });
  resolve([]);
});

test("调查允许只查看、自选及空手牌，空选择不会添加冷却", () => {
  for (const target of ["p", "q"]) {
    const { state, add, use, resolve } = setup();
    if (target === "p") add("own", "p");
    use("master.waver.skill.s3", { targetPlayerId: target });
    resolve([]);
    assert.equal(state.players.p.flags.investigationBlockedRound, undefined);
    assert.equal(state.pendingDecision, null);
  }
});

test("通用选牌拒绝伪造候选，共感者仅匹配控制的激活同定义攻击", () => {
  const { state, add, use, resolve } = setup("master.kohaku");
  add("attack", "p", "card.cardluck", "attack"); add("match", "p"); add("other", "p", "card.normal");
  const mana = state.players.p.mana;
  use("master.kohaku.skill.s1a");
  assert.deepEqual(state.pendingDecision.options.map((o) => o.id), ["match"]);
  assert.throws(() => resolve(["other"]), /DECISION_OPTION_INVALID/);
  assert.throws(() => resolve(["match", "match"]), /DECISION_SELECTION_DUPLICATE/);
  resolve(["match"]);
  assert.deepEqual(state.players.p.discard, ["match"]);
  assert.equal(state.players.p.mana, mana + 1);
  assert.equal(state.players.p.flags.roundPowerBonus, 2);
});

test("选牌可存档恢复且重新验证牌区，失效选择不产生奖励", () => {
  const { state, add, use } = setup("master.kohaku");
  add("attack", "p", "card.cardluck", "attack"); add("match", "p");
  use("master.kohaku.skill.s1a");
  const saved = JSON.parse(JSON.stringify(state));
  saved.cards.attack.active = false;
  const engine = new StandardMatchEngine(buildStandardContent(content));
  assert.throws(() => engine.execute(saved, {
    commandId: "stale", gameInstanceId: saved.gameInstanceId, expectedRevision: saved.revision,
    actorId: "p", type: CommandType.ResolveDecision,
    payload: { decisionId: saved.pendingDecision.decisionId, selections: ["match"] },
  }), /STRUCTURED_SKILL_CARD_SELECTION_INVALID/);
  assert.equal(saved.players.p.flags.roundPowerBonus, undefined);
  const restored = JSON.parse(JSON.stringify(state));
  const result = engine.execute(restored, {
    commandId: "resume", gameInstanceId: restored.gameInstanceId, expectedRevision: restored.revision,
    actorId: "p", type: CommandType.ResolveDecision,
    payload: { decisionId: restored.pendingDecision.decisionId, selections: ["match"] },
  });
  assert.equal(result.state.players.p.flags.roundPowerBonus, 2);
});

test("死・紧握选择同战场玩家手牌并洗回其牌库", () => {
  const { state, add, use, resolve } = setup("master.shiki-ryougi");
  state.players.p.locationId = "mountain"; state.players.q.locationId = "mountain"; state.players.r.locationId = "city";
  state.board.locations.mountain = ["p", "q"]; state.board.locations.city = ["r"];
  add("grip-card", "p", "master.shiki-ryougi.skill.s3", "attack");
  add("chosen", "q"); add("deck-a", "q", "card.normal", "deck"); add("deck-b", "q", "card.cardluck", "deck");
  use("master.shiki-ryougi.skill.s3", { targetPlayerId: "q" });
  assert.deepEqual(state.pendingDecision.options.map((option) => option.id), ["chosen"]);
  resolve(["chosen"]);
  assert.equal(state.pendingDecision, null);
  assert.equal(state.cards.chosen.zone, "deck");
  assert.equal(state.cards.chosen.face, "down");
  assert.deepEqual(new Set(state.players.q.deck), new Set(["chosen", "deck-a", "deck-b"]));
  assert.throws(() => use("master.shiki-ryougi.skill.s3", { targetPlayerId: "r" }), /SKILL_USE_FORBIDDEN|STRUCTURED_SKILL_TARGET_PLAYER_INVALID/);
  state.players.p.locationId = "workshop"; state.board.locations.mountain = ["q"]; state.board.locations.workshop = ["p"];
  assert.throws(() => use("master.shiki-ryougi.skill.s3", { targetPlayerId: "q" }), /SKILL_USE_FORBIDDEN|STRUCTURED_SKILL_CONDITION_NOT_MET/);
});

test("领域外生命 EX 可弃置所在地或付费改为全场手牌", () => {
  {
    const { state, add, use } = setup("master.sion");
    state.players.p.locationId = "mountain"; state.players.q.locationId = "mountain"; state.players.r.locationId = "city";
    state.board.locations.mountain = ["p", "q"]; state.board.locations.city = ["r"];
    add("life-ex", "p", "master.sion.skill.s16", "master-skills");
    add("p-hand", "p"); add("q-hand", "q"); add("r-hand", "r");
    use("master.sion.skill.s16", { choiceId: "same-location" });
    assert.deepEqual(state.players.p.discard, ["p-hand"]);
    assert.deepEqual(state.players.q.discard, ["q-hand"]);
    assert.deepEqual(state.players.r.hand, ["r-hand"]);
  }
  {
    const { state, add, use } = setup("master.sion");
    state.players.p.mana = 5;
    add("life-ex", "p", "master.sion.skill.s16", "master-skills");
    add("p-hand", "p"); add("q-hand", "q"); add("r-hand", "r");
    use("master.sion.skill.s16", { choiceId: "all-players" });
    assert.equal(state.players.p.mana, 3);
    assert.deepEqual(state.players.p.discard, ["p-hand"]);
    assert.deepEqual(state.players.q.discard, ["q-hand"]);
    assert.deepEqual(state.players.r.discard, ["r-hand"]);
  }
});

test("神言魔术式在战败后从移除区取回万符必应破戒", () => {
  {
    const { state, emit } = setupMedea();
    emit("combat.resolved", { locationId: "mountain", powers: { p: 6, q: 2 }, winnerIds: ["p"] });
    assert.equal(state.cards["rule-breaker"].zone, "removed");
    assert.deepEqual(state.players.p.servantSkills, []);
  }
  {
    const { state, emit } = setupMedea();
    state.cards["divine-words"].active = false;
    emit("combat.resolved", { locationId: "mountain", powers: { p: 1, q: 4 }, winnerIds: ["q"] });
    assert.equal(state.cards["rule-breaker"].zone, "removed");
  }
  {
    const { state, emit } = setupMedea();
    emit("combat.resolved", { locationId: "mountain", powers: { p: 1, q: 4 }, winnerIds: ["q"] });
    assert.equal(state.cards["rule-breaker"].zone, "servant-skills");
    assert.equal(state.cards["rule-breaker"].face, "up");
    assert.deepEqual(state.players.p.servantSkills, ["rule-breaker"]);
  }
});

test("万符必应破戒按目标原令咒数扣除、败北或加威力", () => {
  {
    const { state, use } = setupMedeaNoblePhantasm(3);
    use();
    assert.equal(state.players.q.commandSeals, 2);
    assert.equal(state.players.q.defeated, false);
    assert.equal(state.players.p.flags.roundPowerBonus, undefined);
  }
  {
    const { state, use } = setupMedeaNoblePhantasm(1);
    use();
    assert.equal(state.players.q.commandSeals, 0);
    assert.equal(state.players.q.defeated, true);
    assert.equal(state.players.p.flags.roundPowerBonus, undefined);
  }
  {
    const { state, use } = setupMedeaNoblePhantasm(0);
    use();
    assert.equal(state.players.q.commandSeals, 0);
    assert.equal(state.players.q.defeated, true);
    assert.equal(state.players.p.flags.roundPowerBonus, 10);
  }
  {
    const { use } = setupMedeaNoblePhantasm(3);
    assert.throws(() => use("r"), /SKILL_USE_FORBIDDEN|STRUCTURED_SKILL_TARGET_PLAYER_INVALID/);
  }
});

test("少女贞洁关闭同地点魔术基础牌并按其基本威力获得魔力", () => {
  {
    const { state, use } = setupFrank();
    use();
    assert.equal(state.cards["magic-basic"].active, false);
    assert.equal(state.cards["magic-basic"].face, "down");
    assert.equal(state.cards["magic-basic"].zone, "attack");
    assert.equal(state.players.p.mana, 4);
  }
  {
    const { use } = setupFrank();
    assert.throws(() => use("strength-basic"), /STRUCTURED_SKILL_CARD_SELECTION_INVALID/);
  }
  {
    const { use } = setupFrank();
    assert.throws(() => use("remote-magic"), /STRUCTURED_SKILL_CARD_SELECTION_INVALID/);
  }
});

test("喀戎战后选择双方同属性基础攻击并交换到对方手牌", () => {
  {
    const { state, emit, resolve } = setupChiron();
    emit();
    assert.equal(state.pendingDecision.kind, "structured-private-card-choice");
    assert.deepEqual(state.pendingDecision.options.map((option) => option.id), ["chiron-own"]);
    resolve(["chiron-own"]);
    assert.equal(state.pendingDecision.kind, "structured-private-card-choice");
    assert.deepEqual(state.pendingDecision.options.map((option) => option.id), ["chiron-opponent"]);
    resolve(["chiron-opponent"]);
    assert.deepEqual(state.players.p.hand, ["chiron-opponent"]);
    assert.deepEqual(state.players.q.hand, ["chiron-own"]);
    assert.equal(state.cards["chiron-opponent"].ownerPlayerId, "p");
    assert.equal(state.cards["chiron-own"].ownerPlayerId, "q");
    assert.equal(state.cards["chiron-opponent"].active, false);
    assert.equal(state.cards["chiron-own"].active, false);
    assert.equal(state.players.p.victoryPoints, 2);
  }
  {
    const { state, emit, resolve } = setupChiron("card.carda2", "card.carda3");
    emit();
    resolve(["chiron-own"]);
    resolve(["chiron-opponent"]);
    assert.equal(state.players.p.victoryPoints, 0);
  }
  {
    const { state, emit, resolve } = setupChiron("card.carda3", "card.cardb2");
    emit();
    resolve(["chiron-own"]);
    assert.equal(state.pendingDecision.options.length, 0);
  }
  {
    const { state, emit, resolve } = setupChiron();
    emit();
    resolve([]);
    assert.equal(state.pendingDecision, null);
    assert.deepEqual(state.players.p.attack, ["chiron-own"]);
    assert.deepEqual(state.players.q.attack, ["chiron-opponent"]);
  }
});

test("契约胜利之剑移除亚瑟技能并永久提高本牌威力和费用", () => {
  const { state, definitions, use, resolve } = setupArthur();
  use();
  assert.deepEqual(new Set(state.pendingDecision.options.map((option) => option.id)), new Set(["windbreaker", "magic-resistance"]));
  resolve(["windbreaker", "magic-resistance"]);
  assert.deepEqual(state.players.p.servantSkills, []);
  assert.equal(state.cards.windbreaker.zone, "removed");
  assert.equal(state.cards["magic-resistance"].zone, "removed");
  assert.equal(state.cards.contract.powerModifiers?.[0].value, 10);
  assert.equal(state.cards.contract.powerModifiers?.[0].duration, "game");
  assert.equal(getEffectiveCardCost(state, state.players.p, state.cards.contract, definitions["servant.arthur.skill.sc-arthur-1"]), definitions["servant.arthur.skill.sc-arthur-1"].cost + 4);
});

test("堂吉诃德独处战场获得竞争战果，战败成长封顶到十二", () => {
  {
    const { state, use } = setupDonquixote();
    use();
    assert.equal(state.players.p.victoryPoints, 3);
  }
  {
    const { state, use } = setupDonquixote();
    state.players.q.locationId = "city"; state.board.locations.city = ["p", "q"]; state.board.locations.mountain = [];
    assert.throws(() => use(), /SKILL_USE_FORBIDDEN/);
  }
  {
    const { state, definitions, emitLostCombat } = setupDonquixote();
    for (let index = 0; index < 5; index += 1) {
      state.round = index + 1;
      emitLostCombat();
    }
    const totalPowerBonus = state.cards.windmill.powerModifiers.reduce((sum, modifier) => sum + modifier.value, 0);
    assert.equal(totalPowerBonus, 12);
    assert.equal(getEffectiveCardCost(state, state.players.p, state.cards.windmill, definitions["servant.donquixote.skill.sc-donquixote-1"]), definitions["servant.donquixote.skill.sc-donquixote-1"].cost + 12);
  }
});

test("赛米拉米斯毒龙只击败同战场且前哨部署于此的对手", () => {
  {
    const { state, use } = setupSemiramis();
    use();
    assert.equal(state.players.q.defeated, true);
    assert.equal(state.players.r.defeated, false);
    assert.equal(state.players.s.defeated, false);
  }
  {
    const { state, use } = setupSemiramis();
    state.cards.territory.active = false;
    assert.throws(() => use(), /SKILL_USE_FORBIDDEN/);
  }
});

test("黄金噬者从移除区取回一张或付费取回两张黄金冲击", () => {
  {
    const { state, use } = setupKintoki();
    use("one");
    assert.equal(state.players.p.victoryPoints, 2);
    assert.deepEqual(state.players.p.servantSkills, ["golden-one"]);
    assert.equal(state.cards["golden-one"].face, "up");
    assert.equal(state.cards["golden-two"].zone, "removed");
  }
  {
    const { state, use } = setupKintoki();
    use("two");
    assert.equal(state.players.p.mana, 0);
    assert.equal(state.players.p.victoryPoints, 4);
    assert.deepEqual(new Set(state.players.p.servantSkills), new Set(["golden-one", "golden-two"]));
  }
  {
    const { use } = setupKintoki(6);
    assert.throws(() => use("two"), /INSUFFICIENT_MANA/);
  }
});

test("自我改造打出时隐藏真名并在同战场玩家淘汰后永久加威力", () => {
  {
    const { state, emit } = setupHassan();
    emit("card.played", { playerId: "p", instanceId: "self-modification", definitionId: "servant.hassan.skill.sc-hassan-2", face: "up" });
    assert.equal(state.players.p.trueNameRevealed, false);
    assert.equal(state.players.p.victoryPoints, 2);
  }
  {
    const { state, emit } = setupHassan();
    emit("round.ended", { round: 2, eliminatedThisRound: ["r"], previousLocations: { p: "mountain", q: "mountain", r: "city" } });
    assert.equal(state.cards["self-modification"].powerModifiers, undefined);
    emit("round.ended", { round: 2, eliminatedThisRound: ["q"], previousLocations: { p: "mountain", q: "mountain", r: "city" } });
    assert.equal(state.cards["self-modification"].powerModifiers?.[0].value, 1);
    assert.equal(state.cards["self-modification"].powerModifiers?.[0].duration, "game");
  }
});
