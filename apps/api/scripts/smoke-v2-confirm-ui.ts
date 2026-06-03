// =====================================================
//  smoke-v2-confirm-ui.ts — pide aprobacion al agente desde el UI,
//  hace click en "Aprobar" y verifica que se renderea la respuesta
//  final del agente y que los botones quedan deshabilitados.
// =====================================================

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

  console.log('1) login ana');
  await page.waitForSelector('.login-card select option', { state: 'attached' });
  await page.selectOption('.login-card select', { value: 'ana@pickit.test' });
  await page.locator('.login-card button').click();
  await page.waitForSelector('.sidebar .members-section');

  console.log('2) pedir APROBAR factura');
  await page.fill('.input-row input', '@agente-facturacion aproba la factura CUIT 20-12345678-9 por $10000');
  await page.locator('.input-row button').click();

  console.log('3) esperar a que renderee al menos un boton Aprobar habilitado');
  await page.waitForSelector('.blocks button.primary:not(:disabled)', { timeout: STEP_TIMEOUT_MS });
  const labels = await page.locator('.blocks button').allTextContents();
  console.log(`   botones: ${labels.join(' | ')}`);
  if (!labels.some((l) => /aprob/i.test(l))) {
    throw new Error(`no aparece boton Aprobar: ${JSON.stringify(labels)}`);
  }

  console.log('4) click en Aprobar (el del ULTIMO mensaje, mensajes viejos pueden tener el suyo disabled)');
  await page.locator('.blocks button.primary:not(:disabled)').last().click();

  console.log('5) esperar a que aparezca un nuevo mensaje del agente sin botones');
  // El mensaje USER autogenerado se renderea inmediatamente. El final del agente
  // tarda lo que tarda Claude. Esperamos un mensaje cuyo content contenga
  // "aprobada"/"registrada"/"listo".
  // Buscamos texto especifico del agente (definido en el systemPrompt),
  // no nuestro propio "aproba la factura" del input.
  const FINAL_REGEX = /registrad|operaci(o|ó)n/i;
  await page.waitForFunction(
    (re) => {
      const items = Array.from(document.querySelectorAll('.msg.agent .content'));
      return items.some((el) => new RegExp(re, 'i').test(el.textContent ?? ''));
    },
    FINAL_REGEX.source,
    { timeout: STEP_TIMEOUT_MS },
  );
  const finalText = await page.evaluate((re) => {
    const items = Array.from(document.querySelectorAll('.msg.agent .content'));
    return items.reverse().find((el) => new RegExp(re, 'i').test(el.textContent ?? ''))?.textContent ?? '';
  }, FINAL_REGEX.source);
  console.log(`   final: "${finalText}"`);

  console.log('6) los botones originales ahora estan deshabilitados');
  const disabledCount = await page.locator('.blocks button:disabled').count();
  if (disabledCount === 0) throw new Error('los botones no quedaron disabled despues del click');
  const resolvedTag = await page.locator('.blocks .resolved-tag').count();
  if (resolvedTag === 0) throw new Error('falta el tag "respondido"');

  await browser.close();
  console.log('OK — v2-confirm-ui verificado');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
