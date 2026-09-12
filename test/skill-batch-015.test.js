import test from "node:test";
import assert from "node:assert/strict";

import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { projectPublicState } from "../src/projection/project-state.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";
import { closePlayerCard, createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { ignoresDefeat } from "../src/rules-core/jekyll-hyde.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { endStandardRound } from "../src/rules-core/rounds.ts";

function makeCommand(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function buildEngine() {
  return new StandardMatchEngine(buildStandardContent(content));
}

test("skills-015 结构化选择支持希翁追猎重新部署至指定战场", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "structured-sion-hunt-battlefield", players: [{ id: "sion", name: "希翁" }], seed: 1501 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  state.players.sion.locationId = "mountain";
  state.board.locations.mountain = ["sion"];
  createOwnedCardInstance(state, "sion", {
    instanceId: "hunt",
    definitionId: "master.sion.skill.s6",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "sion-hunt-to-city", CommandType.UseSkill, "sion", {
    skillId: "master.sion.skill.s6",
    data: { abilityId: "hunt", choiceId: "battlefield", targetLocationId: "city" },
  }));

  assert.equal(result.state.players.sion.locationId, "city");
  assert.deepEqual(result.state.board.locations.mountain, []);
  assert.deepEqual(result.state.board.locations.city, ["sion"]);
});

test("skills-015 结构化选择支持希翁追猎支付魔力并移动至侦查", () => {
  const engine = buildEngine();
  const state = createGameState({
    gameInstanceId: "structured-sion-hunt-scouting",
    players: [{ id: "sion", name: "希翁" }, { id: "opponent", name: "对手" }],
    seed: 1502,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  state.players.sion.locationId = "mountain";
  state.players.sion.mana = 1;
  state.players.opponent.locationId = "mountain";
  state.board.locations.mountain = ["sion", "opponent"];
  createOwnedCardInstance(state, "sion", {
    instanceId: "hunt",
    definitionId: "master.sion.skill.s6",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "sion-hunt-to-scouting", CommandType.UseSkill, "sion", {
    skillId: "master.sion.skill.s6",
    data: { abilityId: "hunt", choiceId: "scouting" },
  }));

  assert.equal(result.state.players.sion.locationId, "scouting");
  assert.deepEqual(result.state.board.locations.mountain, ["opponent"]);
  assert.deepEqual(result.state.board.locations.scouting, ["sion"]);
  assert.equal(result.state.players.sion.mana, 0);
});

test("skills-015 考列斯巴格达电池在工房部署后可选择获得魔力", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "structured-caules-battery-mana", players: [{ id: "caules", name: "考列斯" }], seed: 1503 });
  state.status = "playing";
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "caules";
  state.players.caules.masterId = "master.caules-yggdmillennia";
  state.players.caules.locationId = "workshop";
  state.players.caules.flags.deploymentLocationId = "workshop";
  state.board.locations.workshop = ["caules"];

  const result = engine.execute(state, makeCommand(state, "caules-charge-mana", CommandType.UseSkill, "caules", {
    skillId: "master.caules-yggdmillennia.skill.s2",
    data: { abilityId: "charge", choiceId: "gain-mana" },
  }));

  assert.equal(result.state.players.caules.mana, 1);
});

test("skills-015 考列斯巴格达电池可设置本回合无视败北并在回合结束清理", () => {
  const engine = buildEngine();
  const built = buildStandardContent(content);
  const state = createGameState({ gameInstanceId: "structured-caules-battery-ignore-defeat", players: [{ id: "caules", name: "考列斯" }], seed: 1504 });
  state.status = "playing";
  state.round = 3;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "caules";
  state.players.caules.masterId = "master.caules-yggdmillennia";
  state.players.caules.locationId = "workshop";
  state.players.caules.flags.deploymentLocationId = "workshop";
  state.players.caules.mana = 2;
  state.board.locations.workshop = ["caules"];

  const result = engine.execute(state, makeCommand(state, "caules-charge-ignore-defeat", CommandType.UseSkill, "caules", {
    skillId: "master.caules-yggdmillennia.skill.s2",
    data: { abilityId: "charge", choiceId: "ignore-defeat" },
  }));

  assert.equal(result.state.players.caules.mana, 0);
  assert.equal(result.state.players.caules.flags.ignoreDefeat, true);
  assert.equal(ignoresDefeat(result.state, result.state.players.caules), true);

  endStandardRound(result.state, built.skills.asCardDefinitions());

  assert.equal(result.state.players.caules.flags.ignoreDefeat, undefined);
  assert.equal(result.state.players.caules.flags["structuredRoundFlag:ignoreDefeat"], undefined);
});

test("skills-015 考列斯巴格达电池在战场部署后可激活绞首刑之雷", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "structured-caules-battery-start-thunder", players: [{ id: "caules", name: "考列斯" }], seed: 1505 });
  state.status = "playing";
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "caules";
  state.players.caules.masterId = "master.caules-yggdmillennia";
  state.players.caules.locationId = "mountain";
  state.players.caules.flags.deploymentLocationId = "mountain";
  state.board.locations.mountain = ["caules"];
  createOwnedCardInstance(state, "caules", {
    instanceId: "thunder",
    definitionId: "master.caules-yggdmillennia.skill.s3",
    zone: "master-skills",
    face: "up",
    active: false,
  });

  const result = engine.execute(state, makeCommand(state, "caules-start-thunder", CommandType.UseSkill, "caules", {
    skillId: "master.caules-yggdmillennia.skill.s2",
    data: { abilityId: "start-thunder" },
  }));

  assert.equal(result.state.cards.thunder.active, true);
  assert.equal(result.state.cards.thunder.face, "up");
});

test("skills-015 结构化打出触发可移除弃牌并创建游戏外牌到手牌", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "structured-kiritsugu-ascension", players: [{ id: "kiritsugu", name: "切嗣" }], seed: 1506 });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "kiritsugu";
  state.players.kiritsugu.masterId = "master.kiritsugu";
  state.players.kiritsugu.mana = 8;
  createOwnedCardInstance(state, "kiritsugu", { instanceId: "ascension", definitionId: "master.kiritsugu.skill.ascension", zone: "hand" });
  createOwnedCardInstance(state, "kiritsugu", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand" });
  createOwnedCardInstance(state, "kiritsugu", { instanceId: "discard-a", definitionId: "card.carda1", zone: "discard" });
  createOwnedCardInstance(state, "kiritsugu", { instanceId: "discard-b", definitionId: "card.cardb1", zone: "discard" });

  const result = engine.execute(state, makeCommand(state, "play-kiritsugu-ascension", CommandType.CommitAttack, "kiritsugu", {
    faceUpInstanceIds: ["ascension", "basic"],
    faceDownInstanceIds: [],
    cardDataByInstanceId: {
      ascension: { removedDiscardInstanceIds: ["discard-a", "discard-b"] },
    },
  }));

  assert.equal(result.state.cards["discard-a"].zone, "removed");
  assert.equal(result.state.cards["discard-b"].zone, "removed");
  assert.equal(result.state.cards["discard-a"].active, false);
  assert.equal(result.state.cards["discard-b"].face, "down");
  const originBullets = result.state.players.kiritsugu.hand
    .map((instanceId) => result.state.cards[instanceId].definitionId)
    .filter((definitionId) => definitionId === "card.card-origin");
  assert.equal(originBullets.length, 2);
});

