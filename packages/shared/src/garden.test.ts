import { describe, expect, it } from 'vitest'
import { BEDS, BED_CAPACITY, PLANT_SECONDS, ROOMS, SPECIES, bedOf, isWalkable, speciesFor, zoneAt } from './index'

describe('focus garden', () => {
  it('grows one plant per 24 hours of focus, with the next one in progress', () => {
    expect(bedOf('Ada', 0)).toMatchObject({ grown: 0, towardsNext: 0, hidden: 0 })
    expect(bedOf('Ada', 0).plants).toHaveLength(1)
    const bed = bedOf('Ada', 2 * PLANT_SECONDS + 6 * 3600)
    expect(bed.grown).toBe(2)
    expect(bed.towardsNext).toBe(6 * 3600)
    expect(bed.plants.map((p) => p.growth)).toEqual([1, 1, 0.25])
  })

  it('gives each person every species once before repeating, in their own order', () => {
    for (const name of ['Ada', 'Ben', 'Steven']) {
      const first = SPECIES.map((_, n) => speciesFor(name, n))
      expect(new Set(first).size).toBe(SPECIES.length)
    }
    expect(SPECIES.map((_, n) => speciesFor('Ada', n))).not.toEqual(SPECIES.map((_, n) => speciesFor('Ben', n)))
  })

  it('draws only the newest plants once a bed is full', () => {
    const bed = bedOf('Ada', 9 * PLANT_SECONDS)
    expect(bed.plants).toHaveLength(BED_CAPACITY)
    expect(bed.hidden).toBe(10 - BED_CAPACITY)
    expect(bed.plants.at(-1)!.growth).toBe(0)
  })

  it('has its beds inside the Focus Garden, clear of the path from the front door', () => {
    const room = ROOMS.find((r) => r.id === 'focusGarden')!
    for (const b of BEDS) {
      expect(zoneAt(Math.round(b.x), Math.round(b.z))).toBe('focusGarden')
      expect(b.x - 1.5).toBeGreaterThan(room.x0 - 0.5)
      expect(b.x + 1.5).toBeLessThan(room.x1 + 0.5)
      expect(Math.abs(b.x - 12)).toBeGreaterThan(2.5)
    }
    for (let z = room.z0; z <= room.z1; z++) expect(isWalkable(12, z)).toBe(true)
  })
})
