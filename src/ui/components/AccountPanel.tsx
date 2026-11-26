import { useState } from 'react';
import type { OnlineSession } from '../hooks/useOnlineGame';

/** Optional sign-in. Playing works without it; signing in keeps a record against each opponent. */
export function AccountPanel({ session }: { session: OnlineSession }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const connected = session.status === 'open';

  if (session.user) {
    return (
      <div className="account-panel">
        <div className="account-head">
          <div>
            <span className="field-label" style={{ marginBottom: 2 }}>
              Signed in as
            </span>
            <strong>{session.user.username}</strong>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={session.logout}>
            Sign out
          </button>
        </div>
        {session.stats.length > 0 ? (
          <table className="record-table">
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Games</th>
                <th>Won</th>
                <th>Lost</th>
              </tr>
            </thead>
            <tbody>
              {session.stats.slice(0, 8).map((s) => (
                <tr key={s.opponentId}>
                  <td>{s.opponent}</td>
                  <td>{s.games}</td>
                  <td className="win">{s.wins}</td>
                  <td className="loss">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rules-summary" style={{ margin: 0 }}>
            No games recorded yet. Finish a game against another signed-in player and it will show up here.
          </p>
        )}
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') session.login(username, password);
    else session.register(username, password);
  };

  return (
    <div className="account-panel">
      <div className="account-head">
        <div>
          <strong>Playing as a guest</strong>
          <div className="rules-summary" style={{ margin: 0, fontSize: 13 }}>
            Sign in to keep your wins and losses against each friend.
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} disabled={!connected}>
          {open ? 'Close' : 'Sign in'}
        </button>
      </div>
      {open && (
        <form className="account-form" onSubmit={submit}>
          <div className="tabs" style={{ margin: '4px 0 8px' }}>
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
              Sign in
            </button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
              Create account
            </button>
          </div>
          <input className="text-input" placeholder="Username" value={username} autoComplete="username" maxLength={16} onChange={(e) => setUsername(e.target.value)} />
          <input
            className="text-input"
            placeholder={mode === 'register' ? 'Password (6+ characters)' : 'Password'}
            type="password"
            value={password}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
          {session.authError && <span className="error-text">{session.authError}</span>}
          <button className="btn btn-primary" type="submit" disabled={session.authBusy || !username || password.length < (mode === 'register' ? 6 : 1)}>
            {session.authBusy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  );
}
