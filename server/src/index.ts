import path from 'path'
import fs from 'fs'
import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { pool, testConnection } from './db'
import { loadAuthConfig, requireAuth, authRoutes } from './auth'
import customerRoutes  from './routes/customers'
import loanRoutes      from './routes/loans'
import paymentRoutes   from './routes/payments'
import dashboardRoutes from './routes/dashboard'
import billRoutes      from './routes/bills'

dotenv.config()

const app          = express()
const PORT         = parseInt(process.env.PORT || '3000', 10)
const IS_PROD      = process.env.NODE_ENV === 'production'
const TRUST_PROXY  = process.env.TRUST_PROXY === 'true'

// Behind nginx/IIS/Cloudflare the client IP arrives in X-Forwarded-For.
// Only trust it when explicitly told to — otherwise the rate limiter can be
// bypassed by spoofing the header.
if (TRUST_PROXY) app.set('trust proxy', 1)

app.disable('x-powered-by')

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  // The client is a same-origin SPA; a strict CSP would need per-build hashes
  // for Vite's inline module preload, so keep the sensible defaults but allow
  // the Google Fonts stylesheet the app loads.
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}))

app.use(compression())

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production the client is served from this same origin, so cross-origin
// requests are only needed in development (Vite on :5173) or when CORS_ORIGIN
// is set explicitly for a split deployment.
//
// Scoped to /api on purpose: static assets are same-origin and must never be
// subject to an origin check.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use('/api', cors({
  origin: (origin, callback) => {
    // No Origin header: same-origin navigation, curl, or a health probe.
    if (!origin) return callback(null, true)
    if (corsOrigins.includes(origin)) return callback(null, true)

    // Deny by omitting the CORS headers rather than throwing. Throwing turns a
    // disallowed origin into a 500 for everyone, including the same-origin
    // asset requests the browser labels with an Origin header. Omitting the
    // headers is what actually blocks the caller — the browser enforces it.
    callback(null, false)
  },
  credentials: true,
}))

// ─── Body parsing (capped — an unbounded body is a memory DoS) ───────────────
app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: true, limit: '256kb' }))

// ─── Rate limiting ────────────────────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit:    Number(process.env.RATE_LIMIT_PER_MINUTE || 300),
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message: { error: 'Too many requests — please slow down and try again shortly.' },
}))

// Writes are far cheaper to abuse than reads, so cap them harder.
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit:    Number(process.env.RATE_LIMIT_WRITES_PER_MINUTE || 60),
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message: { error: 'Too many write requests — please slow down and try again shortly.' },
})

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  return writeLimiter(req, res, next)
})

// ─── Request logging (development only) ───────────────────────────────────────
if (!IS_PROD) {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
    next()
  })
}

// ─── Health check ─────────────────────────────────────────────────────────────
// Verifies the database too — a process that is up but cannot reach PostgreSQL
// is not healthy, and a load balancer needs to know the difference.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({
      status: 'degraded', database: 'unreachable', timestamp: new Date().toISOString(),
    })
  }
})

// ─── Authentication ───────────────────────────────────────────────────────────
// Single shared login, credentials in the environment. Mounted after the health
// check and before every data route, so nothing below is reachable without a
// session. Fails closed: if AUTH_ENABLED is not explicitly "false" and no
// password is configured, startup aborts rather than serving customer data open.
let authConfig
try {
  authConfig = loadAuthConfig()
} catch (err) {
  // A configuration mistake here means the difference between a locked app and
  // an open one, so print the guidance plainly instead of a stack trace.
  console.error('\n❌ Authentication is not configured correctly:\n')
  console.error((err as Error).message + '\n')
  process.exit(1)
}

app.use('/api/auth', authRoutes(authConfig))
app.use('/api', requireAuth(authConfig))

if (!authConfig.enabled) {
  console.warn('⚠️  AUTH_ENABLED=false — the API is open to anyone who can reach it.')
}

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/customers',  customerRoutes)
app.use('/api/loans',      loanRoutes)
app.use('/api/payments',   paymentRoutes)
app.use('/api/dashboard',  dashboardRoutes)
app.use('/api/bills',      billRoutes)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Route not found' }))

// ─── Serve the built client (single-origin production deployment) ────────────
// One process serves both the SPA and the API, so there is no CORS to
// configure and the client's relative "/api" base URL just works.
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist')

if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  // Hashed assets are immutable; index.html must never be cached or users get
  // stale JS pointing at deleted chunks after a deploy.
  app.use(express.static(CLIENT_DIST, {
    index:    false,
    maxAge:   '1y',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
    },
  }))

  // SPA fallback: React Router owns every non-API path, so deep links such as
  // /customers/<uuid> must return index.html instead of a 404.
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(CLIENT_DIST, 'index.html'))
  })
} else {
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }))
  if (IS_PROD) {
    console.warn(
      `⚠️  No client build found at ${CLIENT_DIST}. ` +
      'Run "npm run build" in the client folder before starting in production.'
    )
  }
}

// ─── Error handler ────────────────────────────────────────────────────────────
// Must stay last, and must take four arguments for Express to recognise it.
app.use((
  err:   Error & { status?: number },
  _req:  express.Request,
  res:   express.Response,
  _next: express.NextFunction
) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500

  if (status >= 500) console.error('Unhandled error:', err)

  res.status(status).json({
    error: status >= 500
      // Never leak stack traces, SQL fragments or driver messages to a client.
      ? 'Internal server error'
      : err.message,
  })
})

// ─── Startup + graceful shutdown ──────────────────────────────────────────────
let server: http.Server | undefined

async function start() {
  try {
    await testConnection()
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}  (${process.env.NODE_ENV || 'development'})`)
    })
  } catch (err) {
    console.error('❌ Failed to start server:', err)
    process.exit(1)
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully…`)
  // Stop accepting new connections, let in-flight requests finish, then release
  // the pool so PostgreSQL is not left holding open sessions.
  const timer = setTimeout(() => {
    console.error('Shutdown timed out — forcing exit.')
    process.exit(1)
  }, 10_000)
  timer.unref()

  try {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    await pool.end()
    console.log('✅ Shutdown complete.')
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT',  () => void shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

start()
