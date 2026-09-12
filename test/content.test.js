import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ContentRepository } from "../src/content/ContentRepository.js";
import { mergeContentPackages } from "../src/content/content-loader.js";

const content = JSON.parse(
  await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"),
);

test("旧版内容已完整进入稳定 ID 迁移仓库", () => {
  const repository = new ContentRepository(content);
  assert.equal(repository.list("masters").length, 68);
  assert.equal(repository.list("servants").length, 183);
  assert.equal(repository.require("master.tiamat").name, "提亚马特");
  assert.equal(repository.require("event-group.fuyuki").cards.length, 20);
  const lakshmi = repository.require("servant.lakshmibai");
  assert.equal(lakshmi.deck.length, 12);
  assert.equal(lakshmi.deck.includes("card.x-misfortune"), true);
  assert.equal(lakshmi.deck.includes("card.carda2"), false);
});

test("扩展包内不同集合不能复用同一稳定 ID", () => {
  const base = {};
  assert.throws(() => mergeContentPackages(base, {
    masters: [{ id: "master.new", skills: [{ id: "skill.same" }] }],
    cards: [{ id: "skill.same", name: "冲突" }],
  }), /CONTENT_ID_DUPLICATE:skill\.same/);
});

test("内容仓库返回副本，界面无法直接污染规则数据", () => {
  const repository = new ContentRepository(content);
  const tiamat = repository.require("master.tiamat");
  tiamat.name = "被界面修改";
  assert.equal(repository.require("master.tiamat").name, "提亚马特");
});

test("内容导入器从角色集合生成 3X 候选池", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const content = buildStandardContent({ masters: [{ id: "master.a" }], servants: [{ id: "servant.a", deck: [] }] });
  assert.deepEqual(content.threeXMasterPool, ["master.a"]);
  assert.deepEqual(content.threeXServantPool, ["servant.a"]);
});

test("内容导入器拒绝从者牌库中的未知卡牌引用", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  assert.throws(() => buildStandardContent({
    cards: [{ id: "card.known", name: "已知牌" }],
    servants: [{ id: "servant.invalid-deck", deck: ["card.missing"] }],
  }), /SERVANT_CARD_NOT_FOUND:servant.invalid-deck:card.missing/);
});

test("开发版技能卡会进入正式卡牌目录并关联技能定义", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent(content);
  const catalogCard = built.cards["card.skill.master.shirou-emiya.skill.s2"];
  assert.ok(catalogCard);
  assert.equal(catalogCard.cardType, "skill");
  assert.equal(catalogCard.ownerType, "master");
  assert.equal(catalogCard.ownerDefinitionId, "master.shirou-emiya");
  assert.equal(catalogCard.linkedSkillId, "master.shirou-emiya.skill.s2");
  assert.equal(catalogCard.implementation?.level, "FULL");
  assert.ok(Object.keys(built.cards).length >= 1037);
});

test("正式技能卡目录与技能定义共享同一份规则程序", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const raw = JSON.parse(await readFile(new URL("../src/content/generated/legacy-content.json", import.meta.url), "utf8"));
  const content = buildStandardContent(raw);
  const skill = content.skills.get("servant.benkei.skill.sc-benkei-3");
  const card = content.cards["card.skill.servant.benkei.skill.sc-benkei-3"];
  assert.ok(skill.ruleProgram);
  assert.ok(card.ruleProgram);
  assert.equal(card.ruleProgram.skillId, skill.ruleProgram.skillId);
  assert.deepEqual(card.ruleProgram.nodes, skill.ruleProgram.nodes);
});

test("批量导入保留开发版明确的出牌门槛、追加和单卡限制", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent(content);
  const byId = (id) => built.skills.get(id);

  // These constraints are copied from explicit card wording; they do not
  // imply that the remaining effect body has a FULL handler.
  assert.equal(byId("servant.sasaki.skill.sc-sasaki-1").requiresEightMana, false);
  assert.equal(byId("servant.muramasa.skill.sc-muramasa-1").singleCardPlay, true);
  assert.deepEqual(byId("servant.georgios.skill.sc-georgios-2").appendFromHand, { maxCount: 3, maxBasePower: 3 });
  assert.equal(byId("servant.illya.skill.sc-illya-4").limit, "once-per-round");
});

test("开发版明确的打出时抽牌会登记为结构化出牌触发", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent(content);
  for (const id of [
    "servant.georgios.skill.sc-georgios-2",
    "servant.lakshmibai.skill.sc-lakshmibai-4",
    "servant.parvati.skill.sc-parvati-2",
  ]) {
    assert.equal(built.skills.get(id).drawOnPlay, 1);
    assert.equal(built.cards[`card.skill.${id}`].drawOnPlay, 1);
    assert.equal(built.skills.get(id).supportLevel, "FULL");
  }
  assert.equal(built.skills.get("servant.lakshmibai.skill.sc-lakshmibai-4").returnToDeckOnDefeat, true);
  assert.equal(built.cards["card.skill.servant.lakshmibai.skill.sc-lakshmibai-4"].returnToDeckOnDefeat, true);
});

test("从者牌库校验拒绝非法结构与空卡牌ID，但允许同名复数", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  assert.throws(() => buildStandardContent({
    cards: [{ id: "card.known", name: "已知牌" }],
    servants: [{ id: "servant.bad-deck", deck: "card.known" }],
  }), /SERVANT_DECK_INVALID:servant\.bad-deck/);
  assert.throws(() => buildStandardContent({
    cards: [{ id: "card.known", name: "已知牌" }],
    servants: [{ id: "servant.bad-card", deck: [""] }],
  }), /SERVANT_DECK_CARD_ID_INVALID:servant\.bad-card/);
  const content = buildStandardContent({
    cards: [{ id: "card.known", name: "已知牌" }],
    servants: [{ id: "servant.copies", deck: ["card.known", "card.known"] }],
  });
  assert.deepEqual(content.playerDecks["servant.copies"], ["card.known", "card.known"]);
  assert.deepEqual(content.deckDefinitions["servant.copies"], {
    id: "servant.copies.deck",
    ownerDefinitionId: "servant.copies",
    cards: [{ definitionId: "card.known", count: 2 }],
  });
});

