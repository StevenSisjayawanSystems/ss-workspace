import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, type Room } from '@colyseus/sdk'
import { DESKS, SEATS, SPAWN, circleFree, seatById } from '@guildhouse/shared'
import { createServer } from './app'
import { cleanBlock, cleanColor, cleanText, validMove } from './rules'

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
    expect(cleanBlock('\n\nTitle\r\n  - one\u0007\n\n\n\nend  \n', 100)).toBe('Title\n  - one \n\nend')
  })
})

const PORT = 2599
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const all = (map: any) => {
  const out: any[] = []
  map.forEach((v: any) => out.push(v))
  return out
}
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

  it('syncs two players, validates movement, relays chat, keeps timers and music to those who joined, and cleans up on leave', async () => {
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

    // Standing: arrival time, level and totals are all the server's.
    expect(Date.now() - players(b)[a.sessionId].joinedAt).toBeLessThan(60000)
    expect(players(b)[a.sessionId]).toMatchObject({ level: 1, streak: 1, days: 1, pomodoros: 0 })

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

    // A timer belongs to whoever started it. Others can see it and join; only those in on it can change it.
    expect(all(b.state.pomodoros)).toHaveLength(0)
    a.send('pomo:start', { focusMin: 25, breakMin: 5 })
    await wait(200)
    const [timer] = all(b.state.pomodoros)
    expect(timer).toMatchObject({ phase: 'focus', startedBy: 'Ada', focusMin: 25 })
    expect(timer.endsAt - Date.now()).toBeGreaterThan(24 * 60000)
    expect(timer.members.split(' ')).toHaveLength(1)
    b.send('pomo:pause')
    await wait(200)
    expect(all(a.state.pomodoros)[0].paused).toBe(false)
    // Closed to the room, nobody can walk in. Someone busy with their own timer is asked rather than pulled out of it.
    const invites: any[] = []
    const brought: any[] = []
    b.onMessage('invite', (m: any) => invites.push(m))
    b.onMessage('brought', (m: any) => brought.push(m))
    a.send('pomo:open', false)
    await wait(200)
    b.send('pomo:join', timer.id)
    await wait(200)
    expect(all(a.state.pomodoros)[0]).toMatchObject({ open: false, members: timer.members })
    b.send('pomo:timer', { minutes: 5 })
    await wait(200)
    a.send('pomo:bring', players(a)[b.sessionId].member)
    await wait(200)
    expect(invites).toEqual([{ what: 'timer', id: timer.id, name: 'Ada' }])
    expect(all(a.state.pomodoros)).toHaveLength(2)
    // Someone free is simply added, and told.
    b.send('pomo:leave')
    await wait(200)
    a.send('pomo:bring', players(a)[b.sessionId].member)
    await wait(200)
    expect(brought).toEqual([{ what: 'timer', name: 'Ada' }])
    expect(all(a.state.pomodoros)).toHaveLength(1)
    expect(all(a.state.pomodoros)[0].members.split(' ')).toHaveLength(2)
    b.send('pomo:pause')
    await wait(200)
    expect(all(a.state.pomodoros)[0].paused).toBe(true)
    // Starting one of your own leaves the one you had joined, and a timer ends when the last person leaves it.
    b.send('pomo:timer', { minutes: 5 })
    await wait(200)
    expect(all(a.state.pomodoros).map((p: any) => [p.startedBy, p.phase, p.members.split(' ').length]).sort()).toEqual([['Ada', 'focus', 1], ['Ben', 'timer', 1]])
    a.send('pomo:leave')
    b.send('pomo:leave')
    await wait(200)
    expect(all(a.state.pomodoros)).toHaveLength(0)

    // Bulletin board and status are shared; a note can be taken down by anyone.
    a.send('note:add', { text: 'Standup at 10  ', color: '#9fd0c4' })
    a.send('note:add', { text: '', color: 'red' })
    a.send('status', '  Focusing\u0000 ')
    await wait(200)
    expect(b.state.notes.length).toBe(1)
    expect(b.state.notes[0]).toMatchObject({ text: 'Standup at 10', author: 'Ada', color: '#9fd0c4' })
    expect(players(b)[a.sessionId].status).toBe('Focusing')
    b.send('note:remove', b.state.notes[0].id)
    await wait(200)
    expect(a.state.notes.length).toBe(0)

    // Reservations reach everyone, and a claimed desk's chair is refused to others with an explanation.
    const notices: any[] = []
    b.onMessage('notice', (m: any) => notices.push(m))
    a.onMessage('notice', () => {})
    a.send('desk:claim', DESKS[0].id)
    a.send('room:book', { zone: 'councilA', minutes: 30 })
    await wait(200)
    expect(b.state.desks.map((c: any) => [c.deskId, c.owner])).toEqual([[DESKS[0].id, 'Ada']])
    expect(b.state.bookings[0]).toMatchObject({ zone: 'councilA', by: 'Ada' })
    b.send('desk:claim', DESKS[0].id)
    await wait(200)
    expect(notices[0]).toEqual({ title: "That desk is Ada's", detail: 'Choose a free desk' })
    // Closed door: both walk to the council chamber; Ada sits and closes the door, Ben has to knock.
    const council = SEATS.filter((x) => x.zone === 'councilA').sort((p, q) => q.z - p.z)
    const walk = async (who: any, stops: [number, number][]) => {
      for (const [x, z] of stops) {
        who.send('move', { x, z, facing: 0, moving: true })
        await wait(280)
      }
    }
    const route: [number, number][] = [[12, 19.2], [12, 17.2], [12, 15.2], [12, 13.2], [12, 11.2], [12, 9.2], [12, 7.2], [12, 6.2]]
    await Promise.all([walk(a, route), walk(b, route)])
    const knocks: any[] = []
    const letIn: any[] = []
    a.onMessage('knock', (m: any) => knocks.push(m))
    a.onMessage('knock:settled', () => {})
    b.onMessage('knock:settled', () => {})
    b.onMessage('knock:answer', (m: any) => letIn.push(m))
    a.send('sit', council[0].id)
    await wait(200)
    expect(players(b)[a.sessionId].seat).toBe(council[0].id)
    a.send('door:close')
    await wait(200)
    expect(b.state.doors.map((d: any) => [d.zone, d.by])).toEqual([['councilA', 'Ada']])
    b.send('sit', council[1].id)
    await wait(200)
    expect(players(a)[b.sessionId].seat).toBe('')
    expect(knocks).toEqual([{ from: b.sessionId, name: 'Ben', zone: 'councilA' }])
    a.send('knock:answer', { to: b.sessionId, accept: true })
    await wait(200)
    expect(letIn).toEqual([{ name: 'Ada', zone: 'councilA', accept: true }])
    b.send('sit', council[1].id)
    await wait(200)
    expect(players(a)[b.sessionId].seat).toBe(council[1].id)
    // Once everyone has left, the door opens by itself.
    a.send('stand')
    b.send('stand')
    await wait(1300)
    expect(b.state.doors.length).toBe(0)

    // The backup way in: 'join' seats you in a room from anywhere, never in a quiet room or a taken seat.
    a.send('join', 'councilB')
    await wait(200)
    expect(seatById(players(b)[a.sessionId].seat)?.zone).toBe('councilB')
    b.send('join', players(b)[a.sessionId].seat)
    await wait(200)
    expect(seatById(players(a)[b.sessionId].seat)?.zone).toBe('councilB')
    expect(players(a)[b.sessionId].seat).not.toBe(players(a)[a.sessionId].seat)
    b.send('stand')
    await wait(200)
    b.send('join', 'library')
    await wait(200)
    expect(players(a)[b.sessionId].seat).toBe('')
    a.send('stand')
    await wait(200)

    a.send('desk:release')
    a.send('room:cancel', b.state.bookings[0].id)
    await wait(200)
    expect(b.state.desks.length).toBe(0)
    expect(b.state.bookings.length).toBe(0)

    const errors: string[] = []
    a.onMessage('juke:error', (m: string) => errors.push(m))
    a.onMessage('clock', () => {})
    a.send('juke:add', 'not a link')
    a.send('juke:add', 'https://youtu.be/jfKfPfyJRdk')
    await wait(4500)
    expect(errors).toHaveLength(1)
    // Music is its owner's until someone tunes in; only listeners can change it.
    const [station] = all(b.state.jukeboxes)
    expect(station).toMatchObject({ host: 'Ada', paused: false })
    expect(station.queue.length).toBe(1)
    expect(station.queue[0].videoId).toBe('jfKfPfyJRdk')
    expect(station.queue[0].addedBy).toBe('Ada')
    b.send('juke:pause')
    await wait(200)
    expect(all(a.state.jukeboxes)[0].paused).toBe(false)
    b.send('juke:join', station.id)
    await wait(200)
    b.send('juke:pause')
    await wait(200)
    expect(all(a.state.jukeboxes)[0].paused).toBe(true)
    b.send('juke:skip')
    await wait(200)
    expect(all(a.state.jukeboxes)[0].queue.length).toBe(0)
    a.send('juke:leave')
    b.send('juke:leave')
    await wait(200)
    expect(all(a.state.jukeboxes)).toHaveLength(0)

    await a.leave()
    await wait(200)
    expect(Object.keys(players(b))).toEqual([b.sessionId])
    await b.leave()
  }, 40000)
})
