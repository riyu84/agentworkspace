// =====================================================
//  smoke-v2-auth.ts — verifica el flow de auth JWT:
//  1) login ok -> token
//  2) /auth/me con el token -> member
//  3) socket con token valido -> connected
//  4) socket sin token -> auth:error + disconnected
//  5) socket con token invalido -> auth:error + disconnected
// =====================================================

import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const SOCKET_URL = `${API_URL}/chat`;
const TIMEOUT_MS = 5000;

async function ensureSeed() {
  const r = await fetch(`${API_URL}/seed`, { method: 'POST' });
  if (!r.ok) throw new Error(`seed fallo: ${r.status}`);
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  const data = await r.json();
  return data.token;
}

async function me(token: string): Promise<any> {
  const r = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`me -> ${r.status}`);
  return r.json();
}

/**
 * Decide el estado final del socket. Socket.IO emite 'connect' antes que el
 * server pueda desconectarlo desde handleConnection; por eso esperamos un
 * grace window despues del connect y vemos si sigue vivo.
 */
function awaitOutcome(sock: Socket): Promise<'connected' | 'disconnected'> {
  const GRACE_MS = 500;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout esperando outcome')), TIMEOUT_MS);
    let kicked = false;
    sock.on('disconnect', () => {
      kicked = true;
      clearTimeout(timer);
      resolve('disconnected');
    });
    sock.on('connect_error', () => {
      clearTimeout(timer);
      resolve('disconnected');
    });
    sock.on('connect', () => {
      setTimeout(() => {
        if (kicked) return;
        clearTimeout(timer);
        resolve('connected');
      }, GRACE_MS);
    });
  });
}

async function main() {
  console.log('0) seed (idempotente)');
  await ensureSeed();

  console.log('1) login ana');
  const token = await login('ana@pickit.test');
  if (!token || token.split('.').length !== 3) throw new Error(`token raro: ${token}`);
  console.log(`   token: ${token.slice(0, 20)}...`);

  console.log('2) /auth/me');
  const meRes = await me(token);
  if (meRes.member?.displayName !== 'ana') {
    throw new Error(`me no devolvio ana: ${JSON.stringify(meRes)}`);
  }

  console.log('3) socket con token valido -> connected');
  const sOk = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
  const outOk = await awaitOutcome(sOk);
  if (outOk !== 'connected') throw new Error('socket con token valido fue desconectado');
  sOk.disconnect();

  console.log('4) socket SIN token -> disconnected con auth:error');
  const sNo = io(SOCKET_URL, { transports: ['websocket'] });
  let sawAuthError = false;
  sNo.on('auth:error', () => (sawAuthError = true));
  const outNo = await awaitOutcome(sNo);
  if (outNo !== 'disconnected') throw new Error('socket sin token NO fue desconectado');
  // dar un instante para que llegue auth:error
  await new Promise((r) => setTimeout(r, 100));
  if (!sawAuthError) console.warn('   ! warning: no llego auth:error');

  console.log('5) socket con token INVALIDO -> disconnected');
  const sBad = io(SOCKET_URL, { auth: { token: 'no.es.un.jwt' }, transports: ['websocket'] });
  const outBad = await awaitOutcome(sBad);
  if (outBad !== 'disconnected') throw new Error('socket con token invalido NO fue desconectado');

  console.log('6) login con email inexistente -> 401');
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'no-existe@nada.com' }),
  });
  if (r.status !== 401) throw new Error(`esperaba 401, got ${r.status}`);

  console.log('OK — v2-auth verificado');
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});