test("正式牌库定义校验归属、计数、重复项和卡牌引用", async () => {
  const { assertDeckDefinition, createDeckDefinition, expandDeckDefinition } = await import("../src/rules-core/deck-definitions.ts");
  const definitions = { "card.a": { id: "card.a", name: "甲", cost: 0, basePower: 1, typeLabel: "力量" } };
  const deck = createDeckDefinition("servant.example", ["card.a", "card.a"]);
  assert.deepEqual(expandDeckDefinition(deck), ["card.a", "card.a"]);
  assert.doesNotThrow(() => assertDeckDefinition(deck, definitions, "servant.example"));
  assert.throws(() => assertDeckDefinition({ ...deck, ownerDefinitionId: "servant.other" }, definitions, "servant.example"), /DECK_OWNER_MISMATCH/);
  assert.throws(() => assertDeckDefinition({ ...deck, cards: [{ definitionId: "card.a", count: 0 }] }, definitions), /DECK_CARD_COUNT_INVALID/);
  assert.throws(() => assertDeckDefinition({ ...deck, cards: [{ definitionId: "card.a", count: 1 }, { definitionId: "card.a", count: 1 }] }, definitions), /DECK_CARD_DUPLICATE/);
  assert.throws(() => assertDeckDefinition({ ...deck, cards: [{ definitionId: "card.missing", count: 1 }] }, definitions), /DECK_CARD_DEFINITION_NOT_FOUND/);
});

test("六张狂战士基础攻击按稳定ID导入结构化标签", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const berserkerIds = ["card.carda5", "card.carda6", "card.cardb5", "card.cardb6", "card.cardq5", "card.cardq6"];
  const built = buildStandardContent({
    cards: [
      ...berserkerIds.map((id) => ({ id, name: "显示名可变" })),
      { id: "card.normal", name: "狂战士字样不决定规则" },
    ],
  });
  for (const id of berserkerIds) assert.deepEqual(built.cards[id].tags, ["berserker-attack"]);
  assert.deepEqual(built.cards["card.normal"].tags, []);
});

