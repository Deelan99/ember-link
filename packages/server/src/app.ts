import Fastify, { type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { ServerOptions } from 'node:https'
import { fileURLToPath } from 'node:url'
import { claimSecret, getMeta, insertSecret } from './db.js'

const ONE_MINUTE = 60 * 1000
const SEVEN_DAYS = 7 * 24 * 60 * ONE_MINUTE
const DEFAULT_TTL = 24 * 60 * ONE_MINUTE
const MAX_BODY = 1024 * 1024 // 1 MB ciphertext cap

interface CreateBody {
  ciphertext?: unknown
  iv?: unknown
  salt?: unknown
  hasPassphrase?: unknown
  ttlMs?: unknown
}

function newId(): string {
  // 128 bits of entropy, URL-safe.
  return randomBytes(16).toString('base64url')
}

// Optional: point these at a local cert (e.g. from mkcert) to serve HTTPS directly.
// Needed for testing on a phone/other device on the LAN, since the Web Crypto API
// only runs in a secure context and a LAN IP doesn't qualify for that over plain HTTP.
const { TLS_KEY_FILE, TLS_CERT_FILE } = process.env

export async function buildApp(): Promise<FastifyInstance> {
  const https: ServerOptions | undefined =
    TLS_KEY_FILE && TLS_CERT_FILE
      ? { key: readFileSync(TLS_KEY_FILE), cert: readFileSync(TLS_CERT_FILE) }
      : undefined

  // Cast away the http/https server generic split: nothing below touches the raw
  // server, only the (identical) Fastify request/reply API.
  const app = (
    https
      ? Fastify({ logger: process.env.NODE_ENV === 'test' ? false : true, bodyLimit: MAX_BODY, https })
      : Fastify({ logger: process.env.NODE_ENV === 'test' ? false : true, bodyLimit: MAX_BODY })
  ) as FastifyInstance

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // no external / inline JS — matches the zero-trust model
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        // Helmet appends this by default, which makes browsers rewrite same-origin
        // asset requests to https:// — breaks any plain-HTTP deployment (e.g. a
        // reverse proxy that terminates TLS upstream, or local testing).
        upgradeInsecureRequests: null,
      },
    },
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // In dev the web app runs on a different origin (Vite :5173).
  if (process.env.NODE_ENV !== 'production') {
    await app.register(cors, { origin: true })
  }

  app.post('/api/secrets', async (req, reply) => {
    const b = (req.body ?? {}) as CreateBody
    if (
      typeof b.ciphertext !== 'string' ||
      typeof b.iv !== 'string' ||
      typeof b.salt !== 'string' ||
      b.ciphertext.length === 0
    ) {
      return reply.code(400).send({ error: 'invalid payload' })
    }
    const requested = Number(b.ttlMs)
    const ttlMs = Number.isFinite(requested)
      ? Math.min(Math.max(requested, ONE_MINUTE), SEVEN_DAYS)
      : DEFAULT_TTL
    const id = newId()
    insertSecret({
      id,
      ciphertext: b.ciphertext,
      iv: b.iv,
      salt: b.salt,
      hasPassphrase: Boolean(b.hasPassphrase),
      expiresAt: Date.now() + ttlMs,
    })
    return { id }
  })

  // Non-destructive: lets the viewer decide whether to prompt for a passphrase.
  app.get('/api/secrets/:id/meta', async (req) => {
    const { id } = req.params as { id: string }
    return getMeta(id)
  })

  // Destructive: atomically claims + deletes, returning the ciphertext once.
  app.post('/api/secrets/:id/consume', async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = claimSecret(id)
    if (!row) return reply.code(404).send({ error: 'not found' })
    return {
      ciphertext: row.ciphertext,
      iv: row.iv,
      salt: row.salt,
      hasPassphrase: Boolean(row.has_passphrase),
    }
  })

  // Serve the built web app (create UI + viewer) when it exists.
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist })
    // SPA fallback: any non-API, non-file path returns index.html so /s/<id>
    // resolves to the client-side router.
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
