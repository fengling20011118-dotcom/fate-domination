import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { movePlayerCard } from "../src/rules-core/decks.ts";

function command(state, id, type, actorId, payload={}) { return { commandId:id, gameInstanceId:state.gameInstanceId, actorId, expectedRevision:state.revision, type, payload }; }

test("batch026 Amakusa Doctrine assigns leader and next-seat god-servant roles at game start",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch026-amakusa-doctrine",players:[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],seed:2601});
  state.players.a.masterId="master.amakusa";
  const result=engine.execute(state,command(state,"start",CommandType.StartStandardGame,"host",{}));
  assert.equal(result.state.players.a.statuses.includes("role:red-team-leader"),true);
  assert.equal(result.state.players.b.statuses.includes("role:god-servant"),true);
  assert.equal(result.state.players.b.statuses.includes("history:god-servant"),true);
  assert.equal(result.state.players.c.statuses.includes("role:god-servant"),false);
});

test("batch026 turn-order next-player role assignment wraps from the last seat",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch026-amakusa-wrap",players:[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],seed:2602});
  state.players.c.masterId="master.amakusa";
  const result=engine.execute(state,command(state,"start-wrap",CommandType.StartStandardGame,"host",{}));
  assert.equal(result.state.players.c.statuses.includes("role:red-team-leader"),true);
  assert.equal(result.state.players.a.statuses.includes("role:god-servant"),true);
  assert.equal(result.state.players.b.statuses.includes("role:god-servant"),false);
});

import { createEvent } from "../src/match-engine/events.ts";
import { enqueueScheduledEffects } from "../src/rules-core/scheduled-effects.ts";

test("batch026 Amakusa Red Team Leader pays 1 plus current god-servants and schedules an eligible never-servant",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  let state=createGameState({gameInstanceId:"batch026-amakusa-vassal",players:[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],seed:2603});
  state.players.a.masterId="master.amakusa";
  let result=engine.execute(state,command(state,"start-vassal",CommandType.StartStandardGame,"host",{})); state=result.state;
  state.phase="action"; state.step="player-window"; state.activePlayerId="a"; state.players.a.commandSeals=3; state.players.b.commandSeals=0; state.players.c.commandSeals=2;
  result=engine.execute(state,command(state,"vassalize",CommandType.UseSkill,"a",{skillId:"master.amakusa.skill.s2",data:{abilityId:"vassalize"}})); state=result.state;
  assert.ok(state.pendingDecision); assert.deepEqual(state.pendingDecision.options.map(o=>o.id),["c"]);
  const decisionId=state.pendingDecision.decisionId;
  result=engine.execute(state,command(state,"vassalize-target",CommandType.ResolveDecision,"a",{decisionId,selections:["c"]})); state=result.state;
  assert.equal(state.players.a.commandSeals,1); // X = 1 + one current god-servant.
  assert.equal(state.players.c.statuses.includes("role:god-servant"),false);
  assert.equal(state.scheduledEffects.length,1); assert.equal(state.scheduledEffects[0].triggerRound,state.round+1);
  state.round += 1;
  const event=createEvent(state,"round-next",0,"round.started",{round:state.round}); enqueueScheduledEffects(state,event);
  const definitions={...built.cards,...Object.fromEntries(built.events.map(e=>[e.id,e])),...built.skills.asCardDefinitions()};
  engine.effects.drain(state,1000,definitions);
  assert.equal(state.players.c.statuses.includes("role:god-servant"),true); assert.equal(state.players.c.statuses.includes("history:god-servant"),true); assert.equal(state.scheduledEffects.length,0);
});

test("batch026 Amakusa Red Team Leader is illegal when dynamic command-seal cost cannot be paid",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  let state=createGameState({gameInstanceId:"batch026-amakusa-vassal-cost",players:[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],seed:2604}); state.players.a.masterId="master.amakusa";
  let result=engine.execute(state,command(state,"start-cost",CommandType.StartStandardGame,"host",{})); state=result.state;
  state.phase="action"; state.step="player-window"; state.activePlayerId="a"; state.players.a.commandSeals=1; state.players.c.commandSeals=0;
  assert.throws(()=>engine.execute(state,command(state,"vassalize-no-cost",CommandType.UseSkill,"a",{skillId:"master.amakusa.skill.s2",data:{abilityId:"vassalize"}})),/SKILL_USE_FORBIDDEN/);
});

import { endStandardRound } from "../src/rules-core/rounds.ts";

