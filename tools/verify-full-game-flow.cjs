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
  if (!battleText.includes('冬木事件组 · 剩余20张')) throw new Error(`主对战区未使用开发版冬木20张事件组：${battleText.match(/冬木[^\n]{0,40}/)?.[0] || '未找到冬木状态'}`);
  if (/CURRENT DECISION|DIRECTIVES/.test(battleText)) throw new Error('主对战区仍包含调试客户端内容');
  const runtimeSkillCards = await page.evaluate(() => Object.values(window.fdCurrentBattleRuntime.snapshot().definitions).filter(card => card.cardType === 'skill' || card.isSkill).length);
  if (runtimeSkillCards !== 0) throw new Error(`试玩运行时仍载入了 ${runtimeSkillCards} 张未完成技能卡`);
  if (battleEntryMs > 3000) throw new Error(`进入主对战区仍然过慢：${battleEntryMs}ms`);

  const endAction = page.locator('.battle-host').locator('.end-action');
  if ((await endAction.innerText()) !== '完成当前阶段') throw new Error('阶段完成按钮没有使用“完成当前阶段”');
  await endAction.click();
  const deployTarget = page.locator('.battle-host').locator('.place.runtime-map-action-deploy').first();
  await deployTarget.waitFor({timeout: 15000});
  const locationButtons = await page.locator('.battle-host').locator('.runtime-action-list button').allTextContents();
  if (locationButtons.some(text => /部署|移动/.test(text))) throw new Error(`部署或移动仍显示为右侧按钮：${locationButtons.join('、')}`);
  const deployedViaMap = await deployTarget.getAttribute('aria-label');
  await deployTarget.click();
  await endAction.waitFor({timeout: 15000});
  await endAction.click();
  const moveTarget = page.locator('.battle-host').locator('.place.runtime-map-action-move').first();
  await moveTarget.waitFor({timeout: 15000});
  const mapInteractions = {deploy: deployedViaMap, move: await moveTarget.getAttribute('aria-label')};

  const relevantErrors = errors.filter(message => !message.includes('favicon') && !message.includes('net::ERR_ABORTED'));
  if (relevantErrors.length) throw new Error(relevantErrors.join('\n'));
  console.log(JSON.stringify({ok: true, mode: requestedMode, url: page.url(), selected: [selectedMaster, selectedServant], eventGroup: '冬木', eventCards: 20, runtimeSkillCards, battleEntryMs, mapInteractions}, null, 2));
  await browser.close();
})().catch(async error => {
  console.error(error.stack || error);
  process.exitCode = 1;
  process.exit();
});
