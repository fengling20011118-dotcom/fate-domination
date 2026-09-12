import test from "node:test";
import assert from "node:assert/strict";
import legacyContent from "../src/content/generated/legacy-content.json" with { type: "json" };
import { buildStandardContent } from "../src/content/content-package.ts";
import { createGameState } from "../src/domain/state/createGameState.ts";
import { assertStateInvariants } from "../src/domain/state/invariants.ts";
import { createEvent } from "../src/match-engine/events.ts";
import { StandardMatchEngine } from "../src/match-engine/standard-match-engine.ts";
import { CommandType } from "../src/match-engine/commands.ts";
import { createOwnedCardInstance } from "../src/rules-core/decks.ts";
import { EffectRuntime } from "../src/match-engine/effect-runtime.ts";
import { PassiveRuntime, enqueuePassiveEffects } from "../src/rules-core/passives.ts";
import { registerCorePassiveHandlers, registerCoreSkillHandlers } from "../src/rules-core/skill-handlers.ts";
import { finalizeCombatFromSnapshot } from "../src/rules-core/combat.ts";

function command(state, commandId, type, actorId, payload = {}) {
  return { commandId, gameInstanceId: state.gameInstanceId, actorId, expectedRevision: state.revision, type, payload };
}

function setup() {
  const built = buildStandardContent(legacyContent);
  const definitions = { ...built.cards, ...Object.fromEntries(built.events.map((event) => [event.id, event])), ...built.skills.asCardDefinitions() };
  const passives = new PassiveRuntime();
  const effects = new EffectRuntime();
  registerCoreSkillHandlers(built.skills);
  registerCorePassiveHandlers(built.skills, passives, effects, definitions);
  return { built, definitions, passives, effects };
}

test("batch025 Mozart Dies Irae uses printed event VP for every combat loser in the armed round", () => {
  const { definitions, passives, effects } = setup();
  const state = createGameState({ gameInstanceId: "batch025-mozart", players: [{id:"m",name:"Mozart"},{id:"l",name:"Loser"}], seed:2501 });
  state.status="playing"; state.round=4; state.phase="action"; state.step="settlement";
  state.players.m.servantId="servant.mozart";
  state.players.m.victoryPoints=8; state.players.l.victoryPoints=10;

  const played = createEvent(state,"mozart-play",0,"card.played",{playerId:"m",definitionId:"servant.mozart.skill.sc-mozart-2",face:"up",paidMana:6,attributes:["魔术","宝具"]});
  enqueuePassiveEffects(state,passives,played); effects.drain(state,1000,definitions);
  assert.equal(state.players.m.flags.mozartDiesIraeRound,4);

  state.phase="combat"; state.board.locations.mountain=["m","l"];
  state.players.m.locationId="mountain"; state.players.l.locationId="mountain";
  state.board.currentEvents.mountain=["evt-a","evt-b"];
  const result = finalizeCombatFromSnapshot(state,{locationId:"mountain",participantIds:["m","l"],powers:{m:8,l:3},attributes:{m:[],l:[]},cardPowers:{m:{},l:{}},cardAttributes:{m:{},l:{}},round:4},definitions,{
    "evt-a":{id:"evt-a",victoryPoints:2}, "evt-b":{id:"evt-b",victoryPoints:3}
  });
  assert.deepEqual(result.eventIds,["evt-a","evt-b"]);
  assert.equal(result.printedEventVictoryPoints,5);
  assert.equal(state.players.l.victoryPoints,10);

  const resolved=createEvent(state,"mozart-combat",0,"combat.resolved",result);
  enqueuePassiveEffects(state,passives,resolved); effects.drain(state,1000,definitions);
  assert.equal(state.players.l.victoryPoints,5);
});

