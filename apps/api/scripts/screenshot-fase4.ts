// =====================================================
//  screenshot-fase4.ts — abre la UI, dispara una mencion al
//  agente y captura la pantalla con typing/toolCall si aplica.
// =====================================================

import { chromium } from 'playwright';
import { existsSync } from 'fs';

const WEB_URL = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const OUT = process.env.OUT ?? '/tmp/fase4.png';

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

  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar .channels button');

  // mando algunos mensajes y la mencion al agente.
  await page.fill('.input-row input', 'buenas, ¿alguien por aca?');
  await page.locator('.input-row button').click();
  await page.waitForTimeout(300);

  await page.fill('.input-row input', '@agente-facturacion validá CUIT 20-12345678-9 por $10000');
  await page.locator('.input-row button').click();

  // dar tiempo al agent:typing
  await page.waitForTimeout(2500);

  await page.screenshot({ path: OUT, fullPage: false });
  console.log(`screenshot -> ${OUT}`);
  await browser.close();
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
