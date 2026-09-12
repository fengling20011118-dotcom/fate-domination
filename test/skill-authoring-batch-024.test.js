import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { assertStateInvariants } from "../src/domain/state/invariants.ts";
import { createEvent } from "../src/match-engine/events.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { endStandardRound, startStandardRound } from "../src/rules-core/rounds.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";

test("batch024 Akasha Fate seeds one canonical Overload and one persistent temporary board copy on each battlefield", () => {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...built.skills.asCardDefinitions() };
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCoreSkillHandlers(built.skills);
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  const state = createGameState({ gameInstanceId: "batch024-akasha-fate", players: [{ id: "a", name: "Akasha" }], seed: 2401 });
  state.status = "playing";
  state.round = 1;
  state.phase = "preparation";
  state.players.a.masterId = "master.akasha";

  const start = createEvent(state, "batch024-akasha-start", 0, "game.started", { round: 1, phase: "preparation" });
  enqueuePassiveEffects(state, passives, start);
  effects.drain(state, 1000, definitions);

  const isOverload = (card) => definitions[card.definitionId]?.linkedSkillId === "master.akasha.skill.s6";
  const overloads = Object.values(state.cards).filter(isOverload);
  const originals = overloads.filter((card) => card.zone === "master-skills" && card.temporary === false);
  const boardCopies = overloads.filter((card) => card.zone === "board");
  assert.equal(originals.length, 1);
  assert.equal(state.players.a.masterSkills.includes(originals[0].instanceId), true);
  assert.equal(boardCopies.length, 2);
  assert.deepEqual(new Set(boardCopies.map((card) => card.boardLocationId)), new Set(["mountain", "city"]));
  for (const card of boardCopies) {
    assert.equal(card.ownerPlayerId, "a");
    assert.equal(card.temporary, true);
    assert.equal(card.temporaryCleanup, "explicit");
    assert.equal(card.face, "up");
    assert.equal(card.active, false);
    assert.ok(card.createdByEffectId);
  }
  assert.doesNotThrow(() => assertStateInvariants(state));

  enqueuePassiveEffects(state, passives, start);
  effects.drain(state, 1000, definitions);
  assert.equal(Object.values(state.cards).filter((card) => isOverload(card) && card.zone === "master-skills" && !card.temporary).length, 1);
  assert.equal(Object.values(state.cards).filter((card) => isOverload(card) && card.zone === "board").length, 2);

  endStandardRound(state, definitions);
  assert.equal(Object.values(state.cards).filter((card) => isOverload(card) && card.zone === "board").length, 2);
  assert.doesNotThrow(() => assertStateInvariants(state));
});

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("batch024 Kayneth Arrogance forces deployment to a lone lower-VP opponent battlefield when possible", () => {
  const built = buildStandardContent(legacyContent);
  const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch024-kayneth-arrogance", players: [{id:"k",name:"Kayneth"},{id:"low",name:"Low"},{id:"high",name:"High"}], seed:2402 });
  state.status="playing"; state.round=3; state.phase="outpost"; state.step="player-window"; state.activePlayerId="k";
  state.players.k.masterId="master.kayneth"; state.players.k.victoryPoints=5;
  state.players.low.victoryPoints=2; state.players.low.locationId="city";
  state.players.high.victoryPoints=7; state.players.high.locationId="mountain";
  state.board.locations.city=["low"]; state.board.locations.mountain=["high"];
  createOwnedCardInstance(state,"k",{instanceId:"arrogance",definitionId:"master.kayneth.skill.s3",zone:"master-skills",face:"up",active:false});
  assert.throws(() => engine.execute(state, command(state,"kayneth-illegal-workshop",CommandType.DeployPlayer,"k",{locationId:"workshop"})), /DEPLOYMENT_DESTINATION_FORBIDDEN_BY_RULE/);
  const deployed=engine.execute(state, command(state,"kayneth-city",CommandType.DeployPlayer,"k",{locationId:"city"}));
  assert.equal(deployed.state.players.k.locationId,"city");
  assert.deepEqual(new Set(deployed.state.board.locations.city),new Set(["low","k"]));
});

