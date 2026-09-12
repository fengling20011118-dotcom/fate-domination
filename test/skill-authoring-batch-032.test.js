import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatCardPower, calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { enqueuePassiveEffects } from "../src/rules-core/passives.ts";

function setup(id){
 const built=buildStandardContent(legacyContent); const extra={
  "test.edison.magic":{id:"test.edison.magic",name:"Magic",cost:0,basePower:6,typeLabel:"魔术",attributes:["魔术"],basic:true},
  "test.edison.normal":{id:"test.edison.normal",name:"Normal",cost:0,basePower:2,typeLabel:"力量",attributes:["力量"],basic:true},
 }; const engine=new StandardMatchEngine({...built,cards:{...built.cards,...extra}}); const defs={...built.cards,...extra,...built.skills.asCardDefinitions()};
 const state=createGameState({gameInstanceId:id,players:[{id:"e",name:"Edison"},{id:"o",name:"Opponent"}],seed:3201}); state.status="playing";state.round=5;state.phase="combat";state.step="settlement";state.players.e.servantId="servant.edison";state.players.e.locationId="city";state.players.o.locationId="city";state.board.locations.city=["e","o"];
 state.players.e.flags.deploymentBonusActive=true;state.players.e.flags.deploymentBonus=3;state.players.e.flags.deploymentLocationId="city";
 createOwnedCardInstance(state,"e",{instanceId:"wfd",definitionId:"servant.edison.skill.sc-edison-3",zone:"attack",face:"up",active:true,residual:true});
 createOwnedCardInstance(state,"o",{instanceId:"magic",definitionId:"test.edison.magic",zone:"attack",face:"up",active:true});
 createOwnedCardInstance(state,"o",{instanceId:"lucky",definitionId:"card.cardluck",zone:"attack",face:"up",active:true});
 createOwnedCardInstance(state,"o",{instanceId:"normal",definitionId:"test.edison.normal",zone:"attack",face:"up",active:true});
 return {built,engine,defs,state};
}

test("batch032 Edison WFD zeros engaged Magic/Lucky and adds 2 to deployment advantage without mutating its base",()=>{
 const {state,defs}=setup("batch032-edison-power");
 assert.equal(calculateCombatCardPower(state,state.players.o,"magic",defs,"city"),0);
 assert.equal(calculateCombatCardPower(state,state.players.o,"lucky",defs,"city"),0);
 assert.equal(calculateCombatCardPower(state,state.players.o,"normal",defs,"city"),2);
 assert.equal(state.players.e.flags.deploymentBonus,3);
 assert.equal(calculateCombatPower(state,state.players.e,defs,"city"),8);
 assert.equal(state.players.e.flags.deploymentBonus,3);
});

test("batch032 Edison WFD closes after its combat only when combat snapshot contains Magic",()=>{
 const {state,engine,defs}=setup("batch032-edison-close");
 const noMagic={eventId:"combat-no-magic",type:"combat.resolved",revision:state.revision,sourceCommandId:"test",payload:{locationId:"city",powers:{e:8,o:2},winnerIds:["e"],attributes:{e:["特殊","宝具"],o:["力量"]}}};
 enqueuePassiveEffects(state,engine.passives,noMagic); engine.effects.drain(state,1000,defs); assert.equal(state.cards.wfd.active,true);
 const magic={eventId:"combat-magic",type:"combat.resolved",revision:state.revision,sourceCommandId:"test",payload:{locationId:"city",powers:{e:8,o:2},winnerIds:["e"],attributes:{e:["特殊","宝具"],o:["魔术"]}}};
 enqueuePassiveEffects(state,engine.passives,magic); engine.effects.drain(state,1000,defs);
 assert.equal(state.cards.wfd.active,false); assert.equal(state.cards.wfd.zone,"servant-skills"); assert.equal(state.players.e.servantSkills.includes("wfd"),true);
});
