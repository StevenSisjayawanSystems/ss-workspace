import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@colyseus/sdk'
import { NEW_PROGRESS } from '@guildhouse/shared'
import { createServer } from './app'
import { accrue, cleanProgress, count, localDay, newMember, standingOf } from './members'

describe('member progress', () => {
  it('credits time, call time and a visit on each new local day', () => {
    const m = newMember('k', true, 'Ada')
    const noon = Date.UTC(2026, 9, 8, 12)
    accrue(m, 60, true, noon)
    accrue(m, 30, false, noon)
    expect(m.progress).toMatchObject({ seconds: 90, callSeconds: 60, days: 1, streak: 1, lastDay: '2026-10-08' })
    accrue(m, 1, false, noon + 86400000)
    expect(m.progress).toMatchObject({ days: 2, streak: 2 })
    count(m, 'messages')
    count(m, 'metres', 2.5)
    expect(m.progress).toMatchObject({ messages: 1, metres: 2.5 })
    expect(standingOf(m.progress)).toMatchObject({ level: 1, totalSeconds: 91, messages: 1 })
  })

  it('uses the day where the member is, not the server', () => {
    const lateEvening = Date.UTC(2026, 9, 8, 23, 30)
    expect(localDay(lateEvening, 0)).toBe('2026-10-08')
    // Two hours ahead of UTC it is already the 9th.
    expect(localDay(lateEvening, -120)).toBe('2026-10-09')
  })

  it('takes only sensible numbers from a browser', () => {
    expect(cleanProgress(null)).toEqual(NEW_PROGRESS)
    expect(cleanProgress({ seconds: 100.7, callSeconds: 500, messages: -3, streak: 9, days: 2, lastDay: 'yesterday', songs: 'many' })).toEqual({ ...NEW_PROGRESS, seconds: 100, callSeconds: 100, days: 2, streak: 2 })
  })
})