test("batch024 Kayneth Arrogance does not force an unavailable or non-qualifying battlefield", () => {
  const built = buildStandardContent(legacyContent); const engine = new StandardMatchEngine(built);
  const state = createGameState({ gameInstanceId: "batch024-kayneth-free", players: [{id:"k",name:"Kayneth"},{id:"low",name:"Low"},{id:"high",name:"High"}], seed:2403 });
  state.status="playing"; state.round=3; state.phase="outpost"; state.step="player-window"; state.activePlayerId="k";
  state.players.k.masterId="master.kayneth"; state.players.k.victoryPoints=5;
  state.players.low.victoryPoints=2; state.players.low.locationId="city"; state.board.locations.city=["low"];
  state.modeState.situationRestrictions={forbiddenLocations:["city"]};
  createOwnedCardInstance(state,"k",{instanceId:"arrogance",definitionId:"master.kayneth.skill.s3",zone:"master-skills",face:"up",active:false});
  const deployed=engine.execute(state, command(state,"kayneth-workshop",CommandType.DeployPlayer,"k",{locationId:"workshop"}));
  assert.equal(deployed.state.players.k.locationId,"workshop");
});


test("batch024 Ibaraki Great River Ogre Rampage gives +6 to every tied highest round active paid-cost sum", () => {
  const built=buildStandardContent(legacyContent); const definitions={...built.cards,...built.skills.asCardDefinitions()};
  const state=createGameState({gameInstanceId:"batch024-ibaraki",players:[{id:"i",name:"Ibaraki"},{id:"a",name:"A"},{id:"b",name:"B"}],seed:2404});
  state.status="playing"; state.round=5; state.phase="combat"; state.step="settlement";
  state.players.i.servantId="servant.ibaraki";
  for(const id of ["i","a","b"]){ state.players[id].locationId="mountain"; } state.board.locations.mountain=["i","a","b"];
  createOwnedCardInstance(state,"i",{instanceId:"ibaraki-rule",definitionId:"servant.ibaraki.skill.sc-ibaraki-1",zone:"servant-skills",face:"up",active:false});
  const addAttack=(pid,id,def,paid,round=5)=>{ createOwnedCardInstance(state,pid,{instanceId:id,definitionId:def,zone:"attack",face:"up",active:true}); state.cards[id].paidCost=paid; state.cards[id].playedRound=round; };
  addAttack("i","i1","card.carda1",2); addAttack("i","i-old","card.cardb1",9,4);
  addAttack("a","a1","card.carda1",3); addAttack("a","a2","card.cardb1",2);
  addAttack("b","b1","card.carda1",5);
  const raw=(pid)=>state.players[pid].attack.reduce((sum,id)=>sum+calculateCombatCardPower(state,state.players[pid],id,definitions,"mountain"),0);
  assert.equal(calculateCombatPower(state,state.players.i,definitions,"mountain"),raw("i"));
  assert.equal(calculateCombatPower(state,state.players.a,definitions,"mountain"),raw("a")+6);
  assert.equal(calculateCombatPower(state,state.players.b,definitions,"mountain"),raw("b")+6);
});


