import { CreateSecret } from './CreateSecret'
import { ViewSecret } from './ViewSecret'

// Tiny path-based router. Two views only:
//   /            -> create a secret
//   /s/<id>#key  -> view (and burn) a secret
export function App() {
  const match = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/)

  return (
    <div className="page">
      <header className="masthead">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">🔥</span>
          <span className="brand-name">Emberlink</span>
        </a>
        <p className="tagline">One-time secrets that burn after reading</p>
      </header>
      <main className="card">{match ? <ViewSecret id={match[1]} /> : <CreateSecret />}</main>
      <footer className="footnote">
        End-to-end encrypted in your browser · the server never sees your secret
      </footer>
    </div>
  )
}