test("skills-015 结构化生命周期可在下回合开始执行延迟败北", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-frank-delayed-defeat",
    players: [{ id: "frank", name: "弗兰" }, { id: "other", name: "其他玩家" }],
    seed: 1507,
  });
  state.status = "playing";
  state.round = 2;
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "frank";
  state.players.frank.servantId = "servant.frank";
  state.players.frank.mana = 8;
  state.board.situationDeck = [built.situations[0].id];
  state.board.eventDeck = built.events.map((event) => event.id);
  createOwnedCardInstance(state, "frank", { instanceId: "thunder-tree", definitionId: "servant.frank.skill.sc-frank-3", zone: "hand" });
  createOwnedCardInstance(state, "frank", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand" });

  const played = engine.execute(state, makeCommand(state, "play-frank-thunder-tree", CommandType.CommitAttack, "frank", {
    faceUpInstanceIds: ["thunder-tree", "basic"],
    faceDownInstanceIds: [],
  }));

  assert.equal(played.state.players.frank.mana, 1);
  assert.equal(played.state.players.frank.trueNameRevealed, true);
  assert.equal(played.state.players.frank.flags.ignoreDefeat, true);
  assert.equal(ignoresDefeat(played.state, played.state.players.frank), true);
  assert.equal(played.state.scheduledEffects.length, 1);

  played.state.phase = "combat";
  played.state.step = "settlement";
  played.state.activePlayerId = null;
  played.state.modeState.resolvedCombats = ["mountain", "city"];
  const advanced = engine.execute(played.state, makeCommand(played.state, "end-round-after-frank", CommandType.EndRound, "host", {}));

  assert.equal(advanced.state.round, 3);
  assert.equal(advanced.state.players.frank.flags.ignoreDefeat, undefined);
  assert.equal(advanced.state.players.frank.defeated, true);
  assert.equal(advanced.state.scheduledEffects.length, 0);
});

test("skills-015 结构化关闭技能牌支持回合结束重置绞首刑之雷", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-caules-reset-thunder",
    players: [{ id: "caules", name: "考列斯" }, { id: "other", name: "其他玩家" }],
    seed: 1508,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "settlement";
  state.activePlayerId = null;
  state.players.caules.masterId = "master.caules-yggdmillennia";
  state.board.situationDeck = [built.situations[0].id];
  state.board.eventDeck = built.events.map((event) => event.id);
  state.modeState.resolvedCombats = ["mountain", "city"];
  createOwnedCardInstance(state, "caules", {
    instanceId: "thunder",
    definitionId: "master.caules-yggdmillennia.skill.s3",
    zone: "master-skills",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "end-round-reset-thunder", CommandType.EndRound, "host", {}));

  assert.equal(result.state.cards.thunder.zone, "master-skills");
  assert.equal(result.state.cards.thunder.active, false);
  assert.equal(result.state.cards.thunder.face, "up");
});

test("skills-015 结构化技能牌激活支持藤乃歪曲之魔眼", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "structured-fujino-distort", players: [{ id: "fujino", name: "藤乃" }], seed: 1509 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "fujino";
  state.players.fujino.masterId = "master.fujino";
  state.players.fujino.locationId = "city";
  state.board.locations.city = ["fujino"];
  createOwnedCardInstance(state, "fujino", {
    instanceId: "mystic-eyes",
    definitionId: "master.fujino.skill.s3",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "fujino", {
    instanceId: "distorted-space",
    definitionId: "master.fujino.skill.s2",
    zone: "master-skills",
    face: "up",
    active: false,
  });

  const result = engine.execute(state, makeCommand(state, "fujino-distort", CommandType.UseSkill, "fujino", {
    skillId: "master.fujino.skill.s3",
    data: { abilityId: "bend-space" },
  }));

  assert.equal(result.state.cards["distorted-space"].active, true);
});

test("skills-015 结构化选择可从游戏外创建牌并直接加入攻击", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "structured-rin-gem-yinqi", players: [{ id: "rin", name: "凛" }], seed: 1510 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "rin";
  state.players.rin.masterId = "master.rin";
  state.players.rin.locationId = "city";
  state.players.rin.flags.rinGemCount = 10;
  state.board.locations.city = ["rin"];

  const result = engine.execute(state, makeCommand(state, "rin-gem-yinqi", CommandType.UseSkill, "rin", {
    skillId: "master.rin.skill.s3",
    data: { abilityId: "gem-option", choiceId: "play-yinqi" },
  }));

  const created = result.state.players.rin.attack.map((instanceId) => result.state.cards[instanceId])
    .find((card) => card.definitionId === "card.card-yinqi");
  assert.ok(created);
  assert.equal(created.zone, "attack");
  assert.equal(created.face, "up");
  assert.equal(created.active, true);
  assert.equal(created.temporary, true);
});

test("skills-015 结构化选择可弃置1-3张手牌并抽取同数", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "structured-rin-gem-discard-draw", players: [{ id: "rin", name: "凛" }], seed: 1511 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "rin";
  state.players.rin.masterId = "master.rin";
  state.players.rin.flags.rinGemCount = 10;
  createOwnedCardInstance(state, "rin", { instanceId: "discard-a", definitionId: "card.carda1", zone: "hand" });
  createOwnedCardInstance(state, "rin", { instanceId: "discard-b", definitionId: "card.cardb1", zone: "hand" });
  createOwnedCardInstance(state, "rin", { instanceId: "deck-a", definitionId: "card.cardc1", zone: "deck" });
  createOwnedCardInstance(state, "rin", { instanceId: "deck-b", definitionId: "card.cardc2", zone: "deck" });

  const result = engine.execute(state, makeCommand(state, "rin-gem-discard-draw", CommandType.UseSkill, "rin", {
    skillId: "master.rin.skill.s3",
    data: { abilityId: "gem-option", choiceId: "discard-draw", discardInstanceIds: ["discard-a", "discard-b"] },
  }));

  assert.deepEqual(result.state.players.rin.discard, ["discard-a", "discard-b"]);
  assert.equal(result.state.cards["discard-a"].zone, "discard");
  assert.equal(result.state.players.rin.hand.includes("deck-a"), true);
  assert.equal(result.state.players.rin.hand.includes("deck-b"), true);
});