const PORT = 2597
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('people in the room', () => {
  const server = createServer()
  beforeAll(async () => {
    await server.listen(PORT)
  })
  afterAll(async () => {
    await server.gracefullyShutdown(false)
  })
  const join = async (name: string, more: Record<string, unknown> = {}) => {
    const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate<any>('office', { name, ...more })
    const got: Record<string, any[]> = { me: [], progress: [], chat: [], mention: [], bonds: [], friend: [] }
    for (const type of Object.keys(got)) room.onMessage(type, (m: any) => got[type].push(m))
    for (const type of ['snap', 'ice', 'emote', 'notice', 'people', 'chat:history']) room.onMessage(type, () => {})
    return { room, got }
  }

  it('counts progress on the server, starting from what the browser carried over', async () => {
    const a = await join('Ada', { carry: { seconds: 600, messages: 4 } })
    await wait(150)
    expect(a.got.me[0]).toMatchObject({ member: `guest:${a.room.sessionId}`, account: false })
    expect(a.got.progress[0]).toMatchObject({ seconds: 600, messages: 4 })
    a.room.send('chat', 'hello')
    await wait(1300)
    await a.room.leave()
    const b = await join('Ben')
    await wait(150)
    expect(b.got.progress[0]).toMatchObject({ seconds: 0, messages: 0 })
    await b.room.leave()
  })

  it('delivers direct messages only to the two people, and tells people they were mentioned', async () => {
    const a = await join('Ada')
    const b = await join('Ben')
    const c = await join('Cy')
    await wait(150)
    const key = (who: typeof a) => who.got.me[0].member as string

    a.room.send('chat', { text: 'psst @Ben', to: key(b) })
    await wait(400)
    expect(a.got.chat).toMatchObject([{ from: key(a), to: key(b), text: 'psst @Ben', mentions: [key(b)] }])
    expect(b.got.chat).toHaveLength(1)
    expect(c.got.chat).toHaveLength(0)

    // Messages to yourself or to nobody we know go nowhere.
    a.room.send('chat', { text: 'echo', to: key(a) })
    await wait(400)
    a.room.send('chat', { text: 'void', to: 'nobody' })
    await wait(400)
    expect(a.got.chat).toHaveLength(1)

    c.room.send('chat', 'lunch, @ada and @Ben?')
    await wait(200)
    expect(b.got.chat[1]).toMatchObject({ to: '', name: 'Cy', mentions: [key(a), key(b)] })

    // The board: a note lands where it was put, can be dragged between lanes, voted on, and names people.
    c.room.send('note:add', { text: 'Dark mode, says @Ada', board: 'features', color: '#9fd0c4', x: 0.1, y: 0.4 })
    await wait(200)
    const note = () => b.room.state.notes[0]
    expect(note()).toMatchObject({ board: 'features', author: 'Cy', mentions: key(a) })
    expect(note().x).toBeCloseTo(0.1)
    expect(a.got.mention).toMatchObject([{ name: 'Cy', where: 'board' }])
    expect(b.got.mention).toHaveLength(0)
    b.room.send('note:move', { id: note().id, x: 0.9, y: 5, drop: true })
    b.room.send('note:vote', note().id)
    a.room.send('note:vote', note().id)
    await wait(200)
    expect(note().x).toBeCloseTo(0.9)
    expect(note().y).toBeCloseTo(0.97)
    expect(note().votes.split(' ').sort()).toEqual([key(a), key(b)].sort())
    b.room.send('note:vote', note().id)
    await wait(200)
    expect(note().votes).toBe(key(a))

    // Only the author can reword a note; formatting and line breaks survive. Anyone can comment.
    b.room.send('note:edit', { id: note().id, text: 'hijacked' })
    c.room.send('note:edit', { id: note().id, text: '**Dark mode**\n- for night owls\n  - and @Ben', color: '#b9a8e0' })
    await wait(200)
    expect(note()).toMatchObject({ text: '**Dark mode**\n- for night owls\n  - and @Ben', color: '#b9a8e0', mentions: key(b) })
    expect(b.got.mention).toMatchObject([{ name: 'Cy', where: 'board' }])
    a.room.send('note:comment', { id: note().id, text: '  count me in, @Cy  ' })
    await wait(200)
    expect(note().comments.length).toBe(1)
    expect(note().comments[0]).toMatchObject({ author: 'Ada', text: 'count me in, @Cy', mentions: key(c) })
    expect(c.got.mention).toMatchObject([{ name: 'Ada', where: 'comment' }])

    // All of that is remembered as bonds between the people involved.
    a.room.send('bonds:of', key(a))
    await wait(200)
    const mine = a.got.bonds.at(-1)
    expect(mine.of).toBe(key(a))
    expect(Object.fromEntries(mine.list.map((x: any) => [x.name, x.messages]))).toEqual({ Ben: 1, Cy: 3 })


    // Friends: one asks, the other says yes by asking back, and either can end it.
    const friendOf = (who: typeof a, other: typeof a) => who.got.bonds.at(-1).list.find((x: any) => x.id === key(other))
    a.room.send('friend:add', key(b))
    await wait(200)
    expect(b.got.friend).toMatchObject([{ name: 'Ada', what: 'asked' }])
    expect(friendOf(b, a)).toMatchObject({ friends: false, askedBy: key(a) })
    a.room.send('friend:add', key(b))
    b.room.send('friend:add', key(a))
    await wait(200)
    expect(a.got.friend).toMatchObject([{ name: 'Ben', what: 'accepted' }])
    expect(friendOf(a, b)).toMatchObject({ friends: true, askedBy: '' })
    b.room.send('friend:remove', key(a))
    await wait(200)
    expect(friendOf(a, b)).toMatchObject({ friends: false, askedBy: '' })
    a.room.send('note:remove', note().id)
    await wait(200)
    expect(c.room.state.notes.length).toBe(0)
    await Promise.all([a.room.leave(), b.room.leave(), c.room.leave()])
  })
})
