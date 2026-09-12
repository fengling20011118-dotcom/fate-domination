import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { triggerStructuredCardPlayEffects } from "../src/rules-core/card-play.ts";

function command(state,id,type,actorId,payload={}){return {commandId:id,gameInstanceId:state.gameInstanceId,actorId,expectedRevision:state.revision,type,payload};}

function setup(id){
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:id,players:[{id:"v",name:"Valkyrie"}],seed:2901});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="v";
  state.players.v.servantId="servant.valkyrie"; state.players.v.mana=8;
  createOwnedCardInstance(state,"v",{instanceId:"gungnir",definitionId:"servant.valkyrie.skill.sc-valkyrie-3",zone:"servant-skills",face:"up",active:false});
  return {built,engine,state,definitions:{...built.cards,...built.skills.asCardDefinitions()}};
}

test("batch029 Valkyrie False Gungnir retriggers every active Commander play effect",()=>{
  const {engine,state,definitions}=setup("batch029-valkyrie");
  createOwnedCardInstance(state,"v",{instanceId:"ortlinde",definitionId:"card.x-commanderortlinde",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"v",{instanceId:"hildr",definitionId:"card.x-commanderhildr",zone:"attack",face:"up",active:true});
  triggerStructuredCardPlayEffects(state,"ortlinde",definitions); triggerStructuredCardPlayEffects(state,"hildr",definitions);
  assert.equal(state.cards.ortlinde.powerModifiers?.reduce((s,m)=>s+m.value,0),2);
  assert.equal(state.cards.hildr.powerModifiers?.reduce((s,m)=>s+m.value,0),3);
  const result=engine.execute(state,command(state,"valk-use",CommandType.UseSkill,"v",{skillId:"servant.valkyrie.skill.sc-valkyrie-3",data:{abilityId:"false-gungnir-retrigger-commanders"}}));
  assert.equal(result.state.cards.ortlinde.powerModifiers?.reduce((s,m)=>s+m.value,0),4);
  assert.equal(result.state.cards.hildr.powerModifiers?.reduce((s,m)=>s+m.value,0),6);
  assert.equal(result.state.players.v.trueNameRevealed,true);
});

test("batch029 Valkyrie False Gungnir is unavailable without an active Commander",()=>{
  const {engine,state}=setup("batch029-valkyrie-none");
  assert.throws(()=>engine.execute(state,command(state,"valk-empty",CommandType.UseSkill,"v",{skillId:"servant.valkyrie.skill.sc-valkyrie-3",data:{abilityId:"false-gungnir-retrigger-commanders"}})),/STRUCTURED_SKILL_CONDITION_NOT_MET|SKILL_NOT_LEGAL|SKILL_USE_FORBIDDEN/);
});


test("batch029 Roberts Parley lets pay-capable opponents decide independently, shares rounded-up event VP, and discards the event",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch029-roberts",players:[{id:"r",name:"Roberts"},{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],seed:2902});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="r";
  state.players.r.servantId="servant.roberts"; state.players.r.locationId="city"; state.players.a.locationId="city"; state.players.b.locationId="city"; state.players.c.locationId="city"; state.board.locations.city=["r","a","b","c"];
  state.players.a.mana=3; state.players.b.mana=2; state.players.c.mana=1;
  createOwnedCardInstance(state,"r",{instanceId:"parley",definitionId:"servant.roberts.skill.sc-roberts-1",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.city=["event.fuyuki.5"]; state.board.eventVisibility={"event.fuyuki.5":"up"};
  const points=Number(built.events.find(e=>e.id==="event.fuyuki.5")?.victoryPoints); assert.ok(points>0);
  let res=engine.execute(state,command(state,"roberts-use",CommandType.UseSkill,"r",{skillId:"servant.roberts.skill.sc-roberts-1",data:{abilityId:"parley"}}));
  assert.ok(res.state.pendingDecision); assert.deepEqual(res.state.pendingDecision.options.map(o=>o.id),["event.fuyuki.5"]);
  let decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"roberts-event",CommandType.ResolveDecision,"r",{decisionId,selections:["event.fuyuki.5"]}));
  assert.ok(res.state.pendingDecision); assert.deepEqual(res.state.pendingDecision.chooserPlayerIds,["a","b"]); assert.deepEqual(new Set(res.state.pendingDecision.options.map(o=>o.id)),new Set(["pay","refuse"]));
  decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"a-pay",CommandType.ResolveDecision,"a",{decisionId,selections:["pay"]}));
  res=engine.execute(res.state,command(res.state,"b-refuse",CommandType.ResolveDecision,"b",{decisionId,selections:["refuse"]}));
  const share=Math.ceil(points/2);
  assert.equal(res.state.players.a.mana,1); assert.equal(res.state.players.b.mana,2); assert.equal(res.state.players.c.mana,1);
  assert.equal(res.state.players.r.victoryPoints,share); assert.equal(res.state.players.a.victoryPoints,share); assert.equal(res.state.players.b.victoryPoints,0); assert.equal(res.state.players.c.victoryPoints,0);
  assert.equal(res.state.board.eventDiscard.includes("event.fuyuki.5"),true); assert.equal(res.state.board.currentEvents.city.length,0);
  assert.equal(Object.values(res.state.players).some(p=>p.statuses.includes("roberts-parley-paid")),false);
});

