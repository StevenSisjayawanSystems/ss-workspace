import { createServer } from './app'
import { config } from './config'
import { relayConfigured } from './ice'

await createServer().listen(config.port)
console.log(`Guildhouse server listening on :${config.port}`)
console.log(config.inviteCode ? 'Invite code required to join' : 'WARNING: no INVITE_CODE set, anyone with the address can join')
console.log(relayConfigured() ? 'Call relay (TURN) configured' : 'No call relay configured: calls may fail on strict networks')