test("标准内容包将943个技能全部装入注册表但只开放真实FULL能力", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const { StandardMatchEngine } = await import("../src/match-engine/standard-match-engine.ts");
  const built = buildStandardContent(content);
  assert.equal(built.skills.list().length, 943);
  new StandardMatchEngine(built);
  assert.equal(built.skills.list().length, 944);
  const levels = Object.groupBy(built.skills.list(), (skill) => skill.supportLevel);
  assert.equal((levels.FULL?.length ?? 0) + (levels.PARTIAL?.length ?? 0), 944);
  assert.equal(levels.MANUAL, undefined);
  assert.equal(levels.DISABLED, undefined);
  const sourceRefs = built.skills.list().flatMap((skill) => skill.sourceRefs ?? []);
  assert.equal(sourceRefs.length, 1886);
  assert.equal(sourceRefs.filter((ref) => ref.kind === "development-image").length, 943);
  assert.equal(sourceRefs.filter((ref) => ref.kind === "chm").length, 590);
  assert.equal(sourceRefs.filter((ref) => ref.kind === "legacy").length, 353);
  const full = built.skills.list().filter((skill) => skill.supportLevel === "FULL");
  const siegCommand = built.skills.get("master.sieg.skill.s1a");
  assert.equal(siegCommand.handlerId, "core.sieg-dragon-command-seal");
  assert.deepEqual(siegCommand.windows, ["action"]);
  assert.equal(built.skills.hasHandler(siegCommand.id), true);
  const blackMud = built.skills.get("master.sakura.skill.s3");
  assert.equal(blackMud.handlerId, "core.sakura-black-mud");
  assert.equal(blackMud.abilityCost, 2);
  assert.deepEqual(blackMud.windows, ["preparation"]);
  assert.equal(built.skills.hasHandler(blackMud.id), true);
  const conversion = built.skills.get("master.irisviel.skill.s2");
  assert.equal(conversion.handlerId, "core.irisviel-conversion-magic");
  assert.deepEqual(conversion.windows, ["outpost"]);
  const davinci = built.skills.get("servant.davinci.skill.sc-davinci-4");
  assert.equal(davinci.handlerId, "core.deploy-workshop-gain-mana");
  assert.deepEqual(davinci.passiveEventTypes, ["player.deployed"]);
  assert.equal(davinci.locationId, "workshop");
  assert.equal(davinci.manaGain, 1);
  const shinjiBook = built.skills.get("master.shinji.skill.s2");
  assert.equal(shinjiBook.handlerId, "core.shinji-book");
  assert.deepEqual(shinjiBook.passiveEventTypes, ["game.started"]);
  assert.equal(shinjiBook.addSkillDefinitionId, undefined);
  const shirouProjection = built.skills.get("master.shirou-emiya.skill.s2");
  assert.equal(shirouProjection.supportLevel, "FULL");
  assert.equal(shirouProjection.handlerId, "core.game-start-add-skill");
  assert.equal(shirouProjection.addSkillDefinitionId, "card.derived.master.shirou-emiya.ganjiang-moye");
  const shirouAscension = built.skills.get("master.shirou-emiya.skill.ascension");
  assert.equal(shirouAscension.supportLevel, "FULL");
  assert.equal(shirouAscension.handlerId, "core.card-play");
  assert.equal(shirouAscension.basicCardPowerBonus, 2);
  assert.deepEqual(shirouAscension.basicCardPowerBonusAttributes, ["力量", "迅捷"]);
  assert.deepEqual(shirouAscension.tags, ["ascension", "climax-total-power-plus-4"]);
  const shirouCard = built.cards["card.derived.master.shirou-emiya.ganjiang-moye"];
  assert.equal(shirouCard.name, "干将·莫邪");
  assert.equal(shirouCard.ownerDefinitionId, "master.shirou-emiya");
  assert.equal(shirouCard.requirement, undefined);
  assert.equal(shirouCard.requiresEightMana, true);
  const tokiomiElementalist = built.skills.get("master.tokiomi.skill.s1");
  assert.equal(tokiomiElementalist.handlerId, "core.tokiomi-elementalist");
  assert.deepEqual(tokiomiElementalist.passiveEventTypes, ["game.started", "attack.committed"]);
  const fireball = built.cards["card.derived.master.tokiomi.fireball"];
  assert.equal(fireball.name, "火炎弹");
  assert.equal(fireball.ownerDefinitionId, "master.tokiomi");
  assert.equal(fireball.typeLabel, "魔术");
  const zoukenCreator = built.skills.get("master.zouken.skill.s2");
  assert.equal(zoukenCreator.handlerId, "core.game-start-add-skill");
  assert.deepEqual(zoukenCreator.addSkillDefinitionIds, ["master.zouken.skill.s3", "master.zouken.skill.s4"]);
  for (const [id, mana] of [["master.shirou-emiya.skill.s1", 2], ["master.iliya.skill.s1", 6], ["master.taiga.skill.s1", 3]]) {
    const initialMana = built.skills.get(id);
    assert.equal(initialMana.handlerId, "core.master-initial-mana");
  assert.equal(initialMana.initialMana, mana);
  }
  for (const [id, target] of [
    ["master.bazett.skill.s1", "master.bazett.skill.s2"],
    ["master.ciel.skill.s1a", "master.ciel.skill.s2"],
    ["master.shiki-tohno.skill.s1", "master.shiki-tohno.skill.s2"],
    ["master.fujino.skill.s1", "master.fujino.skill.s3"],
  ]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, "core.game-start-add-skill");
    assert.equal(skill.addSkillDefinitionId, target);
    assert.deepEqual(skill.passiveEventTypes, ["game.started"]);
  }
  for (const [id, targets] of [
    ["master.fiore.skill.s1", ["master.fiore.skill.s2", "master.fiore.skill.s3", "master.fiore.skill.s4"]],
    ["master.caules-yggdmillennia.skill.s1", ["master.caules-yggdmillennia.skill.s2", "master.caules-yggdmillennia.skill.s3"]],
  ]) {
    const skill = built.skills.get(id);
    assert.equal(skill.supportLevel, "FULL");
    assert.equal(skill.handlerId, "core.game-start-add-skill");
    assert.deepEqual(skill.addSkillDefinitionIds, targets);
    assert.deepEqual(skill.passiveEventTypes, ["game.started"]);
  }
  const nanaya = built.skills.get("master.shiki-nanaya.skill.s1");
  assert.equal(nanaya.supportLevel, "FULL");
  assert.equal(nanaya.addSkillDefinitionId, "master.shiki-nanaya.skill.s2");
  const sionAscension = built.skills.get("master.sion.skill.ascension");
  assert.equal(sionAscension.supportLevel, "FULL");
  assert.equal(sionAscension.handlerId, "core.game-start-add-skill");
  assert.deepEqual(sionAscension.passiveEventTypes, ["card.played"]);
  assert.deepEqual(sionAscension.addSkillDefinitionIds, [
    "master.sion.skill.s5",
    "master.sion.skill.s6",
    "master.sion.skill.s7",
    "master.sion.skill.s8",
    "master.sion.skill.s10",
    "master.sion.skill.s11",
  ]);
  const kireiOverseer = built.skills.get("master.kirei.skill.s2");
  assert.equal(kireiOverseer.supportLevel, "FULL");
  assert.equal(kireiOverseer.handlerId, "core.structured-skill");
  assert.equal(kireiOverseer.rules?.schemaVersion, "fd-card-authoring-v1");
  assert.deepEqual(kireiOverseer.abilities?.map((ability) => ability.id), ["overseer-info", "neutral-move"]);
  const teslaNoblePhantasm = built.skills.get("servant.tesla.skill.sc-tesla-3");
  assert.equal(teslaNoblePhantasm.supportLevel, "FULL");
  assert.equal(teslaNoblePhantasm.handlerId, "core.structured-skill");
  assert.deepEqual(teslaNoblePhantasm.passiveEventTypes, ["card.played"]);
  assert.deepEqual(teslaNoblePhantasm.rules?.abilities.map((ability) => ability.id), ["play-shock", "combat-shock"]);
  const sionBattleContinuationEx = built.skills.get("master.sion.skill.s6");
  assert.equal(sionBattleContinuationEx.supportLevel, "FULL");
  assert.equal(sionBattleContinuationEx.handlerId, "core.structured-skill");
  assert.deepEqual(sionBattleContinuationEx.rules?.abilities.map((ability) => ability.id), ["hunt"]);
  const caulesBattery = built.skills.get("master.caules-yggdmillennia.skill.s2");
  assert.equal(caulesBattery.supportLevel, "FULL");
  assert.equal(caulesBattery.handlerId, "core.structured-skill");
  assert.deepEqual(caulesBattery.abilities?.map((ability) => ability.id), ["charge", "start-thunder"]);
  assert.deepEqual(caulesBattery.rules?.abilities.map((ability) => ability.id), ["charge", "start-thunder"]);
  const kiritsuguAscension = built.skills.get("master.kiritsugu.skill.ascension");
  assert.equal(kiritsuguAscension.supportLevel, "FULL");
  assert.equal(kiritsuguAscension.handlerId, "core.structured-skill");
  assert.deepEqual(kiritsuguAscension.passiveEventTypes, ["card.played"]);
  assert.deepEqual(kiritsuguAscension.rules?.abilities.map((ability) => ability.id), ["unlock-origin-bullets"]);
  const frankThunderTree = built.skills.get("servant.frank.skill.sc-frank-3");
  assert.equal(frankThunderTree.supportLevel, "FULL");
  assert.equal(frankThunderTree.handlerId, "core.structured-skill");
  assert.deepEqual(frankThunderTree.passiveEventTypes, ["card.played"]);
  assert.deepEqual(frankThunderTree.rules?.abilities.map((ability) => ability.id), ["death-and-rebirth", "next-round-defeat-self"]);
  const caulesElectricTheory = built.skills.get("master.caules-yggdmillennia.skill.s1a");
  assert.equal(caulesElectricTheory.supportLevel, "FULL");
  assert.equal(caulesElectricTheory.handlerId, "core.structured-skill");
  assert.deepEqual(caulesElectricTheory.passiveEventTypes, ["game.started", "round.ended"]);
  const fujinoMysticEyes = built.skills.get("master.fujino.skill.s3");
  assert.equal(fujinoMysticEyes.supportLevel, "FULL");
  assert.equal(fujinoMysticEyes.handlerId, "core.fujino-injury-warp");
  assert.equal(fujinoMysticEyes.standardAppend, true);
  assert.deepEqual(fujinoMysticEyes.rules?.abilities.map((ability) => ability.id), ["distortion-append", "bend-space"]);
  const rinGem = built.skills.get("master.rin.skill.s3");
  assert.equal(rinGem.supportLevel, "FULL");
  assert.equal(rinGem.handlerId, "core.rin-gem");
  assert.equal(rinGem.limit, undefined);
  assert.deepEqual(rinGem.rules?.abilities.map((ability) => ability.id), ["gem-option"]);
  const illyaManaSlash = built.skills.get("servant.illya.skill.sc-illya-2");
  assert.equal(illyaManaSlash.supportLevel, "FULL");
  assert.equal(illyaManaSlash.handlerId, "core.structured-skill");
  assert.equal(illyaManaSlash.requiresEightMana, false);
  assert.deepEqual(illyaManaSlash.passiveEventTypes, ["card.played"]);
  const maxwellProof = built.skills.get("servant.maxwell.skill.sc-maxwell-2");
  assert.equal(maxwellProof.supportLevel, "FULL");
  assert.equal(maxwellProof.handlerId, "core.structured-skill");
  assert.equal(maxwellProof.requiresEightMana, false);
  assert.deepEqual(maxwellProof.abilities?.map((ability) => ability.id), ["paradox-seed", "paradox-collapse"]);
  assert.equal(maxwellProof.abilities?.find((ability) => ability.id === "paradox-collapse")?.revealsTrueNameOnSkillUse, true);
  const artoriaSelectionStaff = built.skills.get("servant.artoriac.skill.sc-artoriac-2");
  assert.equal(artoriaSelectionStaff.supportLevel, "FULL");
  assert.equal(artoriaSelectionStaff.handlerId, "core.structured-skill");
  assert.deepEqual(artoriaSelectionStaff.rules?.abilities.map((ability) => ability.id), ["selection-staff"]);
  const shakespeareCurtain = built.skills.get("servant.shakespeare.skill.sc-shakespeare-3");
  assert.equal(shakespeareCurtain.supportLevel, "FULL");
  assert.equal(shakespeareCurtain.handlerId, "core.structured-skill");
  assert.deepEqual(shakespeareCurtain.rules?.abilities.map((ability) => ability.id), ["tragedy-writing"]);
  const leonidasRoar = built.skills.get("servant.leonidas.skill.sc-leonidas-2");
  assert.equal(leonidasRoar.supportLevel, "FULL");
  assert.equal(leonidasRoar.handlerId, "core.structured-skill");
  assert.deepEqual(leonidasRoar.rules?.abilities.map((ability) => ability.id), ["warrior-roar", "warrior-roar-next-round"]);
  const astraeaJudgment = built.skills.get("servant.astraea.skill.sc-astraea-1");
  assert.equal(astraeaJudgment.supportLevel, "FULL");
  assert.equal(astraeaJudgment.handlerId, "core.structured-skill");
  assert.deepEqual(astraeaJudgment.rules?.abilities.map((ability) => ability.id), ["judgment-time"]);
  const dariusSoldier = built.skills.get("servant.darius.skill.sc-darius-4");
  assert.equal(dariusSoldier.supportLevel, "FULL");
  assert.equal(dariusSoldier.handlerId, "core.structured-skill");
  assert.deepEqual(dariusSoldier.passiveEventTypes, ["combat.resolved"]);
  assert.deepEqual(dariusSoldier.rules?.abilities.map((ability) => ability.id), ["undead-soldier-half-close"]);
  const hassanPoisonBody = built.skills.get("servant.hassanser.skill.sc-hassanser-2");
  assert.equal(hassanPoisonBody.supportLevel, "FULL");
  assert.equal(hassanPoisonBody.handlerId, "core.structured-skill");
  assert.deepEqual(hassanPoisonBody.rules?.abilities.map((ability) => ability.id), ["poison-gas", "wither", "death-kiss"]);
  const hakunoCcc = built.skills.get("master.hakuno-f.skill.s3");
  assert.equal(hakunoCcc.supportLevel, "FULL");
  assert.equal(hakunoCcc.handlerId, "core.hakuno-f-mystic-code");
  assert.deepEqual(hakunoCcc.passiveEventTypes, ["combat.resolved"]);
  assert.deepEqual(hakunoCcc.rules?.abilities.map((ability) => ability.id), ["data-leak", "cc-hack"]);
  const scathachSpear = built.skills.get("servant.scathach.skill.sc-scathach-2");
  assert.equal(scathachSpear.supportLevel, "FULL");
  assert.equal(scathachSpear.handlerId, "core.structured-skill");
  assert.deepEqual(scathachSpear.passiveEventTypes, ["combat.resolved"]);
  assert.deepEqual(scathachSpear.rules?.abilities.map((ability) => ability.id), ["piercing-spear-close", "death-omen"]);
  const boudicaNoSword = built.skills.get("servant.boudica.skill.sc-boudica-2");
  assert.equal(boudicaNoSword.supportLevel, "FULL");
  assert.equal(boudicaNoSword.handlerId, "core.structured-skill");
  assert.deepEqual(boudicaNoSword.passiveEventTypes, ["combat.resolved", "round.ended"]);
  assert.deepEqual(boudicaNoSword.rules?.abilities.map((ability) => ability.id), [
    "lost-combat-penalty",
    "oathless-sword",
    "oathless-sword-win",
    "oathless-sword-no-win",
    "oathless-sword-cleanup",
  ]);
  assert.deepEqual(full.filter((skill) => !built.skills.hasHandler(skill.id)), []);
  assert.deepEqual(built.skills.list().filter((skill) => skill.supportLevel !== "FULL" && built.skills.hasHandler(skill.id)), []);
});

