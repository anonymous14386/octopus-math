import { useState, FormEvent } from 'react';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (data.ok) {
        onSuccess();
      } else {
        setError(data.error || 'Invalid credentials.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-10 w-full max-w-sm shadow-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-5">
          <svg className="w-12 h-12 fill-blue-400" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93V18c0-.55-.45-1-1-1s-1 .45-1 1v1.93C7.06 19.48 4.52 16.94 4.07 13H6c.55 0 1-.45 1-1s-.45-1-1-1H4.07C4.52 7.06 7.06 4.52 11 4.07V6c0 .55.45 1 1 1s1-.45 1-1V4.07C16.94 4.52 19.48 7.06 19.93 11H18c-.55 0-1 .45-1 1s.45 1 1 1h1.93c-.45 3.94-2.99 6.48-6.93 6.93zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-[#f0f6fc] text-center mb-1">Octopus Math</h1>
        <p className="text-sm text-[#8b949e] text-center mb-7">
          Sign in with your OctopusTechnology account
        </p>

        {error && (
          <div className="bg-[#3d1c1c] border border-[#f85149] text-[#f85149] text-sm rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-[#8b949e] mb-1" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[#c9d1d9] text-sm outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-[#8b949e] mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[#c9d1d9] text-sm outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-md py-2 text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
