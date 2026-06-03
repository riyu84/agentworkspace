import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { api, WORKSPACE_ID } from './api';
import { makeSocket } from './socket';
import type { Channel, Member, Message, Workspace } from './types';
import { MessageList } from './MessageList';

const TYPING_TTL_MS = 8000;

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string>(() => localStorage.getItem('meId') ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [listHeight, setListHeight] = useState(500);
  const socketRef = useRef<Socket | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // Bootstrap: seed (idempotente) + cargar workspace.
  useEffect(() => {
    (async () => {
      try {
        await api.seed();
        const ws = await api.workspace(WORKSPACE_ID);
        setWorkspace(ws);
        if (ws.channels.length > 0 && !activeChannelId) setActiveChannelId(ws.channels[0].id);
        if (!meId) {
          const firstHuman = ws.members.find((m) => m.type === 'HUMAN');
          if (firstHuman) {
            setMeId(firstHuman.id);
            localStorage.setItem('meId', firstHuman.id);
          }
        }
      } catch (e) {
        setError(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conectar socket cuando hay meId.
  useEffect(() => {
    if (!meId) return;
    const s = makeSocket(meId);
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
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [meId]);

  // Join channel + cargar historial cuando cambia.
  useEffect(() => {
    if (!activeChannelId || !socketRef.current) return;
    socketRef.current.emit('channel:join', { channelId: activeChannelId });
    setMessages([]);
    api
      .messages(activeChannelId)
      .then(setMessages)
      .catch((e) => setError(String(e)));
  }, [activeChannelId, meId]);

  // Medir alto disponible para la lista virtualizada.
  useEffect(() => {
    if (!mainRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      // restar header (53) + typing (22) + input-row (~58)
      setListHeight(Math.max(120, h - 53 - 22 - 58));
    });
    ro.observe(mainRef.current);
    return () => ro.disconnect();
  }, []);

  const authorById = useMemo(() => {
    const m = new Map<string, Member>();
    workspace?.members.forEach((mem) => m.set(mem.id, mem));
    return m;
  }, [workspace]);

  const activeChannel = workspace?.channels.find((c) => c.id === activeChannelId) ?? null;
  const me = workspace?.members.find((m) => m.id === meId) ?? null;

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
          <select
            value={meId}
            onChange={(e) => {
              setMeId(e.target.value);
              localStorage.setItem('meId', e.target.value);
            }}
          >
            {workspace.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.type})
              </option>
            ))}
          </select>
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
            placeholder={me ? `Mensaje a #${activeChannel?.name ?? ''} como ${me.displayName}` : 'esperando identidad...'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!me || !activeChannel}
          />
          <button onClick={send} disabled={!draft.trim() || !me || !activeChannel}>
            Enviar
          </button>
        </div>
      </main>
    </div>
  );
}
