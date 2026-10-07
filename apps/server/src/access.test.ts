import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@colyseus/sdk'
import { createServer } from './app'
import { config, inviteAccepted } from './config'
import { iceServers, relayConfigured } from './ice'

describe('invite code', () => {
  it('accepts anything when no code is set and only the exact code otherwise', () => {
    expect(inviteAccepted(undefined, undefined)).toBe(true)
    expect(inviteAccepted('moonstone', 'moonstone')).toBe(true)
    expect(inviteAccepted('  moonstone ', 'moonstone')).toBe(true)
    expect(inviteAccepted('moonston', 'moonstone')).toBe(false)
    expect(inviteAccepted('Moonstone', 'moonstone')).toBe(false)
    expect(inviteAccepted(undefined, 'moonstone')).toBe(false)
    expect(inviteAccepted(42, 'moonstone')).toBe(false)
  })
})

describe('call setup servers', () => {
  const none = { cloudflareKeyId: undefined, cloudflareApiToken: undefined, urls: undefined, username: undefined, credential: undefined }
  it('offers plain STUN with no relay configured', async () => {
    expect(relayConfigured(none)).toBe(false)
    const servers = await iceServers(none)
    expect(servers).toHaveLength(1)
    expect(JSON.stringify(servers)).toContain('stun:')
    expect(JSON.stringify(servers)).not.toContain('turn:')
  })
  it('adds a static relay when its three settings are present', async () => {
    const turn = { ...none, urls: ['turn:relay.example:3478', 'turns:relay.example:5349'], username: 'u', credential: 'c' }
    expect(relayConfigured(turn)).toBe(true)
    expect(await iceServers(turn)).toContainEqual({ urls: turn.urls, username: 'u', credential: 'c' })
    expect(relayConfigured({ ...turn, credential: undefined })).toBe(false)
  })
})

describe('joining a guildhouse that has an invite code', () => {
  const PORT = 2598
  const server = createServer()
  const url = `ws://localhost:${PORT}`
  beforeAll(async () => {
    config.inviteCode = 'moonstone'
    await server.listen(PORT)
  })
  afterAll(async () => {
    config.inviteCode = undefined
    await server.gracefullyShutdown(false)
  })

  it('turns away a missing or wrong code and tells the client why', async () => {
    for (const code of [undefined, 'wrong']) {
      const err: any = await new Client(url).joinOrCreate('office', { name: 'Ada', code }).then(
        () => null,
        (e) => e,
      )
      expect(err, String(code)).not.toBeNull()
      expect(err.code).toBe(4401)
    }
  })

  it('lets the right code in and hands over the call setup servers', async () => {
    const room = await new Client(url).joinOrCreate<any>('office', { name: 'Ada', code: 'moonstone' })
    const ice = await new Promise<any[]>((resolve) => room.onMessage('ice', resolve))
    room.onMessage('snap', () => {})
    expect(ice[0].urls.join()).toContain('stun:')
    await room.leave()
  })
})
