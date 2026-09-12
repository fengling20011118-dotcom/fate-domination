import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { useCaligulaMadTyrant, useCaligulaFlucticulusDiana, CALIGULA_MAD_TYRANT_ID, CALIGULA_FLUCTICULUS_ID } from "../src/rules-core/caligula.ts";
import { registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";

const built = buildStandardContent(legacyContent);
registerCoreSkillHandlers(built.skills);
const definitions = { ...built.cards, ...built.skills.asCardDefinitions(),
  "card.test.str": { id:"card.test.str", name:"力量3", cardType:"attack", cost:2, basePower:3, typeLabel:"力量", attributes:["力量"], basic:true },
};
function make(id){ const state=createGameState({gameInstanceId:id,players:[{id:"c",name:"Caligula"},{id:"o1",name:"O1"},{id:"o2",name:"O2"}],seed:1}); state.status="playing";state.round=3;state.phase="action";state.step="player-window";state.activePlayerId="c";state.players.c.servantId="servant.caligula"; for(const p of Object.keys(state.players))putAt(state,p,"mountain");state.players.c.mana=10;return state; }
function putAt(state,id,loc){for(const ids of Object.values(state.board.locations)){const i=ids.indexOf(id);if(i>=0)ids.splice(i,1)}state.players[id].locationId=loc;state.board.locations[loc].push(id)}
function add(state,p,id,def,zone="attack",active=true,face="up"){createOwnedCardInstance(state,p,{instanceId:id,definitionId:def,zone,active,face})}

test("卡利古拉技能包 3/3 FULL",()=>{const skills=built.skills.list().filter(s=>s.ownerId==="servant.caligula");assert.equal(skills.length,3);assert.ok(skills.every(s=>s.supportLevel==="FULL"))});

test("暴君特权可免费暗置【蔑】，中伤支付其费用激活并令一名战败对手失去2战果",()=>{
 const state=make("caligula-injury");add(state,"c","tyrant",CALIGULA_MAD_TYRANT_ID);add(state,"c","insult","card.test.str","hand",false,"down");state.players.o1.victoryPoints=5;
 useCaligulaMadTyrant({state,player:state.players.c,skill:built.skills.get(CALIGULA_MAD_TYRANT_ID),definitions,payload:{abilityId:"make-insult",instanceId:"insult"},openDecision:()=>{}});
 assert.equal(state.cards.insult.zone,"attack");assert.equal(state.cards.insult.face,"down");
 state.phase="combat"; const before=state.players.c.mana;
 useCaligulaMadTyrant({state,player:state.players.c,skill:built.skills.get(CALIGULA_MAD_TYRANT_ID),definitions,payload:{abilityId:"injury",instanceId:"insult"},openDecision:()=>{}});
 assert.equal(state.players.c.mana,before-2);assert.equal(state.cards.insult.active,true);
 useCaligulaMadTyrant({state,player:state.players.c,skill:built.skills.get(CALIGULA_MAD_TYRANT_ID),definitions,payload:{eventType:"combat.resolved",event:{locationId:"mountain",powers:{c:8,o1:4},winnerIds:["c"]}},openDecision:()=>{}});
 assert.equal(state.players.o1.victoryPoints,3);
});

test("暴君特权的怜悯弃置暗置【蔑】，获胜后获得1魔力和1战果",()=>{
 const state=make("caligula-pity");add(state,"c","tyrant",CALIGULA_MAD_TYRANT_ID);add(state,"c","insult","card.test.str","hand",false,"down");
 useCaligulaMadTyrant({state,player:state.players.c,skill:built.skills.get(CALIGULA_MAD_TYRANT_ID),definitions,payload:{abilityId:"make-insult",instanceId:"insult"},openDecision:()=>{}});
 state.phase="combat";state.players.c.mana=2;state.players.c.victoryPoints=0;
 useCaligulaMadTyrant({state,player:state.players.c,skill:built.skills.get(CALIGULA_MAD_TYRANT_ID),definitions,payload:{abilityId:"pity",instanceId:"insult"},openDecision:()=>{}});
 assert.equal(state.cards.insult.zone,"discard");
 useCaligulaMadTyrant({state,player:state.players.c,skill:built.skills.get(CALIGULA_MAD_TYRANT_ID),definitions,payload:{eventType:"combat.resolved",event:{powers:{c:8,o1:4},winnerIds:["c"]}},openDecision:()=>{}});
 assert.equal(state.players.c.mana,3);assert.equal(state.players.c.victoryPoints,1);
});

test("吞噬吾心吧月光使自己与交战对手下回合的需激活能力统一替换为+3合计威力",()=>{
 const state=make("caligula-moon");state.phase="combat";add(state,"c","moon",CALIGULA_FLUCTICULUS_ID);add(state,"c","tyrant",CALIGULA_MAD_TYRANT_ID);
 useCaligulaFlucticulusDiana({state,player:state.players.c,skill:built.skills.get(CALIGULA_FLUCTICULUS_ID),definitions,payload:{abilityId:"contagious-lunacy"},openDecision:()=>{}});
 for(const id of ["c","o1","o2"]) assert.equal(state.players[id].flags.activatedAbilityReplacementRound,4);
 state.round=4;state.phase="action";state.activePlayerId="c";state.players.c.flags.roundPowerBonus=0;
 // 原本“制造蔑”在没有手牌候选时不合法；癫狂只保留激活窗口并替换其效果。
 built.skills.execute(state,"c",CALIGULA_MAD_TYRANT_ID,{abilityId:"make-insult"},()=>{},()=>0,definitions);
 assert.equal(state.players.c.flags.roundPowerBonus,3);
});
