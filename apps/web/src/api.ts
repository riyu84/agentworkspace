import type { Message, Workspace } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export const WORKSPACE_ID = 'ws_pickit_seed';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

async function post<T>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method: 'POST' });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export const api = {
  apiUrl: API_URL,
  seed: () => post<unknown>('/seed'),
  workspace: (id: string) => get<Workspace>(`/workspaces/${id}`),
  messages: (channelId: string, limit = 50) =>
    get<Message[]>(`/channels/${channelId}/messages?limit=${limit}`),
};
