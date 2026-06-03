import { useEffect, useState } from 'react';
import { api, WORKSPACE_ID } from './api';
import type { Member } from './types';

interface Props {
  onLogin: (token: string, member: Member) => void;
}

export function Login({ onLogin }: Props) {
  const [humans, setHumans] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Seedeamos para que existan los humanos de demo, despues los listamos.
  useEffect(() => {
    (async () => {
      try {
        await api.seed();
        const ws = await api.workspace(WORKSPACE_ID);
        const onlyHumans = ws.members.filter((m) => m.type === 'HUMAN');
        setHumans(onlyHumans);
        if (onlyHumans.length > 0) setEmail(onlyHumans[0].email ?? '');
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const submit = async () => {
    if (!email) return;
    setError(null);
    setLoading(true);
    try {
      const { token, member } = await api.login(email);
      onLogin(token, member);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Discord for Agents</h1>
        <p className="muted">Elegí con qué usuario querés entrar.</p>
        {humans === null && !error && <p className="muted">cargando…</p>}
        {error && <p className="error">{error}</p>}
        {humans && (
          <>
            <select value={email} onChange={(e) => setEmail(e.target.value)}>
              {humans.map((m) => (
                <option key={m.id} value={m.email ?? ''}>
                  {m.displayName} ({m.email})
                </option>
              ))}
            </select>
            <button onClick={submit} disabled={!email || loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