test("skills-015 结构化条件可读取出牌前魔力并修正来源牌威力", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: "structured-illya-mana-slash", players: [{ id: "illya", name: "伊莉雅" }], seed: 1512 });
  state.status = "playing";
  state.phase = "action";
  state.step = "play-batch-draft";
  state.activePlayerId = "illya";
  state.players.illya.servantId = "servant.illya";
  state.players.illya.mana = 8;
  createOwnedCardInstance(state, "illya", { instanceId: "mana-slash", definitionId: "servant.illya.skill.sc-illya-2", zone: "hand" });
  createOwnedCardInstance(state, "illya", { instanceId: "basic", definitionId: "card.cardb1", zone: "hand" });

  const result = engine.execute(state, makeCommand(state, "play-illya-mana-slash", CommandType.CommitAttack, "illya", {
    faceUpInstanceIds: ["mana-slash", "basic"],
    faceDownInstanceIds: [],
  }));

  assert.equal(result.state.players.illya.mana, 7);
  assert.equal(result.state.players.illya.flags.lastAttackCommitManaBefore, 8);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.illya, "mana-slash", definitions), 6);
});

test("skills-015 结构化同地点目标可批量获得魔力并累加状态标记", () => {
  const engine = buildEngine();
  const state = createGameState({
    gameInstanceId: "structured-maxwell-paradox-seed",
    players: [
      { id: "maxwell", name: "麦克斯韦" },
      { id: "near", name: "同地点" },
      { id: "far", name: "远处" },
    ],
    seed: 1513,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "maxwell";
  state.players.maxwell.servantId = "servant.maxwell";
  state.players.maxwell.locationId = "city";
  state.players.near.locationId = "city";
  state.players.far.locationId = "mountain";
  state.players.maxwell.mana = 1;
  state.players.near.mana = 3;
  state.players.far.mana = 5;
  state.players.near.flags.paradoxCount = 2;
  state.board.locations.city = ["maxwell", "near"];
  state.board.locations.mountain = ["far"];
  createOwnedCardInstance(state, "maxwell", {
    instanceId: "proof",
    definitionId: "servant.maxwell.skill.sc-maxwell-2",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "maxwell-paradox-seed", CommandType.UseSkill, "maxwell", {
    skillId: "servant.maxwell.skill.sc-maxwell-2",
    data: { abilityId: "paradox-seed" },
  }));

  assert.equal(result.state.players.maxwell.mana, 3);
  assert.equal(result.state.players.near.mana, 5);
  assert.equal(result.state.players.far.mana, 5);
  assert.equal(result.state.players.maxwell.flags.paradoxCount, 1);
  assert.equal(result.state.players.near.flags.paradoxCount, 3);
  assert.equal(result.state.players.far.flags.paradoxCount, undefined);
});

test("skills-015 结构化目标过滤可按状态与魔力比例败北并只在战斗小技能真名解放", () => {
  const engine = buildEngine();
  const state = createGameState({
    gameInstanceId: "structured-maxwell-paradox-collapse",
    players: [
      { id: "maxwell", name: "麦克斯韦" },
      { id: "equal", name: "相等" },
      { id: "over", name: "超出" },
    ],
    seed: 1514,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "maxwell";
  state.players.maxwell.servantId = "servant.maxwell";
  state.players.maxwell.trueNameRevealed = false;
  state.players.maxwell.mana = 4;
  state.players.maxwell.flags.paradoxCount = 3;
  state.players.equal.mana = 6;
  state.players.equal.flags.paradoxCount = 3;
  state.players.over.mana = 4;
  state.players.over.flags.paradoxCount = 3;
  createOwnedCardInstance(state, "maxwell", {
    instanceId: "proof",
    definitionId: "servant.maxwell.skill.sc-maxwell-2",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "maxwell-paradox-collapse", CommandType.UseSkill, "maxwell", {
    skillId: "servant.maxwell.skill.sc-maxwell-2",
    data: { abilityId: "paradox-collapse" },
  }));

  assert.equal(result.state.players.maxwell.defeated, true);
  assert.equal(result.state.players.equal.defeated, false);
  assert.equal(result.state.players.over.defeated, true);
  assert.equal(result.state.players.maxwell.trueNameRevealed, true);
});

test("skills-015 结构化变量支付可查看牌库顶并选择一张入手其余弃置", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "structured-artoriac-selection-staff", players: [{ id: "artoria", name: "阿尔托莉雅" }], seed: 1515 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "artoria";
  state.players.artoria.servantId = "servant.artoriac";
  state.players.artoria.mana = 5;
  createOwnedCardInstance(state, "artoria", {
    instanceId: "selection-staff",
    definitionId: "servant.artoriac.skill.sc-artoriac-2",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "artoria", { instanceId: "top-a", definitionId: "card.carda1", zone: "deck" });
  createOwnedCardInstance(state, "artoria", { instanceId: "top-b", definitionId: "card.cardb1", zone: "deck" });
  createOwnedCardInstance(state, "artoria", { instanceId: "top-c", definitionId: "card.cardc1", zone: "deck" });
  createOwnedCardInstance(state, "artoria", { instanceId: "top-d", definitionId: "card.cardm1", zone: "deck" });
  createOwnedCardInstance(state, "artoria", { instanceId: "bottom", definitionId: "card.cards1", zone: "deck" });

  const result = engine.execute(state, makeCommand(state, "selection-staff-use", CommandType.UseSkill, "artoria", {
    skillId: "servant.artoriac.skill.sc-artoriac-2",
    data: { abilityId: "selection-staff", amount: 2, selectedInstanceId: "top-c" },
  }));

  assert.equal(result.state.players.artoria.mana, 3);
  assert.deepEqual(result.state.players.artoria.hand, ["top-c"]);
  assert.deepEqual(result.state.players.artoria.discard, ["top-a", "top-b", "top-d"]);
  assert.deepEqual(result.state.players.artoria.deck, ["bottom"]);
});

test("skills-015 结构化同战场选择目标可过滤本回合未用令咒玩家", () => {
  const engine = buildEngine();
  const state = createGameState({
    gameInstanceId: "structured-shakespeare-tragedy",
    players: [
      { id: "shakespeare", name: "莎士比亚" },
      { id: "target", name: "目标" },
      { id: "sealed", name: "已用令咒" },
    ],
    seed: 1516,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "shakespeare";
  state.players.shakespeare.servantId = "servant.shakespeare";
  state.players.shakespeare.locationId = "mountain";
  state.players.target.locationId = "mountain";
  state.players.sealed.locationId = "mountain";
  state.players.sealed.flags.commandSealUsedRound = 3;
  state.board.locations.mountain = ["shakespeare", "target", "sealed"];
  createOwnedCardInstance(state, "shakespeare", {
    instanceId: "curtain",
    definitionId: "servant.shakespeare.skill.sc-shakespeare-3",
    zone: "attack",
    face: "up",
    active: true,
  });

  assert.throws(() => engine.execute(state, makeCommand(state, "tragedy-blocked", CommandType.UseSkill, "shakespeare", {
    skillId: "servant.shakespeare.skill.sc-shakespeare-3",
    data: { abilityId: "tragedy-writing", targetPlayerId: "sealed" },
  })), /STRUCTURED_SKILL_CONDITION_NOT_MET|STRUCTURED_SKILL_TARGET/);

  const result = engine.execute(state, makeCommand(state, "tragedy-target", CommandType.UseSkill, "shakespeare", {
    skillId: "servant.shakespeare.skill.sc-shakespeare-3",
    data: { abilityId: "tragedy-writing", targetPlayerId: "target" },
  }));

  assert.equal(result.state.players.target.defeated, true);
  assert.equal(result.state.players.sealed.defeated, false);
});

test("skills-015 结构化生命周期可把被选攻击的当前威力延迟为下回合合计威力", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: "structured-leonidas-warrior-roar",
    players: [
      { id: "leonidas", name: "列奥尼达" },
      { id: "opponent", name: "对手" },
    ],
    seed: 1517,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "leonidas";
  state.players.leonidas.servantId = "servant.leonidas";
  state.players.leonidas.trueNameRevealed = false;
  state.players.leonidas.locationId = "mountain";
  state.players.opponent.locationId = "mountain";
  state.board.locations.mountain = ["leonidas", "opponent"];
  createOwnedCardInstance(state, "leonidas", {
    instanceId: "roar",
    definitionId: "servant.leonidas.skill.sc-leonidas-2",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "opponent", {
    instanceId: "opponent-attack",
    definitionId: "card.cardb3",
    zone: "attack",
    face: "up",
    active: true,
  });
  const copiedPower = calculateCombatCardPower(state, state.players.opponent, "opponent-attack", definitions, "mountain");

  const used = engine.execute(state, makeCommand(state, "warrior-roar", CommandType.UseSkill, "leonidas", {
    skillId: "servant.leonidas.skill.sc-leonidas-2",
    data: { abilityId: "warrior-roar", targetInstanceId: "opponent-attack" },
  }));

  assert.equal(used.state.players.leonidas.trueNameRevealed, true);
  assert.equal(used.state.scheduledEffects.length, 1);
  assert.equal(used.state.scheduledEffects[0].triggerRound, 5);

  used.state.phase = "combat";
  used.state.step = "settlement";
  used.state.activePlayerId = null;
  used.state.modeState.resolvedCombats = ["mountain", "city"];
  used.state.board.situationDeck = built.situations.map((situation) => situation.id);
  used.state.board.eventDeck = built.events.map((event) => event.id);
  const advanced = engine.execute(used.state, makeCommand(used.state, "advance-to-next-round", CommandType.EndRound, "host", {}));

  assert.equal(advanced.state.round, 5);
  assert.equal(advanced.state.players.leonidas.flags.roundPowerBonus, copiedPower);
});

test("skills-015 结构化状态清理可按移除人数给来源牌限额加威力", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: "structured-astraea-judgment",
    players: [
      { id: "astraea", name: "阿斯特赖亚" },
      { id: "flagged", name: "标记玩家" },
      { id: "clean", name: "无状态" },
    ],
    seed: 1518,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "astraea";
  state.players.astraea.servantId = "servant.astraea";
  state.players.astraea.trueNameRevealed = false;
  state.players.astraea.statuses.push("谴责");
  state.players.flagged.flags.condemned = true;
  createOwnedCardInstance(state, "astraea", {
    instanceId: "judgment",
    definitionId: "servant.astraea.skill.sc-astraea-1",
    zone: "attack",
    face: "up",
    active: true,
  });
  const basePower = calculateCombatCardPower(state, state.players.astraea, "judgment", definitions);

  const result = engine.execute(state, makeCommand(state, "astraea-judgment", CommandType.UseSkill, "astraea", {
    skillId: "servant.astraea.skill.sc-astraea-1",
    data: { abilityId: "judgment-time" },
  }));

  assert.equal(result.state.players.astraea.trueNameRevealed, true);
  assert.deepEqual(result.state.players.astraea.statuses, []);
  assert.equal(result.state.players.flagged.flags.condemned, undefined);
  assert.equal(calculateCombatCardPower(result.state, result.state.players.astraea, "judgment", definitions), basePower + 8);
});

test("skills-015 结构化残留触发可在战斗结束后关闭一半同定义牌", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: "structured-darius-undead-half-close",
    players: [
      { id: "darius", name: "大流士" },
      { id: "opponent", name: "对手" },
    ],
    seed: 1519,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "settlement";
  state.players.darius.servantId = "servant.darius";
  state.players.darius.locationId = "city";
  state.players.opponent.locationId = "city";
  state.board.locations.city = ["darius", "opponent"];
  for (const instanceId of ["soldier-a", "soldier-b", "soldier-c"]) {
    createOwnedCardInstance(state, "darius", {
      instanceId,
      definitionId: "servant.darius.skill.sc-darius-4",
      zone: "attack",
      face: "up",
      active: true,
      residual: true,
    });
  }

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "combat-resolved",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { locationId: "city" },
  });
  engine.effects.drain(state, 1000, definitions);

  assert.deepEqual(state.players.darius.attack, ["soldier-c"]);
  assert.equal(state.cards["soldier-a"].active, false);
  assert.equal(state.cards["soldier-b"].active, false);
  assert.deepEqual(state.players.darius.servantSkills, ["soldier-a", "soldier-b"]);
});

test("skills-015 结构化同战场目标支持妄想毒身扣减对手战果", () => {
  const engine = buildEngine();
  const state = createGameState({
    gameInstanceId: "structured-hassanser-poison-gas",
    players: [
      { id: "hassan", name: "静谧" },
      { id: "near", name: "同战场" },
      { id: "away", name: "其他地点" },
    ],
    seed: 1520,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "hassan";
  state.players.hassan.servantId = "servant.hassanser";
  state.players.hassan.locationId = "mountain";
  state.players.near.locationId = "mountain";
  state.players.away.locationId = "city";
  state.players.near.victoryPoints = 3;
  state.players.away.victoryPoints = 3;
  state.board.locations.mountain = ["hassan", "near"];
  state.board.locations.city = ["away"];
  createOwnedCardInstance(state, "hassan", {
    instanceId: "poison-body",
    definitionId: "servant.hassanser.skill.sc-hassanser-2",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "poison-gas", CommandType.UseSkill, "hassan", {
    skillId: "servant.hassanser.skill.sc-hassanser-2",
    data: { abilityId: "poison-gas" },
  }));

  assert.equal(result.state.players.near.victoryPoints, 2);
  assert.equal(result.state.players.away.victoryPoints, 3);
});

test("skills-015 结构化选择关闭当前战场基础牌并扣减双方战果", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-hassanser-death-kiss",
    players: [
      { id: "hassan", name: "静谧" },
      { id: "target", name: "目标" },
    ],
    seed: 1521,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "hassan";
  state.players.hassan.servantId = "servant.hassanser";
  state.players.hassan.locationId = "city";
  state.players.target.locationId = "city";
  state.players.hassan.victoryPoints = 4;
  state.players.target.victoryPoints = 4;
  state.board.locations.city = ["hassan", "target"];
  createOwnedCardInstance(state, "hassan", {
    instanceId: "poison-body",
    definitionId: "servant.hassanser.skill.sc-hassanser-2",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "target", {
    instanceId: "target-basic",
    definitionId: "card.cardb1",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "death-kiss", CommandType.UseSkill, "hassan", {
    skillId: "servant.hassanser.skill.sc-hassanser-2",
    data: { abilityId: "death-kiss", targetInstanceId: "target-basic" },
  }));

  assert.equal(result.state.cards["target-basic"].active, false);
  assert.equal(result.state.cards["target-basic"].face, "down");
  assert.equal(result.state.cards["target-basic"].zone, "attack");
  assert.deepEqual(result.state.players.target.discard, []);
  assert.equal(result.state.players.hassan.victoryPoints, 3);
  assert.equal(result.state.players.target.victoryPoints, 3);
});

test("skills-015 结构化牌库顶查看可弃置任意数量并重排剩余牌", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-hakuno-ccc-intrusion",
    players: [
      { id: "hakuno", name: "白野" },
      { id: "target", name: "目标" },
    ],
    seed: 1522,
  });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "hakuno";
  state.players.hakuno.masterId = "master.hakuno-f";
  state.players.hakuno.locationId = "mountain";
  state.players.target.locationId = "mountain";
  state.board.locations.mountain = ["hakuno", "target"];
  createOwnedCardInstance(state, "hakuno", {
    instanceId: "ccc",
    definitionId: "master.hakuno-f.skill.s3",
    zone: "attack",
    face: "up",
    active: true,
  });
  for (const [instanceId, definitionId] of [["top-a", "card.cardb1"], ["top-b", "card.cardq1"], ["top-c", "card.carda1"], ["bottom", "card.cardluck"]]) {
    createOwnedCardInstance(state, "target", {
      instanceId,
      definitionId,
      zone: "deck",
      face: "down",
      active: false,
    });
  }

  const result = engine.execute(state, makeCommand(state, "illegal-intrusion", CommandType.UseSkill, "hakuno", {
    skillId: "master.hakuno-f.skill.s3",
    data: {
      abilityId: "cc-hack",
      targetPlayerId: "target",
      discardInstanceIds: ["top-b"],
      orderedRestInstanceIds: ["top-c", "top-a"],
    },
  }));

  assert.deepEqual(result.state.players.target.discard, ["top-b"]);
  assert.deepEqual(result.state.players.target.deck, ["top-c", "top-a", "bottom"]);
});

test("skills-015 结构化战斗结果条件支持源牌激活时战败扣战果", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-hakuno-ccc-data-leak",
    players: [
      { id: "hakuno", name: "白野" },
      { id: "winner", name: "胜者" },
    ],
    seed: 1523,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "settlement";
  state.players.hakuno.masterId = "master.hakuno-f";
  state.players.hakuno.locationId = "city";
  state.players.winner.locationId = "city";
  state.players.hakuno.victoryPoints = 3;
  state.board.locations.city = ["hakuno", "winner"];
  createOwnedCardInstance(state, "hakuno", {
    instanceId: "ccc",
    definitionId: "master.hakuno-f.skill.s3",
    zone: "attack",
    face: "up",
    active: true,
  });

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "combat-resolved",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { locationId: "city", participantIds: ["hakuno", "winner"], powers: { hakuno: 2, winner: 6 }, winnerIds: ["winner"] },
  });
  engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });

  assert.equal(state.players.hakuno.victoryPoints, 2);
});

