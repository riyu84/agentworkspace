// =====================================================
//  smoke-v2-presence-ui.ts — verifica el indicador de presence en el
//  frontend desde dos browsers headless (ana + beto).
// =====================================================

import { chromium, Browser, Page } from 'playwright';
import { existsSync } from 'fs';

const WEB_URL = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const TIMEOUT_MS = 15_000;

function resolveChromiumPath(): string | undefined {
  const candidates = [
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ];
  return candidates.find((p) => existsSync(p));
}

async function loginAs(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(WEB_URL, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.login-card select option', { state: 'attached', timeout: TIMEOUT_MS });
  await page.selectOption('.login-card select', { value: email });
  await page.locator('.login-card button').click();
  await page.waitForSelector('.sidebar .members-section', { timeout: TIMEOUT_MS });
  return page;
}

async function onlineNames(page: Page): Promise<string[]> {
  return page.locator('.sidebar .member-row.online span:nth-child(2)').allTextContents();
}

async function waitFor(predicate: () => Promise<boolean>, what: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout esperando: ${what}`);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox'],
  });

  console.log('1) login ana');
  const ana = await loginAs(browser, 'ana@pickit.test');

  console.log('2) ana ve a si misma online y al agente (BOT)');
  await waitFor(async () => {
    const list = await onlineNames(ana);
    return list.includes('ana') && list.includes('agente-facturacion');
  }, 'ana + agente-facturacion online');
  console.log(`   ana ve: ${(await onlineNames(ana)).join(', ')}`);

  console.log('3) login beto en otro contexto');
  const beto = await loginAs(browser, 'beto@pickit.test');

  console.log('4) ana ve a beto aparecer online');
  await waitFor(async () => (await onlineNames(ana)).includes('beto'), 'beto aparece para ana');
  console.log(`   ana ve: ${(await onlineNames(ana)).join(', ')}`);

  console.log('5) beto ve a ana online');
  await waitFor(async () => (await onlineNames(beto)).includes('ana'), 'ana aparece para beto');

  console.log('6) cerrar el browser de beto -> ana debe verlo desaparecer');
  await beto.context().close();
  await waitFor(async () => !(await onlineNames(ana)).includes('beto'), 'beto se va para ana');
  console.log(`   ana ve: ${(await onlineNames(ana)).join(', ')}`);

  await browser.close();
  console.log('OK — v2-presence-ui verificado');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
