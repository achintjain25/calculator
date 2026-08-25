import { useState } from 'react'
import { authApi } from '../api/auth'

interface Props {
  shopName:  string
  onSuccess: () => void
}

export default function LoginPage({ shopName, onSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter both your username and password')
      return
    }
    setBusy(true)
    setError('')
    try {
      await authApi.login(username.trim(), password)
      onSuccess()
    } catch (err: unknown) {
      setError((err as Error).message)
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-gold-500/50
                          shadow-lg shadow-gold-500/20 mb-4">
            <img src="/logo.jpeg" alt="" className="w-full h-full object-cover" />
          </div>
          <h1
            className="text-gold-400 font-bold text-2xl"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {shopName}
          </h1>
          <p className="text-gray-500 text-[10px] tracking-widest uppercase mt-1">
            Gold &amp; Silver Jewellery
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6 space-y-4"
        >
          <div>
            <h2 className="text-white font-semibold text-base">Sign in</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              Enter your shop credentials to continue
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="text-red-400 text-sm bg-red-900/20 border border-red-500/30
                         rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <div>
            <label htmlFor="username" className="input-label">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              className="input-field"
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              disabled={busy}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="input-label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="input-field"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              disabled={busy}
            />
          </div>

          <button type="submit" disabled={busy} className="btn-gold w-full disabled:opacity-60">
            {busy ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in…
              </>
            ) : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-6">
          Authorised users only. All activity is against live customer records.
        </p>
      </div>
    </div>
  )
}
