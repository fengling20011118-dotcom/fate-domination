import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

function command(state,id,type,actorId,payload={}){return {commandId:id,gameInstanceId:state.gameInstanceId,actorId,expectedRevision:state.revision,type,payload};}

test("batch030 Darius Immortal Army creates five canonical temporary residual Undead Soldiers and their existing residual closes half",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  let state=createGameState({gameInstanceId:"batch030-darius",players:[{id:"d",name:"Darius"},{id:"o",name:"Opponent"}],seed:3001});
  state.status="playing"; state.round=6; state.phase="action"; state.step="player-window"; state.activePlayerId="d";
  state.players.d.servantId="servant.darius"; state.players.d.mana=8; state.players.d.locationId="city"; state.players.o.locationId="city"; state.board.locations.city=["d","o"];
  createOwnedCardInstance(state,"d",{instanceId:"army",definitionId:"servant.darius.skill.sc-darius-3",zone:"attack",face:"up",active:true});
  const result=engine.execute(state,command(state,"darius-army",CommandType.UseSkill,"d",{skillId:"servant.darius.skill.sc-darius-3",data:{abilityId:"immortal-army-summon"}}));
  state=result.state;
  const soldierIds=state.players.d.attack.filter(id=>id!=="army" && (state.cards[id].definitionId==="card.skill.servant.darius.skill.sc-darius-4" || state.cards[id].definitionId==="servant.darius.skill.sc-darius-4"));
  assert.equal(soldierIds.length,5);
  for(const id of soldierIds){const c=state.cards[id]; assert.equal(c.active,true); assert.equal(c.face,"up"); assert.equal(c.residual,true); assert.equal(c.temporary,true); assert.equal(c.paidCost,0); assert.equal(c.playedRound,6); assert.ok(c.createdByEffectId);}
  assert.equal(state.players.d.trueNameRevealed,true);
  state.phase="combat"; state.step="settlement"; state.activePlayerId=null;
  const definitions={...built.cards,...built.skills.asCardDefinitions()};
  enqueuePassiveEffects(state,engine.passives,{eventId:"batch030-combat",type:"combat.resolved",revision:state.revision,sourceCommandId:"test",payload:{locationId:"city"}});
  engine.effects.drain(state,1000,definitions);
  const remaining=soldierIds.filter(id=>state.cards[id].active && state.cards[id].zone==="attack");
  const closed=soldierIds.filter(id=>!state.cards[id].active);
  assert.equal(remaining.length,2); assert.equal(closed.length,3);
});



test("batch030 Roberts Baronet Roar joins attack after an explicit Parley refusal, pays 3, then moves to either adjacent location",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  let state=createGameState({gameInstanceId:"batch030-roberts",players:[{id:"r",name:"Roberts"},{id:"a",name:"A"}],seed:3002});
  state.status="playing"; state.round=6; state.phase="action"; state.step="player-window"; state.activePlayerId="r"; state.players.r.servantId="servant.roberts"; state.players.r.mana=7;
  state.players.r.locationId="city"; state.players.a.locationId="city"; state.board.locations.city=["r","a"]; state.players.a.mana=2;
  createOwnedCardInstance(state,"r",{instanceId:"parley",definitionId:"servant.roberts.skill.sc-roberts-1",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"r",{instanceId:"roar",definitionId:"servant.roberts.skill.sc-roberts-2",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.city=["event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.4":"up"};
  let res=engine.execute(state,command(state,"r-parley",CommandType.UseSkill,"r",{skillId:"servant.roberts.skill.sc-roberts-1",data:{abilityId:"parley"}}));
  let decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"r-event",CommandType.ResolveDecision,"r",{decisionId,selections:["event.fuyuki.4"]}));
  decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"a-refuse-roar",CommandType.ResolveDecision,"a",{decisionId,selections:["refuse"]}));
  assert.equal(res.state.players.r.flags.robertsParleyRefusedRound,6);
  assert.equal(res.state.players.r.mana,7);
  res=engine.execute(res.state,command(res.state,"r-roar",CommandType.UseSkill,"r",{skillId:"servant.roberts.skill.sc-roberts-2",data:{abilityId:"baronet-roar-after-refusal"}}));
  assert.equal(res.state.players.r.mana,4); assert.equal(res.state.players.r.trueNameRevealed,true);
  assert.equal(res.state.cards.roar.zone,"attack"); assert.equal(res.state.cards.roar.active,true); assert.equal(res.state.cards.roar.face,"up");
  res=engine.execute(res.state,command(res.state,"r-move-open",CommandType.UseSkill,"r",{skillId:"servant.roberts.skill.sc-roberts-2",data:{abilityId:"baronet-roar-adjacent-move"}}));
  const options=engine.getLegalActions(res.state,"r")[0].payload.options.map(o=>o.id);
  assert.deepEqual(new Set(options),new Set(["mountain","scouting"]));
  decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"r-move-resolve",CommandType.ResolveDecision,"r",{decisionId,selections:["mountain"]}));
  assert.equal(res.state.players.r.locationId,"mountain");
});
import { enqueueScheduledEffects } from "../src/rules-core/scheduled-effects.ts";

