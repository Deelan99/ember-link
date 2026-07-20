// Storage layer backed by Node's built-in synchronous SQLite (node:sqlite).
// No native compilation required — ships with Node >= 22.5 / stable in 24+.
//
// The server stores ONLY ciphertext, IV and salt. It never sees the plaintext
// or the fragment key, so it is structurally incapable of reading secrets.

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// Load the built-in synchronous SQLite via createRequire so bundlers/test
// runners (Vite/Vitest) don't try to resolve the still-new `node:sqlite`
// specifier themselves — Node's own loader handles it at runtime.
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
    }
  }
}

const DB_PATH =
  process.env.DB_PATH ?? fileURLToPath(new URL('../data/emberlink.db', import.meta.url))

if (DB_PATH !== ':memory:') {
  mkdirSync(dirname(DB_PATH), { recursive: true })
}

const db = new DatabaseSync(DB_PATH)
try {
  db.exec('PRAGMA journal_mode = WAL')
} catch {
  /* not applicable for :memory: */
}
db.exec(`
  CREATE TABLE IF NOT EXISTS secrets (
    id             TEXT PRIMARY KEY,
    ciphertext     TEXT NOT NULL,
    iv             TEXT NOT NULL,
    salt           TEXT NOT NULL,
    has_passphrase INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL,
    expires_at     INTEGER NOT NULL,
    consumed       INTEGER NOT NULL DEFAULT 0
  );
`)

const insertStmt = db.prepare(
  `INSERT INTO secrets (id, ciphertext, iv, salt, has_passphrase, created_at, expires_at, consumed)
   VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
)
const metaStmt = db.prepare(
  `SELECT has_passphrase FROM secrets WHERE id = ? AND consumed = 0 AND expires_at > ?`,
)
const claimStmt = db.prepare(
  `UPDATE secrets SET consumed = 1 WHERE id = ? AND consumed = 0 AND expires_at > ?`,
)
const rowStmt = db.prepare(`SELECT ciphertext, iv, salt, has_passphrase FROM secrets WHERE id = ?`)
const deleteStmt = db.prepare(`DELETE FROM secrets WHERE id = ?`)
const sweepStmt = db.prepare(`DELETE FROM secrets WHERE expires_at <= ? OR consumed = 1`)

export interface StoredSecret {
  id: string
  ciphertext: string
  iv: string
  salt: string
  hasPassphrase: boolean
  expiresAt: number
}

export interface SecretRow {
  ciphertext: string
  iv: string
  salt: string
  has_passphrase: number
}

export function insertSecret(rec: StoredSecret): void {
  insertStmt.run(
    rec.id,
    rec.ciphertext,
    rec.iv,
    rec.salt,
    rec.hasPassphrase ? 1 : 0,
    Date.now(),
    rec.expiresAt,
  )
}

export function getMeta(id: string): { exists: boolean; hasPassphrase: boolean } {
  const row = metaStmt.get(id, Date.now()) as { has_passphrase: number } | undefined
  if (!row) return { exists: false, hasPassphrase: false }
  return { exists: true, hasPassphrase: Boolean(row.has_passphrase) }
}

/**
 * Atomically claim and delete a secret. Returns the row exactly once; every
 * subsequent (or concurrent) call returns null. node:sqlite is synchronous and
 * single-threaded, and the UPDATE ... WHERE consumed = 0 guard guarantees only
 * one caller can win even if requests arrive together.
 */
export function claimSecret(id: string): SecretRow | null {
  db.exec('BEGIN IMMEDIATE')
  try {
    const info = claimStmt.run(id, Date.now()) as { changes: number | bigint }
    if (Number(info.changes) !== 1) {
      db.exec('ROLLBACK')
      return null
    }
    const row = rowStmt.get(id) as SecretRow | undefined
    deleteStmt.run(id)
    db.exec('COMMIT')
    return row ?? null
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  }
}

export function sweepExpired(): void {
  sweepStmt.run(Date.now())
}
