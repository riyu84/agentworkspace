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

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });

  // Pantalla de login (limpio storage).
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.login-card');
  await page.screenshot({ path: '/tmp/v2-auth-login.png' });
  console.log('screenshot -> /tmp/v2-auth-login.png');

  // Logueado: pantalla principal con identidad fija y boton logout.
  await page.selectOption('.login-card select', { value: 'ana@pickit.test' });
  await page.locator('.login-card button').click();
  await page.waitForSelector('.sidebar .picker .me-label');
  await page.fill('.input-row input', 'identidad firmada con JWT');
  await page.locator('.input-row button').click();
  await page.waitForSelector('.msg .content');
  await page.screenshot({ path: '/tmp/v2-auth-main.png' });
  console.log('screenshot -> /tmp/v2-auth-main.png');

  await browser.close();
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