test("batch030 Albion Starfall triggers from real scouting entry, joins attack, relocates, and loses 8 mana at combat end",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch030-albion",players:[{id:"a",name:"Albion"}],seed:3002});
  state.status="playing"; state.round=4; state.phase="action"; state.step="move-decision"; state.activePlayerId="a";
  state.players.a.servantId="servant.albion"; state.players.a.locationId="city"; state.board.locations.city=["a"]; state.players.a.mana=20; state.players.a.victoryPoints=1;
  createOwnedCardInstance(state,"a",{instanceId:"albion-starfall",definitionId:"servant.albion.skill.sc-albion-1",zone:"servant-skills",face:"up",active:false});
  let res=engine.execute(state,command(state,"albion-enter",CommandType.MovePlayer,"a",{locationId:"scouting"}));
  assert.ok(res.state.pendingDecision); assert.deepEqual(new Set(res.state.pendingDecision.options.map(o=>o.id)),new Set(["use","skip"]));
  const manaAfterMove=res.state.players.a.mana; const vpAfterMove=res.state.players.a.victoryPoints;
  let decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"albion-use",CommandType.ResolveDecision,"a",{decisionId,selections:["use"]}));
  assert.ok(res.state.pendingDecision); assert.equal(res.state.cards["albion-starfall"].zone,"attack"); assert.equal(res.state.cards["albion-starfall"].active,true);
  assert.equal(res.state.players.a.mana,manaAfterMove+4); assert.equal(res.state.players.a.victoryPoints,vpAfterMove+2);
  assert.deepEqual(new Set(res.state.pendingDecision.options.map(o=>o.id)),new Set(["workshop","mountain","city"]));
  decisionId=res.state.pendingDecision.decisionId;
  res=engine.execute(res.state,command(res.state,"albion-relocate",CommandType.ResolveDecision,"a",{decisionId,selections:["mountain"]}));
  assert.equal(res.state.players.a.locationId,"mountain"); assert.equal(res.state.pendingDecision,null); assert.equal(res.state.scheduledEffects.length,1);
  const beforeLoss=res.state.players.a.mana;
  enqueueScheduledEffects(res.state,{eventId:"combat-ending-test",type:"combat.ending",revision:res.state.revision,sourceCommandId:"test",payload:{round:res.state.round}});
  engine.effects.drain(res.state,1000,{...built.cards,...built.skills.asCardDefinitions()});
  assert.equal(res.state.players.a.mana,Math.max(0,beforeLoss-8)); assert.equal(res.state.scheduledEffects.length,0);
});
import { movePlayerByEffect } from "../src/rules-core/board.ts";
import { calculateCombatCardPower } from "../src/rules-core/combat-power.ts";

