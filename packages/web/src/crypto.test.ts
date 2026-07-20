import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, b64urlDecode, b64urlEncode } from './crypto'

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    expect(Array.from(b64urlDecode(b64urlEncode(bytes)))).toEqual(Array.from(bytes))
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret with no passphrase', async () => {
    const enc = await encryptSecret('sk-test-1234567890')
    expect(enc.hasPassphrase).toBe(false)
    const out = await decryptSecret(enc, enc.fragmentKey)
    expect(out).toBe('sk-test-1234567890')
  })

  it('round-trips a secret with a passphrase', async () => {
    const enc = await encryptSecret('super-secret-value', 'hunter2')
    expect(enc.hasPassphrase).toBe(true)
    const out = await decryptSecret(enc, enc.fragmentKey, 'hunter2')
    expect(out).toBe('super-secret-value')
  })

  it('fails to decrypt with the wrong passphrase', async () => {
    const enc = await encryptSecret('super-secret-value', 'hunter2')
    await expect(decryptSecret(enc, enc.fragmentKey, 'wrong')).rejects.toThrow()
  })

  it('fails to decrypt with the wrong fragment key', async () => {
    const enc = await encryptSecret('super-secret-value')
    const wrongKey = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)))
    await expect(decryptSecret(enc, wrongKey)).rejects.toThrow()
  })

  it('does not expose plaintext in the stored payload', async () => {
    const enc = await encryptSecret('needle-in-haystack')
    expect(JSON.stringify({ ciphertext: enc.ciphertext, iv: enc.iv, salt: enc.salt })).not.toContain(
      'needle',
    )
  })
})
