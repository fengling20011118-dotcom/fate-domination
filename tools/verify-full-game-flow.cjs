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
  if (!/冬木事件组 · 剩余(?:19|20)张/.test(battleText)) throw new Error(`主对战区未使用冬木20张事件组：${battleText.match(/冬木[^\n]{0,40}/)?.[0] || '未找到冬木状态'}`);
  if (/CURRENT DECISION|DIRECTIVES/.test(battleText)) throw new Error('主对战区仍包含调试客户端内容');
  const runtimeSkillCards = await page.evaluate(() => Object.values(window.fdCurrentBattleRuntime.snapshot().definitions).filter(card => card.cardType === 'skill' || card.isSkill).length);
  if (runtimeSkillCards !== 0) throw new Error(`试玩运行时仍载入了 ${runtimeSkillCards} 张未完成技能卡`);
  if (battleEntryMs > 3000) throw new Error(`进入主对战区仍然过慢：${battleEntryMs}ms`);

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
  await moveToggle.click();
  const moveTarget = page.locator('.battle-host').locator('.place.runtime-map-action-move').first();
  await moveTarget.waitFor({timeout: 15000});
  const mapInteractions = {deploy: deployedViaMap, move: await moveTarget.getAttribute('aria-label')};
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
  await page.waitForFunction(() => window.fdCurrentBattleRuntime.snapshot().eventLog.some(event => event.type === 'attack.committed' && event.payload?.playerId === 'p2'), null, {timeout: 15000});
  const automaticProgress = await page.evaluate(() => ({phase: window.fdCurrentBattleRuntime.snapshot().view.phase, activePlayerId: window.fdCurrentBattleRuntime.snapshot().view.activePlayerId}));

  const relevantErrors = errors.filter(message => !message.includes('favicon') && !message.includes('net::ERR_ABORTED'));
  if (relevantErrors.length) throw new Error(relevantErrors.join('\n'));
  console.log(JSON.stringify({ok: true, mode: requestedMode, url: page.url(), selected: [selectedMaster, selectedServant], eventGroup: '冬木', eventCards: 20, runtimeSkillCards, battleEntryMs, mapInteractions, automaticProgress}, null, 2));
  await browser.close();
})().catch(async error => {
  console.error(error.stack || error);
  process.exitCode = 1;
  process.exit();
});