test("技能注册表导出的正式技能卡契约保留归属、窗口、来源和实现等级", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent(content);
  const cards = built.skills.asCardDefinitions();
  const skills = built.skills.list();
  assert.equal(Object.keys(cards).length, skills.length);
  for (const skill of skills) {
    const card = cards[skill.id];
    assert.ok(card, `missing card contract for ${skill.id}`);
    assert.equal(card.cardType, skill.materializedCardType ?? "skill");
    assert.equal(card.ownerType, skill.ownerType);
    assert.equal(card.ownerDefinitionId, skill.ownerId);
    assert.equal(card.linkedSkillId, skill.id);
    assert.deepEqual(card.phases ?? [], skill.cardAbilityPhases ?? []);
    assert.deepEqual(card.ruleProgram?.windows ?? [], skill.windows);
    assert.equal(card.implementation?.level, skill.supportLevel);
    assert.equal(card.implementation?.handlerId, skill.handlerId);
    assert.deepEqual(card.sourceRefs ?? [], skill.sourceRefs ?? []);
    const catalog = built.cards[`card.skill.${skill.id}`];
    assert.ok(catalog, `missing catalog card for ${skill.id}`);
    assert.equal(catalog.linkedSkillId, skill.id);
    assert.equal(catalog.implementation?.level, skill.supportLevel);
    assert.equal(catalog.implementation?.handlerId, skill.handlerId);
    assert.equal(catalog.ownerDefinitionId, skill.ownerId);
  }
});

