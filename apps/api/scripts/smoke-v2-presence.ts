// =====================================================
//  smoke-v2-presence.ts — verifica el tracking online/offline:
//  1) inicial: nadie online -> GET /presence vacio
//  2) ana conecta -> presence:online recibido por otros sockets
//  3) GET /presence devuelve [ana]
//  4) beto conecta (2 sockets) -> beto online
//  5) cerrar 1 de los 2 sockets de beto -> NO offline (todavia tiene 1)
//  6) cerrar el 2do socket de beto -> presence:offline recibido
//  7) ana sigue online; cerrar -> offline
// =====================================================

import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const SOCKET_URL = `${API_URL}/chat`;
const TIMEOUT_MS = 5000;

async function login(email: string): Promise<string> {
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  return (await r.json()).token;
}

async function presenceList(): Promise<string[]> {
  const r = await fetch(`${API_URL}/presence`);
  if (!r.ok) throw new Error(`presence -> ${r.status}`);
  return (await r.json()).online;
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    const t = setTimeout(() => reject(new Error('connect timeout')), TIMEOUT_MS);
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

function awaitEvent(s: Socket, event: string, predicate?: (p: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), TIMEOUT_MS);
    const handler = (payload: any) => {
      if (predicate && !predicate(payload)) return;
      s.off(event, handler);
      clearTimeout(t);
      resolve(payload);
    };
    s.on(event, handler);
  });
}

function awaitDisconnect(s: Socket): Promise<void> {
  return new Promise((resolve) => s.once('disconnect', () => resolve()));
}

async function main() {
  // asegurar seed
  await fetch(`${API_URL}/seed`, { method: 'POST' });

  console.log('0) ids de ana y beto');
  const anaToken = await login('ana@pickit.test');
  const betoToken = await login('beto@pickit.test');
  // decodificar JWT para sacar el id sin lib extra
  const decode = (t: string) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
  const anaId = decode(anaToken).sub;
  const betoId = decode(betoToken).sub;
  console.log(`   anaId=${anaId} betoId=${betoId}`);

  console.log('1) GET /presence inicial (esperamos vacio o sin ana/beto)');
  const initial = await presenceList();
  if (initial.includes(anaId) || initial.includes(betoId)) {
    throw new Error(`presence inicial ya tiene a alguien: ${JSON.stringify(initial)}`);
  }

  console.log('2) ana conecta -> abrir un "observer" primero (beto) para escuchar el broadcast');
  const observer = await connect(betoToken);
  const sawAnaOnline = awaitEvent(observer, 'presence:online', (p) => p.memberId === anaId);
  const anaSock = await connect(anaToken);
  await sawAnaOnline;

  console.log('3) GET /presence ahora incluye a ana y beto');
  const afterAna = await presenceList();
  if (!afterAna.includes(anaId) || !afterAna.includes(betoId)) {
    throw new Error(`presence no incluye ambos: ${JSON.stringify(afterAna)}`);
  }

  console.log('4) beto abre un 2do socket: NO debe emitir presence:online de nuevo');
  let unexpectedDup = false;
  observer.on('presence:online', (p) => {
    if (p.memberId === betoId) unexpectedDup = true;
  });
  const betoSock2 = await connect(betoToken);
  await new Promise((r) => setTimeout(r, 400));
  if (unexpectedDup) throw new Error('presence:online duplicado al abrir 2do tab de beto');

  console.log('5) cerrar el 2do socket de beto: NO debe emitir presence:offline');
  let unexpectedOffline = false;
  observer.on('presence:offline', (p) => {
    if (p.memberId === betoId) unexpectedOffline = true;
  });
  betoSock2.disconnect();
  await new Promise((r) => setTimeout(r, 400));
  if (unexpectedOffline) throw new Error('presence:offline emitido aunque beto sigue con 1 socket');

  console.log('6) cerrar el ultimo socket de beto: presence:offline recibido por ana');
  const sawBetoOffline = awaitEvent(anaSock, 'presence:offline', (p) => p.memberId === betoId);
  observer.disconnect();
  await sawBetoOffline;

  console.log('7) cerrar ana, presence final no la incluye');
  anaSock.disconnect();
  // dar tiempo a Redis
  await new Promise((r) => setTimeout(r, 400));
  const final = await presenceList();
  if (final.includes(anaId) || final.includes(betoId)) {
    throw new Error(`presence final aun tiene gente: ${JSON.stringify(final)}`);
  }

  console.log('OK — v2-presence verificado');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