test("batch025 Mozart Dies Irae does not leak into a later round", () => {
  const { definitions, passives, effects } = setup();
  const state = createGameState({ gameInstanceId: "batch025-mozart-expire", players: [{id:"m",name:"Mozart"},{id:"l",name:"Loser"}], seed:2502 });
  state.status="playing"; state.round=4; state.players.m.servantId="servant.mozart"; state.players.l.victoryPoints=9;
  const played=createEvent(state,"mozart-play2",0,"card.played",{playerId:"m",definitionId:"servant.mozart.skill.sc-mozart-2",face:"up"});
  enqueuePassiveEffects(state,passives,played); effects.drain(state,1000,definitions);
  state.round=5;
  const resolved=createEvent(state,"mozart-late",0,"combat.resolved",{locationId:"city",powers:{m:7,l:2},winnerIds:["m"],defeatedPlayerIds:["l"],victoryPoints:{m:1,l:0},eventIds:["evt"],printedEventVictoryPoints:4,scoutingPlayerId:null,attributes:{m:[],l:[]}});
  enqueuePassiveEffects(state,passives,resolved); effects.drain(state,1000,definitions);
  assert.equal(state.players.l.victoryPoints,9);
});


test("batch025 Kiritsugu Seize the Day uses current combat power, gains one selected event VP, and discards that event", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-kiritsugu-event",players:[{id:"k",name:"Kiritsugu"}],seed:2503});
  state.status="playing"; state.round=4; state.phase="action"; state.step="player-window"; state.activePlayerId="k";
  state.players.k.servantId="servant.kiritsugu"; state.players.k.mana=8; state.players.k.locationId="mountain"; state.board.locations.mountain=["k"];
  state.players.k.flags.roundPowerBonus=13;
  createOwnedCardInstance(state,"k",{instanceId:"kiritsugu-event-skill",definitionId:"servant.kiritsugu.skill.sc-kiritsugu-3",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.mountain=["event.fuyuki.1","event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"up"};
  let result=engine.execute(state,command(state,"kiritsugu-use",CommandType.UseSkill,"k",{skillId:"servant.kiritsugu.skill.sc-kiritsugu-3",data:{abilityId:"seize-the-day-event"}}));
  assert.ok(result.state.pendingDecision); assert.deepEqual(new Set(result.state.pendingDecision.options.map(o=>o.id)),new Set(["event.fuyuki.1","event.fuyuki.4"]));
  const before=result.state.players.k.victoryPoints;
  result=engine.execute(result.state,command(result.state,"kiritsugu-pick",CommandType.ResolveDecision,"k",{decisionId:result.state.pendingDecision.decisionId,selections:["event.fuyuki.4"]}));
  assert.equal(result.state.players.k.victoryPoints,before+3);
  assert.deepEqual(result.state.board.currentEvents.mountain,["event.fuyuki.1"]);
  assert.equal(result.state.board.eventDiscard.includes("event.fuyuki.4"),true);
  assert.equal(result.state.players.k.trueNameRevealed,true);
});

test("batch025 Merlin Avalon grants scouting bonus once and removes all current battlefield events to removed zone", () => {
  const { built, definitions, passives, effects }=setup();
  const state=createGameState({gameInstanceId:"batch025-merlin",players:[{id:"m",name:"Merlin"}],seed:2504});
  state.status="playing"; state.round=4; state.phase="combat"; state.players.m.servantId="servant.merlin"; state.players.m.locationId="scouting"; state.board.locations.scouting=["m"];
  createOwnedCardInstance(state,"m",{instanceId:"merlin-avalon",definitionId:"servant.merlin.skill.sc-merlin-3",zone:"servant-skills",face:"up",active:false});
  const first=createEvent(state,"merlin-scout-1",0,"combat.resolved",{locationId:"mountain",powers:{},winnerIds:[],defeatedPlayerIds:[],victoryPoints:{m:2},eventIds:[],printedEventVictoryPoints:0,scoutingPlayerId:"m",attributes:{}});
  enqueuePassiveEffects(state,passives,first); effects.drain(state,1000,definitions);
  assert.equal(state.players.m.victoryPoints,1); assert.equal(state.players.m.mana,2);
  const second=createEvent(state,"merlin-scout-2",0,"combat.resolved",{locationId:"city",powers:{},winnerIds:[],defeatedPlayerIds:[],victoryPoints:{},eventIds:[],printedEventVictoryPoints:0,scoutingPlayerId:"m",attributes:{}});
  enqueuePassiveEffects(state,passives,second); effects.drain(state,1000,definitions);
  assert.equal(state.players.m.victoryPoints,1); assert.equal(state.players.m.mana,2);

  state.phase="action"; state.step="player-window"; state.activePlayerId="m"; state.players.m.mana=8; state.players.m.locationId="city"; state.board.locations.scouting=[]; state.board.locations.city=["m"];
  state.board.currentEvents.city=["event.fuyuki.1","event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"down"};
  const engine=new StandardMatchEngine(built);
  const result=engine.execute(state,command(state,"merlin-remove",CommandType.UseSkill,"m",{skillId:"servant.merlin.skill.sc-merlin-3",data:{abilityId:"avalon-remove-events"}}));
  assert.deepEqual(result.state.board.currentEvents.city,[]);
  assert.deepEqual(new Set(result.state.board.eventRemoved),new Set(["event.fuyuki.1","event.fuyuki.4"]));
  assert.equal(result.state.board.eventDiscard.length,0);
  assert.equal(result.state.players.m.trueNameRevealed,true);
});


test("batch025 Iskandar Gordius Wheel discards one local event, chooses one of the next two, and shuffles the rest", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-iskandar",players:[{id:"i",name:"Iskandar"}],seed:2505});
  state.status="playing"; state.round=5; state.phase="action"; state.step="player-window"; state.activePlayerId="i";
  state.players.i.servantId="servant.iskandar"; state.players.i.mana=8; state.players.i.locationId="mountain"; state.board.locations.mountain=["i"];
  createOwnedCardInstance(state,"i",{instanceId:"iskandar-wheel",definitionId:"servant.iskandar.skill.sc-iskandar-2",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.mountain=["event.fuyuki.1"]; state.board.eventVisibility={"event.fuyuki.1":"up"};
  state.board.eventDeck=["event.fuyuki.2","event.fuyuki.3","event.fuyuki.5"]; state.board.eventDiscard=[]; state.board.eventRemoved=[];

  let result=engine.execute(state,command(state,"iskandar-use",CommandType.UseSkill,"i",{skillId:"servant.iskandar.skill.sc-iskandar-2",data:{abilityId:"gordius-wheel-event-replacement"}}));
  assert.equal(result.state.players.i.trueNameRevealed,true);
  assert.deepEqual(result.state.pendingDecision.options.map(o=>o.id),["event.fuyuki.1"]);
  result=engine.execute(result.state,command(result.state,"iskandar-discard",CommandType.ResolveDecision,"i",{decisionId:result.state.pendingDecision.decisionId,selections:["event.fuyuki.1"]}));
  assert.ok(result.state.pendingDecision);
  assert.deepEqual(result.state.pendingDecision.options.map(o=>o.id),["event.fuyuki.2","event.fuyuki.3"]);
  result=engine.execute(result.state,command(result.state,"iskandar-pick",CommandType.ResolveDecision,"i",{decisionId:result.state.pendingDecision.decisionId,selections:["event.fuyuki.3"]}));
  assert.equal(result.state.pendingDecision,null);
  assert.deepEqual(result.state.board.currentEvents.mountain,["event.fuyuki.3"]);
  assert.equal(result.state.board.eventVisibility["event.fuyuki.3"],"up");
  assert.deepEqual(result.state.board.eventDiscard,["event.fuyuki.1"]);
  assert.deepEqual(new Set(result.state.board.eventDeck),new Set(["event.fuyuki.2","event.fuyuki.5"]));
  assert.doesNotThrow(()=>assertStateInvariants(result.state));
});

test("batch025 Iskandar Gordius Wheel recycles event discard when fewer than two remain in the deck", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-iskandar-recycle",players:[{id:"i",name:"Iskandar"}],seed:2506});
  state.status="playing"; state.round=5; state.phase="action"; state.step="player-window"; state.activePlayerId="i";
  state.players.i.servantId="servant.iskandar"; state.players.i.mana=8; state.players.i.locationId="city"; state.board.locations.city=["i"];
  createOwnedCardInstance(state,"i",{instanceId:"iskandar-wheel-2",definitionId:"servant.iskandar.skill.sc-iskandar-2",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.city=["event.fuyuki.1"]; state.board.eventVisibility={"event.fuyuki.1":"up"};
  state.board.eventDeck=["event.fuyuki.2"]; state.board.eventDiscard=["event.fuyuki.3"]; state.board.eventRemoved=[];

  let result=engine.execute(state,command(state,"iskandar-use-2",CommandType.UseSkill,"i",{skillId:"servant.iskandar.skill.sc-iskandar-2",data:{abilityId:"gordius-wheel-event-replacement"}}));
  result=engine.execute(result.state,command(result.state,"iskandar-discard-2",CommandType.ResolveDecision,"i",{decisionId:result.state.pendingDecision.decisionId,selections:["event.fuyuki.1"]}));
  const options=result.state.pendingDecision.options.map(o=>o.id);
  assert.equal(options.length,2);
  assert.equal(new Set(options).size,2);
  assert.equal(result.state.board.eventDiscard.length,0);
  const selected=options[0];
  result=engine.execute(result.state,command(result.state,"iskandar-pick-2",CommandType.ResolveDecision,"i",{decisionId:result.state.pendingDecision.decisionId,selections:[selected]}));
  assert.deepEqual(result.state.board.currentEvents.city,[selected]);
  assert.equal(result.state.board.eventVisibility[selected],"up");
  assert.equal(result.state.board.eventDeck.length,2);
  assert.doesNotThrow(()=>assertStateInvariants(result.state));
});


test("batch025 Amakusa Twin Arm Zero sets X from all face-up event VP and removes only those events", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine({ ...built, cards:{...built.cards,"test.basic.amakusa":{id:"test.basic.amakusa",name:"basic",cost:0,basePower:1,typeLabel:"力量",attributes:["力量"],basic:true}} });
  const state=createGameState({gameInstanceId:"batch025-amakusa",players:[{id:"a",name:"Amakusa"}],seed:2507});
  state.status="playing"; state.round=6; state.phase="action"; state.step="play-batch-draft"; state.activePlayerId="a";
  state.players.a.servantId="servant.amakusa"; state.players.a.mana=8; state.players.a.locationId="mountain"; state.board.locations.mountain=["a"];
  createOwnedCardInstance(state,"a",{instanceId:"amakusa-zero",definitionId:"servant.amakusa.skill.sc-amakusa-1",zone:"servant-skills",face:"up",active:false});
  createOwnedCardInstance(state,"a",{instanceId:"amakusa-basic",definitionId:"test.basic.amakusa",zone:"hand",face:"down",active:false});
  state.board.currentEvents.mountain=["event.fuyuki.1"]; state.board.currentEvents.city=["event.fuyuki.4","event.fuyuki.5"];
  state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"up","event.fuyuki.5":"down"}; state.board.eventRemoved=[]; state.board.eventDiscard=[];
  const result=engine.execute(state,command(state,"amakusa-play",CommandType.CommitAttack,"a",{faceUpInstanceIds:["amakusa-zero","amakusa-basic"],faceDownInstanceIds:[]}));
  const source=result.state.cards["amakusa-zero"];
  assert.equal(source.powerModifiers?.some(m=>m.sourceId==="servant.amakusa.skill.sc-amakusa-1"&&m.value===16&&m.duration==="round"),true);
  assert.deepEqual(new Set(result.state.board.eventRemoved),new Set(["event.fuyuki.1","event.fuyuki.4"]));
  assert.deepEqual(result.state.board.currentEvents.mountain,[]);
  assert.deepEqual(result.state.board.currentEvents.city,["event.fuyuki.5"]);
  assert.equal(result.state.board.eventVisibility["event.fuyuki.5"],"down");
  assert.equal(result.state.players.a.trueNameRevealed,true);
  assert.equal(built.skills.get("servant.amakusa.skill.sc-amakusa-1").limit,"once-per-game");
  assert.doesNotThrow(()=>assertStateInvariants(result.state));
});


test("batch025 Twice Game Winner swaps events without flipping and shares one usage across preparation/action windows", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-twice-swap",players:[{id:"t",name:"Twice"}],seed:2508});
  state.status="playing"; state.round=7; state.phase="preparation"; state.step="player-window"; state.activePlayerId="t";
  state.players.t.masterId="master.twice"; state.players.t.commandSeals=3;
  createOwnedCardInstance(state,"t",{instanceId:"twice-game-winner",definitionId:"master.twice.skill.s1",zone:"master-skills",face:"up",active:false});
  state.board.currentEvents.mountain=["event.fuyuki.1"]; state.board.currentEvents.city=["event.fuyuki.4"];
  state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"down"}; state.board.eventDeck=["event.fuyuki.2","event.fuyuki.3"];
  const ability=built.skills.get("master.twice.skill.s1").abilities?.find(a=>a.id==="game-winner-event-control");
  assert.deepEqual(new Set(ability.windows),new Set(["preparation","action"]));

  let result=engine.execute(state,command(state,"twice-use-prep",CommandType.UseSkill,"t",{skillId:"master.twice.skill.s1",data:{abilityId:"game-winner-event-control"}}));
  assert.equal(result.state.players.t.commandSeals,3);
  assert.deepEqual(new Set(result.state.pendingDecision.options.map(o=>o.id)),new Set(["swap-events","replace-face-up-event"]));
  result=engine.execute(result.state,command(result.state,"twice-option-swap",CommandType.ResolveDecision,"t",{decisionId:result.state.pendingDecision.decisionId,selections:["swap-events"]}));
  assert.deepEqual(new Set(result.state.pendingDecision.options.map(o=>o.id)),new Set(["event.fuyuki.1","event.fuyuki.4"]));
  result=engine.execute(result.state,command(result.state,"twice-pick-swap",CommandType.ResolveDecision,"t",{decisionId:result.state.pendingDecision.decisionId,selections:["event.fuyuki.1","event.fuyuki.4"]}));
  assert.deepEqual(result.state.board.currentEvents.mountain,["event.fuyuki.4"]);
  assert.deepEqual(result.state.board.currentEvents.city,["event.fuyuki.1"]);
  assert.equal(result.state.board.eventVisibility["event.fuyuki.1"],"up");
  assert.equal(result.state.board.eventVisibility["event.fuyuki.4"],"down");
  result.state.phase="action"; result.state.step="player-window"; result.state.activePlayerId="t";
  assert.throws(()=>engine.execute(result.state,command(result.state,"twice-use-again",CommandType.UseSkill,"t",{skillId:"master.twice.skill.s1",data:{abilityId:"game-winner-event-control"}})),/SKILL_USE_FORBIDDEN/);
  assert.doesNotThrow(()=>assertStateInvariants(result.state));
});

test("batch025 Twice Game Winner action before round 10 requires and pays exactly one command seal before replacing an event", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const makeState=(seals,id)=>{
    const state=createGameState({gameInstanceId:id,players:[{id:"t",name:"Twice"}],seed:2509});
    state.status="playing"; state.round=9; state.phase="action"; state.step="player-window"; state.activePlayerId="t"; state.players.t.masterId="master.twice"; state.players.t.commandSeals=seals;
    createOwnedCardInstance(state,"t",{instanceId:"twice-game-winner",definitionId:"master.twice.skill.s1",zone:"master-skills",face:"up",active:false});
    state.board.currentEvents.mountain=["event.fuyuki.1"]; state.board.currentEvents.city=["event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"up"};
    state.board.eventDeck=["event.fuyuki.2","event.fuyuki.3","event.fuyuki.5"]; state.board.eventDiscard=[]; return state;
  };
  const noSeal=makeState(0,"batch025-twice-no-seal");
  assert.throws(()=>engine.execute(noSeal,command(noSeal,"twice-no-seal",CommandType.UseSkill,"t",{skillId:"master.twice.skill.s1",data:{abilityId:"game-winner-event-control"}})),/SKILL_USE_FORBIDDEN/);

  let state=makeState(1,"batch025-twice-pay");
  let result=engine.execute(state,command(state,"twice-use-action",CommandType.UseSkill,"t",{skillId:"master.twice.skill.s1",data:{abilityId:"game-winner-event-control"}}));
  assert.equal(result.state.players.t.commandSeals,0);
  result=engine.execute(result.state,command(result.state,"twice-option-replace",CommandType.ResolveDecision,"t",{decisionId:result.state.pendingDecision.decisionId,selections:["replace-face-up-event"]}));
  assert.deepEqual(new Set(result.state.pendingDecision.options.map(o=>o.id)),new Set(["event.fuyuki.1","event.fuyuki.4"]));
  result=engine.execute(result.state,command(result.state,"twice-pick-replace",CommandType.ResolveDecision,"t",{decisionId:result.state.pendingDecision.decisionId,selections:["event.fuyuki.1"]}));
  assert.equal(result.state.board.currentEvents.mountain.length,1);
  assert.equal(result.state.board.eventVisibility[result.state.board.currentEvents.mountain[0]],"up");
  assert.equal(result.state.board.currentEvents.city[0],"event.fuyuki.4");
  assert.equal(result.state.board.eventDeck.length,3);
  assert.doesNotThrow(()=>assertStateInvariants(result.state));
});

test("batch025 Twice Game Winner no longer costs a command seal from round 10 onward", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-twice-r10",players:[{id:"t",name:"Twice"}],seed:2510});
  state.status="playing"; state.round=10; state.phase="action"; state.step="player-window"; state.activePlayerId="t"; state.players.t.masterId="master.twice"; state.players.t.commandSeals=0;
  createOwnedCardInstance(state,"t",{instanceId:"twice-game-winner",definitionId:"master.twice.skill.s1",zone:"master-skills",face:"up",active:false});
  state.board.currentEvents.mountain=["event.fuyuki.1"]; state.board.currentEvents.city=["event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"up"}; state.board.eventDeck=["event.fuyuki.2"];
  const result=engine.execute(state,command(state,"twice-r10",CommandType.UseSkill,"t",{skillId:"master.twice.skill.s1",data:{abilityId:"game-winner-event-control"}}));
  assert.equal(result.state.players.t.commandSeals,0);
  assert.ok(result.state.pendingDecision);
});


test("batch025 Drake Golden Hind alone gains local event VP, discards events, and moves free to a legal chosen location", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-drake-alone",players:[{id:"d",name:"Drake"},{id:"o",name:"Other"}],seed:2511});
  state.status="playing"; state.round=6; state.phase="combat"; state.step="player-window"; state.activePlayerId="d"; state.players.d.servantId="servant.drake"; state.players.d.locationId="mountain"; state.board.locations.mountain=["d"];
  state.players.o.locationId="scouting"; state.board.locations.scouting=["o"];
  createOwnedCardInstance(state,"d",{instanceId:"drake-hind",definitionId:"servant.drake.skill.sc-drake-2",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.mountain=["event.fuyuki.1","event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"up"}; state.board.eventDiscard=[];
  let result=engine.execute(state,command(state,"drake-use-alone",CommandType.UseSkill,"d",{skillId:"servant.drake.skill.sc-drake-2",data:{abilityId:"golden-hind-storm-night"}}));
  assert.equal(result.state.players.d.victoryPoints,8);
  assert.deepEqual(new Set(result.state.board.eventDiscard),new Set(["event.fuyuki.1","event.fuyuki.4"]));
  assert.deepEqual(result.state.board.currentEvents.mountain,[]);
  assert.equal(result.state.players.d.trueNameRevealed,true);
  assert.equal(result.state.pendingDecision.options.some(o=>o.id==="mountain"),false);
  assert.equal(result.state.pendingDecision.options.some(o=>o.id==="scouting"),false); // occupied
  assert.equal(result.state.pendingDecision.options.some(o=>o.id==="city"),true);
  result=engine.execute(result.state,command(result.state,"drake-move-city",CommandType.ResolveDecision,"d",{decisionId:result.state.pendingDecision.decisionId,selections:["city"]}));
  assert.equal(result.state.players.d.locationId,"city");
  assert.equal(result.events.some(e=>e.type==="player.moved"&&e.payload.cost===0),true);
  assert.doesNotThrow(()=>assertStateInvariants(result.state));
});

test("batch025 Drake Golden Hind with an engaged opponent gets no event reward but may still move by effect", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-drake-engaged",players:[{id:"d",name:"Drake"},{id:"o",name:"Other"}],seed:2512});
  state.status="playing"; state.round=6; state.phase="combat"; state.step="player-window"; state.activePlayerId="d"; state.players.d.servantId="servant.drake"; state.players.d.locationId="city"; state.players.o.locationId="city"; state.board.locations.city=["d","o"];
  createOwnedCardInstance(state,"d",{instanceId:"drake-hind",definitionId:"servant.drake.skill.sc-drake-2",zone:"servant-skills",face:"up",active:false});
  state.board.currentEvents.city=["event.fuyuki.1"]; state.board.eventVisibility={"event.fuyuki.1":"up"}; state.board.eventDiscard=[];
  let result=engine.execute(state,command(state,"drake-use-engaged",CommandType.UseSkill,"d",{skillId:"servant.drake.skill.sc-drake-2",data:{abilityId:"golden-hind-storm-night"}}));
  assert.equal(result.state.players.d.victoryPoints,0);
  assert.deepEqual(result.state.board.currentEvents.city,["event.fuyuki.1"]);
  assert.equal(result.state.board.eventDiscard.length,0);
  result=engine.execute(result.state,command(result.state,"drake-move-workshop",CommandType.ResolveDecision,"d",{decisionId:result.state.pendingDecision.decisionId,selections:["workshop"]}));
  assert.equal(result.state.players.d.locationId,"workshop");
});

test("batch025 Drake Golden Hind from scouting gains 2 VP before moving", () => {
  const built=buildStandardContent(legacyContent); const engine=new StandardMatchEngine(built);
  const state=createGameState({gameInstanceId:"batch025-drake-scout",players:[{id:"d",name:"Drake"}],seed:2513});
  state.status="playing"; state.round=6; state.phase="combat"; state.step="player-window"; state.activePlayerId="d"; state.players.d.servantId="servant.drake"; state.players.d.locationId="scouting"; state.board.locations.scouting=["d"];
  createOwnedCardInstance(state,"d",{instanceId:"drake-hind",definitionId:"servant.drake.skill.sc-drake-2",zone:"servant-skills",face:"up",active:false});
  let result=engine.execute(state,command(state,"drake-use-scout",CommandType.UseSkill,"d",{skillId:"servant.drake.skill.sc-drake-2",data:{abilityId:"golden-hind-storm-night"}}));
  assert.equal(result.state.players.d.victoryPoints,2);
  result=engine.execute(result.state,command(result.state,"drake-scout-move",CommandType.ResolveDecision,"d",{decisionId:result.state.pendingDecision.decisionId,selections:["mountain"]}));
  assert.equal(result.state.players.d.locationId,"mountain");
});


test("batch025 Lion King Rhongomyniad accumulates removed event VP and immediately wins above 12", () => {
  const { definitions, passives, effects }=setup();
  const state=createGameState({gameInstanceId:"batch025-lionking-threshold",players:[{id:"l",name:"Lion King"},{id:"o",name:"Opponent"}],seed:2514});
  state.status="playing"; state.round=6; state.phase="combat"; state.step="settlement"; state.players.l.servantId="servant.lionking"; state.players.l.locationId="mountain"; state.players.o.locationId="mountain"; state.board.locations.mountain=["l","o"];
  createOwnedCardInstance(state,"l",{instanceId:"lion-rhongo",definitionId:"servant.lionking.skill.sc-lionking-3",zone:"attack",face:"up",active:true,residual:true});
  state.board.currentEvents.mountain=["event.fuyuki.1","event.fuyuki.4"]; state.board.eventVisibility={"event.fuyuki.1":"up","event.fuyuki.4":"up"};
  const emitted=[];
  const first=createEvent(state,"lion-combat-1",0,"combat.resolved",{locationId:"mountain",powers:{l:20,o:10},winnerIds:["l"],defeatedPlayerIds:["o"],victoryPoints:{l:8,o:0},eventIds:["event.fuyuki.1","event.fuyuki.4"],printedEventVictoryPoints:8,scoutingPlayerId:null,attributes:{l:[],o:[]}});
  enqueuePassiveEffects(state,passives,first); effects.drain(state,1000,definitions,(type,payload)=>emitted.push({type,payload}));
  assert.equal(state.players.l.flags.lionKingRhongomyniadRemovedEventVictoryPoints,8);
  assert.equal(state.status,"playing");
  assert.deepEqual(new Set(state.board.eventRemoved),new Set(["event.fuyuki.1","event.fuyuki.4"]));
  assert.deepEqual(state.board.currentEvents.mountain,[]);

  state.round=7; state.players.l.locationId="mountain"; state.players.o.locationId="mountain"; state.board.locations.mountain=["l","o"];
  state.board.currentEvents.mountain=["event.fuyuki.2","event.fuyuki.10"]; state.board.eventVisibility={"event.fuyuki.2":"up","event.fuyuki.10":"up"};
  const second=createEvent(state,"lion-combat-2",0,"combat.resolved",{locationId:"mountain",powers:{l:21,o:11},winnerIds:["l"],defeatedPlayerIds:["o"],victoryPoints:{l:6,o:0},eventIds:["event.fuyuki.2","event.fuyuki.10"],printedEventVictoryPoints:6,scoutingPlayerId:null,attributes:{l:[],o:[]}});
  enqueuePassiveEffects(state,passives,second); effects.drain(state,1000,definitions,(type,payload)=>emitted.push({type,payload}));
  assert.equal(state.players.l.flags.lionKingRhongomyniadRemovedEventVictoryPoints,14);
  assert.equal(state.status,"finished");
  assert.deepEqual(state.modeState.instantVictoryIds,["l"]);
  assert.equal(state.modeState.instantVictoryReason,"lionking-rhongomyniad-event-threshold");
  assert.equal(emitted.some((event)=>event.type==="game.finished"&&event.payload.unpreventable===true&&event.payload.winnerIds.includes("l")),true);
  assert.deepEqual(new Set(state.board.eventRemoved),new Set(["event.fuyuki.1","event.fuyuki.4","event.fuyuki.2","event.fuyuki.10"]));
  assert.doesNotThrow(()=>assertStateInvariants(state));
});

test("batch025 Lion King Rhongomyniad face-up play reveals true name and keeps the printed 9 mana gate", () => {
  const built=buildStandardContent(legacyContent);
  const withBasic={...built,cards:{...built.cards,"test.basic.lion":{id:"test.basic.lion",name:"basic",cost:0,basePower:1,typeLabel:"力量",attributes:["力量"],basic:true}}};
  const engine=new StandardMatchEngine(withBasic);
  const makeState=(mana,id)=>{
    const state=createGameState({gameInstanceId:id,players:[{id:"l",name:"Lion King"}],seed:2515});
    state.status="playing"; state.round=5; state.phase="action"; state.step="play-batch-draft"; state.activePlayerId="l"; state.players.l.servantId="servant.lionking"; state.players.l.mana=mana; state.players.l.locationId="mountain"; state.board.locations.mountain=["l"];
    createOwnedCardInstance(state,"l",{instanceId:"lion-rhongo",definitionId:"servant.lionking.skill.sc-lionking-3",zone:"servant-skills",face:"up",active:false});
    createOwnedCardInstance(state,"l",{instanceId:"lion-basic",definitionId:"test.basic.lion",zone:"hand",face:"down",active:false});
    return state;
  };
  const low=makeState(8,"batch025-lion-low");
  assert.throws(()=>engine.execute(low,command(low,"lion-low-play",CommandType.CommitAttack,"l",{faceUpInstanceIds:["lion-rhongo","lion-basic"],faceDownInstanceIds:[]})),/SKILL_REQUIRES_EIGHT_MANA|SKILL_REQUIREMENT|MANA/);
  const state=makeState(9,"batch025-lion-play");
  const result=engine.execute(state,command(state,"lion-play",CommandType.CommitAttack,"l",{faceUpInstanceIds:["lion-rhongo","lion-basic"],faceDownInstanceIds:[]}));
  assert.equal(result.state.players.l.trueNameRevealed,true);
  assert.equal(result.state.cards["lion-rhongo"].active,true);
});