test("batch024 Ciel Seventh Scripture suppresses next-round situation mana and power only for engaged opponents without active Lucky", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built); const definitions={...built.cards,...built.skills.asCardDefinitions()};
  let state=createGameState({gameInstanceId:"batch024-ciel",players:[{id:"c",name:"Ciel"},{id:"plain",name:"Plain"},{id:"lucky",name:"Lucky"}],seed:2405});
  state.status="playing"; state.round=4; state.phase="combat"; state.step="player-window"; state.activePlayerId="c";
  state.players.c.masterId="master.ciel"; for(const id of ["c","plain","lucky"]){state.players[id].locationId="mountain";} state.board.locations.mountain=["c","plain","lucky"];
  createOwnedCardInstance(state,"c",{instanceId:"seventh",definitionId:"master.ciel.skill.s3",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"lucky",{instanceId:"luck",definitionId:"card.cardluck",zone:"attack",face:"up",active:true});
  let result=engine.execute(state,command(state,"ciel-seventh",CommandType.UseSkill,"c",{skillId:"master.ciel.skill.s3",data:{abilityId:"seventh-scripture-soul-crush",sourceInstanceId:"seventh"}}));
  state=result.state;
  assert.equal(state.players.plain.flags.situationBenefitsSuppressedRound,5);
  assert.equal(state.players.lucky.flags.situationBenefitsSuppressedRound,undefined);
  assert.equal(state.activeRuleModifiers.filter((m)=>m.sourceId==="master.ciel.skill.s3").length,2);

  state.players.c.mana=0; state.players.plain.mana=0; state.players.lucky.mana=0;
  state.board.situationDeck=["sit.ciel.5"];
  const situation5={id:"sit.ciel.5",mana:3,eventPlacement:{mountain:0,city:0},combatPower:{cardAddByAttribute:{"力量":2}}};
  startStandardRound(state,[situation5],[],()=>0,definitions);
  assert.equal(state.round,5); assert.equal(state.players.plain.mana,0); assert.equal(state.players.lucky.mana,3); assert.equal(state.players.c.mana,3);
  for(const id of ["c","plain","lucky"]){state.players[id].locationId="mountain";} state.board.locations.mountain=["c","plain","lucky"];
  createOwnedCardInstance(state,"plain",{instanceId:"plain-str",definitionId:"card.derived.temporary-basic.power-2.strength",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"lucky",{instanceId:"lucky-str",definitionId:"card.derived.temporary-basic.power-2.strength",zone:"attack",face:"up",active:true});
  assert.equal(calculateCombatCardPower(state,state.players.plain,"plain-str",definitions,"mountain"),definitions["card.derived.temporary-basic.power-2.strength"].basePower);
  assert.equal(calculateCombatCardPower(state,state.players.lucky,"lucky-str",definitions,"mountain"),definitions["card.derived.temporary-basic.power-2.strength"].basePower+2);

  state.players.plain.mana=0; state.board.situationDeck=["sit.ciel.6"];
  startStandardRound(state,[{...situation5,id:"sit.ciel.6"}],[],()=>0,definitions);
  assert.equal(state.round,6); assert.equal(state.players.plain.mana,3);
  assert.doesNotThrow(()=>assertStateInvariants(state));
});




test("batch024 initial skill ownership separates catalogue-only grants from game-start-created cards", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built); const definitions={...built.cards,...built.skills.asCardDefinitions()};
  const state=createGameState({gameInstanceId:"batch024-initial-skill-ownership",players:[{id:"arc",name:"Arc"},{id:"aka",name:"Akasha"}],seed:2406});
  state.players.arc.masterId="master.arcueid"; state.players.aka.masterId="master.akasha";
  const result=engine.execute(state,command(state,"start-initial-owned",CommandType.StartStandardGame,"host",{}));
  const linked=(pid,skillId)=>result.state.players[pid].masterSkills.map(id=>result.state.cards[id]).filter(card=>definitions[card.definitionId]?.linkedSkillId===skillId||card.definitionId===skillId);
  const marble=linked("arc","master.arcueid.skill.s2"); const thirst=linked("arc","master.arcueid.skill.s3"); const overload=linked("aka","master.akasha.skill.s6");
  assert.equal(marble.length,1); assert.ok(marble[0].createdByEffectId);
  assert.equal(thirst.length,0);
  assert.equal(overload.length,1); assert.ok(overload[0].createdByEffectId);
  assert.doesNotThrow(()=>assertStateInvariants(result.state));
});

test("batch024 all master ascension skills are catalogue-only until explicitly unlocked", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built); const definitions={...built.cards,...built.skills.asCardDefinitions()};
  const ascensionSkills=built.skills.list().filter(skill=>skill.ownerType==="master"&&skill.tags?.includes("ascension"));
  assert.equal(ascensionSkills.length,68);
  assert.deepEqual(ascensionSkills.filter(skill=>skill.initiallyOwned!==false).map(skill=>skill.id),[]);
  // These four ascension cards do not print typeLabel="升华技". They prove ownership is
  // driven by structured ascension metadata rather than runtime parsing/type-label guesses.
  for(const skillId of ["master.ryuunosuke.skill.ascension","master.shirou-emiya.skill.ascension","master.rin.skill.ascension","master.irisviel.skill.ascension"]){
    assert.notEqual(built.skills.get(skillId).typeLabel,"升华技");
    assert.equal(built.skills.get(skillId).initiallyOwned,false);
  }
  const state=createGameState({gameInstanceId:"batch024-ascension-not-initial",players:[
    {id:"twice",name:"Twice"},{id:"shirou",name:"Shirou"},{id:"rin",name:"Rin"},{id:"iri",name:"Irisviel"}
  ],seed:24061});
  state.players.twice.masterId="master.twice"; state.players.shirou.masterId="master.shirou-emiya"; state.players.rin.masterId="master.rin"; state.players.iri.masterId="master.irisviel";
  const result=engine.execute(state,command(state,"start-no-ascension",CommandType.StartStandardGame,"host",{}));
  for(const playerId of ["twice","shirou","rin","iri"]){
    const seededAscensions=result.state.players[playerId].masterSkills
      .map(id=>result.state.cards[id])
      .filter(card=>card&&((definitions[card.definitionId]?.linkedSkillId??card.definitionId).endsWith(".skill.ascension")));
    assert.equal(seededAscensions.length,0,`${playerId} must not start with an ascension skill`);
  }
});


