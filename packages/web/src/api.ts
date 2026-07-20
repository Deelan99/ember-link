import type { EncryptedPayload } from './crypto'

// In production the web app is served from the same origin as the API, so both
// default to relative/same-origin. In dev (Vite on :5173) point VITE_API_BASE
// at the server (:8080). For the desktop build, set VITE_PUBLIC_URL to the
// deployed server URL so generated links are shareable.
const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || window.location.origin

export interface SecretMeta {
  exists: boolean
  hasPassphrase: boolean
}

export interface CreatePayload extends Omit<EncryptedPayload, never> {
  ttlMs: number
}

export async function createSecret(payload: CreatePayload): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/secrets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create the secret. Please try again.')
  return res.json()
}

export function buildLink(id: string, fragmentKey: string): string {
  return `${PUBLIC_URL}/s/${id}#${fragmentKey}`
}

export async function getMeta(id: string): Promise<SecretMeta> {
  const res = await fetch(`${API_BASE}/api/secrets/${id}/meta`)
  if (!res.ok) return { exists: false, hasPassphrase: false }
  return res.json()
}

/** Destructive: claims and deletes the secret server-side. Returns null if gone. */
export async function consumeSecret(
  id: string,
): Promise<Pick<EncryptedPayload, 'ciphertext' | 'iv' | 'salt' | 'hasPassphrase'> | null> {
  const res = await fetch(`${API_BASE}/api/secrets/${id}/consume`, { method: 'POST' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to retrieve the secret.')
  return res.json()
}