test("正式技能卡契约保留结构化效果片段", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const [skill] = buildSkillDefinitions({ servants: [{ id: "servant.effect", skills: [{ id: "skill.effect", name: "效果", text: "抽2张牌。" }] }] });
  assert.deepEqual(skill.effects, [{ kind: "draw-cards", count: 2 }]);
  assert.deepEqual(skill.unparsedEffects, []);
});

test("内容包校验事件组内的事件卡 ID", () => {
  const base = { eventGroups: [] };
  const validCards = Array.from({ length: 20 }, (_, index) => ({ id: `event.new.${index + 1}` }));
  const valid = mergeContentPackages(base, { eventGroups: [{ id: "event-group.new", name: "新组", cards: validCards }] });
  assert.equal(valid.eventGroups[0].cards[0].id, "event.new.1");
  const duplicateCards = Array.from({ length: 19 }, (_, index) => ({ id: `event.duplicate.${index + 1}` }));
  duplicateCards.push({ id: "event.duplicate.1" });
  assert.throws(() => mergeContentPackages(base, { eventGroups: [{ id: "event-group.bad", name: "坏组", cards: duplicateCards }] }), /EVENT_GROUP_CARD_DUPLICATE/);
  assert.throws(() => mergeContentPackages(base, { eventGroups: [{ id: "event-group.bad-shape", name: "坏组", cards: "not-array" }] }), /EVENT_GROUP_CARDS_INVALID/);
});

test("内容包校验拒绝非法集合、局势和事件组结构", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({
    situations: "bad",
    eventGroups: [{ id: "event-group.test", cards: [{ id: "event.valid" }, { id: "event.valid" }] }],
  });
  assert.ok(errors.includes("CONTENT_COLLECTION_INVALID:situations"));
  assert.ok(errors.includes("EVENT_GROUP_CARD_DUPLICATE:event-group.test:event.valid"));
});

test("作者内容入口要求从者牌库为12张合法卡牌ID", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const invalidShape = validateAuthoredPackage({ servants: [{ id: "servant.bad-shape", name: "测试", image: "servant.png", deck: "card.attack" }] });
  assert.ok(invalidShape.includes("SERVANT_DECK_INVALID:servant.bad-shape"));
  const invalidDeck = validateAuthoredPackage({ servants: [{ id: "servant.bad-deck", name: "测试", image: "servant.png", deck: ["bad id"] }] });
  assert.ok(invalidDeck.includes("SERVANT_DECK_SIZE:servant.bad-deck"));
  assert.ok(invalidDeck.includes("SERVANT_DECK_CARD_ID_INVALID:servant.bad-deck"));

  const cards = Array.from({ length: 12 }, (_, index) => ({ id: `card.authored.${index + 1}`, name: `牌${index + 1}` }));
  const validDeck = cards.map((card) => card.id);
  assert.deepEqual(validateAuthoredPackage({ servants: [{ id: "servant.valid-deck", name: "测试", image: "servant.png", deck: validDeck }] })
    .filter((error) => error.startsWith("SERVANT_DECK_")), []);

  const base = { cards };
  assert.throws(() => mergeContentPackages(base, { servants: [{ id: "servant.short-deck", deck: validDeck.slice(0, 11) }] }), /SERVANT_DECK_SIZE/);
  assert.doesNotThrow(() => mergeContentPackages(base, { servants: [{ id: "servant.full-deck", deck: validDeck }] }));
});

test("事件组必须包含恰好20张事件卡", () => {
  const base = { eventGroups: [] };
  assert.throws(() => mergeContentPackages(base, { eventGroups: [{ id: "event-group.short", name: "短组", cards: [{ id: "event.short" }] }] }), /EVENT_GROUP_CARD_COUNT_INVALID/);
});

test("文明废墟校验结构化名称、战果和属性字段", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ civilizationRuins: [
    { id: "ruin.bad", name: 7, victoryPoints: "未知", typeLabel: 3, text: { bad: true } },
  ] });
  assert.ok(errors.includes("CIVILIZATION_RUIN_NAME_INVALID:ruin.bad"));
  assert.ok(errors.includes("CIVILIZATION_RUIN_VICTORY_POINTS_INVALID:ruin.bad"));
  assert.ok(errors.includes("CIVILIZATION_RUIN_TYPE_INVALID:ruin.bad"));
  assert.ok(errors.includes("CIVILIZATION_RUIN_TEXT_INVALID:ruin.bad"));
});

test("技能定义拒绝未知支持等级、激活类型和阶段窗口", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ masters: [{ id: "master.skill-validation", name: "测试御主", image: "master.png", skills: [{ id: "skill.validation", name: "测试", text: "", image: "skill.png", implementation: "FULL", activation: { kind: "unknown", windows: ["action", 3] } }] }] });
  assert.ok(errors.includes("SKILL_IMPLEMENTATION_INVALID:skill.validation"));
  assert.ok(errors.includes("SKILL_ACTIVATION_INVALID:skill.validation"));
  assert.ok(errors.includes("SKILL_WINDOWS_INVALID:skill.validation"));
});