test("batch024 Arcueid Moon Princess grants Blood Thirst until a combat win then steals available mana and removes the grant", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built); const definitions={...built.cards,...built.skills.asCardDefinitions()};
  let state=createGameState({gameInstanceId:"batch024-moon-princess",players:[{id:"arc",name:"Arc"},{id:"opp",name:"Opponent"}],seed:2407});
  state.players.arc.masterId="master.arcueid";
  let result=engine.execute(state,command(state,"moon-start",CommandType.StartStandardGame,"host",{})); state=result.state;
  const linked=(skillId)=>state.players.arc.masterSkills.map(id=>state.cards[id]).filter(card=>definitions[card.definitionId]?.linkedSkillId===skillId||card.definitionId===skillId);
  assert.equal(linked("master.arcueid.skill.s3").length,0);

  state.phase="outpost"; state.step="player-window"; state.activePlayerId="arc";
  result=engine.execute(state,command(state,"moon-use",CommandType.UseSkill,"arc",{skillId:"master.arcueid.skill.s1a",data:{abilityId:"moon-princess-grant-thirst"}})); state=result.state;
  const thirst=linked("master.arcueid.skill.s3"); assert.equal(thirst.length,1); assert.equal(thirst[0].temporary,true); assert.equal(thirst[0].temporaryCleanup,"explicit"); assert.ok(thirst[0].createdByEffectId); assert.equal(state.players.arc.flags.moonPrincessThirstActive,true);

  const persisted=structuredClone(state); endStandardRound(persisted,definitions);
  assert.equal(persisted.cards[thirst[0].instanceId].zone,"master-skills");

  state.phase="combat"; state.step="settlement"; state.activePlayerId=null; state.modeState.resolvedCombats=[];
  state.players.arc.locationId="mountain"; state.players.opp.locationId="mountain"; state.board.locations={workshop:[],mountain:["arc","opp"],city:[],scouting:[]};
  state.players.arc.flags.roundPowerBonus=5; state.players.opp.flags.roundPowerBonus=0; state.players.opp.mana=1; delete state.players.arc.flags.roundManaGainCap; delete state.players.arc.flags.roundManaGained;
  result=engine.execute(state,command(state,"moon-combat",CommandType.ResolveCombat,"arc",{locationId:"mountain"})); state=result.state;
  assert.ok(state.pendingDecision); assert.equal(state.pendingDecision.ownerPlayerId,"arc"); assert.deepEqual(state.pendingDecision.options.map(option=>option.id),["opp"]);
  const decisionId=state.pendingDecision.decisionId;
  const arcManaBefore=state.players.arc.mana;
  result=engine.execute(state,command(state,"moon-target",CommandType.ResolveDecision,"arc",{decisionId,selections:["opp"]})); state=result.state;
  assert.ok(state.pendingDecision); assert.deepEqual(state.pendingDecision.options.map(option=>option.id),["0","1","2"]);
  const amountDecisionId=state.pendingDecision.decisionId;
  result=engine.execute(state,command(state,"moon-steal",CommandType.ResolveDecision,"arc",{decisionId:amountDecisionId,selections:["1"]})); state=result.state;
  assert.equal(state.players.opp.mana,0); assert.equal(state.players.arc.mana,arcManaBefore+1); assert.equal(state.players.arc.flags.moonPrincessThirstActive,undefined);
  assert.equal(state.cards[thirst[0].instanceId].zone,"removed"); assert.equal(linked("master.arcueid.skill.s3").length,0); assert.equal(state.pendingDecision,null);
  assert.doesNotThrow(()=>assertStateInvariants(state));
});
