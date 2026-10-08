import { createServer } from './app'
import { config } from './config'
import { relayConfigured } from './ice'

await createServer().listen(config.port)
console.log(`Guildhouse server listening on :${config.port}`)
console.log(config.inviteCode ? 'Invite code required to join' : 'WARNING: no INVITE_CODE set, anyone with the address can join')
console.log(config.dataDir ? `Notes are kept in ${config.dataDir}` : 'No DATA_DIR set: notes, desk claims, bookings and the focus garden last only until the next restart')
console.log(relayConfigured() ? 'Call relay (TURN) configured' : 'No call relay configured: calls may fail on strict networks')
