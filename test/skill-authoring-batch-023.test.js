import test from "node:test";
import assert from "node:assert/strict";
import content from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

function command(state, id, type, actorId, payload = {}) {
  return { commandId: id, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("batch023 Sion Avenger EX pays exactly two VP and only offers legally playable discard cards", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch023-sion-avenger", players: [{ id: "sion", name: "Sion" }], seed: 2301 });
  state.status = "playing"; state.round = 3; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion"; state.players.sion.victoryPoints = 3; state.players.sion.mana = 1;
  createOwnedCardInstance(state, "sion", { instanceId: "sion-avenger-source", definitionId: "master.sion.skill.s13", zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "sion", { instanceId: "cheap", definitionId: "card.cardb4", zone: "discard", face: "up", active: false });
  createOwnedCardInstance(state, "sion", { instanceId: "expensive", definitionId: "card.cardb6", zone: "discard", face: "up", active: false });

  const opened = engine.execute(state, command(state, "sion-avenger-open", CommandType.UseSkill, "sion", { skillId: "master.sion.skill.s13", data: { abilityId: "avenger-ex-blazing-grudge" } }));
  assert.equal(opened.state.players.sion.victoryPoints, 1);
  assert.deepEqual(opened.state.pendingDecision?.options.map((option) => option.id), ["cheap"]);

  const resolved = engine.execute(opened.state, command(opened.state, "sion-avenger-resolve", CommandType.ResolveDecision, "sion", {
    decisionId: opened.state.pendingDecision.decisionId,
    selections: ["cheap"],
  }));
  assert.equal(resolved.state.pendingDecision, null);
  assert.equal(resolved.state.players.sion.mana, 0);
  assert.equal(resolved.state.cards.cheap.zone, "attack");
  assert.equal(resolved.state.cards.cheap.active, true);
  assert.equal(resolved.state.cards.expensive.zone, "discard");
  assert.ok(resolved.events.some((event) => event.type === "card.played" && event.payload.instanceId === "cheap" && event.payload.paidMana === 1));
});

test("batch023 Sion Avenger EX is illegal without the two VP payment or a playable discard card", () => {
  const built = buildStandardContent(content);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch023-sion-avenger-illegal", players: [{ id: "sion", name: "Sion" }], seed: 2302 });
  state.status = "playing"; state.round = 3; state.phase = "action"; state.step = "player-window"; state.activePlayerId = "sion";
  state.players.sion.masterId = "master.sion"; state.players.sion.victoryPoints = 1; state.players.sion.mana = 10;
  createOwnedCardInstance(state, "sion", { instanceId: "source", definitionId: "master.sion.skill.s13", zone: "master-skills", face: "up", active: false });
  createOwnedCardInstance(state, "sion", { instanceId: "discard", definitionId: "card.cardb4", zone: "discard", face: "up", active: false });
  assert.equal(engine.getLegalActions(state, "sion").some((action) => action.payload?.skillId === "master.sion.skill.s13"), false);
  assert.throws(() => engine.execute(state, command(state, "sion-avenger-illegal", CommandType.UseSkill, "sion", { skillId: "master.sion.skill.s13", data: { abilityId: "avenger-ex-blazing-grudge" } })), /SKILL_USE_FORBIDDEN/);
});


test("batch023 Darnic Soul Eater opens an optional serialized choice after winning combat", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch023-darnic-win", players: [{id:"d",name:"D"},{id:"o",name:"O"}], seed:2303 });
  state.status="playing"; state.round=3; state.phase="combat"; state.step="settlement"; state.activePlayerId=null;
  state.players.d.masterId="master.darnic"; state.players.d.locationId="mountain"; state.players.o.locationId="mountain"; state.board.locations.mountain=["d","o"];
  state.players.d.mana=1; state.players.d.flags.roundPowerBonus=10;
  createOwnedCardInstance(state,"d",{instanceId:"soul-eater",definitionId:"master.darnic.skill.s1a",zone:"master-skills",face:"up",active:false});
  const opened=engine.execute(state,command(state,"darnic-combat",CommandType.ResolveCombat,"d",{locationId:"mountain"}));
  assert.equal(opened.state.pendingDecision?.kind,"structured-option-choice");
  assert.deepEqual(opened.state.pendingDecision?.options.map(o=>o.id),["set-mana-four"]);
  const resolved=engine.execute(opened.state,command(opened.state,"darnic-choice",CommandType.ResolveDecision,"d",{decisionId:opened.state.pendingDecision.decisionId,selections:["set-mana-four"]}));
  assert.equal(resolved.state.players.d.mana,4);
});

test("batch023 Darnic Soul Eater round-ending penalty uses the normal end-round checkpoint", () => {
  const built = buildStandardContent(content); const engine = new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-darnic-end",players:[{id:"d",name:"D"},{id:"o",name:"O"}],seed:2304});
  state.status="playing"; state.round=3; state.phase="combat"; state.step="settlement"; state.activePlayerId=null; state.modeState.resolvedCombats=["mountain","city"];
  state.players.d.masterId="master.darnic"; state.players.d.mana=2; state.players.d.victoryPoints=5;
  createOwnedCardInstance(state,"d",{instanceId:"soul-eater",definitionId:"master.darnic.skill.s1a",zone:"master-skills",face:"up",active:false});
  const result=engine.execute(state,command(state,"darnic-end",CommandType.EndRound,"d",{}));
  assert.equal(result.state.players.d.victoryPoints,3);
});

test("batch023 Spartacus chooses only opponents from the resolved combat and gains floor(selected power / 5)", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-spartacus",players:[{id:"s",name:"S"},{id:"a",name:"A"},{id:"b",name:"B"},{id:"remote",name:"R"}],seed:2305});
  state.status="playing"; state.round=3; state.phase="combat"; state.step="settlement"; state.activePlayerId=null;
  state.players.s.servantId="servant.spartacus";
  for(const id of ["s","a","b"]){state.players[id].locationId="mountain";} state.players.remote.locationId="city"; state.board.locations.mountain=["s","a","b"]; state.board.locations.city=["remote"];
  createOwnedCardInstance(state,"s",{instanceId:"roar",definitionId:"servant.spartacus.skill.sc-spartacus-2",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"a",{instanceId:"a-attack",definitionId:"card.cardb6",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"b",{instanceId:"b-attack",definitionId:"card.carda4",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"remote",{instanceId:"r-attack",definitionId:"card.cardb6",zone:"attack",face:"up",active:true});
  const opened=engine.execute(state,command(state,"spartacus-combat",CommandType.ResolveCombat,"s",{locationId:"mountain"}));
  assert.equal(opened.state.pendingDecision?.kind,"structured-player-choice");
  assert.deepEqual(new Set(opened.state.pendingDecision?.options.map(o=>o.id)),new Set(["a","b"]));
  const combat=opened.events.find(e=>e.type==="combat.resolved"); assert.ok(combat);
  const expected=Math.floor(Number(combat.payload.powers.a)/5);
  const before=opened.state.players.s.victoryPoints;
  const resolved=engine.execute(opened.state,command(opened.state,"spartacus-choice",CommandType.ResolveDecision,"s",{decisionId:opened.state.pendingDecision.decisionId,selections:["a"]}));
  assert.equal(resolved.state.players.s.victoryPoints-before,expected);
});


test("batch023 Nero Primordial Fire enforces distinct printed base powers and exiles the remaining hand", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-nero-fire",players:[{id:"n",name:"Nero"}],seed:2306});
  state.status="playing"; state.round=3; state.phase="action"; state.step="player-window"; state.activePlayerId="n";
  state.players.n.servantId="servant.nero"; state.players.n.mana=10;
  createOwnedCardInstance(state,"n",{instanceId:"nero-fire",definitionId:"servant.nero.skill.sc-nero-2",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"n",{instanceId:"power5-a",definitionId:"card.cardb4",zone:"hand"});
  createOwnedCardInstance(state,"n",{instanceId:"power5-b",definitionId:"card.carda4",zone:"hand"});
  createOwnedCardInstance(state,"n",{instanceId:"power7",definitionId:"card.cardq5",zone:"hand"});
  createOwnedCardInstance(state,"n",{instanceId:"draw-one",definitionId:"card.cardb2",zone:"deck"});
  createOwnedCardInstance(state,"n",{instanceId:"draw-two",definitionId:"card.cardq2",zone:"deck"});
  const opened=engine.execute(state,command(state,"nero-fire-open",CommandType.UseSkill,"n",{skillId:"servant.nero.skill.sc-nero-2",data:{abilityId:"primordial-fire"}}));
  assert.equal(opened.state.pendingDecision?.kind,"structured-private-card-choice");
  assert.equal(opened.state.players.n.hand.length,5);
  assert.throws(()=>engine.execute(opened.state,command(opened.state,"nero-fire-bad",CommandType.ResolveDecision,"n",{decisionId:opened.state.pendingDecision.decisionId,selections:["power5-a","power5-b"]})),/DISTINCT_POWER_REQUIRED/);
  const resolved=engine.execute(opened.state,command(opened.state,"nero-fire-good",CommandType.ResolveDecision,"n",{decisionId:opened.state.pendingDecision.decisionId,selections:["power5-a","power7"]}));
  assert.equal(resolved.state.cards["power5-a"].zone,"attack");
  assert.equal(resolved.state.cards.power7.zone,"attack");
  assert.equal(resolved.state.players.n.hand.length,0);
  for(const id of ["power5-b","draw-one","draw-two"]) assert.equal(resolved.state.cards[id].zone,"removed");
  assert.equal(resolved.state.players.n.mana,6);
  assert.equal(resolved.state.players.n.trueNameRevealed,true);
});


test("batch023 Chloe Unlimited Blade Works chains two serialized card choices across hand and deck", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-chloe",players:[{id:"c",name:"Chloe"}],seed:2307});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="c";
  state.players.c.servantId="servant.chloe"; state.players.c.mana=10; state.players.c.trueNameRevealed=true;
  createOwnedCardInstance(state,"c",{instanceId:"ubw",definitionId:"servant.chloe.skill.sc-chloe-1",zone:"attack",face:"up",active:true,residual:true});
  createOwnedCardInstance(state,"c",{instanceId:"sacrifice",definitionId:"card.cardb4",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"c",{instanceId:"match-hand",definitionId:"card.carda4",zone:"hand"});
  createOwnedCardInstance(state,"c",{instanceId:"match-deck",definitionId:"card.cardq4",zone:"deck"});
  createOwnedCardInstance(state,"c",{instanceId:"mismatch",definitionId:"card.cardq5",zone:"hand"});
  const first=engine.execute(state,command(state,"chloe-open",CommandType.UseSkill,"c",{skillId:"servant.chloe.skill.sc-chloe-1",data:{abilityId:"unlimited-blade-works-action"}}));
  assert.equal(first.state.pendingDecision?.kind,"structured-private-card-choice");
  assert.ok(first.state.pendingDecision.options.some(o=>o.id==="sacrifice"));
  const second=engine.execute(first.state,command(first.state,"chloe-close",CommandType.ResolveDecision,"c",{decisionId:first.state.pendingDecision.decisionId,selections:["sacrifice"]}));
  assert.equal(second.state.cards.sacrifice.active,false);
  assert.equal(second.state.pendingDecision?.kind,"structured-private-card-choice");
  assert.deepEqual(new Set(second.state.pendingDecision.options.map(o=>o.id)),new Set(["match-hand","match-deck"]));
  const done=engine.execute(second.state,command(second.state,"chloe-play-one",CommandType.ResolveDecision,"c",{decisionId:second.state.pendingDecision.decisionId,selections:["match-deck"]}));
  assert.equal(done.state.cards["match-deck"].zone,"attack");
  assert.equal(done.state.cards.ubw.active,false);
  assert.equal(done.state.cards.ubw.zone,"servant-skills");
  assert.equal(done.state.cards.mismatch.zone,"hand");
});

test("batch023 Chloe Unlimited Blade Works remains active when exactly two matching cards are played", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-chloe-two",players:[{id:"c",name:"Chloe"}],seed:2308});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="c";
  state.players.c.servantId="servant.chloe"; state.players.c.mana=10; state.players.c.trueNameRevealed=true;
  createOwnedCardInstance(state,"c",{instanceId:"ubw",definitionId:"servant.chloe.skill.sc-chloe-1",zone:"attack",face:"up",active:true,residual:true});
  createOwnedCardInstance(state,"c",{instanceId:"sacrifice",definitionId:"card.cardb4",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"c",{instanceId:"match-hand",definitionId:"card.carda4",zone:"hand"});
  createOwnedCardInstance(state,"c",{instanceId:"match-deck",definitionId:"card.cardq4",zone:"deck"});
  let result=engine.execute(state,command(state,"chloe2-open",CommandType.UseSkill,"c",{skillId:"servant.chloe.skill.sc-chloe-1",data:{abilityId:"unlimited-blade-works-action"}}));
  result=engine.execute(result.state,command(result.state,"chloe2-close",CommandType.ResolveDecision,"c",{decisionId:result.state.pendingDecision.decisionId,selections:["sacrifice"]}));
  result=engine.execute(result.state,command(result.state,"chloe2-play",CommandType.ResolveDecision,"c",{decisionId:result.state.pendingDecision.decisionId,selections:["match-hand","match-deck"]}));
  assert.equal(result.state.cards.ubw.zone,"attack");
  assert.equal(result.state.cards.ubw.active,true);
  assert.equal(result.state.cards["match-hand"].zone,"attack");
  assert.equal(result.state.cards["match-deck"].zone,"attack");
});


function setupKagekiyo(gameInstanceId, withAvenger) {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId,players:[{id:"k",name:"Kagekiyo"},{id:"w",name:"Winner"}],seed:2310});
  state.status="playing"; state.round=4; state.phase="combat"; state.step="settlement"; state.activePlayerId=null;
  state.players.k.servantId="servant.kagekiyo"; state.players.k.locationId="mountain"; state.players.w.locationId="mountain"; state.board.locations.mountain=["k","w"];
  state.players.w.flags.roundPowerBonus=10;
  createOwnedCardInstance(state,"k",{instanceId:"oblivion",definitionId:"servant.kagekiyo.skill.sc-kagekiyo-2",zone:"servant-skills",face:"up",active:false});
  if(withAvenger) createOwnedCardInstance(state,"k",{instanceId:"avenger",definitionId:"card.card-avenger",zone:"deck"});
  createOwnedCardInstance(state,"k",{instanceId:"draw-a",definitionId:"card.cardb2",zone:"deck"});
  createOwnedCardInstance(state,"k",{instanceId:"draw-b",definitionId:"card.cardq2",zone:"deck"});
  return {engine,state};
}

test("batch023 Kagekiyo Oblivion Correction offers Avenger branch only when a deck candidate exists", () => {
  const {engine,state}=setupKagekiyo("batch023-kagekiyo-avenger",true);
  let result=engine.execute(state,command(state,"kagekiyo-loss",CommandType.ResolveCombat,"k",{locationId:"mountain"}));
  assert.equal(result.state.pendingDecision?.kind,"structured-option-choice");
  assert.deepEqual(new Set(result.state.pendingDecision.options.map(o=>o.id)),new Set(["avenger-from-deck","draw-two-facedown"]));
  result=engine.execute(result.state,command(result.state,"kagekiyo-branch",CommandType.ResolveDecision,"k",{decisionId:result.state.pendingDecision.decisionId,selections:["avenger-from-deck"]}));
  assert.deepEqual(result.state.pendingDecision?.options.map(o=>o.id),["avenger"]);
  result=engine.execute(result.state,command(result.state,"kagekiyo-avenger",CommandType.ResolveDecision,"k",{decisionId:result.state.pendingDecision.decisionId,selections:["avenger"]}));
  assert.equal(result.state.cards.avenger.zone,"attack");
  assert.equal(result.state.cards.avenger.face,"up");
  assert.equal(result.state.cards.avenger.active,true);
});

test("batch023 Kagekiyo draw branch hides unavailable Avenger option and adds drawn cards face-down", () => {
  const {engine,state}=setupKagekiyo("batch023-kagekiyo-draw",false);
  let result=engine.execute(state,command(state,"kagekiyo-loss2",CommandType.ResolveCombat,"k",{locationId:"mountain"}));
  assert.deepEqual(result.state.pendingDecision?.options.map(o=>o.id),["draw-two-facedown"]);
  result=engine.execute(result.state,command(result.state,"kagekiyo-draw",CommandType.ResolveDecision,"k",{decisionId:result.state.pendingDecision.decisionId,selections:["draw-two-facedown"]}));
  for(const id of ["draw-a","draw-b"]){ assert.equal(result.state.cards[id].zone,"attack"); assert.equal(result.state.cards[id].face,"down"); assert.equal(result.state.cards[id].active,false); }
});


test("batch023 Atalanta Appeal Letter uses authored copies[] and excludes the source card", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-atalanta-copy",players:[{id:"a",name:"Atalanta"}],seed:2311});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="a";
  state.players.a.servantId="servant.atalanta"; state.players.a.mana=10; state.players.a.trueNameRevealed=true;
  state.players.a.flags.deploymentBonusActive=true; state.players.a.flags.deploymentBonus=1;
  createOwnedCardInstance(state,"a",{instanceId:"appeal",definitionId:"card.skill.servant.atalanta.skill.sc-atalanta-2",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"a",{instanceId:"other",definitionId:"card.cardb4",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"a",{instanceId:"old",definitionId:"card.cardq2",zone:"attack",face:"up",active:true});
  state.cards.appeal.playedRound=4; state.cards.other.playedRound=4; state.cards.old.playedRound=3;
  const opened=engine.execute(state,command(state,"atalanta-copy-open",CommandType.UseSkill,"a",{skillId:"servant.atalanta.skill.sc-atalanta-2",data:{abilityId:"appeal-letter-copy"}}));
  assert.equal(opened.state.pendingDecision?.kind,"structured-private-card-choice");
  assert.deepEqual(opened.state.pendingDecision?.options.map(o=>o.id),["other"]);
  assert.doesNotMatch(opened.state.pendingDecision?.options[0]?.label ?? "", /\?\?\{definition\.text\}/);
  const resolved=engine.execute(opened.state,command(opened.state,"atalanta-copy-resolve",CommandType.ResolveDecision,"a",{decisionId:opened.state.pendingDecision.decisionId,selections:["other"]}));
  assert.equal(resolved.state.pendingDecision,null);
  const copies=resolved.state.players.a.attack.map(id=>resolved.state.cards[id]).filter(card=>card.instanceId!=="other" && card.definitionId==="card.cardb4");
  assert.equal(copies.length,1);
  assert.equal(copies[0].temporary,true); assert.equal(copies[0].active,true); assert.equal(copies[0].face,"up");
});

test("batch023 Atalanta Appeal Letter requires deployment bonus", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-atalanta-no-terrain",players:[{id:"a",name:"Atalanta"}],seed:2312});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="a";
  state.players.a.servantId="servant.atalanta"; state.players.a.mana=10; state.players.a.trueNameRevealed=true;
  createOwnedCardInstance(state,"a",{instanceId:"appeal",definitionId:"card.skill.servant.atalanta.skill.sc-atalanta-2",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"a",{instanceId:"other",definitionId:"card.cardb4",zone:"attack",face:"up",active:true});
  state.cards.appeal.playedRound=4; state.cards.other.playedRound=4;
  assert.equal(engine.getLegalActions(state,"a").some(action=>action.payload?.skillId==="servant.atalanta.skill.sc-atalanta-2"),false);
});


test("batch023 Arcueid True Ancestor restores Materialization by canonical linked skill id and resets usage", () => {
  const built=buildStandardContent(content);
  registerCoreSkillHandlers(built.skills); const passives=new PassiveRuntime(); const effects=new EffectRuntime(); registerCorePassiveHandlers(built.skills,passives,effects);
  const state=createGameState({gameInstanceId:"batch023-arcueid-regain",players:[{id:"a",name:"Arcueid"}],seed:2313});
  state.status="playing"; state.round=4; state.players.a.masterId="master.arcueid";
  createOwnedCardInstance(state,"a",{instanceId:"materialization",definitionId:"card.skill.master.arcueid.skill.s2",zone:"removed",face:"down",active:false});
  state.players.a.usage["master.arcueid.skill.s2"]={round:3,phase:"action",used:true,usedGame:true};
  enqueuePassiveEffects(state,passives,{eventId:"moon-used",type:"skill.used",revision:state.revision,sourceCommandId:"test",payload:{playerId:"a",skillId:"master.arcueid.skill.s1a"}});
  effects.drain(state,1000,{...built.cards,...built.skills.asCardDefinitions()});
  assert.equal(state.cards.materialization.zone,"master-skills");
  assert.equal(state.cards.materialization.face,"up"); assert.equal(state.cards.materialization.active,false);
  assert.equal(state.players.a.usage["master.arcueid.skill.s2"],undefined);
});


test("batch023 Caligula Bright Moon ignores situation NP ban and append-plays Moonlight", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-caligula",players:[{id:"c",name:"Caligula"}],seed:2314});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="c";
  state.players.c.servantId="servant.caligula"; state.players.c.mana=10; state.modeState.situationRestrictions={forbiddenAttributes:["宝具"]};
  createOwnedCardInstance(state,"c",{instanceId:"bright-moon",definitionId:"servant.caligula.skill.sc-caligula-1",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"c",{instanceId:"moonlight",definitionId:"servant.caligula.skill.sc-caligula-3",zone:"servant-skills",face:"up",active:false});
  const opened=engine.execute(state,command(state,"caligula-open",CommandType.UseSkill,"c",{skillId:"servant.caligula.skill.sc-caligula-1",data:{abilityId:"bright-moon-append-moonlight"}}));
  assert.deepEqual(opened.state.pendingDecision?.options.map(o=>o.id),["moonlight"]);
  const resolved=engine.execute(opened.state,command(opened.state,"caligula-play",CommandType.ResolveDecision,"c",{decisionId:opened.state.pendingDecision.decisionId,selections:["moonlight"]}));
  assert.equal(resolved.state.cards.moonlight.zone,"attack"); assert.equal(resolved.state.cards.moonlight.active,true);
  assert.equal(resolved.state.players.c.mana,8); assert.equal(resolved.state.players.c.trueNameRevealed,true);
  assert.ok(resolved.events.some(e=>e.type==="servant.true-name-revealed"));
});

test("batch023 Caligula append ability is unavailable without an NP-ban situation", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-caligula-no-ban",players:[{id:"c",name:"Caligula"}],seed:2315});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="c"; state.players.c.servantId="servant.caligula"; state.players.c.mana=10;
  createOwnedCardInstance(state,"c",{instanceId:"bright-moon",definitionId:"servant.caligula.skill.sc-caligula-1",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"c",{instanceId:"moonlight",definitionId:"servant.caligula.skill.sc-caligula-3",zone:"servant-skills",face:"up",active:false});
  assert.equal(engine.getLegalActions(state,"c").some(a=>a.payload?.skillId==="servant.caligula.skill.sc-caligula-1"),false);
});


test("batch023 Helena Colonel Olcott plays a strength basic attack then hides one same-location opponent servant skill", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-helena",players:[{id:"h",name:"Helena"},{id:"o",name:"Opponent"},{id:"r",name:"Remote"}],seed:2316});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="h";
  state.players.h.servantId="servant.helena"; state.players.h.mana=10; state.players.h.locationId="mountain"; state.players.o.locationId="mountain"; state.players.r.locationId="city"; state.board.locations.mountain=["h","o"]; state.board.locations.city=["r"];
  createOwnedCardInstance(state,"h",{instanceId:"strength",definitionId:"card.cardb4",zone:"hand"});
  createOwnedCardInstance(state,"o",{instanceId:"opp-servant",definitionId:"servant.spartacus.skill.sc-spartacus-2",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"o",{instanceId:"opp-master",definitionId:"master.darnic.skill.s1a",zone:"master-skills",face:"up",active:false});
  createOwnedCardInstance(state,"r",{instanceId:"remote-servant",definitionId:"servant.kagekiyo.skill.sc-kagekiyo-2",zone:"servant-skills",face:"up",active:false});
  let result=engine.execute(state,command(state,"helena-open",CommandType.UseSkill,"h",{skillId:"servant.helena.skill.sc-helena-1",data:{abilityId:"colonel-olcott-action"}}));
  assert.deepEqual(result.state.pendingDecision?.options.map(o=>o.id),["strength"]);
  result=engine.execute(result.state,command(result.state,"helena-play",CommandType.ResolveDecision,"h",{decisionId:result.state.pendingDecision.decisionId,selections:["strength"]}));
  assert.equal(result.state.cards.strength.zone,"attack");
  assert.deepEqual(result.state.pendingDecision?.options.map(o=>o.id),["opp-servant"]);
  result=engine.execute(result.state,command(result.state,"helena-hide",CommandType.ResolveDecision,"h",{decisionId:result.state.pendingDecision.decisionId,selections:["opp-servant"]}));
  assert.equal(result.state.cards["opp-servant"].face,"down"); assert.equal(result.state.cards["opp-master"].face,"up"); assert.equal(result.state.cards["remote-servant"].face,"up");
});


test("batch023 Clytie Tempered Soul caps per-player loss, collects canonical Foreign Life cards, and exiles itself", () => {
  const built=buildStandardContent(content); registerCoreSkillHandlers(built.skills); const passives=new PassiveRuntime(); const effects=new EffectRuntime(); registerCorePassiveHandlers(built.skills,passives,effects);
  const state=createGameState({gameInstanceId:"batch023-clytie",players:[{id:"c",name:"Clytie"},{id:"o",name:"Other"},{id:"x",name:"Third"}],seed:2317});
  state.status="playing"; state.round=4; state.players.c.servantId="servant.clytie"; state.players.c.victoryPoints=10; state.players.o.victoryPoints=10; state.players.x.victoryPoints=5;
  createOwnedCardInstance(state,"c",{instanceId:"tempered",definitionId:"servant.clytie.skill.sc-clytie-3",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"c",{instanceId:"fl-c",definitionId:"card.x-foreign-life",zone:"discard",face:"up"});
  for(const [i,def] of [[1,"card.x-foreigner"],[2,"card.skill.servant.molay.skill.sc-molay-4"],[3,"card.skill.servant.abigail.skill.sc-abigail-4"],[4,"card.skill.servant.hokusai.skill.sc-hokusai-4"]]) createOwnedCardInstance(state,"o",{instanceId:`fl-o-${i}`,definitionId:def,zone:"discard",face:"up"});
  createOwnedCardInstance(state,"x",{instanceId:"ordinary",definitionId:"card.cardb2",zone:"discard",face:"up"});
  enqueuePassiveEffects(state,passives,{eventId:"clytie-reveal",type:"servant.true-name-revealed",revision:state.revision,sourceCommandId:"test",payload:{playerId:"c",servantId:"servant.clytie"}});
  effects.drain(state,1000,{...built.cards,...built.skills.asCardDefinitions()});
  assert.equal(state.players.c.victoryPoints,8); assert.equal(state.players.o.victoryPoints,4); assert.equal(state.players.x.victoryPoints,5);
  for(const id of ["fl-c","fl-o-1","fl-o-2","fl-o-3","fl-o-4"]){assert.equal(state.cards[id].zone,"hand");assert.equal(state.cards[id].ownerPlayerId,"c");assert.ok(state.players.c.hand.includes(id));}
  assert.equal(state.cards.ordinary.zone,"discard"); assert.equal(state.cards.tempered.zone,"removed");
});


test("batch023 Parvati Love Unknown grants the combat defeat only after exactly three magic basics", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-parvati",players:[{id:"p",name:"Parvati"},{id:"o",name:"Opponent"}],seed:2318});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="p";
  state.players.p.servantId="servant.parvati"; state.players.p.mana=10; state.players.p.trueNameRevealed=true; state.players.p.locationId="mountain"; state.players.o.locationId="mountain"; state.board.locations.mountain=["p","o"];
  createOwnedCardInstance(state,"p",{instanceId:"love",definitionId:"servant.parvati.skill.sc-parvati-3",zone:"attack",face:"up",active:true});
  for(const [id,def] of [["m1","card.carda1"],["m2","card.carda2"],["m3","card.carda3"]]) createOwnedCardInstance(state,"p",{instanceId:id,definitionId:def,zone:"hand"});
  let result=engine.execute(state,command(state,"parvati-open",CommandType.UseSkill,"p",{skillId:"servant.parvati.skill.sc-parvati-3",data:{abilityId:"love-unknown-play-basics"}}));
  result=engine.execute(result.state,command(result.state,"parvati-play",CommandType.ResolveDecision,"p",{decisionId:result.state.pendingDecision.decisionId,selections:["m1","m2","m3"]}));
  assert.equal(result.state.players.p.flags.parvatiLoveUnknownDefeatRound,4);
  for(const id of ["m1","m2","m3"]) assert.equal(result.state.cards[id].zone,"attack");
  result.state.phase="combat"; result.state.step="player-window"; result.state.activePlayerId="p";
  const actions=engine.getLegalActions(result.state,"p");
  assert.ok(actions.some(a=>a.payload?.skillId==="servant.parvati.skill.sc-parvati-3" && a.payload?.data?.abilityId==="love-unknown-defeat-opponent"));
  result=engine.execute(result.state,command(result.state,"parvati-defeat-open",CommandType.UseSkill,"p",{skillId:"servant.parvati.skill.sc-parvati-3",data:{abilityId:"love-unknown-defeat-opponent"}}));
  assert.deepEqual(result.state.pendingDecision?.options.map(o=>o.id),["o"]);
  result=engine.execute(result.state,command(result.state,"parvati-defeat",CommandType.ResolveDecision,"p",{decisionId:result.state.pendingDecision.decisionId,selections:["o"]}));
  assert.equal(result.state.players.o.defeated,true);
});

test("batch023 Parvati Love Unknown does not arm the combat defeat for a mixed three-card play", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-parvati-mixed",players:[{id:"p",name:"Parvati"},{id:"o",name:"Opponent"}],seed:2319});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="p"; state.players.p.servantId="servant.parvati"; state.players.p.mana=10; state.players.p.trueNameRevealed=true; state.players.p.locationId="mountain"; state.players.o.locationId="mountain"; state.board.locations.mountain=["p","o"];
  createOwnedCardInstance(state,"p",{instanceId:"love",definitionId:"servant.parvati.skill.sc-parvati-3",zone:"attack",face:"up",active:true});
  for(const [id,def] of [["m1","card.carda1"],["m2","card.carda2"],["b1","card.cardb1"]]) createOwnedCardInstance(state,"p",{instanceId:id,definitionId:def,zone:"hand"});
  let result=engine.execute(state,command(state,"parvati-mixed-open",CommandType.UseSkill,"p",{skillId:"servant.parvati.skill.sc-parvati-3",data:{abilityId:"love-unknown-play-basics"}}));
  result=engine.execute(result.state,command(result.state,"parvati-mixed-play",CommandType.ResolveDecision,"p",{decisionId:result.state.pendingDecision.decisionId,selections:["m1","m2","b1"]}));
  assert.equal(result.state.players.p.flags.parvatiLoveUnknownDefeatRound,undefined);
  result.state.phase="combat"; result.state.step="player-window"; result.state.activePlayerId="p";
  assert.equal(engine.getLegalActions(result.state,"p").some(a=>a.payload?.data?.abilityId==="love-unknown-defeat-opponent"),false);
});


test("batch023 Mephisto Shallow Sleep Bomb targets only eligible same-location opponents and gives them a persistent parasite copy", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-mephisto",players:[{id:"m",name:"Mephisto"},{id:"ok",name:"Eligible"},{id:"first",name:"First"},{id:"has",name:"HasParasite"},{id:"remote",name:"Remote"}],seed:2320});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="m"; state.players.m.servantId="servant.mephisto"; state.players.m.mana=10; state.players.m.trueNameRevealed=true;
  for(const id of ["m","ok","first","has"]){state.players[id].locationId="mountain";} state.players.remote.locationId="city"; state.board.locations.mountain=["m","ok","first","has"]; state.board.locations.city=["remote"];
  state.players.m.victoryPoints=2; state.players.ok.victoryPoints=2; state.players.first.victoryPoints=7; state.players.has.victoryPoints=1; state.players.remote.victoryPoints=0;
  createOwnedCardInstance(state,"m",{instanceId:"shallow",definitionId:"servant.mephisto.skill.sc-mephisto-3",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"m",{instanceId:"parasite-source",definitionId:"servant.mephisto.skill.sc-mephisto-2",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"has",{instanceId:"existing-parasite",definitionId:"servant.mephisto.skill.sc-mephisto-2",zone:"attack",face:"up",active:true,residual:true});
  let result=engine.execute(state,command(state,"mephisto-open",CommandType.UseSkill,"m",{skillId:"servant.mephisto.skill.sc-mephisto-3",data:{abilityId:"irresistible-gift"}}));
  assert.deepEqual(result.state.pendingDecision?.options.map(o=>o.id),["parasite-source"]);
  result=engine.execute(result.state,command(result.state,"mephisto-source",CommandType.ResolveDecision,"m",{decisionId:result.state.pendingDecision.decisionId,selections:["parasite-source"]}));
  assert.deepEqual(result.state.pendingDecision?.options.map(o=>o.id),["ok"]);
  result=engine.execute(result.state,command(result.state,"mephisto-target",CommandType.ResolveDecision,"m",{decisionId:result.state.pendingDecision.decisionId,selections:["ok"]}));
  const copy=result.state.players.ok.attack.map(id=>result.state.cards[id]).find(c=>c.definitionId==="servant.mephisto.skill.sc-mephisto-2");
  assert.ok(copy); assert.equal(copy.ownerPlayerId,"ok"); assert.equal(copy.controllerPlayerId,"ok"); assert.equal(copy.temporary,false); assert.equal(copy.residual,true); assert.equal(copy.active,true);
  assert.equal(result.state.players.m.victoryPoints,3); assert.equal(result.state.players.ok.victoryPoints,3);
});


test("batch023 Medusa Mystic Eyes defeats only engaged opponents without a quick attack played or added this round", () => {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch023-medusa",players:[{id:"m",name:"Medusa"},{id:"slow",name:"Slow"},{id:"quick",name:"Quick"}],seed:2321});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="m"; state.players.m.servantId="servant.medusa"; state.players.m.mana=10;
  for(const id of ["m","slow","quick"]){state.players[id].locationId="mountain";} state.board.locations.mountain=["m","slow","quick"];
  createOwnedCardInstance(state,"m",{instanceId:"eyes",definitionId:"servant.medusa.skill.sc-medusa-2",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"slow",{instanceId:"slow-card",definitionId:"card.cardb1",zone:"attack",face:"up",active:true}); state.cards["slow-card"].playedRound=4;
  createOwnedCardInstance(state,"quick",{instanceId:"quick-card",definitionId:"card.cardq1",zone:"attack",face:"up",active:true}); state.cards["quick-card"].playedRound=4;
  const result=engine.execute(state,command(state,"medusa-eyes",CommandType.UseSkill,"m",{skillId:"servant.medusa.skill.sc-medusa-2",data:{abilityId:"mystic-eyes-petrification"}}));
  assert.equal(result.state.players.slow.defeated,true); assert.equal(result.state.players.quick.defeated,false);
  assert.ok(result.events.some(e=>e.type==="player.defeated" && e.payload.playerId==="slow"));
});
