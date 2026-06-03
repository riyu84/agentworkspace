import { chromium } from 'playwright';
import { existsSync } from 'fs';

const WEB_URL = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const STEP_TIMEOUT_MS = 60_000;

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.login-card select option', { state: 'attached' });
  await page.selectOption('.login-card select', { value: 'ana@pickit.test' });
  await page.locator('.login-card button').click();
  await page.waitForSelector('.sidebar .members-section');

  await page.fill('.input-row input', '@agente-facturacion aproba la factura CUIT 30-71659428-1 por $42500');
  await page.locator('.input-row button').click();

  await page.waitForSelector('.blocks button.primary:not(:disabled)', { timeout: STEP_TIMEOUT_MS });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/v2-confirm-prompt.png' });
  console.log('screenshot -> /tmp/v2-confirm-prompt.png');

  await page.locator('.blocks button.primary:not(:disabled)').last().click();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.msg.agent .content'))
      .some((el) => /registrad|operaci(o|ó)n/i.test(el.textContent ?? '')),
    null,
    { timeout: STEP_TIMEOUT_MS },
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/v2-confirm-resolved.png' });
  console.log('screenshot -> /tmp/v2-confirm-resolved.png');

  await browser.close();
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