test("batch029 Roberts Parley leaves the event in play when every eligible opponent refuses",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch029-roberts-refuse",players:[{id:"r",name:"Roberts"},{id:"a",name:"A"}],seed:2903});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="r"; state.players.r.servantId="servant.roberts";
  state.players.r.locationId="mountain"; state.players.a.locationId="mountain"; state.board.locations.mountain=["r","a"]; state.players.a.mana=2;
  createOwnedCardInstance(state,"r",{instanceId:"parley2",definitionId:"servant.roberts.skill.sc-roberts-1",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.mountain=["event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.4":"up"};
  let res=engine.execute(state,command(state,"roberts-use2",CommandType.UseSkill,"r",{skillId:"servant.roberts.skill.sc-roberts-1",data:{abilityId:"parley"}}));
  let decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"roberts-event2",CommandType.ResolveDecision,"r",{decisionId,selections:["event.fuyuki.4"]})); decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"a-refuse",CommandType.ResolveDecision,"a",{decisionId,selections:["refuse"]}));
  assert.equal(res.state.players.r.victoryPoints,0); assert.equal(res.state.players.a.victoryPoints,0); assert.deepEqual(res.state.board.currentEvents.mountain,["event.fuyuki.4"]); assert.equal(res.state.board.eventDiscard.includes("event.fuyuki.4"),false);
});

test("batch029 Astolfo Panic Flute gives each engaged opponent only their own keep options and closes the rest",()=>{
  const built=buildStandardContent(legacyContent);
  const extra={
    "test.ast.a1":{id:"test.ast.a1",name:"A1",cost:0,basePower:1,typeLabel:"力量",attributes:["力量"],basic:true},
    "test.ast.a2":{id:"test.ast.a2",name:"A2",cost:0,basePower:2,typeLabel:"力量",attributes:["力量"],basic:true},
    "test.ast.a3":{id:"test.ast.a3",name:"A3",cost:0,basePower:3,typeLabel:"力量",attributes:["力量"],basic:true},
    "test.ast.b1":{id:"test.ast.b1",name:"B1",cost:0,basePower:1,typeLabel:"力量",attributes:["力量"],basic:true},
    "test.ast.b2":{id:"test.ast.b2",name:"B2",cost:0,basePower:2,typeLabel:"力量",attributes:["力量"],basic:true},
    "test.ast.res":{id:"test.ast.res",name:"Residual",cost:0,basePower:1,typeLabel:"特殊",attributes:[],basic:false,residual:true},
  };
  const engine=new StandardMatchEngine({...built,cards:{...built.cards,...extra}});
  const state=createGameState({gameInstanceId:"batch029-astolfo",players:[{id:"s",name:"Astolfo"},{id:"a",name:"A"},{id:"b",name:"B"}],seed:2904});
  state.status="playing"; state.round=5; state.phase="combat"; state.step="player-window"; state.activePlayerId="s"; state.players.s.servantId="servant.astolfo"; state.players.s.mana=8;
  for(const id of ["s","a","b"])state.players[id].locationId="city"; state.board.locations.city=["s","a","b"];
  createOwnedCardInstance(state,"s",{instanceId:"flute",definitionId:"servant.astolfo.skill.sc-astolfo-1",zone:"servant-skills",face:"up",active:false});
  for(const [id,def] of [["a1","test.ast.a1"],["a2","test.ast.a2"],["a3","test.ast.a3"]]) createOwnedCardInstance(state,"a",{instanceId:id,definitionId:def,zone:"attack",face:"up",active:true,residual:false});
  createOwnedCardInstance(state,"a",{instanceId:"ares",definitionId:"test.ast.res",zone:"attack",face:"up",active:true,residual:true});
  for(const [id,def] of [["b1","test.ast.b1"],["b2","test.ast.b2"]]) createOwnedCardInstance(state,"b",{instanceId:id,definitionId:def,zone:"attack",face:"up",active:true,residual:false});
  let res=engine.execute(state,command(state,"ast-use",CommandType.UseSkill,"s",{skillId:"servant.astolfo.skill.sc-astolfo-1",data:{abilityId:"panic-flute-close-to-one"}}));
  assert.ok(res.state.pendingDecision); assert.deepEqual(res.state.pendingDecision.chooserPlayerIds,["a","b"]); assert.equal(res.state.players.s.trueNameRevealed,true);
  const aAction=engine.getLegalActions(res.state,"a")[0]; const aOptions=aAction.payload.options.map(o=>o.id); assert.deepEqual(new Set(aOptions),new Set(["a1","a2","a3"]));
  const bAction=engine.getLegalActions(res.state,"b")[0]; const bOptions=bAction.payload.options.map(o=>o.id); assert.deepEqual(new Set(bOptions),new Set(["b1","b2"]));
  const decisionId=res.state.pendingDecision.decisionId;
  assert.throws(()=>engine.execute(res.state,command(res.state,"a-forge",CommandType.ResolveDecision,"a",{decisionId,selections:["b1"]})),/DECISION_OPTION_INVALID/);
  res=engine.execute(res.state,command(res.state,"a-keep",CommandType.ResolveDecision,"a",{decisionId,selections:["a2"]}));
  res=engine.execute(res.state,command(res.state,"b-keep",CommandType.ResolveDecision,"b",{decisionId,selections:["b1"]}));
  assert.deepEqual(new Set(res.state.players.a.attack),new Set(["a1","a2","a3","ares"])); assert.deepEqual(new Set(res.state.players.b.attack),new Set(["b1","b2"]));
  for(const id of ["a1","a3","b2"]){ assert.equal(res.state.cards[id].active,false); assert.equal(res.state.cards[id].face,"down"); }
  assert.equal(res.state.cards.ares.active,true); assert.equal(res.state.cards.ares.residual,true);
});