test("真名结构字段只接受布尔值且内容卡保留打出触发", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ masters: [{
    id: "master.true-name-fields", name: "测试御主", image: "master.png",
    skills: [{ id: "skill.true-name-fields", name: "测试", text: "", image: "skill.png", revealsTrueNameOnPlay: "yes", revealsTrueNameOnSkillUse: 1 }],
  }] });
  assert.ok(errors.includes("SKILL_BOOLEAN_FIELD_INVALID:skill.true-name-fields:revealsTrueNameOnPlay"));
  assert.ok(errors.includes("SKILL_BOOLEAN_FIELD_INVALID:skill.true-name-fields:revealsTrueNameOnSkillUse"));

  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({ cards: [{ id: "card.true-name", name: "真名牌", revealsTrueNameOnPlay: true }] });
  assert.equal(built.cards["card.true-name"].revealsTrueNameOnPlay, true);
});

test("内容校验拒绝未知结构化卡牌属性", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ cards: [{ id: "card.invalid-attribute", name: "测试", image: "card.png", attributes: ["防御"] }] });
  assert.ok(errors.includes("CARD_ATTRIBUTES_INVALID:card.invalid-attribute"));
  const skillErrors = validateAuthoredPackage({ masters: [{ id: "master.attribute-test", name: "测试御主", image: "master.png", skills: [{ id: "skill.attribute-test", name: "测试", text: "", image: "skill.png", attributes: ["未知"] }] }] });
  assert.ok(skillErrors.includes("SKILL_ATTRIBUTES_INVALID:skill.attribute-test"));
});

test("内容导入器将卡牌属性规范化为 canonical 值", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({ cards: [{ id: "card.attribute-normalized", name: "属性", attributes: ["敏捷", "魔法", "宝具"] }] });
  assert.deepEqual(built.cards["card.attribute-normalized"].attributes, ["迅捷", "魔术", "宝具"]);
  assert.throws(() => buildStandardContent({ cards: [{ id: "card.attribute-invalid", name: "属性", attributes: ["防御"] }] }), /CARD_ATTRIBUTE_INVALID/);
});

test("局势牌禁用属性使用同一 canonical 规则并拒绝未知值", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({ situations: [{ id: "situation.attribute-lock", mana: 1, forbiddenAttributes: ["敏捷", "魔法"] }] });
  assert.deepEqual(built.situations[0].forbiddenAttributes, ["迅捷", "魔术"]);
  assert.throws(() => buildStandardContent({ situations: [{ id: "situation.attribute-invalid", mana: 1, forbiddenAttributes: ["防御"] }] }), /CARD_ATTRIBUTE_INVALID/);
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  assert.ok(validateAuthoredPackage({ situations: [{ id: "situation.schema-invalid", mana: 1, forbiddenAttributes: ["防御"] }] }).includes("SITUATION_ATTRIBUTES_INVALID:situation.schema-invalid"));
});

test("技能导入保留结构化属性与 handlerId", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const [skill] = buildSkillDefinitions({ servants: [{ id: "servant.content", skills: [{ id: "skill.content", name: "技能", attributes: ["敏捷", "魔法"], handlerId: "handler.content", activation: { kind: "phase", windows: ["combat"] }, implementation: "pending" }] }] });
  assert.deepEqual(skill.attributes, ["迅捷", "魔术"]);
  assert.equal(skill.handlerId, "handler.content");
  assert.equal(skill.supportLevel, "PARTIAL");
});

test("英文版从者技能自动附带可追溯的 CHM 来源，未映射角色不猜来源", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const [mapped] = buildSkillDefinitions({ servants: [{ id: "servant.musashi", skills: [{ id: "skill.source.mapped", name: "技能", text: "" }] }] });
  assert.deepEqual(mapped.sourceRefs, [{
    kind: "chm",
    document: "FD全卡图鉴V2.0.chm",
    category: "servant/english",
    page: "宫本武藏1.htm",
    locator: "从者/剑士/英文版/宫本武藏1.htm",
  }]);
  const [unmapped] = buildSkillDefinitions({ servants: [{ id: "servant.albion", skills: [{ id: "skill.source.unmapped", legacyId: "legacy-1", name: "待核对", text: "" }] }] });
  assert.deepEqual(unmapped.sourceRefs, [{ kind: "legacy", document: "legacy-content.json", locator: "servant/servant.albion/legacy-1" }]);
});

test("技能来源引用结构校验拒绝伪造 CHM 分类", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  const errors = validateAuthoredPackage({ masters: [{ id: "master.source", name: "测试", image: "master.png", skills: [{ id: "skill.source.bad", name: "技能", text: "", image: "skill.png", sourceRefs: [{ kind: "chm", document: "other.chm", category: "servant/chinese", page: "x.htm" }] }] }] });
  assert.ok(errors.includes("SKILL_SOURCE_REF_INVALID:skill.source.bad"));
});

test("技能导入保留显式空属性，不回退到展示标签", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const [skill] = buildSkillDefinitions({ masters: [{ id: "master.empty-attributes", skills: [{ id: "skill.empty-attributes", name: "技能", typeLabel: "宝具", attributes: [], activation: { kind: "phase", windows: ["action"] }, implementation: "pending" }] }] });
  assert.deepEqual(skill.attributes, []);
});

test("已确认的无限剑制按稳定ID使用特殊属性和正确真名触发", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const ids = [
    "servant.emiya.skill.sc-emiya-np",
    "servant.chloe.skill.sc-chloe-1",
    "servant.emiya-alt.skill.sc-emiya-alt-2",
  ];
  const skills = buildSkillDefinitions({ servants: ids.map((id, index) => ({
    id: "servant.test-" + index,
    skills: [{ id, name: "展示名称不参与规则", typeLabel: "宝具", activation: { kind: "play", windows: ["action"] }, implementation: "pending" }],
  })) });
  assert.deepEqual(skills.map((skill) => skill.attributes), [["特殊"], ["特殊"], ["特殊"]]);
  assert.deepEqual(skills.map((skill) => skill.requiresTrueName), [undefined, undefined, undefined]);
  assert.deepEqual(skills.map((skill) => skill.revealsTrueNameOnPlay), [true, true, false]);
  assert.deepEqual(skills.map((skill) => skill.supportLevel), ["FULL", "FULL", "FULL"]);
});