test("skills-015 结构化目标数量条件支持关闭唯一交战对手的非残留攻击", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-scathach-close-single-opponent",
    players: [
      { id: "scathach", name: "斯卡哈" },
      { id: "opponent", name: "对手" },
    ],
    seed: 1524,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "scathach";
  state.players.scathach.servantId = "servant.scathach";
  state.players.scathach.locationId = "mountain";
  state.players.opponent.locationId = "mountain";
  state.board.locations.mountain = ["scathach", "opponent"];
  createOwnedCardInstance(state, "scathach", {
    instanceId: "spear",
    definitionId: "servant.scathach.skill.sc-scathach-2",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "opponent", {
    instanceId: "opponent-attack",
    definitionId: "card.cardq2",
    zone: "attack",
    face: "up",
    active: true,
    residual: false,
  });

  const opened = engine.execute(state, makeCommand(state, "piercing-spear-close", CommandType.UseSkill, "scathach", {
    skillId: "servant.scathach.skill.sc-scathach-2",
    data: { abilityId: "piercing-spear-close" },
  }));
  assert.equal(opened.state.pendingDecision?.kind, "structured-each-player-card-choice");
  assert.deepEqual(opened.state.pendingDecision?.chooserPlayerIds, ["opponent"]);
  assert.deepEqual(opened.state.pendingDecision?.options.map((option) => option.id), ["opponent-attack"]);

  const result = engine.execute(opened.state, makeCommand(opened.state, "piercing-spear-close-resolve", CommandType.ResolveDecision, "opponent", {
    decisionId: opened.state.pendingDecision.decisionId,
    selections: ["opponent-attack"],
  }));

  assert.equal(result.state.cards["opponent-attack"].active, false);
  assert.equal(result.state.cards["opponent-attack"].face, "down");
  assert.equal(result.state.cards["opponent-attack"].zone, "attack");
  assert.deepEqual(result.state.players.opponent.discard, []);
});

