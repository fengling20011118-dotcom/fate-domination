import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

function command(state, commandId, type, actorId, payload = {}) { return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload }; }
function setup() {
  const built=buildStandardContent(legacyContent);
  const extra={
    "test.kiri.cost1a":{id:"test.kiri.cost1a",name:"cost1a",cost:1,basePower:1,typeLabel:"力量",attributes:["力量"],basic:true},
    "test.kiri.cost1b":{id:"test.kiri.cost1b",name:"cost1b",cost:1,basePower:1,typeLabel:"力量",attributes:["力量"],basic:true},
  };
  return {built,engine:new StandardMatchEngine({...built,cards:{...built.cards,...extra}})};
}

test("batch028 Kiritsugu Mystic Break lets each engaged opponent submit independently then resolves all choices", () => {
  const {engine}=setup();
  const state=createGameState({gameInstanceId:"batch028-kiri-multi",players:[{id:"k",name:"Kiritsugu"},{id:"a",name:"A"},{id:"b",name:"B"}],seed:2801});
  state.status="playing"; state.round=5; state.phase="action"; state.step="player-window"; state.activePlayerId="k";
  state.players.k.servantId="servant.kiritsugu"; state.players.k.mana=8;
  for(const id of ["k","a","b"]){state.players[id].locationId="city";} state.board.locations.city=["k","a","b"];
  state.players.a.victoryPoints=10; state.players.b.victoryPoints=10; state.players.b.mana=10;
  createOwnedCardInstance(state,"k",{instanceId:"mystic",definitionId:"servant.kiritsugu.skill.sc-kiritsugu-2",zone:"servant-skills",face:"up",active:false});
  let r=engine.execute(state,command(state,"kiri-use",CommandType.UseSkill,"k",{skillId:"servant.kiritsugu.skill.sc-kiritsugu-2",data:{abilityId:"mystic-break-each-opponent"}}));
  assert.ok(r.state.pendingDecision); assert.deepEqual(r.state.pendingDecision.chooserPlayerIds,["a","b"]); assert.deepEqual(new Set(r.state.pendingDecision.options.map(o=>o.id)),new Set(["lose-vp","no-mana"]));
  assert.equal(r.state.players.k.trueNameRevealed,true);
  const decisionId=r.state.pendingDecision.decisionId;
  r=engine.execute(r.state,command(r.state,"a-pick",CommandType.ResolveDecision,"a",{decisionId,selections:["lose-vp"]}));
  assert.ok(r.state.pendingDecision); assert.deepEqual(r.state.pendingDecision.submissions.a,["lose-vp"]); assert.equal(r.state.players.a.victoryPoints,10); assert.deepEqual(engine.getLegalActions(r.state,"a"),[]);
  r=engine.execute(r.state,command(r.state,"b-pick",CommandType.ResolveDecision,"b",{decisionId,selections:["no-mana"]}));
  assert.equal(r.state.pendingDecision,null); assert.equal(r.state.players.a.victoryPoints,7); assert.equal(r.state.players.b.victoryPoints,10);
  assert.equal(r.state.activeRuleModifiers.some(m=>m.rule==="mana_spending" && m.operation==="forbid" && m.controllerPlayerId==="b" && m.duration==="round"),true);
});
test("batch028 Kiritsugu mana lock rejects positive card and movement mana spending while allowing non-spending state changes", () => {
  const {engine}=setup();
  const state=createGameState({gameInstanceId:"batch028-kiri-lock",players:[{id:"k",name:"Kiritsugu"},{id:"b",name:"B"}],seed:2802});
  state.status="playing"; state.round=5; state.phase="action"; state.step="player-window"; state.activePlayerId="k";
  state.players.k.servantId="servant.kiritsugu"; state.players.k.mana=8; state.players.k.locationId="city"; state.players.b.locationId="city"; state.board.locations.city=["k","b"];
  state.players.b.mana=10;
  createOwnedCardInstance(state,"k",{instanceId:"mystic",definitionId:"servant.kiritsugu.skill.sc-kiritsugu-2",zone:"servant-skills",face:"up",active:false});
  let r=engine.execute(state,command(state,"kiri-use-lock",CommandType.UseSkill,"k",{skillId:"servant.kiritsugu.skill.sc-kiritsugu-2",data:{abilityId:"mystic-break-each-opponent"}}));
  const decisionId=r.state.pendingDecision.decisionId;
  r=engine.execute(r.state,command(r.state,"b-lock",CommandType.ResolveDecision,"b",{decisionId,selections:["no-mana"]}));
  const locked=r.state;
  locked.activePlayerId="b"; locked.step="play-batch-draft";
  createOwnedCardInstance(locked,"b",{instanceId:"c1",definitionId:"test.kiri.cost1a",zone:"hand",face:"down",active:false});
  createOwnedCardInstance(locked,"b",{instanceId:"c2",definitionId:"test.kiri.cost1b",zone:"hand",face:"down",active:false});
  assert.throws(()=>engine.execute(locked,command(locked,"b-play",CommandType.CommitAttack,"b",{faceUpInstanceIds:["c1","c2"],faceDownInstanceIds:[]})),/MANA_SPENDING_FORBIDDEN_BY_RULE/);
  locked.step="move-decision"; locked.board.locations.city=["b"]; locked.board.locations.workshop=["k"]; locked.players.k.locationId="workshop";
  assert.throws(()=>engine.execute(locked,command(locked,"b-move",CommandType.MovePlayer,"b",{locationId:"scouting"})),/MANA_SPENDING_FORBIDDEN_BY_RULE/);
  assert.equal(locked.players.b.mana,10);
});