test("纯牌库攻击技能保留确认的共享或专用处理器并保留每局限制", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const definitions = buildSkillDefinitions({
    masters: content.masters
      .filter((master) => master.id === "master.kuzuki" || master.id === "master.rin")
      .map((master) => ({
        id: master.id,
        skills: (master.skills ?? []).filter((skill) =>
          skill.id === "master.kuzuki.skill.s3" || skill.id === "master.rin.skill.s4"),
      })),
    servants: content.servants
      .filter((servant) => servant.id === "servant.mandricardo")
      .map((servant) => ({
        id: servant.id,
        skills: (servant.skills ?? []).filter((skill) => skill.id === "servant.mandricardo.skill.sc-mandricardo-2"),
      })),
  });
  assert.equal(definitions.length, 3);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.equal(definitions.find((skill) => skill.id === "master.kuzuki.skill.s3")?.handlerId, "core.card-play");
  assert.equal(definitions.find((skill) => skill.id === "master.rin.skill.s4")?.handlerId, "core.card-play");
  assert.equal(definitions.find((skill) => skill.id === "servant.mandricardo.skill.sc-mandricardo-2")?.handlerId, "core.mandricardo-instant-strike");
  assert.equal(definitions.find((skill) => skill.id === "master.kuzuki.skill.s3")?.limit, undefined);
  assert.equal(definitions.find((skill) => skill.id === "master.rin.skill.s4")?.limit, "once-per-game");
});

test("真名解放标记优先使用确认结构，旧内容仅对独立前缀做迁移推断", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const definitions = buildSkillDefinitions(content);
  const prefixed = definitions.filter((skill) => /^\s*【真名解放】/.test(skill.text));
  const unresolvedMentions = definitions.filter((skill) => !skill.revealsTrueNameOnPlay && !skill.revealsTrueNameOnSkillUse && skill.text.includes("【真名解放】"));
  assert.ok(prefixed.every((skill) => skill.revealsTrueNameOnPlay || skill.revealsTrueNameOnSkillUse));
  assert.ok(unresolvedMentions.every((skill) => !/^\s*【真名解放】/.test(skill.text)));
  assert.equal(definitions.find((skill) => skill.id === "servant.danzou.skill.sc-danzou-2")?.revealsTrueNameOnPlay, true);
  assert.equal(definitions.find((skill) => skill.id === "servant.valkyrie.skill.sc-valkyrie-1")?.revealsTrueNameOnSkillUse, true);
});

test("十三张同规则战斗续行共享确认处理器且全部达到FULL", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedBattleContinuationSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedBattleContinuationSkillIds.map((id) => ({
    id: ownersBySkill.get(id),
    skills: [rawById.get(id)],
  })) });
  assert.equal(definitions.length, 13);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.move-to-non-workshop"));
  assert.ok(definitions.every((skill) => skill.windows.length === 1 && skill.windows[0] === "action"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
});

test("十一张同规则单独行动共享确认处理器且全部达到FULL", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedIndependentActionSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedIndependentActionSkillIds.map((id) => ({
    id: ownersBySkill.get(id),
    skills: [rawById.get(id)],
  })) });
  assert.equal(definitions.length, 11);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.independent-action"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
});

test("十二张同规则阵地建造使用残留触发和结构化动态费用", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedTerritoryCreationSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedTerritoryCreationSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 12);
  assert.ok(definitions.every((skill) => skill.activation === "residual"));
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.territory-creation"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
  assert.ok(definitions.every((skill) => JSON.stringify(skill.costRule) === JSON.stringify({ kind: "round-linear", base: 16, perRound: -2, min: 0 })));
});

test("十二张气息遮断共享战力结算后响应处理器并限制为每回合一次", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedPresenceConcealmentSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedPresenceConcealmentSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 12);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.presence-concealment"));
  assert.ok(definitions.every((skill) => skill.activation === "phase"));
  assert.ok(definitions.every((skill) => JSON.stringify(skill.steps) === JSON.stringify(["post-power-response"])));
  assert.ok(definitions.every((skill) => skill.limit === "once-per-round"));
  const jekyll = definitions.find((skill) => skill.id === "servant.jekyll.skill.sc-jekyll-3");
  assert.equal(jekyll?.ownerId, "servant.jekyll");
  assert.equal(jekyll?.text.includes("战力结算后"), true);
});

test("内容校验接受技能卡关联字段并拒绝非法关联", async () => {
  const { validateAuthoredPackage } = await import("../src/content/content-schema.js");
  assert.deepEqual(validateAuthoredPackage({
    masters: [], servants: [], situations: [], eventGroups: [], civilizationRuins: [],
    cards: [{
      id: "card.skill.example",
      name: "示例技能",
      image: "images/cards/example.png",
      cardType: "skill",
      ownerType: "master",
      linkedSkillId: "master.example.skill.s1",
      implementation: { level: "PARTIAL" },
    }],
  }), []);
  assert.ok(validateAuthoredPackage({
    cards: [{
      id: "card.skill.bad",
      name: "非法技能",
      image: "images/cards/example.png",
      linkedSkillId: "bad",
      implementation: { level: "UNKNOWN" },
    }],
  }).some((error) => error.startsWith("CARD_LINKED_SKILL_ID_INVALID")));
});

test("开局加入牌库的能力保留正式卡牌目标、数量和处理器", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.kuzuki");
  const [skill] = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "master.kuzuki.skill.s1")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.game-start-add-deck-cards");
  assert.equal(skill.addCardDefinitionId, "card.skill.master.kuzuki.skill.s3");
  assert.equal(skill.addCardCount, 2);
  assert.deepEqual(skill.passiveEventTypes, ["game.started"]);
});

test("达芬奇令咒牌的确定性出牌效果达到FULL", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.davinci");
  const [skill] = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [raw.skills.find((item) => item.id === "servant.davinci.skill.sc-davinci-8")] }] });
  assert.equal(skill.supportLevel, "FULL");
  assert.equal(skill.handlerId, "core.card-play");
  assert.deepEqual(skill.effects, [{ kind: "restore-command-seal", amount: 1 }]);
  assert.deepEqual(skill.unparsedEffects, []);
});

