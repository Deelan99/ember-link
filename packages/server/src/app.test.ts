import { beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Use an in-memory DB. Must be set before db.ts is imported (via app.ts).
process.env.DB_PATH = ':memory:'
process.env.NODE_ENV = 'test'

let app: FastifyInstance

beforeAll(async () => {
  const { buildApp } = await import('./app.js')
  app = await buildApp()
  await app.ready()
})

async function createSecret(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/secrets',
    payload: { ciphertext: 'Y2lwaGVy', iv: 'aXZpdml2', salt: 'c2FsdA', hasPassphrase: false, ...overrides },
  })
  expect(res.statusCode).toBe(200)
  return res.json().id as string
}

describe('one-time secret lifecycle', () => {
  it('rejects an invalid payload', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/secrets', payload: { iv: 'x' } })
    expect(res.statusCode).toBe(400)
  })

  it('reports metadata without consuming', async () => {
    const id = await createSecret()
    const a = await app.inject({ url: `/api/secrets/${id}/meta` })
    const b = await app.inject({ url: `/api/secrets/${id}/meta` })
    expect(a.json()).toEqual({ exists: true, hasPassphrase: false })
    expect(b.json().exists).toBe(true) // still there — meta does not burn it
  })

  it('surfaces the passphrase flag in metadata', async () => {
    const id = await createSecret({ hasPassphrase: true })
    const meta = await app.inject({ url: `/api/secrets/${id}/meta` })
    expect(meta.json()).toEqual({ exists: true, hasPassphrase: true })
  })

  it('returns the ciphertext exactly once, then 404s', async () => {
    const id = await createSecret()

    const first = await app.inject({ method: 'POST', url: `/api/secrets/${id}/consume` })
    expect(first.statusCode).toBe(200)
    expect(first.json().ciphertext).toBe('Y2lwaGVy')

    const second = await app.inject({ method: 'POST', url: `/api/secrets/${id}/consume` })
    expect(second.statusCode).toBe(404)

    const meta = await app.inject({ url: `/api/secrets/${id}/meta` })
    expect(meta.json().exists).toBe(false)
  })

  it('404s consuming an unknown id', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/secrets/does-not-exist/consume' })
    expect(res.statusCode).toBe(404)
  })
})
