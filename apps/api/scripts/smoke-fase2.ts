// =====================================================
//  smoke-fase2.ts — verifica el flujo de chat humano:
//  1) POST /seed para tener workspace + 2 humanos + 1 channel
//  2) abre 2 sockets autenticados como cada humano
//  3) ambos joinean el channel
//  4) ana manda 1 mensaje
//  5) beto Y ana lo reciben por websocket
//  6) se confirma que quedó persistido en Postgres
// =====================================================

import { io, Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const SOCKET_URL = `${API_URL}/chat`;
const TIMEOUT_MS = 5000;

interface SeedResult {
  workspace: { id: string; name: string };
  members: Array<{ id: string; displayName: string; email: string | null }>;
  channel: { id: string; name: string };
}

function waitForMessage(socket: Socket, channelId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout esperando mensaje en ${socket.id}`)),
      TIMEOUT_MS,
    );
    socket.once('message', (msg) => {
      if (msg.channelId === channelId) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

function connect(memberId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const sock = io(SOCKET_URL, { auth: { memberId }, transports: ['websocket'] });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), TIMEOUT_MS);
    sock.once('connect', () => {
      clearTimeout(timer);
      resolve(sock);
    });
    sock.once('connect_error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function main() {
  console.log('1) seed');
  const seedRes = await fetch(`${API_URL}/seed`, { method: 'POST' });
  if (!seedRes.ok) throw new Error(`seed fallo: ${seedRes.status}`);
  const seed = (await seedRes.json()) as SeedResult;
  const [ana, beto] = seed.members;
  console.log(`   ws=${seed.workspace.id} channel=${seed.channel.id}`);
  console.log(`   ana=${ana.id} beto=${beto.id}`);

  console.log('2) conectar 2 sockets');
  const sockA = await connect(ana.id);
  const sockB = await connect(beto.id);

  console.log('3) join channel');
  sockA.emit('channel:join', { channelId: seed.channel.id });
  sockB.emit('channel:join', { channelId: seed.channel.id });
  await new Promise((r) => setTimeout(r, 100));

  console.log('4) ana envia mensaje, ambos escuchan');
  const content = `hola desde ana @ ${new Date().toISOString()}`;
  const waitA = waitForMessage(sockA, seed.channel.id);
  const waitB = waitForMessage(sockB, seed.channel.id);
  sockA.emit('message:send', { channelId: seed.channel.id, content });

  const [recvA, recvB] = await Promise.all([waitA, waitB]);
  if (recvA.id !== recvB.id) {
    throw new Error(`ids distintos: A=${recvA.id} B=${recvB.id}`);
  }
  if (recvA.content !== content) {
    throw new Error(`content mismatch: ${recvA.content}`);
  }
  console.log(`   recibido id=${recvA.id} por ambos sockets`);

  console.log('5) verificar persistencia en Postgres');
  const prisma = new PrismaClient();
  const fromDb = await prisma.message.findUnique({ where: { id: recvA.id } });
  if (!fromDb) throw new Error('mensaje no persistido');
  if (fromDb.authorId !== ana.id) {
    throw new Error(`authorId esperado=${ana.id} got=${fromDb.authorId}`);
  }
  if (fromDb.role !== 'USER') throw new Error(`role esperado=USER got=${fromDb.role}`);
  console.log(`   persistido: author=${fromDb.authorId} role=${fromDb.role}`);

  await prisma.$disconnect();
  sockA.disconnect();
  sockB.disconnect();
  console.log('OK — FASE 2 verificada');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
