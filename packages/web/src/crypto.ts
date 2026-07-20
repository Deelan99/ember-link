// Zero-knowledge client-side encryption using the Web Crypto API only.
//
// A secret is encrypted with AES-256-GCM. The 256-bit content key is generated
// in the browser and travels ONLY in the URL fragment (`#...`), which browsers
// never send to the server. The server therefore only ever stores ciphertext,
// IV and salt — never the key or plaintext.
//
// Optional passphrase: when set, a PBKDF2-derived value is mixed (via HKDF)
// with the fragment key to produce the actual AES key, so BOTH the link and the
// passphrase are required to decrypt. The server, holding only the salt, still
// cannot decrypt without the fragment key.

const PBKDF2_ITERATIONS = 210_000
const HKDF_INFO = new TextEncoder().encode('emberlink-v1-aesgcm')

export interface EncryptedPayload {
  ciphertext: string // base64url
  iv: string // base64url (12 bytes)
  salt: string // base64url (16 bytes)
  hasPassphrase: boolean
}

export interface EncryptResult extends EncryptedPayload {
  /** The content key, base64url. Goes in the URL fragment — never to the server. */
  fragmentKey: string
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

export function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const b = toBytes(bytes)
  let bin = ''
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function pbkdf2(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    baseKey,
    256,
  )
  return new Uint8Array(bits)
}

/**
 * Derive the AES-256-GCM key from the fragment key material (always present)
 * and, if a passphrase is supplied, additional PBKDF2-derived material — mixed
 * together with HKDF-SHA256. Wrong passphrase => wrong key => GCM auth failure.
 */
async function deriveAesKey(
  contentKey: Uint8Array,
  salt: Uint8Array,
  passphrase?: string,
): Promise<CryptoKey> {
  let ikm: Uint8Array = contentKey
  if (passphrase) {
    const pk = await pbkdf2(passphrase, salt)
    ikm = new Uint8Array(contentKey.length + pk.length)
    ikm.set(contentKey, 0)
    ikm.set(pk, contentKey.length)
  }
  const hkdfKey = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: HKDF_INFO as BufferSource },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptSecret(plaintext: string, passphrase?: string): Promise<EncryptResult> {
  const contentKey = crypto.getRandomValues(new Uint8Array(32))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(contentKey, salt, passphrase)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  )
  return {
    ciphertext: b64urlEncode(ct),
    iv: b64urlEncode(iv),
    salt: b64urlEncode(salt),
    hasPassphrase: Boolean(passphrase),
    fragmentKey: b64urlEncode(contentKey),
  }
}

export async function decryptSecret(
  payload: Pick<EncryptedPayload, 'ciphertext' | 'iv' | 'salt'>,
  fragmentKey: string,
  passphrase?: string,
): Promise<string> {
  const contentKey = b64urlDecode(fragmentKey)
  const salt = b64urlDecode(payload.salt)
  const key = await deriveAesKey(contentKey, salt, passphrase)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlDecode(payload.iv) as BufferSource },
    key,
    b64urlDecode(payload.ciphertext) as BufferSource,
  )
  return new TextDecoder().decode(pt)
}
