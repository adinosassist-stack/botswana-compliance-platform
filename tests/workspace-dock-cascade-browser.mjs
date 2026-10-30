import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {externalizeWorkspaceHeadStyles, injectOwnerCommandCentreAssets} from '../cloudflare/src/production-entry.js';
import {versionReleaseAssets} from '../cloudflare/src/asset-release-identity.js';

function assertDarkComposer(color) {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
  assert.ok(match && match[1] === match[2] && match[2] === match[3] && Number(match[1]) >= 24 && Number(match[1]) <= 60, `composer must remain neutral charcoal, including focus: ${color}`);
}
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright') : 'playwright-core');
const authored = fs.readFileSync('public/index.html', 'utf8');
let fixture = externalizeWorkspaceHeadStyles(authored.slice(0, authored.indexOf('</head>') + 7));
fixture += `<body class="thebe-ai-dock-open"><section id="appShell"><main id="mainContent"></main></section>
<section id="thebeAiDock" class="thebe-ai-dock" data-surface="workspace">
  <header class="thebe-ai-dock-head"><div class="thebe-ai-title-copy"><b>Thebe</b></div><button class="thebe-ai-icon-btn">Minimise</button></header>
  <div class="thebe-ai-dock-scroll"><div class="thebe-ai-response"><div class="thebe-ai-response-answer">Test answer</div></div><div class="thebe-ai-quick"><button>Legacy suggestion</button></div></div>
  <form class="thebe-ai-compose"><textarea aria-label="Ask Thebe" placeholder="Ask Thebe"></textarea><button class="thebe-ai-send">Send</button></form>
</section></body></html>`;
fixture = injectOwnerCommandCentreAssets(fixture);
fixture = versionReleaseAssets(fixture, 'a'.repeat(40), {includeWorkspaceFixes: true});
fixture = fixture.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const executablePath = [process.env.CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
const browser = await chromium.launch({headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
  const page = await browser.newPage();
  await page.route('http://localhost/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({contentType: 'text/html', body: fixture});
    const file = 'public' + pathname;
    return pathname.endsWith('.css') && fs.existsSync(file)
      ? route.fulfill({path: file}) : route.fulfill({status: 404, body: ''});
  });
  for (const width of [320, 375, 414, 1440]) {
    await page.setViewportSize({width, height: 900});
    await page.goto('http://localhost/');
    for (const expanded of [false, true]) {
      await page.locator('#thebeAiDock').evaluate((el, expanded) => {
        if (expanded) el.dataset.expanded = 'true'; else delete el.dataset.expanded;
        document.body.classList.toggle('thebe-ai-expanded', expanded);
      }, expanded);
      await page.getByRole('button', {name: 'Minimise', exact: true}).focus();
      const colors = await page.evaluate(() => {
        const bg = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
        return {dock: bg('#thebeAiDock'), header: bg('.thebe-ai-dock-head'), scroll: bg('.thebe-ai-dock-scroll'),
          composer: bg('.thebe-ai-compose'), text: getComputedStyle(document.querySelector('.thebe-ai-response')).color,
          quick: getComputedStyle(document.querySelector('.thebe-ai-quick')).display};
      });
      for (const key of ['dock', 'header', 'scroll']) assert.equal(colors[key], 'rgb(25, 25, 25)', `${key}: width=${width}, expanded=${expanded}`);
      assertDarkComposer(colors.composer);
      assert.equal(colors.text, 'rgb(237, 237, 237)');
      assert.equal(colors.quick, 'none', 'late styles must not resurrect preset suggestions');
      await page.getByRole('textbox', {name: 'Ask Thebe', exact: true}).focus();
      assertDarkComposer(await page.locator('.thebe-ai-compose').evaluate(el => getComputedStyle(el).backgroundColor));
    }
  }
  console.log('PASS workspace charcoal cascade: production stylesheet order, four widths, expanded states, focus and hidden legacy suggestions');
} finally {
  await browser.close();
}
