import { useEffect, useState } from 'react'
import { decryptSecret } from './crypto'
import { consumeSecret, getMeta } from './api'

type Phase = 'loading' | 'ready' | 'gone' | 'revealed' | 'error'

export function ViewSecret({ id }: { id: string }) {
  const fragmentKey = window.location.hash.slice(1)
  const [phase, setPhase] = useState<Phase>('loading')
  const [hasPassphrase, setHasPassphrase] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

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
      .catch(() => !cancelled && setPhase('gone'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function reveal() {
    setBusy(true)
    setError(null)
    try {
      const data = await consumeSecret(id)
      if (!data) {
        setPhase('gone')
        return
      }
      // The secret is now destroyed server-side. Decryption happens locally.
      const plaintext = await decryptSecret(data, fragmentKey, hasPassphrase ? passphrase : undefined)
      setSecret(plaintext)
      setPhase('revealed')
    } catch {
      setError(
        hasPassphrase
          ? 'Could not decrypt — the passphrase may be wrong. This link has now been used and cannot be opened again.'
          : 'Could not decrypt this secret. The link may be corrupted.',
      )
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  if (phase === 'loading') {
    return <p className="muted">Checking link…</p>
  }

  if (phase === 'gone') {
    return (
      <div className="stack">
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
      <div className="stack">
        <h1>Couldn’t open this secret</h1>
        <p className="error">{error}</p>
        <a className="btn btn-ghost" href="/">
          Create your own secret
        </a>
      </div>
    )
  }

  if (phase === 'revealed') {
    return (
      <div className="stack">
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
            You get one attempt. If the passphrase is wrong, the secret is destroyed and cannot be
            recovered.
          </p>
        </>
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