test("batch026 Amakusa Absolute Punishment copies one revealed god-servant skill, revokes the role, and forbids the original this round",()=>{
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  let state=createGameState({gameInstanceId:"batch026-amakusa-absolution",players:[{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],seed:2605});
  state.players.a.masterId="master.amakusa";
  state.players.b.servantId="servant.emiya";
  state.players.c.servantId="servant.helena";
  let result=engine.execute(state,command(state,"start-absolution",CommandType.StartStandardGame,"host",{})); state=result.state;
  const definitions={...built.cards,...Object.fromEntries(built.events.map(e=>[e.id,e])),...built.skills.asCardDefinitions()};
  const linked=(playerId,skillId)=>state.players[playerId].servantSkills.find(id=>definitions[state.cards[id]?.definitionId]?.linkedSkillId===skillId || state.cards[id]?.definitionId===skillId);
  const emiyaId=linked("b","servant.emiya.skill.sc-emiya-2"); assert.ok(emiyaId);
  state.cards[emiyaId].face="up";
  const hiddenB=state.players.b.servantSkills.find(id=>id!==emiyaId); if(hiddenB) state.cards[hiddenB].face="down";
  const cSkill=state.players.c.servantSkills[0]; assert.ok(cSkill);
  state.phase="action"; state.step="player-window"; state.activePlayerId="a";
  result=engine.execute(state,command(state,"absolution-use",CommandType.UseSkill,"a",{skillId:"master.amakusa.skill.s1a",data:{abilityId:"absolute-punishment"}})); state=result.state;
  assert.ok(state.pendingDecision);
  const optionIds=state.pendingDecision.options.map(o=>o.id);
  assert.equal(optionIds.includes(emiyaId),true);
  if(hiddenB) assert.equal(optionIds.includes(hiddenB),false);
  assert.equal(optionIds.includes(cSkill),false);
  const decisionId=state.pendingDecision.decisionId;
  result=engine.execute(state,command(state,"absolution-pick",CommandType.ResolveDecision,"a",{decisionId,selections:[emiyaId]})); state=result.state;
  assert.equal(state.pendingDecision,null);
  assert.equal(state.players.b.statuses.includes("role:god-servant"),false);
  assert.equal(state.players.b.statuses.includes("history:god-servant"),true);
  const copies=state.players.a.servantSkills.filter(id=>id!==emiyaId && state.cards[id]?.createdByEffectId?.includes("master.amakusa.skill.s1a:copy") && state.cards[id]?.definitionId===state.cards[emiyaId].definitionId);
  assert.equal(copies.length,1); const copyId=copies[0]; assert.equal(state.cards[copyId].temporary,true); assert.equal(state.cards[copyId].face,"up"); assert.equal(state.cards[copyId].active,false);
  const ban=state.activeRuleModifiers.find(m=>m.controllerPlayerId==="b"&&m.rule==="skill_use"&&m.operation==="forbid");
  assert.ok(ban); assert.deepEqual(ban.scope.skillDefinitionIds,["servant.emiya.skill.sc-emiya-2"]); assert.equal(ban.duration,"round");

  state.modeState.situationRestrictions={};
  state.activePlayerId="b"; state.players.b.flags.deploymentBonusActive=true; state.players.b.flags.deploymentBonus=1;
  assert.throws(()=>engine.execute(state,command(state,"b-original-forbidden",CommandType.UseSkill,"b",{skillId:"servant.emiya.skill.sc-emiya-2",data:{abilityId:"fake-spiral-triple-advantage"}})),/SKILL_USE_FORBIDDEN/);

  state.activePlayerId="a"; state.players.a.flags.deploymentBonusActive=true; state.players.a.flags.deploymentBonus=1;
  // Base rules require a non-passive action ability printed on a skill card to
  // have that physical card active first. Absolute Punishment copies the card
  // into the skill zone; activate that copied physical source before testing
  // that the original owner's round ban does not spill onto the copy.
  movePlayerCard(state,"a",copyId,"attack"); state.cards[copyId].face="up"; state.cards[copyId].active=true;
  result=engine.execute(state,command(state,"a-copy-usable",CommandType.UseSkill,"a",{skillId:"servant.emiya.skill.sc-emiya-2",data:{abilityId:"fake-spiral-triple-advantage"}})); state=result.state;
  assert.equal(state.players.a.flags.deploymentBonus,3);

  endStandardRound(state,definitions);
  assert.equal(state.players.a.servantSkills.includes(copyId),false); assert.equal(state.cards[copyId].zone,"removed");
});