test("skills-015 结构化按目标数量获得战果支持死兆胜利奖励", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-scathach-death-omen",
    players: [
      { id: "scathach", name: "斯卡哈" },
      { id: "opponentA", name: "对手A" },
      { id: "opponentB", name: "对手B" },
    ],
    seed: 1525,
  });
  state.status = "playing";
  state.phase = "combat";
  state.step = "settlement";
  state.players.scathach.servantId = "servant.scathach";
  state.players.scathach.locationId = "city";
  state.players.opponentA.locationId = "city";
  state.players.opponentB.locationId = "city";
  state.board.locations.city = ["scathach", "opponentA", "opponentB"];
  createOwnedCardInstance(state, "scathach", {
    instanceId: "spear",
    definitionId: "servant.scathach.skill.sc-scathach-2",
    zone: "attack",
    face: "up",
    active: true,
  });

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "combat-resolved",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { locationId: "city", powers: { scathach: 8, opponentA: 4, opponentB: 6 }, winnerIds: ["scathach"] },
  });
  engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });

  assert.equal(state.players.scathach.victoryPoints, 2);
});

test("skills-015 结构化按定义弃置手牌可支付无以誓约胜利之剑并记录本回合状态", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-boudica-oathless-sword",
    players: [{ id: "boudica", name: "布狄卡" }],
    seed: 1526,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "outpost";
  state.step = "player-window";
  state.activePlayerId = "boudica";
  state.players.boudica.servantId = "servant.boudica";
  createOwnedCardInstance(state, "boudica", {
    instanceId: "no-sword",
    definitionId: "servant.boudica.skill.sc-boudica-2",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "boudica", {
    instanceId: "luck",
    definitionId: "card.cardluck",
    zone: "hand",
    face: "down",
    active: false,
  });
  createOwnedCardInstance(state, "boudica", {
    instanceId: "drawn",
    definitionId: "card.cardb1",
    zone: "deck",
    face: "down",
    active: false,
  });

  const result = engine.execute(state, makeCommand(state, "oathless-sword", CommandType.UseSkill, "boudica", {
    skillId: "servant.boudica.skill.sc-boudica-2",
    data: { abilityId: "oathless-sword", discardInstanceIds: ["luck"] },
  }));

  assert.deepEqual(result.state.players.boudica.discard, ["luck"]);
  assert.deepEqual(result.state.players.boudica.hand, ["drawn"]);
  assert.equal(result.state.players.boudica.flags.roundPowerBonus, 5);
  assert.equal(result.state.players.boudica.flags.boudicaOathlessSwordRound, 4);
});