test("十四张骑乘共享追加出牌与打出抽牌处理器", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedRidingSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedRidingSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 14);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.riding"));
  assert.ok(definitions.every((skill) => skill.activation === "phase"));
  assert.ok(definitions.every((skill) => skill.limit === "once-per-round"));
  assert.ok(definitions.every((skill) => skill.playDrawIfWithBasicAttack === 1));
  assert.ok(definitions.every((skill) => JSON.stringify(skill.appendFromHand) === JSON.stringify({ maxCount: 3, maxBasePower: 3 })));
});

test("十二张对魔力拆分为两个独立的结构化战斗效果", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const { confirmedSaberMagicResistanceSkillIds } = await import("../src/content/confirmed-skill-overrides.ts");
  const rawSkills = content.servants.flatMap((servant) => servant.skills ?? []);
  const rawById = new Map(rawSkills.map((skill) => [skill.id, skill]));
  const ownersBySkill = new Map(content.servants.flatMap((servant) => (servant.skills ?? []).map((skill) => [skill.id, servant.id])));
  const definitions = buildSkillDefinitions({ servants: confirmedSaberMagicResistanceSkillIds.map((id) => ({ id: ownersBySkill.get(id), skills: [rawById.get(id)] })) });
  assert.equal(definitions.length, 12);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.saber-magic-resistance"));
  assert.ok(definitions.every((skill) => skill.requiresActiveCard === true));
  assert.ok(definitions.every((skill) => skill.abilities?.map((ability) => ability.id).join(",") === "noble-bloom,magic-resistance"));
  assert.ok(definitions.every((skill) => skill.abilities?.every((ability) => ability.limit === "once-per-round" && ability.windows[0] === "combat")));
  assert.ok(definitions.every((skill) => skill.abilities?.find((ability) => ability.id === "noble-bloom")?.requiresActiveCard === false));
  assert.ok(definitions.every((skill) => skill.abilities?.find((ability) => ability.id === "magic-resistance")?.requiresActiveCard === true));
});

test("金时两张黄金冲击保留无视8魔力与局势禁用的结构化例外", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const definitions = buildSkillDefinitions({ servants: content.servants
    .filter((servant) => servant.id === "servant.kintoki")
    .map((servant) => ({ id: servant.id, skills: (servant.skills ?? []).filter((skill) => skill.id.endsWith("sc-kintoki-1") || skill.id.endsWith("sc-kintoki-2")) })) });
  assert.equal(definitions.length, 2);
  assert.ok(definitions.every((skill) => skill.supportLevel === "FULL"));
  assert.ok(definitions.every((skill) => skill.handlerId === "core.card-play"));
  assert.ok(definitions.every((skill) => skill.requiresEightMana === false));
  assert.ok(definitions.every((skill) => skill.ignoresSituationRestrictions === true));
  assert.ok(definitions.every((skill) => skill.revealsTrueNameOnPlay === true));
  assert.ok(definitions.every((skill) => skill.limit === "once-per-game"));
});

test("每局两次或三次不会被错误推断为每局一次", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const definitions = buildSkillDefinitions({ masters: [{ id: "master.test", skills: [
    { id: "master.test.skill.twice", name: "两次", text: "<每局游戏限两次>", implementation: "pending", activation: { kind: "active", windows: ["action"] } },
    { id: "master.test.skill.thrice", name: "三次", text: "<每局游戏限三次>", implementation: "pending", activation: { kind: "active", windows: ["action"] } },
    { id: "master.test.skill.once", name: "一次", text: "<每局游戏限一次>", implementation: "pending", activation: { kind: "active", windows: ["action"] } },
  ] }] });
  assert.equal(definitions.find((skill) => skill.id.endsWith("twice"))?.limit, "twice-per-game");
  assert.equal(definitions.find((skill) => skill.id.endsWith("thrice"))?.limit, undefined);
  assert.equal(definitions.find((skill) => skill.id.endsWith("once"))?.limit, "once-per-game");
});

test("肯尼斯双重御主登记为开局被动并绑定8魔力豁免处理器", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.kayneth");
  const definitions = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((skill) => skill.id === "master.kayneth.skill.s1")] }] });
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].activation, "passive");
  assert.equal(definitions[0].supportLevel, "FULL");
  assert.equal(definitions[0].handlerId, "core.skill-eight-mana-waiver");
});

test("韦伯战略部署保留结构化能力费用、抽牌数量和处理器", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.waver");
  const definitions = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [raw.skills.find((skill) => skill.id === "master.waver.skill.s2")] }] });
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].activation, "phase");
  assert.deepEqual(definitions[0].windows, ["outpost"]);
  assert.equal(definitions[0].abilityCost, 1);
  assert.equal(definitions[0].drawCount, 2);
  assert.equal(definitions[0].supportLevel, "FULL");
  assert.equal(definitions[0].handlerId, "core.pay-mana-draw");
});

test("内容包保留御主初始魔力配置", async () => {
  const { buildStandardContent } = await import("../src/content/content-package.ts");
  const built = buildStandardContent({
    masters: [{ id: "master.shirou", initialMana: 2 }, { id: "master.illya", initialMana: 6 }, { id: "master.default" }],
  });
  assert.deepEqual(built.masterInitialMana, { "master.shirou": 2, "master.illya": 6 });
});

test("慎二吸魔命令保留进入深山町被动的结构化位置与魔力值", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.masters.find((master) => master.id === "master.shinji");
  const skill = raw.skills.find((item) => item.id === "master.shinji.skill.s1");
  const definitions = buildSkillDefinitions({ masters: [{ id: raw.id, skills: [skill] }] });
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0].activation, "passive");
  assert.equal(definitions[0].handlerId, "core.enter-location-gain-mana");
  assert.equal(definitions[0].locationId, "mountain");
  assert.equal(definitions[0].manaGain, 1);
  assert.equal(definitions[0].supportLevel, "FULL");
});

test("规则明确的低于8魔力出牌例外写入卡牌结构", async () => {
  const { buildSkillDefinitions } = await import("../src/content/skill-package.ts");
  const raw = content.servants.find((servant) => servant.id === "servant.parvati");
  const skill = raw.skills.find((item) => item.id === "servant.parvati.skill.sc-parvati-2");
  const definitions = buildSkillDefinitions({ servants: [{ id: raw.id, skills: [skill] }] });
  assert.equal(definitions[0].requiresEightMana, false);
  assert.equal(definitions[0].supportLevel, "FULL");
});
