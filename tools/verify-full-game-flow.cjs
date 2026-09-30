const path = require('node:path');
const {pathToFileURL} = require('node:url');
const rulesRoot = process.env.FD_RULES_ROOT || path.resolve(__dirname, '../../binchen648_fd/work');
const {chromium} = require(path.join(rulesRoot, 'node_modules/playwright'));

(async () => {
  const requestedMode = process.argv[2] === '3x' ? '3x' : 'free';
  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--allow-file-access-from-files'],
  });
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', request => errors.push(`request: ${request.url()} (${request.failure()?.errorText || 'failed'})`));

  const entry = pathToFileURL(path.resolve(__dirname, '../ui-preview/本地UI预览.html')).href;
  await page.goto(entry, {waitUntil: 'domcontentloaded'});
  await page.locator('.legal-screen.is-ready [data-legal-continue]').waitFor({timeout: 120000});
  await page.locator('[data-legal-continue]').click();
  await page.locator('.press-any').waitFor({timeout: 10000});
  await page.waitForTimeout(500);
  await page.locator('.press-any').click();
  await page.waitForTimeout(900);
  await page.locator('[data-nav="single"]').click();
  await page.waitForTimeout(750);
  await page.locator(`[data-mode="${requestedMode}"]`).click();
  await page.waitForTimeout(750);
  let selectedMaster = '肯尼斯';
  let selectedServant = '巴御前';
  if (requestedMode === 'free') {
    await page.locator('[data-pick-master="肯尼斯"]').click();
    await page.locator('[data-standard-next]').click();
    await page.locator('[data-pick-servant="巴御前"]').click();
    await page.locator('[data-standard-next]').click();
  } else {
    await page.locator('[data-threex-ban]').first().click();
    await page.locator('[data-threex-confirm-ban]').click();
    await page.waitForTimeout(550);
    await page.locator('[data-threex-finish-ban]').click();
    await page.waitForTimeout(550);
    const masterChoice = page.locator('[data-threex-master]').first();
    selectedMaster = await masterChoice.getAttribute('data-threex-master');
    await masterChoice.click();
    await page.locator('[data-threex-confirm-master]').click();
    await page.waitForTimeout(550);
    await page.locator('[data-threex-finish-purchase]').click();
    await page.waitForTimeout(550);
    const servantChoice = page.locator('[data-threex-servant]').first();
    selectedServant = await servantChoice.getAttribute('data-threex-servant');
    await servantChoice.click();
    await page.locator('[data-threex-confirm-servant]').click();
    await page.waitForTimeout(550);
  }

  const readyText = await page.locator('.ready-footer').innerText();
  if (/测试|预览/.test(readyText)) throw new Error(`准备页残留非正式文案：${readyText}`);
  const battleEntryStartedAt = Date.now();
  await page.locator('[data-enter-battle-preview]').click();
  try {
    await page.locator('.battle-host').waitFor({timeout: 15000});
    await page.waitForFunction(() => document.querySelector('.battle-host')?.shadowRoot?.querySelector('.battle-root'), null, {timeout: 15000});
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      href: location.href,
      overlay: document.querySelectorAll('.battle-entry-transition').length,
      readyButton: !!document.querySelector('[data-enter-battle-preview]'),
      bodyText: document.body.innerText.slice(-800),
    }));
    throw new Error(`${error.message}\n${JSON.stringify(diagnostic)}\n${errors.join('\n')}`);
  }
  if (!page.url().endsWith(encodeURI('/本地UI预览.html'))) throw new Error(`正式入口被导航到其他页面：${page.url()}`);
  const battleEntryMs = Date.now() - battleEntryStartedAt;
  const battleText = await page.evaluate(() => document.querySelector('.battle-host').shadowRoot.textContent);
  if (!battleText.includes(selectedMaster)) throw new Error(`主对战区未载入所选御主：${selectedMaster}`);
  if (!battleText.includes(selectedServant)) throw new Error(`主对战区未载入所选从者：${selectedServant}`);
  if (!/冬木事件组 · 剩余(?:18|19|20)张/.test(battleText)) throw new Error(`主对战区未使用冬木20张事件组：${battleText.match(/冬木[^\n]{0,40}/)?.[0] || '未找到冬木状态'}`);
  if (/CURRENT DECISION|DIRECTIVES/.test(battleText)) throw new Error('主对战区仍包含调试客户端内容');
  const runtimeSkillCards = await page.evaluate(() => Object.values(window.fdCurrentBattleRuntime.snapshot().definitions).filter(card => card.cardType === 'skill' || card.isSkill).length);
  if (runtimeSkillCards !== 0) throw new Error(`试玩运行时仍载入了 ${runtimeSkillCards} 张未完成技能卡`);
  if (battleEntryMs > 3000) throw new Error(`进入主对战区仍然过慢：${battleEntryMs}ms`);

  await page.waitForFunction(() => window.fdCurrentBattleRuntime.snapshot().view.activePlayerId === 'p1', null, {timeout: 15000});
  const endAction = page.locator('.battle-host').locator('.end-action');
  if ((await endAction.innerText()) !== '完成当前阶段') throw new Error('阶段完成按钮没有使用“完成当前阶段”');
  await endAction.click();
  const deployTarget = page.locator('.battle-host').locator('.place.runtime-map-action-deploy').first();
  await deployTarget.waitFor({timeout: 15000});
  if (await endAction.isEnabled()) throw new Error('尚未部署时仍然可以跳过部署阶段');
  if (await page.locator('.battle-host').locator('[data-runtime-map-move-toggle]').count()) throw new Error('部署阶段错误显示了“常规移动”');
  const locationButtons = await page.locator('.battle-host').locator('.runtime-action-list button').allTextContents();
  if (locationButtons.some(text => /部署|移动/.test(text))) throw new Error(`部署或移动仍显示为右侧按钮：${locationButtons.join('、')}`);
  const deployedViaMap = await deployTarget.getAttribute('aria-label');
  await deployTarget.click();
  const moveToggle = page.locator('.battle-host').locator('[data-runtime-map-move-toggle]');
  await moveToggle.waitFor({timeout: 15000});
  if ((await moveToggle.innerText()) !== '常规移动') throw new Error('行动阶段没有显示常规移动按钮');
  if (await page.locator('.battle-host').locator('.end-action').count()) throw new Error('行动阶段仍然显示了“跳过移动”');
  if (await page.locator('.battle-host').locator('.place.runtime-map-action-move').count()) throw new Error('未点击常规移动时地图已经可以移动');
  let moveLabel = '当前无可移动地点';
  if (await moveToggle.isEnabled()) {
    await moveToggle.click();
    const moveTarget = page.locator('.battle-host').locator('.place.runtime-map-action-move').first();
    await moveTarget.waitFor({timeout: 15000});
    moveLabel = await moveTarget.getAttribute('aria-label');
  }
  const mapInteractions = {deploy: deployedViaMap, move: moveLabel};
  const occupantDiagnostic = await page.evaluate(() => {
    const snapshot = window.fdCurrentBattleRuntime.snapshot(), root = document.querySelector('.battle-host')?.shadowRoot;
    const selectors = {workshop:'.workshop',mountain:'.mountain',city:'.city',scouting:'.scout','moon-cell':'.moon-cell'};
    return Object.fromEntries(Object.entries(selectors).map(([id,selector]) => {
      const place = root?.querySelector(selector), expected = snapshot.view.board.locations?.[id]?.length ?? 0;
      const visible = (place?.querySelectorAll('.land-slots .slot-face img').length ?? 0) + (place?.querySelectorAll('.location-occupant img').length ?? 0);
      return [id,{expected,visible}];
    }));
  });
  if (Object.values(occupantDiagnostic).some(({expected,visible}) => expected !== visible)) throw new Error(`地区玩家头像显示不完整：${JSON.stringify(occupantDiagnostic)}`);
  const firstVisibleHandCard = page.locator('.battle-host').locator('.hand .card').first();
  await firstVisibleHandCard.waitFor({timeout: 15000});
  await firstVisibleHandCard.click();
  await page.waitForFunction(() => window.fdCurrentBattleRuntime.snapshot().view.step === 'play-batch-draft', null, {timeout: 10000});
  const playableInstanceIds = await page.evaluate(() => window.fdCurrentBattleRuntime.snapshot().actions.find(action => action.commandType === 'player.attack.commit' && action.payload?.faceUpInstanceIds?.length && !action.payload?.faceDownInstanceIds?.length)?.payload.faceUpInstanceIds);
  if (!playableInstanceIds?.length) {
    const available = await page.evaluate(() => window.fdCurrentBattleRuntime.snapshot().actions.filter(action => action.commandType === 'player.attack.commit'));
    throw new Error(`移动后没有可打出的手牌组合：${JSON.stringify(available)}`);
  }
  const alreadySelected = await page.locator('.battle-host').locator('.hand .card.selected').evaluateAll(nodes => nodes.map(node => node.dataset.instanceId));
  for (const instanceId of alreadySelected) await page.locator('.battle-host').locator(`.hand .card[data-instance-id="${instanceId}"]`).click();
  for (const instanceId of playableInstanceIds) {
    const handCard = page.locator('.battle-host').locator(`.hand .card[data-instance-id="${instanceId}"]`);
    await handCard.waitFor({timeout: 15000});
    await handCard.click();
  }
  const confirmPlay = page.locator('.battle-host').locator('#confirm-play');
  const playDiagnostic = await page.evaluate(() => {
    const snapshot = window.fdCurrentBattleRuntime.snapshot(), root = document.querySelector('.battle-host')?.shadowRoot;
    return {phase: snapshot.view.phase, step: snapshot.view.step, actions: snapshot.actions.map(action => action.commandType), selected: root?.querySelectorAll('.hand .card.selected').length, buttonDisabled: root?.querySelector('#confirm-play')?.disabled};
  });
  if (!playDiagnostic.actions.includes('player.attack.commit')) throw new Error(`移动后没有进入出牌步骤：${JSON.stringify(playDiagnostic)}`);
  await page.waitForFunction(() => {
    const host = document.querySelector('.battle-host');
    return host?.shadowRoot?.querySelector('#confirm-play')?.disabled === false;
  }, null, {timeout: 10000});
  await confirmPlay.click();
  await page.waitForFunction(() => window.fdCurrentBattleRuntime.snapshot().eventLog.some(event => event.type === 'attack.committed' && event.payload?.playerId !== 'p1') || window.fdCurrentBattleRuntime.snapshot().view.phase === 'combat', null, {timeout: 20000});
  const visualMotion = await page.evaluate(() => {const root=document.querySelector('.battle-host')?.shadowRoot,css=[...(root?.querySelectorAll('style')||[])].map(style=>style.textContent).join('\n');return {tokenArrivals:root?.querySelectorAll('.runtime-token-arrive').length??0,cardArrivals:root?.querySelectorAll('.runtime-card-arrive').length??0,cardAnimationInstalled:css.includes('.runtime-card-arrive')}});
  if (!visualMotion.tokenArrivals || !visualMotion.cardAnimationInstalled) throw new Error(`AI 动作没有生成入场动画：${JSON.stringify(visualMotion)}`);
  const seededFirstPlayers = await page.evaluate(() => [1,123456789,305419896].map(seed => window.FDBattleRuntime.create({seed}).snapshot().view.turnOrder[0]));
  if (new Set(seededFirstPlayers).size < 2) throw new Error(`新局首位玩家没有随机化：${seededFirstPlayers.join(',')}`);
  const automaticProgress = await page.evaluate(() => ({phase: window.fdCurrentBattleRuntime.snapshot().view.phase, activePlayerId: window.fdCurrentBattleRuntime.snapshot().view.activePlayerId}));

  for (let attempts = 0; attempts < 90; attempts += 1) {
    const progress = await page.evaluate(() => { const snapshot=window.fdCurrentBattleRuntime.snapshot(); return {phase:snapshot.view.phase,step:snapshot.view.step,activePlayerId:snapshot.view.activePlayerId,completeActionId:snapshot.actions.find(action=>action.commandType==='phase.player.complete')?.id}; });
    if (progress.phase === 'combat' && ['settlement', 'post-power-response'].includes(progress.step)) break;
    if (progress.activePlayerId === 'p1' && progress.completeActionId) {
      await page.locator('.battle-host').locator(`[data-runtime-action="${progress.completeActionId}"]`).click();
    } else {
      await page.waitForTimeout(450);
    }
  }
  const reachedSettlement = await page.evaluate(() => { const view=window.fdCurrentBattleRuntime.snapshot().view; return view.phase==='combat'&&['settlement','post-power-response'].includes(view.step); });
  if (!reachedSettlement) {
    const diagnostic = await page.evaluate(() => { const snapshot=window.fdCurrentBattleRuntime.snapshot(); return {view:snapshot.view,actions:snapshot.actions,eventTypes:snapshot.eventLog.slice(-12).map(event=>event.type)}; });
    throw new Error(`未能进入战场结算：${JSON.stringify(diagnostic)}`);
  }
  const settlementBefore = await page.evaluate(() => {
    const snapshot = window.fdCurrentBattleRuntime.snapshot(), root = document.querySelector('.battle-host')?.shadowRoot;
    const actionButton=root?.querySelector('.settlement-actions [data-runtime-action]'),shell=root?.querySelector('.settlement-shell'),buttonRect=actionButton?.getBoundingClientRect(),shellRect=shell?.getBoundingClientRect();
    const locationSelectors={workshop:'.workshop',mountain:'.mountain',city:'.city',scouting:'.scout','moon-cell':'.moon-cell'};
    const playedGroups=Object.fromEntries(Object.entries(locationSelectors).map(([locationId,selector])=>{const place=root?.querySelector(selector),placeRect=place?.getBoundingClientRect(),expected=snapshot.roster.filter(entry=>entry.player?.locationId===locationId&&Object.values(snapshot.view.cards||{}).some(card=>card.ownerPlayerId===entry.playerId&&card.zone==='attack')).length,seats=[...(place?.querySelectorAll('.map-played-layer .table-play-seat')||[])],cards=[...(place?.querySelectorAll('.map-played-layer .mini-card')||[])],inside=rect=>!placeRect||(!rect.width&&!rect.height)||(rect.left>=placeRect.left-1&&rect.right<=placeRect.right+1&&rect.top>=placeRect.top-1&&rect.bottom<=placeRect.bottom+1);return [locationId,{expected,actual:seats.length,seatsInside:seats.every(node=>inside(node.getBoundingClientRect())),cardsInside:cards.every(node=>inside(node.getBoundingClientRect()))}]}));
    return {
      resolveLocations: snapshot.actions.filter(action => action.commandType === 'combat.resolve').map(action => action.payload?.locationId),
      buttons: [...(root?.querySelectorAll('.settlement-actions [data-runtime-action]') || [])].map(button => button.textContent.trim()),
      buttonFullyVisible: Boolean(buttonRect&&shellRect&&buttonRect.top>=shellRect.top&&buttonRect.bottom<=shellRect.bottom&&buttonRect.bottom<=innerHeight),
      combatants: root?.querySelectorAll('.settlement-combatant').length ?? 0,
      progress: root?.querySelector('.settlement-progress')?.textContent.trim() || '',
      playedGroups,
    };
  });
  if (process.env.FD_SETTLEMENT_SCREENSHOT) await page.screenshot({path: process.env.FD_SETTLEMENT_SCREENSHOT});
  if (JSON.stringify(settlementBefore.resolveLocations) !== JSON.stringify(['mountain'])) throw new Error(`首个结算项目不是唯一的深山町：${JSON.stringify(settlementBefore)}`);
  if (settlementBefore.buttons.length !== 1 || settlementBefore.buttons[0] !== '结算深山町') throw new Error(`结算界面没有只显示当前战场操作：${JSON.stringify(settlementBefore)}`);
  if (!settlementBefore.buttonFullyVisible) throw new Error(`结算按钮没有完整显示：${JSON.stringify(settlementBefore)}`);
  if (!settlementBefore.progress.includes('1 / 2')) throw new Error(`结算界面没有显示顺序进度：${JSON.stringify(settlementBefore)}`);
  if (Object.values(settlementBefore.playedGroups).some(group=>group.expected!==group.actual||!group.seatsInside||!group.cardsInside)) throw new Error(`地区内玩家出牌组显示不完整：${JSON.stringify(settlementBefore.playedGroups)}`);
  await page.locator('.battle-host').locator('.settlement-actions [data-runtime-action]').click();
  for (let attempts = 0; attempts < 12; attempts += 1) {
    const state = await page.evaluate(() => ({
      step: window.fdCurrentBattleRuntime.snapshot().view.step,
      actions: window.fdCurrentBattleRuntime.snapshot().actions.map(action => ({type: action.commandType, locationId: action.payload?.locationId})),
    }));
    if (state.actions.some(action => action.type === 'combat.resolve' && action.locationId === 'city')) break;
    if (state.actions.some(action => action.type === 'combat.response.complete')) {
      await page.locator('.battle-host').locator('.settlement-actions [data-runtime-action]').click();
    } else {
      await page.waitForTimeout(450);
    }
  }
  const settlementAfter = await page.evaluate(() => {
    const snapshot = window.fdCurrentBattleRuntime.snapshot(), root = document.querySelector('.battle-host')?.shadowRoot;
    return {
      resolveLocations: snapshot.actions.filter(action => action.commandType === 'combat.resolve').map(action => action.payload?.locationId),
      buttons: [...(root?.querySelectorAll('.settlement-actions [data-runtime-action]') || [])].map(button => button.textContent.trim()),
      completed: root?.querySelectorAll('.settlement-history-item').length ?? 0,
    };
  });
  if (JSON.stringify(settlementAfter.resolveLocations) !== JSON.stringify(['city'])) throw new Error(`深山町后没有按顺序开放新都：${JSON.stringify(settlementAfter)}`);
  if (settlementAfter.buttons.length !== 1 || settlementAfter.buttons[0] !== '结算新都') throw new Error(`第二项结算操作不正确：${JSON.stringify(settlementAfter)}`);
  if (settlementAfter.completed < 1) throw new Error(`结算界面没有保留已完成战场结果：${JSON.stringify(settlementAfter)}`);

  const relevantErrors = errors.filter(message => !message.includes('favicon') && !message.includes('net::ERR_ABORTED'));
  if (relevantErrors.length) throw new Error(relevantErrors.join('\n'));
  console.log(JSON.stringify({ok: true, mode: requestedMode, url: page.url(), selected: [selectedMaster, selectedServant], eventGroup: '冬木', eventCards: 20, runtimeSkillCards, battleEntryMs, mapInteractions, occupantDiagnostic, visualMotion, seededFirstPlayers, automaticProgress, settlementBefore, settlementAfter}, null, 2));
  await browser.close();
})().catch(async error => {
  console.error(error.stack || error);
  process.exitCode = 1;
  process.exit();
});