test("skills-015 布狄卡守护车轮残留时阻止对手关闭她的牌但允许自己关闭", () => {
  const built = buildStandardContent(content);
  const definitions = {
    ...built.cards,
    "test.basic.strength": { id: "test.basic.strength", name: "测试力量", cost: 0, basePower: 3, typeLabel: "力量", attributes: ["力量"], basic: true },
  };
  const state = createGameState({ gameInstanceId: "boudica-guard-close-protection", players: [{ id: "boudica", name: "布狄卡" }, { id: "opp", name: "对手" }], seed: 1530 });
  state.status = "playing";
  state.players.boudica.servantId = "servant.boudica";
  createOwnedCardInstance(state, "boudica", {
    instanceId: "wheel",
    definitionId: "card.skill.servant.boudica.skill.sc-boudica-1",
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });
  createOwnedCardInstance(state, "boudica", {
    instanceId: "attack",
    definitionId: "test.basic.strength",
    zone: "attack",
    face: "up",
    active: true,
  });

  assert.throws(() => closePlayerCard(state, "boudica", "attack", definitions, { closedByPlayerId: "opp" }), /CARD_CLOSE_PROTECTED/);
  assert.doesNotThrow(() => closePlayerCard(state, "boudica", "attack", definitions, { closedByPlayerId: "boudica" }));
  assert.equal(state.cards.attack.active, false);
});

test("skills-015 布狄卡守护车轮可战斗移动加威力并在战斗结算后关闭", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "boudica-guard-wheel", players: [{ id: "boudica", name: "布狄卡" }, { id: "opp", name: "对手" }], seed: 1531 });
  state.status = "playing";
  state.phase = "combat";
  state.step = "player-window";
  state.activePlayerId = "boudica";
  state.players.boudica.servantId = "servant.boudica";
  state.players.boudica.trueNameRevealed = true;
  state.players.boudica.mana = 2;
  state.players.boudica.locationId = "mountain";
  state.players.opp.locationId = "mountain";
  state.board.locations.mountain = ["boudica", "opp"];
  createOwnedCardInstance(state, "boudica", {
    instanceId: "wheel",
    definitionId: "card.skill.servant.boudica.skill.sc-boudica-1",
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });

  const moved = engine.execute(state, makeCommand(state, "boudica-wheel-move", CommandType.UseSkill, "boudica", {
    skillId: "servant.boudica.skill.sc-boudica-1",
    data: { abilityId: "wheel-forward" },
  }));
  assert.equal(moved.state.players.boudica.locationId, "city");
  assert.equal(moved.state.players.boudica.mana, 0);

  const powered = engine.execute(moved.state, makeCommand(moved.state, "boudica-wheel-power", CommandType.UseSkill, "boudica", {
    skillId: "servant.boudica.skill.sc-boudica-1",
    data: { abilityId: "wheel-power" },
  }));
  assert.equal(powered.state.players.boudica.flags.roundPowerBonus, 5);

  powered.state.step = "settlement";
  powered.state.activePlayerId = "boudica";
  const resolved = engine.execute(powered.state, makeCommand(powered.state, "boudica-wheel-resolve", CommandType.ResolveCombat, "boudica", { locationId: "city" }));
  assert.equal(resolved.state.cards.wheel.active, false);
  assert.equal(resolved.state.cards.wheel.zone, "servant-skills");
});

test("skills-015 结构化当前回合胜利标记可按顺位之后人数结算战果并清理", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({
    gameInstanceId: "structured-boudica-oathless-win",
    players: [
      { id: "boudica", name: "布狄卡" },
      { id: "afterA", name: "后位A" },
      { id: "afterB", name: "后位B" },
    ],
    seed: 1527,
  });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "settlement";
  state.players.boudica.servantId = "servant.boudica";
  state.players.boudica.locationId = "city";
  state.players.afterA.locationId = "city";
  state.players.afterB.locationId = "city";
  state.players.boudica.flags.boudicaOathlessSwordRound = 4;
  state.board.locations.city = ["boudica", "afterA", "afterB"];
  createOwnedCardInstance(state, "boudica", {
    instanceId: "no-sword",
    definitionId: "servant.boudica.skill.sc-boudica-2",
    zone: "attack",
    face: "up",
    active: true,
  });

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "combat-resolved",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { locationId: "city", powers: { boudica: 7, afterA: 3, afterB: 4 }, winnerIds: ["boudica"] },
  });
  engine.effects.drain(state, 1000, definitions);

  assert.equal(state.players.boudica.victoryPoints, 2);
  assert.equal(state.players.boudica.flags.boudicaOathlessSwordWonRound, 4);

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "round-ended",
    type: "round.ended",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { round: 4 },
  });
  engine.effects.drain(state, 1000, definitions);

  assert.equal(state.players.boudica.flags.boudicaOathlessSwordRound, undefined);
  assert.equal(state.players.boudica.flags.boudicaOathlessSwordWonRound, undefined);
});

test("skills-015 结构化事件字段条件支持回合末未赢战斗惩罚", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "structured-boudica-oathless-no-win",
    players: [{ id: "boudica", name: "布狄卡" }],
    seed: 1528,
  });
  state.status = "playing";
  state.round = 5;
  state.phase = "combat";
  state.step = "settlement";
  state.players.boudica.servantId = "servant.boudica";
  state.players.boudica.victoryPoints = 3;
  state.players.boudica.flags.boudicaOathlessSwordRound = 4;

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "round-ended",
    type: "round.ended",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { round: 4 },
  });
  engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });

  assert.equal(state.players.boudica.victoryPoints, 1);
  assert.equal(state.players.boudica.flags.boudicaOathlessSwordRound, undefined);
  assert.equal(state.players.boudica.flags.boudicaOathlessSwordWonRound, undefined);
});

test("skills-015 希翁骑乘EX可行动阶段追加打出至多三张低威力基础牌", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "sion-riding-ex", players: [{ id: "sion", name: "希翁" }], seed: 1529 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  state.players.sion.mana = 20;
  createOwnedCardInstance(state, "sion", {
    instanceId: "riding-ex",
    definitionId: "card.skill.master.sion.skill.s8",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "sion", { instanceId: "basic-a", definitionId: "card.carda2", zone: "hand" });
  createOwnedCardInstance(state, "sion", { instanceId: "basic-b", definitionId: "card.cardb2", zone: "hand" });
  createOwnedCardInstance(state, "sion", { instanceId: "basic-q", definitionId: "card.cardq2", zone: "hand" });

  const result = engine.execute(state, makeCommand(state, "sion-riding-ex-use", CommandType.UseSkill, "sion", {
    skillId: "master.sion.skill.s8",
    data: { abilityId: "delayed-summon", instanceIds: ["basic-a", "basic-b", "basic-q"] },
  }));

  assert.deepEqual(result.state.players.sion.hand, []);
  assert.ok(result.state.players.sion.attack.includes("basic-a"));
  assert.ok(result.state.players.sion.attack.includes("basic-b"));
  assert.ok(result.state.players.sion.attack.includes("basic-q"));
  assert.equal(result.state.cards["basic-a"].active, true);
  assert.equal(result.state.cards["basic-b"].active, true);
  assert.equal(result.state.cards["basic-q"].active, true);
});

