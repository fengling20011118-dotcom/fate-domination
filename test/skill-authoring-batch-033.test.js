import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { calculateCombatPower } from "../src/rules-core/combat-power.ts";
import { applyClimaxElimination } from "../src/rules-core/rounds.ts";

function setup(id, count=2){
  const built=buildStandardContent(legacyContent);
  const defs={...built.cards,...built.skills.asCardDefinitions()};
  const players=Array.from({length:count},(_,i)=>({id:i===0?"t":`p${i}`,name:i===0?"Twice":`P${i}`}));
  const state=createGameState({gameInstanceId:id,players,seed:3301});
  state.status="playing"; state.round=8; state.phase="combat"; state.step="settlement";
  state.players.t.masterId="master.twice"; state.players.t.locationId="city"; state.board.locations.city=["t"];
  createOwnedCardInstance(state,"t",{instanceId:"savior",definitionId:"master.twice.skill.ascension",zone:"master-skills",face:"up",active:false});
  return {built,defs,state};
}

test("batch033 Twice Savior gives +12 combat power only while tied for lowest victory points",()=>{
  const {state,defs}=setup("batch033-twice-power",2);
  state.players.t.victoryPoints=1; state.players.p1.victoryPoints=3;
  assert.equal(calculateCombatPower(state,state.players.t,defs,"city"),12);
  state.players.t.victoryPoints=4;
  assert.equal(calculateCombatPower(state,state.players.t,defs,"city"),0);
  state.players.p1.victoryPoints=4;
  assert.equal(calculateCombatPower(state,state.players.t,defs,"city"),12);
});

test("batch033 Twice Savior removes its physical source to replace one climax elimination, then no longer protects",()=>{
  const {state,defs}=setup("batch033-twice-elimination",5);
  state.players.t.victoryPoints=0;
  for(let i=1;i<5;i++) state.players[`p${i}`].victoryPoints=10+i;
  const first=applyClimaxElimination(state,defs);
  assert.equal(first.includes("t"),false);
  assert.equal(state.players.t.eliminated,false);
  assert.equal(state.cards.savior.zone,"removed");
  assert.equal(state.players.t.masterSkills.includes("savior"),false);
  const second=applyClimaxElimination(state,defs);
  assert.equal(second.includes("t"),true);
  assert.equal(state.players.t.eliminated,true);
});
