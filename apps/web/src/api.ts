import type { LoginResponse, Message, MeResponse, Workspace } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const WORKSPACE_ID = 'ws_pickit_seed';

async function get<T>(path: string, token?: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`${path} -> ${r.status}: ${text}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  apiUrl: API_URL,
  seed: () => post<unknown>('/seed'),
  workspace: (id: string) => get<Workspace>(`/workspaces/${id}`),
  messages: (channelId: string, limit = 50) =>
    get<Message[]>(`/channels/${channelId}/messages?limit=${limit}`),
  login: (email: string) => post<LoginResponse>('/auth/login', { email }),
  me: (token: string) => get<MeResponse>('/auth/me', token),
  presence: () => get<{ online: string[] }>('/presence'),
};
