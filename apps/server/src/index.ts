import { createServer } from './app'
import { config } from './config'
import { relayConfigured } from './ice'

await createServer().listen(config.port)
console.log(`Guildhouse server listening on :${config.port}`)
console.log(config.inviteCode ? 'Invite code required to join' : 'WARNING: no INVITE_CODE set, anyone with the address can join')
console.log(config.supabase.url && config.supabase.secretKey ? 'Sign-in required; progress, board and chat are kept in Supabase' : 'No Supabase settings: people join as guests and nothing about them is kept')
console.log(config.dataDir ? `Notes are kept in ${config.dataDir}` : 'No DATA_DIR set: desk claims, bookings and the focus garden last only until the next restart')
console.log(relayConfigured() ? 'Call relay (TURN) configured' : 'No call relay configured: calls may fail on strict networks')
