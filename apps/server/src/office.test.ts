import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, type Room } from '@colyseus/sdk'
import { SEATS, SPAWN, circleFree } from '@guildhouse/shared'
import { createServer } from './app'
import { cleanColor, cleanText, validMove } from './rules'

describe('rules', () => {
  it('accepts a normal step and rejects teleports and walls', () => {
    expect(validMove(SPAWN, { x: SPAWN.x + 0.3, z: SPAWN.z }, 80)).toBe(true)
    expect(validMove(SPAWN, { x: SPAWN.x, z: SPAWN.z - 12 }, 80)).toBe(false)
    expect(validMove({ x: 1, z: 1.9 }, { x: 1, z: 0.4 }, 500)).toBe(false)
    expect(validMove(SPAWN, { x: NaN, z: 1 }, 80)).toBe(false)
  })
  it('sanitises profile input', () => {
    expect(cleanColor('#AABBCC', '#000000')).toBe('#AABBCC')
    expect(cleanColor('red; drop', '#000000')).toBe('#000000')
    expect(cleanText('  hi\u0000there  ', 5)).toBe('hi th')
    expect(cleanText(42, 5)).toBe('')
  })
})

const PORT = 2599
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const players = (room: Room<any>) => {
  const out: Record<string, any> = {}
  room.state.players.forEach((p: any, id: string) => (out[id] = p))
  return out
}

