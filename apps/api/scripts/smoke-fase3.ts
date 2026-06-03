// =====================================================
//  smoke-fase3.ts — verifica que un agente real se despierta
//  por mencion, ejecuta la tool validar_factura, y persiste
//  la respuesta con metadata.toolCalls en el mensaje.
// =====================================================

import { io, Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const SOCKET_URL = `${API_URL}/chat`;
const AGENT_TIMEOUT_MS = 60_000; // claude puede tardar
const WS_TIMEOUT_MS = 5_000;

interface SeedResult {
  workspace: { id: string };
  members: Array<{ id: string; displayName: string }>;
  channel: { id: string };
  agent: { id: string; displayName: string };
}

function connect(memberId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = io(SOCKET_URL, { auth: { memberId }, transports: ['websocket'] });
    const t = setTimeout(() => reject(new Error('socket connect timeout')), WS_TIMEOUT_MS);
    sock.once('connect', () => {
      clearTimeout(t);
      resolve(sock);
    });
    sock.once('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function main() {
  console.log('1) seed (incluye agente)');
  const seedRes = await fetch(`${API_URL}/seed`, { method: 'POST' });
  if (!seedRes.ok) throw new Error(`seed fallo: ${seedRes.status}`);
  const seed = (await seedRes.json()) as SeedResult;
  const ana = seed.members.find((m) => m.displayName === 'ana')!;
  console.log(`   channel=${seed.channel.id} agent=${seed.agent.id} (${seed.agent.displayName})`);

  console.log('2) conectar como ana y joinear channel');
  const sock = await connect(ana.id);
  sock.emit('channel:join', { channelId: seed.channel.id });
  await new Promise((r) => setTimeout(r, 100));

  console.log('3) mencionar al agente');
  let sawTyping = false;
  const agentReply = new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout esperando respuesta del agente')), AGENT_TIMEOUT_MS);
    sock.on('agent:typing', (e) => {
      if (e.agentId === seed.agent.id) {
        sawTyping = true;
        console.log('   -> agent:typing recibido');
      }
    });
    sock.on('message', (msg) => {
      if (msg.role === 'AGENT' && msg.authorId === seed.agent.id) {
        clearTimeout(t);
        resolve(msg);
      }
    });
  });

  const content = `@agente-facturacion validá CUIT 20-12345678-9 por $10000`;
  sock.emit('message:send', { channelId: seed.channel.id, content });

  const reply = await agentReply;
  console.log(`   <- reply id=${reply.id} parentId=${reply.parentId}`);
  console.log(`   reply.content: ${String(reply.content).slice(0, 120)}`);

  if (!sawTyping) console.warn('   ! warning: no llego agent:typing antes de la respuesta');

  console.log('4) validar metadata.toolCalls');
  const toolCalls = reply.metadata?.toolCalls ?? [];
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    throw new Error(`metadata.toolCalls vacio: ${JSON.stringify(reply.metadata)}`);
  }
  const tc = toolCalls.find((t: any) => t.name === 'validar_factura');
  if (!tc) throw new Error(`no se encontro toolCall validar_factura: ${JSON.stringify(toolCalls)}`);
  console.log(`   ok: validar_factura args=${JSON.stringify(tc.args)}`);

  console.log('5) verificar persistencia (role=AGENT, parentId hacia el mensaje original)');
  const prisma = new PrismaClient();
  const fromDb = await prisma.message.findUnique({ where: { id: reply.id } });
  if (!fromDb) throw new Error('mensaje del agente no persistido');
  if (fromDb.role !== 'AGENT') throw new Error(`role esperado=AGENT got=${fromDb.role}`);
  if (!fromDb.parentId) throw new Error('parentId vacio');
  const parent = await prisma.message.findUnique({ where: { id: fromDb.parentId } });
  if (parent?.authorId !== ana.id) throw new Error('parent no es el mensaje de ana');
  console.log(`   persistido: role=${fromDb.role} parent.author=${parent.authorId}`);

  await prisma.$disconnect();
  sock.disconnect();
  console.log('OK — FASE 3 verificada');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
