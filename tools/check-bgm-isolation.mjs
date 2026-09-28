import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('ui-preview/本地UI预览.html','utf8');
for(const match of html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
const names=['battleBgmZone','bgmZoneForScreen','bgmTrackPool','pickBgm','stopBgmPlayback','switchBgm','syncBgmForScreen'];
const source=names.map(name=>{const start=html.search(new RegExp('(?:async )?function '+name+'\\('));const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end)}).join('\n');
const requests=[];
class Audio {
 constructor(){this.paused=true;this.volume=0}
 pause(){this.paused=true} load(){} removeAttribute(){this.src=''} addEventListener(){}
 play(){this.paused=false;return new Promise((resolve,reject)=>requests.push({audio:this,resolve,reject}))}
}
const context=vm.createContext({Audio,Set,Math});
vm.runInContext(`let screen='splash',battleVictoryBgm=false,battleBgmRound=1,bgmSwitchToken=0,bgmEnabled=true,bgmUnlocked=true,desiredBgmZone='',currentBgmZone='',currentBgmSrc='',activeBgmChannel=0;
const bgmChannels=[new Audio(),new Audio()],customBgm={},availableBgm={splash:['splash.mp3'],home:['home.mp3'],selection:['select.mp3']},previousBgm={},startupAudioReady=new Set();
function stopBattleRoundObserver(){} function observeBattleRoundForBgm(){} function fadeBgm(from,to){from.pause();to.volume=.3}
${source}`,context);
const run=code=>vm.runInContext(code,context);
const splash=run("switchBgm('splash')");
run("screen='home'");
const home=run("switchBgm('home')");
assert.equal(requests[0].audio.paused,true,'old music stops before next play resolves');
requests[1].resolve();await home;
requests[0].resolve();await splash;
assert.equal(requests[1].audio.paused,false,'stale completion must not stop current music');
run("syncBgmForScreen('splash',true)");assert.equal(requests.length,2,'stale route ignored');
run("screen='single-setup'");const failed=run("switchBgm('selection')");requests[2].reject(new Error('blocked'));await failed;
assert.equal(requests[1].audio.paused,true,'failure does not retain previous scene');
run("screen='battle-preview';battleVictoryBgm=true;syncBgmForScreen(screen)");
assert.equal(run('currentBgmSrc'),'','missing scene track stays silent');
assert.equal(run("bgmTrackPool('victory').tracks.length"),0);
run("screen='legal';syncBgmForScreen(screen)");
assert.equal(run('bgmChannels.every(a=>a.paused)'),true);

function functionSource(name){
 const start=html.search(new RegExp('(?:async )?function '+name+'\\('));
 assert.notEqual(start,-1,'missing function '+name);
 let depth=0,bodyStarted=false;
 for(let index=start;index<html.length;index++){
   if(html[index]==='{'){depth++;bodyStarted=true}
   else if(html[index]==='}'&&bodyStarted&&--depth===0)return html.slice(start,index+1)
 }
 throw new Error('unterminated function '+name);
}
const sfxContext=vm.createContext({Set});
vm.runInContext(`const activeSfx=new Set();${functionSource('stopActiveSfx')}`,sfxContext);
const sfxState=vm.runInContext(`(()=>{const battle={fdSfxGroup:'battle',currentTime:3,paused:false,pause(){this.paused=true}},ui={fdSfxGroup:'ui',currentTime:2,paused:false,pause(){this.paused=true}};activeSfx.add(battle);activeSfx.add(ui);stopActiveSfx(true);return {battleStopped:battle.paused&&battle.currentTime===0,battleRemoved:!activeSfx.has(battle),uiKept:activeSfx.has(ui)&&!ui.paused}})()`,sfxContext);
assert.deepEqual({...sfxState},{battleStopped:true,battleRemoved:true,uiKept:true});
assert.match(functionSource('prepareScreenExit'),/routeEpoch\+\+/);
assert.match(functionSource('prepareScreenExit'),/stopActiveSfx\(true\)/);
assert.match(functionSource('switchStandardStage'),/ownerEpoch!==routeEpoch/);
assert.match(functionSource('transitionThreeXStep'),/ownerEpoch!==routeEpoch/);
assert.match(functionSource('refreshThreeXStage'),/ownerEpoch!==routeEpoch/);
assert.match(functionSource('initHomeNoticeCarousel'),/screen!==['"]home['"]\|\|!root\.isConnected/);
const battle=readFileSync('ui-preview/battle-ui.js','utf8');
assert.match(battle,/if\(!root\.isConnected\)\{window\.clearInterval\(turnClockInterval\)/);
console.log('PASS: syntax, BGM isolation, SFX cleanup, stale route guards, detached timer guards');
