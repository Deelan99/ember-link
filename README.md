# 🔥 Emberlink

Zero-knowledge, one-time secret sharing for API keys, passwords, and other
confidential text. Paste a secret, get a link, share it — the link works
**once**, then self-destructs. Inspired by [password.link](https://password.link).

## How it stays secret

- **Encrypted in your browser.** Secrets are encrypted with **AES-256-GCM** using
  the Web Crypto API *before* anything is sent anywhere.
- **The server never sees the key or the plaintext.** The 256-bit content key
  lives only in the URL **fragment** (`…/s/<id>#<key>`), which browsers never
  transmit to the server. The server stores only ciphertext, IV, and salt.
- **One-time, atomically.** Viewing a secret runs a single-transaction
  claim-and-delete, so a link can be opened exactly once even under concurrent
  requests. A background sweep also purges expired items.
- **Optional passphrase** mixes a PBKDF2-derived key into the encryption key, so
  both the link *and* the passphrase are required to decrypt.
- **No preview burns.** Revealing requires an explicit click, so email/Slack
  link-preview bots don't silently consume a secret.

## Layout

```
emberlink/
├─ packages/
│  ├─ web/      Vite + React + TS. Create + view UI and all the crypto.
│  ├─ server/   Fastify + node:sqlite. Stores ciphertext, serves the web app.
│  └─ desktop/  Tauri v2 desktop wrapper (the creator app).
```

## Requirements

- **Node.js ≥ 22.5** (uses the built-in `node:sqlite` — no native build step).
- **Rust toolchain** — only if you want to build the desktop app
  (https://rustup.rs). The web app + server need only Node.

## Quick start (web + server, local)

```bash
npm install

# terminal 1 — API on http://localhost:8080
npm run dev:server

# terminal 2 — web app on http://localhost:5173
npm run dev:web
```

Open http://localhost:5173, create a secret, copy the link, and open it in
another browser/incognito window. Reveal it once — a second open shows nothing.

## Production (single origin)

```bash
npm run build     # builds web -> packages/web/dist, then the server
npm start         # serves the web app + API from one origin on PORT (default 8080)
```

In production the web app is served by the server, so API calls and links use
the same origin automatically. Deploy `packages/server` (with the built
`packages/web/dist` alongside it) behind HTTPS and set `PUBLIC_URL`/`PORT`.

### Configuration

| Variable         | Where   | Default                  | Purpose                                    |
| ---------------- | ------- | ------------------------ | ------------------------------------------ |
| `PORT`           | server  | `8080`                   | HTTP port                                  |
| `DB_PATH`        | server  | `packages/server/data/…` | SQLite file, or `:memory:`                 |
| `NODE_ENV`       | server  | —                        | `production` disables dev CORS             |
| `VITE_API_BASE`  | web     | same origin              | API origin for the browser (dev: `:8080`)  |
| `VITE_PUBLIC_URL`| web     | `location.origin`        | Origin used when building shareable links  |

## Desktop app (Tauri)

The desktop app is the **creator's** convenience tool — recipients always open
links in a normal browser. Requires the Rust toolchain.

```bash
# start the web dev server + API first (see Quick start), then:
npm run dev:desktop
```

To ship installers (`.dmg` on macOS, `.msi`/NSIS on Windows):

```bash
# build the web app pointing links at your DEPLOYED server, then bundle:
VITE_PUBLIC_URL=https://secrets.example.com \
VITE_API_BASE=https://secrets.example.com \
  npm run build -w @emberlink/web
npm --prefix packages/desktop run build
```

Regenerate app icons from `packages/desktop/app-icon.png` any time with
`npm --prefix packages/desktop run icon`.

## Tests

```bash
npm test                       # both suites
npm run test -w @emberlink/web    # crypto round-trip (encrypt/decrypt, passphrase)
npm run test -w @emberlink/server # one-time consume + metadata semantics
```

## Security notes & trade-offs

- **Passphrase = one server fetch, up to 3 local attempts.** The ciphertext is
  claimed and deleted server-side the moment it's fetched — that single fetch
  is the real one-time guarantee. The browser then caches that ciphertext and
  retries decryption locally up to 3 times for passphrase typos, without ever
  asking the server again (the server can't verify the passphrase without
  weakening zero-knowledge). If all 3 local attempts fail, the secret is gone
  for good. The UI warns the recipient.
- **Share the passphrase out-of-band** — never in the same message as the link.
- Run behind **HTTPS** in production; the server sets HSTS, a strict CSP
  (no external JS), and rate limits the API.
- The security ceiling is the link itself: anyone who obtains the full link
  (and passphrase, if set) before the intended recipient can read the secret.
