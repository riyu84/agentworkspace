import type { ButtonBlock, Member, Message } from './types';

interface Props {
  msg: Message;
  authorById: Map<string, Member>;
  style?: React.CSSProperties;
  resolved?: boolean;
  onAction?: (msg: Message, block: ButtonBlock) => void;
}

export function MessageItem({ msg, authorById, style, resolved, onAction }: Props) {
  const author = msg.author ?? authorById.get(msg.authorId);
  const isAgent = msg.role === 'AGENT' || author?.type === 'AGENT';
  const isSystem = msg.role === 'SYSTEM';
  const displayName = author?.displayName ?? msg.authorId.slice(0, 8);
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const ts = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const toolCalls = msg.metadata?.toolCalls ?? [];
  const blocks = (msg.metadata?.blocks ?? []) as ButtonBlock[];

  return (
    <div className={`msg ${isAgent ? 'agent' : ''} ${isSystem ? 'system' : ''}`} style={style}>
      <div className="avatar">{initial}</div>
      <div className="body">
        <div className="head">
          <span className={`name ${isAgent ? 'agent' : ''}`}>{displayName}</span>
          <span className="ts">{ts}</span>
        </div>
        <div className="content">{msg.content}</div>
        {toolCalls.length > 0 && (
          <div className="tool-calls">
            {toolCalls.map((tc, i) => (
              <div className="tool-call" key={tc.id ?? `${tc.name}-${i}`}>
                <span className="tool-name">{tc.name}</span>
                <pre>{JSON.stringify(tc.args, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
        {blocks.length > 0 && (
          <div className="blocks">
            {blocks.map((b) => (
              <button
                key={b.actionId}
                className={b.style ?? 'default'}
                disabled={resolved || !onAction}
                onClick={() => onAction?.(msg, b)}
              >
                {b.label}
              </button>
            ))}
            {resolved && <span className="resolved-tag">respondido</span>}
          </div>
        )}
      </div>
    </div>
  );
}