test("batch030 Mozart Lullaby forbids opponents leaving workshop by regular or effect movement this round",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built); const defs={...built.cards,...built.skills.asCardDefinitions()};
  const state=createGameState({gameInstanceId:"batch030-mozart-lullaby",players:[{id:"m",name:"Mozart"},{id:"o",name:"Opponent"}],seed:3003});
  state.status="playing"; state.round=5; state.phase="action"; state.step="player-window"; state.activePlayerId="m"; state.players.m.servantId="servant.mozart"; state.players.m.mana=8;
  state.players.m.locationId="city"; state.players.o.locationId="workshop"; state.board.locations.city=["m"]; state.board.locations.workshop=["o"];
  createOwnedCardInstance(state,"m",{instanceId:"serenade",definitionId:"servant.mozart.skill.sc-mozart-1",zone:"attack",face:"up",active:true});
  let res=engine.execute(state,command(state,"mozart-lullaby",CommandType.UseSkill,"m",{skillId:"servant.mozart.skill.sc-mozart-1",data:{abilityId:"lullaby-lock-workshop"}}));
  assert.equal(res.state.players.m.trueNameRevealed,true); assert.ok(res.state.activeRuleModifiers.some(x=>x.rule==="movement_destinations"));
  res.state.activePlayerId="o"; res.state.step="move-decision"; res.state.players.o.mana=10;
  assert.throws(()=>engine.execute(res.state,command(res.state,"opp-move",CommandType.MovePlayer,"o",{locationId:"mountain"})),/MOVEMENT_DESTINATION_FORBIDDEN_BY_RULE/);
  assert.throws(()=>movePlayerByEffect(res.state,"o","mountain",defs),/MOVEMENT_DESTINATION_FORBIDDEN_BY_RULE/);
  res.state.activePlayerId="m"; res.state.step="move-decision"; res.state.players.m.locationId="workshop"; res.state.board.locations.city=[]; res.state.board.locations.workshop=["o","m"];
  assert.doesNotThrow(()=>movePlayerByEffect(res.state,"m","mountain",defs));
});

test("batch030 Mozart Serenade gives Dies Irae +3 only on the next round",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built); const defs={...built.cards,...built.skills.asCardDefinitions()};
  const state=createGameState({gameInstanceId:"batch030-mozart-next",players:[{id:"m",name:"Mozart"}],seed:3004});
  state.status="playing"; state.round=5; state.phase="action"; state.step="player-window"; state.activePlayerId="m"; state.players.m.servantId="servant.mozart"; state.players.m.mana=8; state.players.m.locationId="city"; state.board.locations.city=["m"];
  createOwnedCardInstance(state,"m",{instanceId:"serenade2",definitionId:"servant.mozart.skill.sc-mozart-1",zone:"attack",face:"up",active:true});
  createOwnedCardInstance(state,"m",{instanceId:"dies",definitionId:"servant.mozart.skill.sc-mozart-2",zone:"attack",face:"up",active:true});
  const base=calculateCombatCardPower(state,state.players.m,"dies",defs,"city");
  let res=engine.execute(state,command(state,"mozart-arm",CommandType.UseSkill,"m",{skillId:"servant.mozart.skill.sc-mozart-1",data:{abilityId:"serenade-arm-next-round-requiem"}}));
  assert.equal(res.state.scheduledEffects.length,1); assert.equal(calculateCombatCardPower(res.state,res.state.players.m,"dies",defs,"city"),base);
  res.state.round=6; res.state.phase="outpost"; res.state.step="player-window";
  enqueueScheduledEffects(res.state,{eventId:"round6",type:"round.started",revision:res.state.revision,sourceCommandId:"test",payload:{round:6,phase:"outpost"}}); engine.effects.drain(res.state,1000,defs);
  assert.equal(calculateCombatCardPower(res.state,res.state.players.m,"dies",defs,"city"),base+3);
  res.state.round=7;
  assert.equal(calculateCombatCardPower(res.state,res.state.players.m,"dies",defs,"city"),base);
});
