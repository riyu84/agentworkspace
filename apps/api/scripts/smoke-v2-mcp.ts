// =====================================================
//  smoke-v2-mcp.ts — verifica que el agente carga tools desde el
//  MCP server "pickit" y las usa.
//  1) ana pide "quien es el proveedor 20-12345678-9"
//  2) el agente llama consultar_proveedor (tool MCP)
//  3) la respuesta menciona "Logistica del Plata"
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
    const t = setTimeout(
      () => reject(new Error('timeout esperando mensaje del agente')),
      AGENT_TIMEOUT_MS,
    );
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

  console.log('1) login ana + abrir socket');
  const token = await login('ana@pickit.test');
  const s = await connect(token);
  s.emit('channel:join', { channelId });
  await new Promise((r) => setTimeout(r, 100));

  console.log('2) pedirle al agente consultar un proveedor (forza llamada a tool MCP)');
  const replyP = waitForAgentMessage(s, () => true);
  s.emit('message:send', {
    channelId,
    content: '@agente-facturacion ¿quien es el proveedor 20-12345678-9?',
  });
  const reply = await replyP;
  const content = String(reply.content);
  console.log(`   reply: ${content.slice(0, 200)}`);

  console.log('3) verificar toolCalls incluyen consultar_proveedor (MCP adapters prefija mcp__<server>__)');
  const toolCalls = reply.metadata?.toolCalls ?? [];
  const consult = toolCalls.find((tc: any) => /consultar_proveedor$/.test(tc.name));
  if (!consult) {
    throw new Error(`no se llamo consultar_proveedor. toolCalls: ${JSON.stringify(toolCalls.map((t: any) => t.name))}`);
  }
  console.log(`   ok: ${consult.name} args=${JSON.stringify(consult.args)}`);

  console.log('4) la respuesta menciona "Logistica del Plata"');
  if (!/log[ií]stica del plata/i.test(content)) {
    throw new Error(`respuesta no menciona el nombre real del proveedor: "${content}"`);
  }

  s.disconnect();
  console.log('OK — v2-mcp verificado');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
