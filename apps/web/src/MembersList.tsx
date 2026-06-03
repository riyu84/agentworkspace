import type { Member } from './types';

interface Props {
  members: Member[];
  onlineIds: Set<string>;
}

// Los AGENT no usan websockets para "estar online". Mientras isActive=true
// los mostramos online (representa: la integracion esta lista para recibir).
function isOnline(m: Member, onlineIds: Set<string>): boolean {
  if (m.type === 'AGENT') return true;
  return onlineIds.has(m.id);
}

export function MembersList({ members, onlineIds }: Props) {
  const online = members.filter((m) => isOnline(m, onlineIds));
  const offline = members.filter((m) => !isOnline(m, onlineIds));

  return (
    <div className="members-section">
      <h3>Online — {online.length}</h3>
      {online.map((m) => (
        <div key={m.id} className="member-row online">
          <span className="dot" />
          <span>{m.displayName}</span>
          {m.type === 'AGENT' && <span className="agent-tag">BOT</span>}
        </div>
      ))}
      {offline.length > 0 && (
        <>
          <h3 style={{ marginTop: 8 }}>Offline — {offline.length}</h3>
          {offline.map((m) => (
            <div key={m.id} className="member-row offline">
              <span className="dot" />
              <span>{m.displayName}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