describe('office room', () => {
  const server = createServer()
  beforeAll(async () => {
    await server.listen(PORT)
  })
  afterAll(async () => {
    await server.gracefullyShutdown(false)
  })

  it('syncs two players, validates movement, relays chat, shares the jukebox and cleans up on leave', async () => {
    const a = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>('office', { name: 'Ada', robe: '#112233' })
    const b = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>('office', { name: '  Ben  ', robe: 'nope' })
    const chats: any[] = []
    const snaps: any[] = []
    b.onMessage('chat', (m: any) => chats.push(m))
    b.onMessage('emote', () => {})
    b.onMessage('snap', () => {})
    a.onMessage('chat', () => {})
    a.onMessage('emote', () => {})
    a.onMessage('snap', (m: any) => snaps.push(m))
    await wait(200)

    expect(Object.keys(players(b)).sort()).toEqual([a.sessionId, b.sessionId].sort())
    expect(players(b)[a.sessionId].name).toBe('Ada')
    expect(players(b)[a.sessionId].robe).toBe('#112233')
    expect(players(a)[b.sessionId].name).toBe('Ben')
    expect(players(a)[b.sessionId].robe).toBe('#4a6fa5')

    const start = { x: players(a)[a.sessionId].x, z: players(a)[a.sessionId].z }
    a.send('move', { x: start.x + 0.3, z: start.z, facing: 1, moving: true })
    await wait(200)
    expect(players(b)[a.sessionId].x).toBeCloseTo(start.x + 0.3)
    expect(players(b)[a.sessionId].moving).toBe(true)

    snaps.length = 0
    a.send('move', { x: 29, z: 12, facing: 0, moving: true })
    await wait(200)
    expect(players(b)[a.sessionId].x).toBeCloseTo(start.x + 0.3)
    expect(snaps).toHaveLength(1)

    a.send('chat', 'hello there')
    await wait(150)
    expect(chats).toMatchObject([{ id: a.sessionId, name: 'Ada', text: 'hello there' }])

    // Sitting: out of reach is refused, a taken seat is refused, and signalling only flows between seated room-mates.
    const hallSeats = SEATS.filter((s) => s.zone === 'entrance')
    const far = SEATS.find((s) => s.zone === 'garden')!
    const rtc: any[] = []
    b.onMessage('rtc', (m: any) => rtc.push(m))
    a.onMessage('rtc', () => {})
    a.send('sit', far.id)
    a.send('rtc', { to: b.sessionId, data: 'too-early' })
    await wait(200)
    expect(players(b)[a.sessionId].seat).toBe('')
    // Walk both over to the bench first.
    for (const x of [12.6, 13.8]) {
      a.send('move', { x, z: 21, facing: 0, moving: true })
      await wait(300)
    }
    b.send('move', { x: 13, z: 21.4, facing: 0, moving: true })
    await wait(300)
    a.send('sit', hallSeats[0].id)
    b.send('sit', hallSeats[0].id)
    await wait(200)
    expect(players(b)[a.sessionId].seat).toBe(hallSeats[0].id)
    expect(players(b)[a.sessionId].x).toBeCloseTo(hallSeats[0].x)
    expect(players(a)[b.sessionId].seat).toBe('')
    a.send('move', { x: start.x, z: start.z, facing: 0, moving: true })
    b.send('sit', hallSeats[1].id)
    await wait(200)
    expect(players(b)[a.sessionId].x).toBeCloseTo(hallSeats[0].x)
    expect(players(a)[b.sessionId].seat).toBe(hallSeats[1].id)
    // Real session descriptions run to several kilobytes, so relay one that size.
    const sdp = 'v=0 '.repeat(4000)
    a.send('rtc', { to: b.sessionId, data: { sdp } })
    await wait(200)
    expect(rtc).toEqual([{ from: a.sessionId, data: { sdp } }])
    a.send('stand')
    b.send('stand')
    await wait(200)
    expect(players(b)[a.sessionId].seat).toBe('')
    expect(circleFree(players(b)[a.sessionId].x, players(b)[a.sessionId].z)).toBe(true)

    // Standing: arrival time is the server's; level and totals are reported by the client and sanitised.
    expect(Date.now() - players(b)[a.sessionId].joinedAt).toBeLessThan(60000)
    expect(players(b)[a.sessionId].level).toBe(1)
    a.send('progress', { level: 4.7, totalSeconds: 7260, streak: -3 })
    await wait(200)
    expect(players(b)[a.sessionId]).toMatchObject({ level: 4, totalSeconds: 7260, streak: 0, pomodoros: 0 })

    // Ringing: relayed to the one person with the caller's name and room; quiet rooms cannot be rung from.
    const rings: any[] = []
    const answers: any[] = []
    b.onMessage('ring', (m: any) => rings.push(m))
    a.onMessage('ring:answer', (m: any) => answers.push(m))
    a.onMessage('pomo:done', () => {})
    b.onMessage('pomo:done', () => {})
    a.send('ring', { to: b.sessionId, zone: 'library' })
    a.send('ring', { to: b.sessionId, zone: 'councilA' })
    await wait(200)
    expect(rings).toEqual([{ from: a.sessionId, name: 'Ada', zone: 'councilA' }])
    b.send('ring:answer', { to: a.sessionId, accept: true })
    await wait(200)
    expect(answers).toEqual([{ from: b.sessionId, name: 'Ben', accept: true }])

    // The shared timer is visible to everyone and controllable by anyone.
    expect(b.state.pomodoro.phase).toBe('idle')
    a.send('pomo:start', { focusMin: 25, breakMin: 5 })
    await wait(200)
    expect(b.state.pomodoro).toMatchObject({ phase: 'focus', startedBy: 'Ada', focusMin: 25 })
    expect(b.state.pomodoro.endsAt - Date.now()).toBeGreaterThan(24 * 60000)
    b.send('pomo:stop')
    await wait(200)
    expect(a.state.pomodoro.phase).toBe('idle')

    // Bulletin board and status are shared; a note can be taken down by anyone.
    a.send('note:add', { text: '  Standup at 10  ', color: '#9fd0c4' })
    a.send('note:add', { text: '', color: 'red' })
    a.send('status', '  Focusing\u0000 ')
    await wait(200)
    expect(b.state.notes.length).toBe(1)
    expect(b.state.notes[0]).toMatchObject({ text: 'Standup at 10', author: 'Ada', color: '#9fd0c4' })
    expect(players(b)[a.sessionId].status).toBe('Focusing')
    b.send('note:remove', b.state.notes[0].id)
    await wait(200)
    expect(a.state.notes.length).toBe(0)

    const errors: string[] = []
    a.onMessage('juke:error', (m: string) => errors.push(m))
    a.onMessage('clock', () => {})
    a.send('juke:add', 'not a link')
    a.send('juke:add', 'https://youtu.be/jfKfPfyJRdk')
    await wait(4500)
    expect(errors).toHaveLength(1)
    expect(b.state.jukebox.queue.length).toBe(1)
    expect(b.state.jukebox.queue[0].videoId).toBe('jfKfPfyJRdk')
    expect(b.state.jukebox.queue[0].addedBy).toBe('Ada')
    expect(b.state.jukebox.paused).toBe(false)
    b.send('juke:pause')
    await wait(200)
    expect(a.state.jukebox.paused).toBe(true)
    b.send('juke:skip')
    await wait(200)
    expect(a.state.jukebox.queue.length).toBe(0)

    await a.leave()
    await wait(200)
    expect(Object.keys(players(b))).toEqual([b.sessionId])
    await b.leave()
  }, 15000)
})
