const path = require('node:path');
const {pathToFileURL} = require('node:url');
const rulesRoot = process.env.FD_RULES_ROOT || path.resolve(__dirname, '../../binchen648_fd/work');
const {chromium} = require(path.join(rulesRoot, 'node_modules/playwright'));

(async () => {
  const requestedMode = process.argv[2] === '3x' ? '3x' : 'free';
  const masterIds = {'肯尼斯':'master.kayneth','间桐慎二':'master.shinji','卫宫切嗣':'master.kiritsugu','久宇舞弥':'master.maiya','卧藤门司':'master.gatou','爱丽丝菲尔':'master.irisviel','奥尔加玛丽·阿尼姆斯菲亚':'master.olga-marie'};
  const servantIds = {'阿尔托莉雅·卡斯特':'servant.artoriac','弗朗西斯·德雷克':'servant.drake','阿喀琉斯':'servant.achilles','阿尔托莉雅·潘德拉贡 (Alter)':'servant.artoria-alt','埃列什基伽勒':'servant.ereshkigal','巴御前':'servant.tomoe','坂田金时':'servant.kintoki'};
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
  await page.locator('[data-enter-battle-preview]').click();
  try {
    await page.waitForURL(url => url.pathname.endsWith('/playtest/index.html'), {timeout: 15000});
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      href: location.href,
      overlay: document.querySelectorAll('.battle-entry-transition').length,
      readyButton: !!document.querySelector('[data-enter-battle-preview]'),
      bodyText: document.body.innerText.slice(-800),
    }));
    throw new Error(`${error.message}\n${JSON.stringify(diagnostic)}\n${errors.join('\n')}`);
  }
  await page.locator('.workbench__toggle').waitFor({timeout: 30000});

  const url = new URL(page.url());
  if (url.searchParams.get('master') !== masterIds[selectedMaster]) throw new Error(`御主参数错误：${url.search}`);
  if (url.searchParams.get('servant') !== servantIds[selectedServant]) throw new Error(`从者参数错误：${url.search}`);
  if (url.searchParams.get('mode') !== requestedMode) throw new Error(`模式参数错误：${url.search}`);
  const body = await page.locator('body').innerText();
  if (!body.includes(selectedMaster)) throw new Error(`对局未载入所选御主：${selectedMaster}`);
  if (!body.includes(selectedServant)) throw new Error(`对局未载入所选从者：${selectedServant}`);

  const relevantErrors = errors.filter(message => !message.includes('favicon') && !message.includes('net::ERR_ABORTED'));
  if (relevantErrors.length) throw new Error(relevantErrors.join('\n'));
  console.log(JSON.stringify({ok: true, mode: requestedMode, url: page.url(), selected: [selectedMaster, selectedServant]}, null, 2));
  await browser.close();
})().catch(async error => {
  console.error(error.stack || error);
  process.exitCode = 1;
  process.exit();
});
