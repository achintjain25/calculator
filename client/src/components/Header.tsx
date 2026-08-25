import { useEffect, useState } from 'react'

interface HeaderProps {
  shopName:      string
  username?:     string | null
  onLogout?:     () => void
  onMenuToggle?: () => void
}

export default function Header({ shopName, username, onLogout, onMenuToggle }: HeaderProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })

  return (
    <header className="relative bg-gradient-to-r from-black via-gray-950 to-black border-b border-gold-500/30 shadow-lg flex-shrink-0">
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-gold-500 to-transparent" />

      <div className="flex items-center px-4 sm:px-6 h-16 gap-4">
        {/* Hamburger — mobile */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 text-gray-400 hover:text-gold-400 transition-colors"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-gold-500/50 shadow-lg shadow-gold-500/20">
            <img
              src="/logo.jpeg"
              alt="RJ Jewellers"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-gold-400 font-bold text-lg leading-none"
                style={{ fontFamily: "'Playfair Display', serif" }}>
              {shopName}
            </h1>
            <p className="text-gray-500 text-[10px] tracking-widest uppercase">
              Gold &amp; Silver Jewellery
            </p>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clock */}
        <div className="text-right hidden sm:block">
          <p className="text-gold-400 font-mono text-sm font-semibold tabular-nums">
            {timeStr.toUpperCase()}
          </p>
          <p className="text-gray-500 text-xs">{dateStr}</p>
        </div>

        {/* Signed-in user + sign out */}
        {onLogout && (
          <div className="flex items-center gap-3 pl-3 ml-1 border-l border-gray-800">
            {username && (
              <span className="text-gray-400 text-xs hidden md:inline" title="Signed in">
                {username}
              </span>
            )}
            <button
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-gray-500 hover:text-gold-400 transition-colors
                         rounded-lg hover:bg-gray-800/60"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
    </header>
  )
}
