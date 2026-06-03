// =====================================================
//  smoke-v2-confirm.ts — verifica el ciclo de confirmacion:
//  1) ana le pide aprobar una factura al agente
//  2) el agente llama validar_factura y luego solicitar_confirmacion
//  3) llega un mensaje del agente con metadata.blocks (botones)
//  4) ana hace click en "Aprobar" -> emit action:submit
//  5) el agente sigue y manda un mensaje final tipo "OK, aprobada"
// =====================================================

import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const SOCKET_URL = `${API_URL}/chat`;
const AGENT_TIMEOUT_MS = 90_000;
const WS_TIMEOUT_MS = 5_000;

async function login(email: string): Promise<string> {
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) throw new Error(`login -> ${r.status}`);
  return (await r.json()).token;
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    const t = setTimeout(() => reject(new Error('connect timeout')), WS_TIMEOUT_MS);
    s.once('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.once('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function waitForAgentMessage(s: Socket, predicate: (m: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout esperando mensaje del agente')), AGENT_TIMEOUT_MS);
    const handler = (msg: any) => {
      if (msg.role === 'AGENT' && predicate(msg)) {
        s.off('message', handler);
        clearTimeout(t);
        resolve(msg);
      }
    };
    s.on('message', handler);
  });
}

async function main() {
  await fetch(`${API_URL}/seed`, { method: 'POST' });
  const channelId = await fetch(`${API_URL}/workspaces/ws_pickit_seed`)
    .then((r) => r.json())
    .then((w) => w.channels[0].id);

  console.log('1) login ana');
  const token = await login('ana@pickit.test');
  const s = await connect(token);
  s.emit('channel:join', { channelId });
  await new Promise((r) => setTimeout(r, 100));

  console.log('2) pedirle al agente que APRUEBE (no que solo valide)');
  const firstAgentMsg = waitForAgentMessage(
    s,
    (m) => Array.isArray(m.metadata?.blocks) && m.metadata.blocks.length > 0,
  );
  s.emit('message:send', {
    channelId,
    content: '@agente-facturacion aproba la factura CUIT 20-12345678-9 por $10000',
  });
  const reply = await firstAgentMsg;
  const blocks = reply.metadata.blocks;
  console.log(`   reply: ${String(reply.content).slice(0, 100)}`);
  console.log(`   ${blocks.length} button(s): ${blocks.map((b: any) => b.label).join(' | ')}`);

  const approve = blocks.find((b: any) => b.value === 'approve');
  if (!approve) throw new Error(`no encontre block value=approve: ${JSON.stringify(blocks)}`);

  console.log('3) click en "Aprobar" via action:submit');
  const finalAgentMsg = waitForAgentMessage(s, (m) => m.id !== reply.id);
  s.emit('action:submit', {
    messageId: reply.id,
    actionId: approve.actionId,
    value: approve.value,
  });

  const final = await finalAgentMsg;
  console.log(`   reply final: ${String(final.content).slice(0, 200)}`);
  const finalBlocks = final.metadata?.blocks ?? [];
  if (finalBlocks.length > 0) {
    throw new Error(`el agente volvio a pedir confirmacion en vez de finalizar: ${JSON.stringify(finalBlocks)}`);
  }
  if (!/aprob|listo|registrad/i.test(String(final.content))) {
    throw new Error(`mensaje final no parece confirmacion: "${final.content}"`);
  }

  s.disconnect();
  console.log('OK — v2-confirm verificado');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
