import { useState } from 'react'
import { encryptSecret } from './crypto'
import { buildLink, createSecret } from './api'

const TTL_OPTIONS = [
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: '24 hours', value: 24 * 60 * 60 * 1000 },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000 },
]

export function CreateSecret() {
  const [secret, setSecret] = useState('')
  const [usePassphrase, setUsePassphrase] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [ttlMs, setTtlMs] = useState(TTL_OPTIONS[1].value)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const enc = await encryptSecret(secret, usePassphrase ? passphrase : undefined)
      const { id } = await createSecret({
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        salt: enc.salt,
        hasPassphrase: enc.hasPassphrase,
        ttlMs,
      })
      setLink(buildLink(id, enc.fragmentKey))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard may be blocked; user can copy manually */
    }
  }

  function reset() {
    setSecret('')
    setPassphrase('')
    setUsePassphrase(false)
    setLink(null)
    setError(null)
    setCopied(false)
  }

  if (link) {
    return (
      <div className="stack">
        <h1>Your one-time link is ready</h1>
        <p className="muted">
          Share it with the recipient. It works <strong>once</strong>, then self-destructs.
        </p>
        <div className="linkbox">
          <code className="link">{link}</code>
          <button type="button" className="btn" onClick={copyLink}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        {usePassphrase && (
          <p className="notice">
            This secret is passphrase-protected. Send the passphrase to the recipient through a{' '}
            <strong>separate</strong> channel — never in the same message as the link.
          </p>
        )}
        <button type="button" className="btn btn-ghost" onClick={reset}>
          Create another
        </button>
      </div>
    )
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <h1>Share a secret</h1>
      <p className="muted">
        Paste an API key, password, or note. It is encrypted in your browser before it ever leaves
        this device.
      </p>

      <label className="field">
        <span className="field-label">Secret</span>
        <textarea
          className="input textarea"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="sk-live-…"
          rows={5}
          required
          autoFocus
          spellCheck={false}
        />
      </label>

      <label className="field">
        <span className="field-label">Auto-expire after</span>
        <select
          className="input"
          value={ttlMs}
          onChange={(e) => setTtlMs(Number(e.target.value))}
        >
          {TTL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={usePassphrase}
          onChange={(e) => setUsePassphrase(e.target.checked)}
        />
        <span>Require a passphrase to open</span>
      </label>

      {usePassphrase && (
        <label className="field">
          <span className="field-label">Passphrase</span>
          <input
            className="input"
            type="text"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="A word or phrase you share separately"
            required
            spellCheck={false}
          />
        </label>
      )}

      {error && <p className="error">{error}</p>}

      <button className="btn btn-primary" type="submit" disabled={busy || secret.length === 0}>
        {busy ? 'Encrypting…' : 'Create one-time link'}
      </button>
    </form>
  )
}
