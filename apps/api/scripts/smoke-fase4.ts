// =====================================================
//  smoke-fase4.ts — verifica el frontend en un browser headless.
//  Asume: API en :3000 y vite dev en :5173 ya levantados.
// =====================================================

import { chromium } from 'playwright';
import { existsSync } from 'fs';

const WEB_URL = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const TIMEOUT_MS = 15_000;

// En este entorno hay chromium pre-instalado en /opt/pw-browsers.
function resolveChromiumPath(): string | undefined {
  const candidates = [
    '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ];
  return candidates.find((p) => existsSync(p));
}

async function main() {
  const executablePath = resolveChromiumPath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  console.log('1) abrir UI');
  await page.goto(WEB_URL, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });

  console.log('2) sidebar muestra Workspace + channel');
  await page.waitForSelector('.sidebar header', { timeout: TIMEOUT_MS });
  const wsName = await page.locator('.sidebar header').textContent();
  if (wsName?.trim() !== 'Pickit') throw new Error(`workspace title = ${wsName}`);
  await page.waitForSelector('.sidebar .channels button', { timeout: TIMEOUT_MS });
  const channels = await page.locator('.sidebar .channels button').allTextContents();
  if (!channels.some((c) => c.includes('general'))) {
    throw new Error(`no se encontro #general: ${JSON.stringify(channels)}`);
  }
  console.log(`   channels: ${channels.map((c) => c.trim()).join(', ')}`);

  console.log('3) picker tiene ana / beto / agente-facturacion');
  const opts = await page.locator('.sidebar .picker select option').allTextContents();
  for (const expected of ['ana', 'beto', 'agente-facturacion']) {
    if (!opts.some((o) => o.includes(expected))) {
      throw new Error(`falta member ${expected}: ${JSON.stringify(opts)}`);
    }
  }

  console.log('4) seleccionar ana, mandar mensaje');
  const meId = await page.locator('.sidebar .picker select').inputValue();
  console.log(`   meId=${meId}`);
  await page.fill('.input-row input', 'hola desde el smoke FASE 4');
  await page.locator('.input-row button').click();

  console.log('5) esperar a que el propio mensaje aparezca en la lista');
  await page.waitForSelector('.msg .content', { timeout: TIMEOUT_MS });
  const contents = await page.locator('.msg .content').allTextContents();
  if (!contents.some((c) => c.includes('hola desde el smoke FASE 4'))) {
    throw new Error(`mensaje propio no rendereado: ${JSON.stringify(contents)}`);
  }
  console.log(`   visible (${contents.length} mensajes en lista)`);

  console.log('6) check consola sin errores criticos');
  const critical = consoleErrors.filter(
    (e) => !e.includes('DevTools') && !e.includes('Download the React DevTools'),
  );
  if (critical.length > 0) {
    throw new Error(`errores en consola:\n  ${critical.join('\n  ')}`);
  }

  await browser.close();
  console.log('OK — FASE 4 verificada');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
