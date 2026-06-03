import { chromium } from 'playwright';
import { existsSync } from 'fs';

const WEB_URL = process.env.WEB_URL ?? 'http://127.0.0.1:5173';

function resolveChromiumPath(): string | undefined {
  const candidates = [
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ];
  return candidates.find((p) => existsSync(p));
}

async function loginAs(browser: any, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1200, height: 720 });
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.login-card select option', { state: 'attached' });
  await page.selectOption('.login-card select', { value: email });
  await page.locator('.login-card button').click();
  await page.waitForSelector('.sidebar .members-section');
  return page;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox'],
  });

  // ana + beto logueados al mismo tiempo
  const ana = await loginAs(browser, 'ana@pickit.test');
  const beto = await loginAs(browser, 'beto@pickit.test');
  // dar tiempo a que ana reciba el presence:online de beto
  await ana.waitForTimeout(500);
  await ana.screenshot({ path: '/tmp/v2-presence-both.png' });
  console.log('screenshot -> /tmp/v2-presence-both.png');

  // ahora cerramos beto y capturamos a ana viendolo offline
  await beto.context().close();
  await ana.waitForTimeout(800);
  await ana.screenshot({ path: '/tmp/v2-presence-after.png' });
  console.log('screenshot -> /tmp/v2-presence-after.png');

  await browser.close();
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