test("skills-015 希翁狂战士EX移除牌库牌并按数量永久强化来源牌", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "sion-berserker-ex", players: [{ id: "sion", name: "希翁" }], seed: 1530 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion";
  createOwnedCardInstance(state, "sion", {
    instanceId: "berserker-ex",
    definitionId: "card.skill.master.sion.skill.s11",
    zone: "attack",
    face: "up",
    active: true,
  });
  createOwnedCardInstance(state, "sion", { instanceId: "deck-a", definitionId: "card.carda2", zone: "deck" });
  createOwnedCardInstance(state, "sion", { instanceId: "deck-b", definitionId: "card.cardb2", zone: "deck" });
  createOwnedCardInstance(state, "sion", { instanceId: "deck-q", definitionId: "card.cardq2", zone: "deck" });

  const opened = engine.execute(state, makeCommand(state, "sion-berserker-open", CommandType.UseSkill, "sion", {
    skillId: "master.sion.skill.s11",
    data: { abilityId: "madness-enhancement" },
  }));
  assert.equal(opened.state.pendingDecision.kind, "structured-private-card-choice");
  assert.equal(opened.state.pendingDecision.max, 3);

  const resolved = engine.execute(opened.state, makeCommand(opened.state, "sion-berserker-resolve", CommandType.ResolveDecision, "sion", {
    decisionId: opened.state.pendingDecision.decisionId,
    selections: ["deck-a", "deck-b", "deck-q"],
  }));

  assert.deepEqual(resolved.state.players.sion.deck, []);
  assert.deepEqual(
    ["deck-a", "deck-b", "deck-q"].map((id) => resolved.state.cards[id].zone).sort(),
    ["removed", "removed", "removed"],
  );
  assert.equal(resolved.state.cards["deck-a"].zone, "removed");
  assert.equal(resolved.state.cards["berserker-ex"].powerModifiers?.[0].value, 12);
  assert.equal(resolved.state.cards["berserker-ex"].powerModifiers?.[0].duration, "game");
});

test("skills-015 希翁阵地作成EX胜利成长并在工房部署时获得等量收益", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const state = createGameState({ gameInstanceId: "sion-territory-expansion-ex", players: [{ id: "sion", name: "希翁" }], seed: 1531 });
  state.status = "playing";
  state.round = 4;
  state.phase = "combat";
  state.step = "settlement";
  state.players.sion.masterId = "master.sion";
  state.players.sion.locationId = "city";
  state.board.locations.city = ["sion"];
  createOwnedCardInstance(state, "sion", {
    instanceId: "territory-ex",
    definitionId: "card.skill.master.sion.skill.s9",
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "sion-win",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { locationId: "city", powers: { sion: 6 }, winnerIds: ["sion"] },
  });
  engine.effects.drain(state, 1000, definitions);
  assert.equal(state.players.sion.flags.sionTerritoryExpansionX, 1);

  state.phase = "outpost";
  state.players.sion.locationId = "workshop";
  state.board.locations.city = [];
  state.board.locations.workshop = ["sion"];
  enqueuePassiveEffects(state, engine.passives, {
    eventId: "sion-workshop",
    type: "player.deployed",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { playerId: "sion", locationId: "workshop" },
  });
  engine.effects.drain(state, 1000, definitions);

  assert.equal(state.players.sion.mana, 1);
  assert.equal(state.players.sion.victoryPoints, 1);
  assert.equal(state.players.sion.flags.roundPowerBonus, 1);
});

test("skills-015 混沌破浪按选择X沿箭头移动并强化来源牌", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "chaos-breaker-rush", players: [{ id: "chaos", name: "混沌" }], seed: 1532 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "chaos";
  state.players.chaos.masterId = "master.chaos";
  state.players.chaos.locationId = "workshop";
  state.board.locations.workshop = ["chaos"];
  createOwnedCardInstance(state, "chaos", {
    instanceId: "breaker",
    definitionId: "card.skill.master.chaos.skill.s12",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "chaos-rush", CommandType.UseSkill, "chaos", {
    skillId: "master.chaos.skill.s12",
    data: { abilityId: "rush", x: 2 },
  }));

  assert.equal(result.state.players.chaos.locationId, "city");
  assert.deepEqual(result.state.board.locations.workshop, []);
  assert.deepEqual(result.state.board.locations.city, ["chaos"]);
  assert.equal(result.state.cards.breaker.powerModifiers?.[0].value, 3);
  assert.equal(result.state.cards.breaker.powerModifiers?.[0].duration, "game");
});

test("skills-015 混沌潜影在对手进入同地点时给予回合合计威力惩罚", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "chaos-shadow-trap",
    players: [
      { id: "chaos", name: "混沌" },
      { id: "opponent", name: "对手" },
      { id: "away", name: "远处" },
    ],
    seed: 1533,
  });
  state.status = "playing";
  state.phase = "action";
  state.players.chaos.masterId = "master.chaos";
  state.players.chaos.locationId = "city";
  state.players.opponent.locationId = "city";
  state.players.away.locationId = "mountain";
  state.board.locations.city = ["chaos", "opponent"];
  state.board.locations.mountain = ["away"];
  createOwnedCardInstance(state, "chaos", {
    instanceId: "shadow",
    definitionId: "card.skill.master.chaos.skill.s5",
    zone: "attack",
    face: "up",
    active: true,
    residual: true,
  });

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "opponent-entered",
    type: "player.moved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { playerId: "opponent", locationId: "city" },
  });
  engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });
  assert.equal(state.players.opponent.flags.roundPowerBonus, -5);

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "away-entered",
    type: "player.moved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { playerId: "away", locationId: "mountain" },
  });
  engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });
  assert.equal(state.players.away.flags.roundPowerBonus, undefined);
});

