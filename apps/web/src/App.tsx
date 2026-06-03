import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { api, WORKSPACE_ID } from './api';
import { makeSocket } from './socket';
import type { Channel, Member, Message, Workspace } from './types';
import { MessageList } from './MessageList';
import { Login } from './Login';

const TYPING_TTL_MS = 8000;
const LS_TOKEN = 'auth.token';
const LS_MEMBER = 'auth.member';

interface Session {
  token: string;
  member: Member;
}

function loadSession(): Session | null {
  const token = localStorage.getItem(LS_TOKEN);
  const memberRaw = localStorage.getItem(LS_MEMBER);
  if (!token || !memberRaw) return null;
  try {
    return { token, member: JSON.parse(memberRaw) as Member };
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem(LS_TOKEN, s.token);
  localStorage.setItem(LS_MEMBER, JSON.stringify(s.member));
}

function clearSession() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_MEMBER);
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [listHeight, setListHeight] = useState(500);
  const socketRef = useRef<Socket | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Validar token contra /auth/me al montar; si falla, cerrar sesion.
  useEffect(() => {
    if (!session) return;
    api.me(session.token).catch(() => {
      clearSession();
      setSession(null);
    });
  }, [session?.token]);

  // Cargar workspace una vez autenticado.
  useEffect(() => {
    if (!session) return;
    api
      .workspace(WORKSPACE_ID)
      .then((ws) => {
        setWorkspace(ws);
        if (ws.channels.length > 0 && !activeChannelId) {
          setActiveChannelId(ws.channels[0].id);
        }
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  // Conectar socket con el token.
  useEffect(() => {
    if (!session) return;
    const s = makeSocket(session.token);
    socketRef.current = s;

    s.on('message', (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.role === 'AGENT') {
        setTypingAgents((prev) => {
          const next = new Set(prev);
          next.delete(msg.authorId);
          return next;
        });
      }
    });
    s.on('agent:typing', ({ agentId }: { agentId: string }) => {
      setTypingAgents((prev) => new Set(prev).add(agentId));
      setTimeout(() => {
        setTypingAgents((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
      }, TYPING_TTL_MS);
    });
    s.on('auth:error', () => {
      clearSession();
      setSession(null);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [session?.token]);

  // Join channel + cargar historial cuando cambia.
  useEffect(() => {
    if (!activeChannelId || !socketRef.current) return;
    socketRef.current.emit('channel:join', { channelId: activeChannelId });
    setMessages([]);
    api
      .messages(activeChannelId)
      .then(setMessages)
      .catch((e) => setError(String(e)));
  }, [activeChannelId, session?.token]);

  // Medir alto disponible para la lista virtualizada.
  useEffect(() => {
    if (!mainRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      setListHeight(Math.max(120, h - 53 - 22 - 58));
    });
    ro.observe(mainRef.current);
    return () => ro.disconnect();
  }, [session?.token]);

  const authorById = useMemo(() => {
    const m = new Map<string, Member>();
    workspace?.members.forEach((mem) => m.set(mem.id, mem));
    return m;
  }, [workspace]);

  const activeChannel = workspace?.channels.find((c) => c.id === activeChannelId) ?? null;

  const typingNames = useMemo(() => {
    return [...typingAgents]
      .map((id) => authorById.get(id)?.displayName ?? id.slice(0, 6))
      .join(', ');
  }, [typingAgents, authorById]);

  const send = () => {
    if (!draft.trim() || !activeChannelId || !socketRef.current) return;
    socketRef.current.emit('message:send', {
      channelId: activeChannelId,
      content: draft.trim(),
    });
    setDraft('');
  };

  const handleLogin = (token: string, member: Member) => {
    const s = { token, member };
    saveSession(s);
    setSession(s);
  };

  const handleLogout = () => {
    socketRef.current?.disconnect();
    clearSession();
    setSession(null);
    setWorkspace(null);
    setMessages([]);
    setActiveChannelId(null);
  };

  if (!session) return <Login onLogin={handleLogin} />;
  if (error) return <div className="empty-state">error: {error}</div>;
  if (!workspace) return <div className="empty-state">cargando…</div>;

  return (
    <div className="app">
      <aside className="sidebar">
        <header>{workspace.name}</header>
        <div className="channels">
          {workspace.channels.map((c: Channel) => (
            <button
              key={c.id}
              className={c.id === activeChannelId ? 'active' : ''}
              onClick={() => setActiveChannelId(c.id)}
            >
              # {c.name}
            </button>
          ))}
        </div>
        <div className="picker">
          <label>Identidad</label>
          <span className="me-label">{session.member.displayName}</span>
          <button className="logout" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        <header>
          <strong># {activeChannel?.name ?? '—'}</strong>
          {activeChannel?.topic && <span className="topic">{activeChannel.topic}</span>}
        </header>
        <div className="messages">
          <MessageList messages={messages} authorById={authorById} height={listHeight} />
        </div>
        <div className="typing">
          {typingAgents.size > 0 && `${typingNames} está${typingAgents.size > 1 ? 'n' : ''} pensando…`}
        </div>
        <div className="input-row">
          <input
            placeholder={`Mensaje a #${activeChannel?.name ?? ''} como ${session.member.displayName}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!activeChannel}
          />
          <button onClick={send} disabled={!draft.trim() || !activeChannel}>
            Enviar
          </button>
        </div>
      </main>
    </div>
  );
}
