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

  await page.fill('.input-row input', '@agente-facturacion ¿quien es el proveedor 20-12345678-9?');
  await page.locator('.input-row button').click();

  // Esperar que aparezca un tool-call con consultar_proveedor.
  await page.waitForFunction(
    () => {
      const names = Array.from(document.querySelectorAll('.tool-call .tool-name'));
      return names.some((n) => /consultar_proveedor/.test(n.textContent ?? ''));
    },
    null,
    { timeout: STEP_TIMEOUT_MS },
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/v2-mcp.png' });
  console.log('screenshot -> /tmp/v2-mcp.png');

  await browser.close();
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
