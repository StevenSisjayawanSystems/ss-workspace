import { describe, expect, it } from 'vitest'
import { Jukebox, add, pause, play, position, remove, seek, skip, tick } from './jukebox'

const track = (videoId: string) => ({ videoId, title: videoId, addedBy: 'Ada' })

describe('jukebox clock', () => {
  it('starts the first track and keeps time across pause, play and seek', () => {
    const j = new Jukebox()
    add(j, track('aaaaaaaaaaa'), 1000)
    add(j, track('bbbbbbbbbbb'), 2000)
    expect(j.queue.length).toBe(2)
    expect(position(j, 11000)).toBe(10)

    pause(j, 11000)
    expect(position(j, 60000)).toBe(10)
    play(j, 60000)
    expect(position(j, 65000)).toBe(15)

    seek(j, 100, 65000)
    expect(position(j, 66000)).toBe(101)
    pause(j, 66000)
    seek(j, 5, 70000)
    expect(position(j, 99000)).toBe(5)
  })

  it('advances on skip, removal and when a track runs out', () => {
    const j = new Jukebox()
    add(j, track('aaaaaaaaaaa'), 0)
    add(j, track('bbbbbbbbbbb'), 0)
    add(j, track('ccccccccccc'), 0)
    remove(j, j.queue[1].id, 500)
    expect(j.queue.map((t) => t.videoId)).toEqual(['aaaaaaaaaaa', 'ccccccccccc'])

    j.queue[0].duration = 30
    expect(tick(j, 20000)).toBe(false)
    expect(tick(j, 32000)).toBe(true)
    expect(j.queue[0].videoId).toBe('ccccccccccc')
    expect(position(j, 33000)).toBe(1)

    skip(j, 40000)
    expect(j.queue.length).toBe(0)
    skip(j, 41000)
    expect(tick(j, 42000)).toBe(false)
  })
})
