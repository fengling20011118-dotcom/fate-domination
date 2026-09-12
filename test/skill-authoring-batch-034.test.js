import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance, movePlayerCard } from "../src/rules-core/decks.ts";

function command(state,id,type,actorId,payload={}){return {commandId:id,gameInstanceId:state.gameInstanceId,actorId,expectedRevision:state.revision,type,payload};}
function setup(id, location="city"){
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:id,players:[{id:"k",name:"Kama"},{id:"o",name:"Opponent"},{id:"x",name:"Other"}],seed:3401});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="k";
  state.players.k.servantId="servant.kama"; state.players.k.locationId=location; state.players.o.locationId=location; state.players.x.locationId="mountain";
  for(const key of Object.keys(state.board.locations)) state.board.locations[key]=[];
  state.board.locations[location]=["k","o"]; if(location!=="mountain") state.board.locations.mountain=["x"]; else state.board.locations.workshop=["x"];
  state.players.k.mana=5; state.players.o.mana=1; state.players.x.mana=5;
  createOwnedCardInstance(state,"k",{instanceId:"formless",definitionId:"servant.kama.skill.sc-kama-1",zone:"attack",face:"up",active:true,residual:true});
  return {built,engine,state};
}
function openChoice(engine,state,id){return engine.execute(state,command(state,id,CommandType.UseSkill,"k",{skillId:"servant.kama.skill.sc-kama-1",data:{abilityId:"formless-action"}}));}
function resolve(engine,state,id,selection){const decisionId=state.pendingDecision?.decisionId; assert.ok(decisionId); return engine.execute(state,command(state,id,CommandType.ResolveDecision,"k",{decisionId,selections:[selection]}));}

test("batch034 Kama Formless option is once per round and each selected option stays unavailable until source closes",()=>{
  const {engine,state}=setup("batch034-kama-choice");
  let res=openChoice(engine,state,"open-power");
  assert.deepEqual(new Set(res.state.pendingDecision.options.map(o=>o.id)),new Set(["power","move","drain","close"]));
  res=resolve(engine,res.state,"choose-power","power");
  assert.equal(res.state.players.k.flags.roundPowerBonus,3);
  assert.throws(()=>openChoice(engine,res.state,"same-round"),/SKILL_USE_FORBIDDEN/);
  res.state.round=5;
  res=openChoice(engine,res.state,"next-round");
  const options=res.state.pendingDecision.options.map(o=>o.id);
  assert.equal(options.includes("power"),false);
  assert.equal(options.includes("drain"),true);
  assert.equal(options.includes("close"),true);
});

test("batch034 Kama closing Formless clears until-source-closed option history for the same physical card",()=>{
  const {engine,state}=setup("batch034-kama-close-reset");
  let res=resolve(engine,openChoice(engine,state,"r4-open" ).state,"r4-power","power");
  res.state.round=5;
  res=resolve(engine,openChoice(engine,res.state,"r5-open").state,"r5-close","close");
  assert.equal(res.state.cards.formless.zone,"servant-skills");
  assert.equal(res.state.cards.formless.active,false);
  assert.equal(Object.keys(res.state.players.k.flags).some(key=>key.includes("structuredChoice:servant.kama.skill.sc-kama-1:formless-options")),false);
  movePlayerCard(res.state,"k","formless","attack"); res.state.cards.formless.face="up"; res.state.cards.formless.active=true; res.state.cards.formless.residual=true; res.state.round=6;
  res=openChoice(engine,res.state,"r6-open");
  assert.deepEqual(new Set(res.state.pendingDecision.options.map(o=>o.id)),new Set(["power","move","drain","close"]));
});

test("batch034 Kama move option offers only forward destinations within two arrows",()=>{
  const {engine,state}=setup("batch034-kama-move","workshop");
  let res=openChoice(engine,state,"move-open");
  res=resolve(engine,res.state,"move-option","move");
  assert.ok(res.state.pendingDecision);
  assert.deepEqual(new Set(res.state.pendingDecision.options.map(o=>o.id)),new Set(["mountain","city"]));
  res=resolve(engine,res.state,"move-city","city");
  assert.equal(res.state.players.k.locationId,"city");
});

test("batch034 Kama drain option makes every player at the same location lose up to two mana",()=>{
  const {engine,state}=setup("batch034-kama-drain");
  let res=openChoice(engine,state,"drain-open");
  res=resolve(engine,res.state,"drain-select","drain");
  assert.equal(res.state.players.k.mana,3);
  assert.equal(res.state.players.o.mana,0);
  assert.equal(res.state.players.x.mana,5);
});
