import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../src/content/generated/legacy-content.json' with { type: 'json' };
import { buildStandardContent } from '../src/content/content-package.ts';
import { createGameState } from '../src/domain/state/createGameState.ts';
import { CommandType } from '../src/match-engine/commands.ts';
import { StandardMatchEngine } from '../src/match-engine/standard-match-engine.ts';
import { createOwnedCardInstance } from '../src/rules-core/decks.ts';
import { PassiveRuntime, enqueuePassiveEffects } from '../src/rules-core/passives.ts';
import { EffectRuntime } from '../src/match-engine/effect-runtime.ts';
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from '../src/rules-core/skill-handlers.ts';

function command(state,id,type,actorId,payload={}) { return {commandId:id,gameInstanceId:state.gameInstanceId,actorId,expectedRevision:state.revision,type,payload}; }

function makeCopiedParasite(gameId='batch031-meph-copy') {
  const built=buildStandardContent(content); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:gameId,players:[{id:'m',name:'Mephisto'},{id:'v',name:'Victim'},{id:'lead',name:'Leader'}],seed:3101});
  state.status='playing'; state.round=4; state.phase='action'; state.step='player-window'; state.activePlayerId='m';
  state.players.m.servantId='servant.mephisto'; state.players.m.trueNameRevealed=true; state.players.m.mana=10;
  state.players.v.servantId='servant.medusa'; state.players.v.mana=0;
  state.players.lead.victoryPoints=8; state.players.m.victoryPoints=2; state.players.v.victoryPoints=2;
  for (const id of ['m','v','lead']) state.players[id].locationId='mountain'; state.board.locations.mountain=['m','v','lead'];
  createOwnedCardInstance(state,'m',{instanceId:'shallow',definitionId:'servant.mephisto.skill.sc-mephisto-3',zone:'attack',face:'up',active:true});
  createOwnedCardInstance(state,'m',{instanceId:'parasite-source',definitionId:'servant.mephisto.skill.sc-mephisto-2',zone:'servant-skills',face:'up',active:false});
  let r=engine.execute(state,command(state,'open',CommandType.UseSkill,'m',{skillId:'servant.mephisto.skill.sc-mephisto-3',data:{abilityId:'irresistible-gift'}}));
  r=engine.execute(r.state,command(r.state,'pick-source',CommandType.ResolveDecision,'m',{decisionId:r.state.pendingDecision.decisionId,selections:['parasite-source']}));
  r=engine.execute(r.state,command(r.state,'pick-victim',CommandType.ResolveDecision,'m',{decisionId:r.state.pendingDecision.decisionId,selections:['v']}));
  const copyId=r.state.players.v.attack.find((id)=>r.state.cards[id]?.definitionId==='servant.mephisto.skill.sc-mephisto-2');
  assert.ok(copyId);
  return {built,engine,state:r.state,copyId};
}

test('batch031 Mephisto parasite copy preserves creator provenance and victim can steal exactly one mana',()=>{
  const {engine,state,copyId}=makeCopiedParasite();
  assert.equal(state.cards[copyId].createdByPlayerId,'m');
  assert.equal(state.cards[copyId].derivedFromInstanceId,'parasite-source');
  state.phase='action'; state.step='player-window'; state.activePlayerId='v'; state.players.m.mana=3; state.players.v.mana=0;
  const used=engine.execute(state,command(state,'parasite-steal',CommandType.UseSkill,'v',{skillId:'servant.mephisto.skill.sc-mephisto-2',data:{abilityId:'parasite-steal-mana'}}));
  assert.equal(used.state.players.m.mana,2); assert.equal(used.state.players.v.mana,1);
  assert.equal(used.state.cards[copyId].powerModifiers?.some((mod)=>mod.sourceId==='servant.mephisto.skill.sc-mephisto-2'&&mod.value===1&&mod.duration==='game'),true);
});

test('batch031 Mephisto parasite steal is not legal when the creator cannot actually provide one mana',()=>{
  const {engine,state}=makeCopiedParasite('batch031-meph-no-mana');
  state.phase='action'; state.step='player-window'; state.activePlayerId='v'; state.players.m.mana=0;
  const legal=engine.getLegalActions(state,'v').filter((a)=>a.type===CommandType.UseSkill&&a.payload?.skillId==='servant.mephisto.skill.sc-mephisto-2');
  assert.equal(legal.some((a)=>a.payload?.data?.abilityId==='parasite-steal-mana'),false);
});

test('batch031 Mephisto parasite detonates for its current power at round start then exiles itself',()=>{
  const {built,state,copyId}=makeCopiedParasite('batch031-meph-detonate');
  registerCoreSkillHandlers(built.skills); const passives=new PassiveRuntime(); const effects=new EffectRuntime(); registerCorePassiveHandlers(built.skills,passives,effects);
  state.players.v.victoryPoints=8; state.players.lead.victoryPoints=8; state.players.m.victoryPoints=3;
  state.cards[copyId].powerModifiers=[{id:'test:permanent',sourceId:'servant.mephisto.skill.sc-mephisto-2',kind:'add',value:3,duration:'game'}];
  enqueuePassiveEffects(state,passives,{eventId:'round-start',type:'round.started',revision:state.revision,sourceCommandId:'test',payload:{round:state.round,phase:'preparation',activePlayerId:'v'}});
  effects.drain(state,1000,{...built.cards,...built.skills.asCardDefinitions()});
  assert.equal(state.players.v.defeated,true); assert.equal(state.players.v.victoryPoints,5); assert.equal(state.players.m.victoryPoints,6);
  assert.equal(state.cards[copyId].zone,'removed'); assert.equal(state.cards[copyId].active,false);
});
