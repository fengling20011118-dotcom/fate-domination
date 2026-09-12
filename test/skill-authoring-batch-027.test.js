import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

test("batch027 Edison Mass Production closes immediately when played while below 2 mana", () => {
  const built=buildStandardContent(legacyContent);
  const basic={id:"test.edison.basic",name:"basic",cost:0,basePower:1,typeLabel:"力量",attributes:["力量"],basic:true};
  const engine=new StandardMatchEngine({...built,cards:{...built.cards,[basic.id]:basic}});
  const state=createGameState({gameInstanceId:"batch027-edison-low",players:[{id:"e",name:"Edison"}],seed:2701});
  state.status="playing"; state.round=3; state.phase="action"; state.step="play-batch-draft"; state.activePlayerId="e";
  state.players.e.servantId="servant.edison"; state.players.e.mana=1;
  createOwnedCardInstance(state,"e",{instanceId:"mass",definitionId:"servant.edison.skill.sc-edison-2",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"e",{instanceId:"basic",definitionId:basic.id,zone:"hand",face:"down",active:false});
  const result=engine.execute(state,command(state,"edison-play",CommandType.CommitAttack,"e",{faceUpInstanceIds:["mass","basic"],faceDownInstanceIds:[]}));
  assert.equal(result.state.cards.mass.zone,"servant-skills");
  assert.equal(result.state.cards.mass.active,false);
  assert.equal(result.state.players.e.servantSkills.includes("mass"),true);
  assert.equal(result.state.players.e.attack.includes("basic"),true);
});

test("batch027 Edison Mass Production resolves workshop deployment rewards then closes from the resulting mana threshold", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch027-edison-workshop",players:[{id:"e",name:"Edison"},{id:"o",name:"Opponent"}],seed:2702});
  state.status="playing"; state.round=4; state.phase="outpost"; state.step="player-window"; state.activePlayerId="o";
  state.players.e.servantId="servant.edison"; state.players.e.locationId="mountain"; state.board.locations.mountain=["e"]; state.players.e.mana=4;
  createOwnedCardInstance(state,"e",{instanceId:"mass",definitionId:"servant.edison.skill.sc-edison-2",zone:"attack",face:"up",active:true,residual:true});
  const result=engine.execute(state,command(state,"opp-deploy",CommandType.DeployPlayer,"o",{locationId:"workshop"}));
  assert.equal(result.state.players.o.mana,3); // workshop first-slot 2 + Edison 1
  assert.equal(result.state.players.e.victoryPoints,2);
  assert.equal(result.state.players.e.mana,1);
  assert.equal(result.state.cards.mass.zone,"servant-skills");
  assert.equal(result.state.cards.mass.active,false);
  assert.equal(result.events.some(e=>e.type==="player.mana.changed" && e.payload?.playerId==="e" && e.payload?.after===1),true);
});