test("skills-015 混沌天灾按X弃置所在战场对应战果事件", () => {
  const engine = buildEngine();
  const state = createGameState({ gameInstanceId: "chaos-calamity", players: [{ id: "chaos", name: "混沌" }], seed: 1534 });
  state.status = "playing";
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "chaos";
  state.players.chaos.masterId = "master.chaos";
  state.players.chaos.locationId = "city";
  state.board.locations.city = ["chaos"];
  state.board.currentEvents.city = ["event.fuyuki.2", "event.fuyuki.3"];
  state.board.eventVisibility["event.fuyuki.2"] = "up";
  state.board.eventVisibility["event.fuyuki.3"] = "up";
  createOwnedCardInstance(state, "chaos", {
    instanceId: "calamity",
    definitionId: "card.skill.master.chaos.skill.s13",
    zone: "attack",
    face: "up",
    active: true,
  });

  const result = engine.execute(state, makeCommand(state, "chaos-calamity-use", CommandType.UseSkill, "chaos", {
    skillId: "master.chaos.skill.s13",
    data: { abilityId: "calamity-crossing", x: 2 },
  }));

  assert.deepEqual(result.state.board.currentEvents.city, ["event.fuyuki.3"]);
  assert.ok(result.state.board.eventDiscard.includes("event.fuyuki.2"));
  assert.equal(result.state.board.eventVisibility["event.fuyuki.2"], undefined);
});

test("skills-015 沃戴姆天体学开局秘密记录两个回合后才加入人理保障天球", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({
    gameInstanceId: "wodime-astrology-start",
    players: [{ id: "wodime", name: "沃戴姆" }, { id: "other", name: "其他玩家" }],
    seed: 15351,
  });
  state.players.wodime.masterId = "master.wodime";

  let result = engine.execute(state, makeCommand(state, "wodime-start", CommandType.StartStandardGame, "host", {}));
  assert.equal(result.state.pendingDecision?.kind, "wodime-astrology-rounds");
  assert.equal(result.state.pendingDecision?.ownerPlayerId, "wodime");
  assert.equal(result.state.pendingDecision?.min, 2);
  assert.equal(result.state.pendingDecision?.max, 2);
  assert.deepEqual(result.state.pendingDecision?.options.map((option) => option.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  assert.equal(result.state.players.wodime.masterSkills.some((instanceId) => result.state.cards[instanceId]?.definitionId === "master.wodime.skill.s2"), false);

  const otherView = projectPublicState(result.state, "other");
  assert.deepEqual(otherView.pendingDecision?.options, []);
  assert.deepEqual(otherView.pendingDecision?.submissions, {});

  const decisionId = result.state.pendingDecision.decisionId;
  result = engine.execute(result.state, makeCommand(result.state, "wodime-record-rounds", CommandType.ResolveDecision, "wodime", {
    decisionId,
    selections: ["2", "5"],
  }));

  assert.equal(result.state.players.wodime.flags.wodimeAstrologyRounds, "2,5");
  assert.equal(result.state.players.wodime.masterSkills.some((instanceId) => result.state.cards[instanceId]?.definitionId === "master.wodime.skill.s2"), true);
  assert.equal(projectPublicState(result.state, "other").players.wodime.publicFlags.wodimeAstrologyRounds, undefined);
});

test("skills-015 沃戴姆冠位指定在战斗胜利后额外记录下一回合天球触发", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "wodime-grand-designation", players: [{ id: "wodime", name: "沃戴姆" }], seed: 1535 });
  state.status = "playing";
  state.round = 6;
  state.phase = "combat";
  state.step = "settlement";
  state.players.wodime.masterId = "master.wodime";
  state.players.wodime.flags.wodimeAstrologyRounds = "2,4";

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "wodime-win-before-unlock",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { locationId: "city", powers: { wodime: 8 }, winnerIds: ["wodime"] },
  });
  engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });
  assert.equal(state.players.wodime.flags.wodimeAstrologyRounds, "2,4");

  createOwnedCardInstance(state, "wodime", {
    instanceId: "wodime-grand-designation",
    definitionId: "master.wodime.skill.ascension",
    zone: "master-skills",
    face: "up",
    active: false,
  });

  enqueuePassiveEffects(state, engine.passives, {
    eventId: "wodime-win",
    type: "combat.resolved",
    revision: state.revision,
    sourceCommandId: "test",
    payload: { locationId: "city", powers: { wodime: 8 }, winnerIds: ["wodime"] },
  });
  engine.effects.drain(state, 1000, { ...built.cards, ...built.skills.asCardDefinitions() });

  assert.equal(state.players.wodime.flags.wodimeAstrologyRounds, "2,4,7");
});

test("skills-015 龙之介渎神者按2X支付并在战斗阶段惩罚污染战场对手", () => {
  const engine = buildEngine();
  const state = createGameState({
    gameInstanceId: "ryuunosuke-blasphemer",
    players: [
      { id: "ryuu", name: "龙之介" },
      { id: "opponent", name: "对手" },
      { id: "away", name: "远处" },
    ],
    seed: 1536,
  });
  state.status = "playing";
  state.round = 3;
  state.phase = "action";
  state.step = "player-window";
  state.activePlayerId = "ryuu";
  state.players.ryuu.masterId = "master.ryuunosuke";
  // Ascension skills are catalogue-only until unlocked; this focused handler
  // test explicitly grants the ascension card instead of relying on the old
  // incorrect initial-ownership behavior.
  createOwnedCardInstance(state, "ryuu", {
    instanceId: "ryuunosuke-ascension",
    definitionId: "master.ryuunosuke.skill.ascension",
    zone: "master-skills",
    face: "up",
    active: false,
  });
  state.players.ryuu.locationId = "city";
  state.players.ryuu.mana = 8;
  state.players.opponent.locationId = "city";
  state.players.opponent.victoryPoints = 6;
  state.players.opponent.flags.deploymentBonusActive = true;
  state.players.opponent.flags.deploymentBonus = 3;
  state.players.away.locationId = "mountain";
  state.players.away.victoryPoints = 6;
  state.board.locations.city = ["ryuu", "opponent"];
  state.board.locations.mountain = ["away"];
  state.board.currentEvents.city = ["event.fuyuki.2"];
  state.board.eventVisibility["event.fuyuki.2"] = "up";

  const used = engine.execute(state, makeCommand(state, "ryuu-blasphemer", CommandType.UseSkill, "ryuu", {
    skillId: "master.ryuunosuke.skill.ascension",
    data: { abilityId: "blasphemer", x: 4 },
  }));

  assert.equal(used.state.players.ryuu.mana, 0);
  assert.deepEqual(used.state.board.currentEvents.city, []);
  assert.ok(used.state.board.eventDiscard.includes("event.fuyuki.2"));
  assert.equal(used.state.players.ryuu.flags.ryuunosukeBlasphemerX, 4);

  enqueuePassiveEffects(used.state, engine.passives, {
    eventId: "action-to-combat",
    type: "phase.transitioned",
    revision: used.state.revision,
    sourceCommandId: "test",
    payload: { previousPhase: "action", transition: "next-phase" },
  });
  engine.effects.drain(used.state, 1000, { ...engine.content.cards, ...engine.content.skills.asCardDefinitions() });

  assert.equal(used.state.players.opponent.flags.deploymentBonusActive, false);
  assert.equal(used.state.players.opponent.flags.deploymentBonus, 0);
  assert.equal(used.state.players.opponent.victoryPoints, 2);
  assert.equal(used.state.players.opponent.flags.roundPowerBonus, -8);
  assert.equal(used.state.players.away.victoryPoints, 6);
  assert.equal(used.state.players.ryuu.flags.ryuunosukeBlasphemerX, undefined);
});
