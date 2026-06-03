// =====================================================
//  smoke-v2-auth-ui.ts — verifica el frontend con auth JWT:
//  1) sin sesion previa, ve pantalla de login con humanos
//  2) al loguearse aparece la app principal
//  3) puede mandar y ver mensajes
//  4) logout vuelve a la pantalla de login
// =====================================================

import { chromium } from 'playwright';
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

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  console.log('1) abrir UI sin sesion');
  await page.goto(WEB_URL, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });
  // limpio cualquier sesion previa
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  console.log('2) ve pantalla de login con dropdown de humanos');
  await page.waitForSelector('.login-card', { timeout: TIMEOUT_MS });
  // <option> dentro de <select> no es "visible" para Playwright; uso state attached.
  await page.waitForSelector('.login-card select option', { state: 'attached', timeout: TIMEOUT_MS });
  const opts = await page.locator('.login-card select option').allTextContents();
  if (!opts.some((o) => o.includes('ana'))) {
    throw new Error(`no veo a ana en el login: ${JSON.stringify(opts)}`);
  }
  if (opts.some((o) => o.includes('agente-facturacion'))) {
    throw new Error('el login NO deberia mostrar agentes');
  }
  console.log(`   options: ${opts.map((o) => o.trim()).join(' | ')}`);

  console.log('3) entrar como ana');
  await page.selectOption('.login-card select', { value: 'ana@pickit.test' });
  await page.locator('.login-card button').click();
  await page.waitForSelector('.sidebar header', { timeout: TIMEOUT_MS });
  const wsName = (await page.locator('.sidebar header').textContent())?.trim();
  if (wsName !== 'Pickit') throw new Error(`workspace title=${wsName}`);

  console.log('4) verifica que se ve "ana" como identidad y NO el picker viejo');
  const meLabel = (await page.locator('.sidebar .picker .me-label').textContent())?.trim();
  if (meLabel !== 'ana') throw new Error(`me-label=${meLabel}`);
  const hasOldPicker = await page.locator('.sidebar .picker select').count();
  if (hasOldPicker > 0) throw new Error('todavia hay un <select> en el sidebar');

  console.log('5) verificar token en localStorage');
  const token = await page.evaluate(() => localStorage.getItem('auth.token'));
  if (!token || token.split('.').length !== 3) {
    throw new Error(`token raro en localStorage: ${token}`);
  }

  console.log('6) mandar un mensaje y verlo rendereado');
  await page.fill('.input-row input', 'hola con auth jwt');
  await page.locator('.input-row button').click();
  await page.waitForSelector('.msg .content', { timeout: TIMEOUT_MS });
  const contents = await page.locator('.msg .content').allTextContents();
  if (!contents.some((c) => c.includes('hola con auth jwt'))) {
    throw new Error(`mensaje no rendereado: ${JSON.stringify(contents)}`);
  }

  console.log('7) logout vuelve al login');
  await page.locator('.sidebar .picker .logout').click();
  await page.waitForSelector('.login-card', { timeout: TIMEOUT_MS });
  const tokenAfter = await page.evaluate(() => localStorage.getItem('auth.token'));
  if (tokenAfter) throw new Error('token quedo en localStorage despues de logout');

  console.log('8) check consola sin errores criticos');
  const critical = consoleErrors.filter(
    (e) =>
      !e.includes('DevTools') &&
      !e.includes('Download the React DevTools') &&
      !e.includes('WebSocket is closed'),
  );
  if (critical.length > 0) {
    throw new Error(`errores en consola:\n  ${critical.join('\n  ')}`);
  }

  await browser.close();
  console.log('OK — v2-auth-ui verificado');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
