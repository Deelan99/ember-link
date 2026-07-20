import { buildApp } from './app.js'
import { sweepExpired } from './db.js'

const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '0.0.0.0'

const app = await buildApp()

// Periodically purge expired / already-consumed rows (hygiene).
const sweep = setInterval(() => {
  try {
    sweepExpired()
  } catch (err) {
    app.log.error(err, 'sweep failed')
  }
}, 60 * 1000)
sweep.unref()

try {
  await app.listen({ port: PORT, host: HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
