import crypto from 'crypto'
import { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'

/**
 * Single-user authentication
 * ──────────────────────────
 * The shop has one operator, so there is no users table — the credentials live
 * in environment variables and the session is a signed, stateless cookie.
 *
 * Design notes:
 *   - Passwords are verified against a scrypt hash, never a plaintext compare.
 *     scrypt is in Node core, so this adds no native dependency (bcrypt needs
 *     a compiler toolchain, which is painful on Windows).
 *   - The session cookie is an HMAC-signed token carrying only a username and
 *     an expiry. Nothing to store server-side, so sessions survive restarts
 *     and there is no table to grow.
 *   - Every comparison that touches a secret uses timingSafeEqual.
 *
 * Generate the hash with:  npm run set-password -- "your password"
 */

const COOKIE_NAME = 'rj_session'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface AuthConfig {
  enabled:       boolean
  username:      string
  passwordHash:  string
  secret:        string
  sessionHours:  number
  cookieSecure:  boolean
}

/** scrypt parameters. Stored in the hash string so they can change later. */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

/** Produce `scrypt$N$r$p$salt$hash`, the value that goes in AUTH_PASSWORD_HASH. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const key  = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
    // scrypt needs memory proportional to N*r*128; raise the cap to match.
    maxmem: 256 * SCRYPT.N * SCRYPT.r,
  })
  return [
    'scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString('base64'), key.toString('base64'),
  ].join('$')
}

/** Constant-time verification against a stored scrypt hash. */
function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts
  const N = parseInt(nStr, 10), r = parseInt(rStr, 10), p = parseInt(pStr, 10)
  if (!N || !r || !p) return false

  const salt     = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')

  let actual: Buffer
  try {
    actual = crypto.scryptSync(password, salt, expected.length, {
      N, r, p, maxmem: 256 * N * r,
    })
  } catch {
    return false
  }

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

/** Read and validate auth settings from the environment. */
export function loadAuthConfig(): AuthConfig {
  const isProd = process.env.NODE_ENV === 'production'

  // Auth is on unless explicitly disabled, so a misconfigured deployment fails
  // closed rather than silently serving customer data to the world.
  const enabled = process.env.AUTH_ENABLED !== 'false'

  const username     = process.env.AUTH_USERNAME || 'owner'
  const sessionHours = Number(process.env.AUTH_SESSION_HOURS || 12)

  let passwordHash = process.env.AUTH_PASSWORD_HASH || ''

  // Plaintext fallback so a first-time setup is not blocked on running the
  // hashing tool. Hashed at boot, never compared directly.
  if (!passwordHash && process.env.AUTH_PASSWORD) {
    passwordHash = hashPassword(process.env.AUTH_PASSWORD)
    console.warn(
      'AUTH_PASSWORD is set in plaintext. Run "npm run set-password" and use ' +
      'AUTH_PASSWORD_HASH instead so the password is not stored in .env in the clear.'
    )
  }

  let secret = process.env.AUTH_SESSION_SECRET || ''

  if (enabled) {
    if (!passwordHash) {
      throw new Error(
        'Authentication is enabled but no password is set.\n' +
        '  Run:  npm run set-password -- "your password"\n' +
        '  Then put the printed AUTH_PASSWORD_HASH line into server/.env\n' +
        '  (Or set AUTH_ENABLED=false to run without a login — local use only.)'
      )
    }
    if (!secret) {
      if (isProd) {
        throw new Error(
          'AUTH_SESSION_SECRET is required in production.\n' +
          '  Generate one with:  npm run set-password -- "your password"'
        )
      }
      // Development convenience: a random secret means sessions drop on
      // restart, which is harmless locally.
      secret = crypto.randomBytes(32).toString('hex')
      console.warn('AUTH_SESSION_SECRET not set — using a random one. Logins will not survive a restart.')
    }
  }

  // Secure cookies require HTTPS. Behind a proxy TLS is being terminated, so
  // default to secure there; a plain-HTTP LAN deployment must not, or the
  // browser silently drops the cookie and login appears to do nothing.
  const cookieSecure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === 'true'
    : (isProd && process.env.TRUST_PROXY === 'true')

  return { enabled, username, passwordHash, secret, sessionHours, cookieSecure }
}

// ─── Session tokens ───────────────────────────────────────────────────────────

/** `base64url(payload).base64url(hmac)` — stateless and tamper-evident. */
function signToken(username: string, secret: string, hours: number): string {
  const payload = Buffer.from(JSON.stringify({
    u:   username,
    exp: Date.now() + hours * 3600_000,
  })).toString('base64url')

  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Returns the username if the token is authentic and unexpired, else null. */
function verifyToken(token: string, secret: string): string | null {
  const dot = token.indexOf('.')
  if (dot < 1) return null

  const payload = token.slice(0, dot)
  const sig     = token.slice(dot + 1)

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof data.exp !== 'number' || Date.now() > data.exp) return null
    return typeof data.u === 'string' ? data.u : null
  } catch {
    return null
  }
}

/** Pull one cookie out of the request without pulling in cookie-parser. */
function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

// ─── Middleware ───────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { username?: string }
  }
}

/**
 * Rejects unauthenticated API requests with 401.
 *
 * `/api/health` and `/api/auth/*` are left open: health so a load balancer can
 * probe without credentials, and auth so login is reachable.
 */
export function requireAuth(config: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enabled) return next()

    const path = req.path
    if (path === '/health' || path.startsWith('/auth/')) return next()

    const token = readCookie(req, COOKIE_NAME)
    const user  = token ? verifyToken(token, config.secret) : null

    if (!user) {
      return res.status(401).json({ error: 'Not signed in', code: 'UNAUTHENTICATED' })
    }

    req.username = user
    next()
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function authRoutes(config: AuthConfig): Router {
  const router = Router()

  // Brute force is the whole threat model for a single shared password, so the
  // login endpoint gets a much tighter budget than the rest of the API.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit:    Number(process.env.AUTH_LOGIN_ATTEMPTS_PER_15MIN || 10),
    standardHeaders: 'draft-7',
    legacyHeaders:   false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
  })

  router.get('/me', (req: Request, res: Response) => {
    if (!config.enabled) {
      return res.json({ authenticated: true, username: null, auth_disabled: true })
    }
    const token = readCookie(req, COOKIE_NAME)
    const user  = token ? verifyToken(token, config.secret) : null
    if (!user) return res.status(401).json({ authenticated: false })
    res.json({ authenticated: true, username: user })
  })

  router.post('/login', loginLimiter, (req: Request, res: Response) => {
    if (!config.enabled) return res.json({ authenticated: true, auth_disabled: true })

    const username = String(req.body?.username ?? '')
    const password = String(req.body?.password ?? '')

    const userBuf     = Buffer.from(username)
    const expectedBuf = Buffer.from(config.username)
    const userOk = userBuf.length === expectedBuf.length &&
                   crypto.timingSafeEqual(userBuf, expectedBuf)

    // Verify the password even when the username is wrong, so response timing
    // does not reveal which half failed.
    const passOk = verifyPassword(password, config.passwordHash)

    if (!userOk || !passOk) {
      return res.status(401).json({ error: 'Incorrect username or password' })
    }

    const token = signToken(config.username, config.secret, config.sessionHours)

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,               // not readable from JavaScript
      sameSite: 'lax',              // blocks cross-site form CSRF
      secure:   config.cookieSecure,
      maxAge:   config.sessionHours * 3600_000,
      path:     '/',
    })

    res.json({ authenticated: true, username: config.username })
  })

  router.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   config.cookieSecure,
      path:     '/',
    })
    res.json({ authenticated: false })
  })

  return router
}
