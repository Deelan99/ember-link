import { useEffect, useRef, useState } from 'react'
import { decryptSecret, type EncryptedPayload } from './crypto'
import { consumeSecret, getMeta } from './api'

type Phase = 'loading' | 'ready' | 'gone' | 'revealed' | 'error'
type Ciphertext = Pick<EncryptedPayload, 'ciphertext' | 'iv' | 'salt'>

const MAX_PASSPHRASE_ATTEMPTS = 3

export function ViewSecret({ id }: { id: string }) {
  const fragmentKey = window.location.hash.slice(1)
  const [phase, setPhase] = useState<Phase>('loading')
  const [hasPassphrase, setHasPassphrase] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  // The server hands over the ciphertext exactly once (that's the real "view
  // once" guarantee). We cache it here so a wrong passphrase can be retried
  // locally without another round trip — the server never sees the passphrase
  // either way, so this doesn't change what the server can or can't disclose.
  const [ciphertext, setCiphertext] = useState<Ciphertext | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_PASSPHRASE_ATTEMPTS)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!fragmentKey) {
      setError('This link is missing its decryption key and cannot be opened.')
      setPhase('error')
      return
    }
    let cancelled = false
    getMeta(id)
      .then((m) => {
        if (cancelled) return
        if (!m.exists) {
          setPhase('gone')
        } else {
          setHasPassphrase(m.hasPassphrase)
          setPhase('ready')
        }
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not check this link — check your connection and try again.')
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    return () => clearTimeout(copiedTimeout.current)
  }, [])

  async function reveal() {
    setBusy(true)
    setError(null)
    try {
      let data = ciphertext
      if (!data) {
        try {
          const fetched = await consumeSecret(id)
          if (!fetched) {
            setPhase('gone')
            return
          }
          // The secret is now destroyed server-side. Decryption (and any passphrase
          // retries) happens entirely locally from here on.
          data = fetched
          setCiphertext(fetched)
        } catch {
          // Fetch failed before the secret was claimed — nothing was consumed or
          // decrypted, so this must not count against the passphrase attempt limit.
          setError('Could not reach the server. Check your connection and try again.')
          return
        }
      }
      const plaintext = await decryptSecret(data, fragmentKey, hasPassphrase ? passphrase : undefined)
      setSecret(plaintext)
      setPhase('revealed')
    } catch {
      const remaining = attemptsLeft - 1
      setAttemptsLeft(remaining)
      if (hasPassphrase && remaining > 0) {
        setPassphrase('')
        setError(`Wrong passphrase. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`)
      } else {
        setError(
          hasPassphrase
            ? 'Could not decrypt — the passphrase was wrong too many times. This link has now been used and cannot be opened again.'
            : 'Could not decrypt this secret. The link may be corrupted.',
        )
        setPhase('error')
      }
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      clearTimeout(copiedTimeout.current)
      copiedTimeout.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (phase === 'loading') {
    return (
      <p className="muted" aria-live="polite">
        Checking link…
      </p>
    )
  }

  if (phase === 'gone') {
    return (
      <div className="stack" aria-live="polite">
        <h1>Nothing to see here</h1>
        <p className="muted">
          This secret has already been viewed, has expired, or never existed. For your security it
          can only be opened once.
        </p>
        <a className="btn btn-ghost" href="/">
          Create your own secret
        </a>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="stack" aria-live="polite">
        <h1>Couldn’t open this secret</h1>
        <p className="error" role="alert">
          {error}
        </p>
        <a className="btn btn-ghost" href="/">
          Create your own secret
        </a>
      </div>
    )
  }

  if (phase === 'revealed') {
    return (
      <div className="stack" aria-live="polite">
        <h1>Here is the secret</h1>
        <pre className="secret-output">{secret}</pre>
        <button type="button" className="btn" onClick={copySecret}>
          {copied ? 'Copied ✓' : 'Copy to clipboard'}
        </button>
        <p className="notice">
          This link has now self-destructed. Refreshing this page will show nothing.
        </p>
      </div>
    )
  }

  // phase === 'ready'
  return (
    <div className="stack">
      <h1>Someone shared a secret with you</h1>
      <p className="muted">
        It can be viewed <strong>once</strong>. As soon as you reveal it, it is permanently deleted.
      </p>
      {hasPassphrase && (
        <>
          <label className="field">
            <span className="field-label">Passphrase</span>
            <input
              className="input"
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="The passphrase you were given"
              spellCheck={false}
            />
          </label>
          <p className="warn">
            You get {MAX_PASSPHRASE_ATTEMPTS} attempts. If they all fail, the secret is destroyed and
            cannot be recovered.
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={reveal}
        disabled={busy || (hasPassphrase && passphrase.length === 0)}
      >
        {busy ? 'Decrypting…' : 'Reveal secret'}
      </button>
    </div>
  )
}
