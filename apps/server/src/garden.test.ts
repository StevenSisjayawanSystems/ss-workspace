import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BEDS } from '@guildhouse/shared'
import { GardenStore, Plot, credit } from './garden'

describe('focus garden credit', () => {
  it('adds focus time per person, once each, and hands out beds in order of arrival', () => {
    const plots: Plot[] = []
    credit(plots, ['Ada', 'Ben', 'Ada'], 10)
    credit(plots, ['Ben'], 5)
    expect(plots.map((p) => [p.name, p.seconds])).toEqual([['Ada', 10], ['Ben', 15]])
  })

  it('stops handing out beds when the garden is full, without disturbing the others', () => {
    const plots: Plot[] = []
    credit(plots, BEDS.map((_, i) => `P${i}`), 1)
    credit(plots, ['Late', 'P0'], 1)
    expect(plots).toHaveLength(BEDS.length)
    expect(plots[0].seconds).toBe(2)
    expect(plots.some((p) => p.name === 'Late')).toBe(false)
  })

  it('survives a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guildhouse-garden-'))
    const plots: Plot[] = []
    credit(plots, ['Ada'], 90000.4)
    new GardenStore(dir).save(plots)
    expect(new GardenStore(dir).load()).toEqual([{ name: 'Ada', seconds: 90000 }])
    expect(new GardenStore(undefined).load()).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})
