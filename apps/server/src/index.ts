import { createServer } from './app'

const port = Number(process.env.PORT ?? 2567)
await createServer().listen(port)
console.log(`Guildhouse server listening on :${port}`)
