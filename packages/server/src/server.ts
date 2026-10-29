import { buildApp } from './app.js'
import { sweepExpired } from './db.js'

const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '0.0.0.0'
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS ?? 60 * 1000)

const app = await buildApp()

// Periodically purge expired / already-consumed rows (hygiene).
const sweep = setInterval(() => {
  try {
    sweepExpired()
  } catch (err) {
    app.log.error(err, 'sweep failed')
  }
}, SWEEP_INTERVAL_MS)
sweep.unref()

async function shutdown(): Promise<void> {
  clearInterval(sweep)
  try {
    await app.close()
  } finally {
    process.exit(0)
  }
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

try {
  await app.listen({ port: PORT, host: HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
