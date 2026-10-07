import { describe, expect, it } from 'vitest'
import {
  DOORS,
  FURNITURE,
  ROOMS,
  SPAWN,
  circleFree,
  findPath,
  footprintTiles,
  isWalkable,
  nearestWalkable,
  route,
  tileAt,
  zoneAt,
} from './index'

describe('office layout', () => {
  it('spawn is walkable and in the entrance hall', () => {
    expect(isWalkable(SPAWN.x, SPAWN.z)).toBe(true)
    expect(zoneAt(SPAWN.x, SPAWN.z)).toBe('entrance')
  })

  it('every door sits in a wall line with clear tiles on both sides', () => {
    for (const d of DOORS) {
      expect(tileAt(d.x, d.z)).toBe('door')
      const northSouth = isWalkable(d.x, d.z - 1) && isWalkable(d.x, d.z + 1)
      const eastWest = isWalkable(d.x - 1, d.z) && isWalkable(d.x + 1, d.z)
      expect(northSouth || eastWest, `door ${d.x},${d.z}`).toBe(true)
    }
  })

  it('blocking furniture stands on room floor and never overlaps', () => {
    const seen = new Set<string>()
    for (const f of FURNITURE)
      for (const t of footprintTiles(f)) {
        expect(tileAt(t.x, t.z), `${f.type} at ${t.x},${t.z}`).toBe('floor')
        const key = `${t.x},${t.z}`
        expect(seen.has(key), `overlap at ${key} (${f.type})`).toBe(false)
        seen.add(key)
      }
  })

  it('every room is reachable from spawn', () => {
    for (const r of ROOMS) {
      const target = nearestWalkable((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)!
      expect(zoneAt(target.x, target.z)).toBe(r.id)
      expect(findPath(SPAWN, target), r.id).not.toBeNull()
    }
  })

  it('every walkable tile is reachable from spawn', () => {
    for (const r of ROOMS)
      for (let x = r.x0; x <= r.x1; x++)
        for (let z = r.z0; z <= r.z1; z++)
          if (isWalkable(x, z)) expect(findPath(SPAWN, { x, z }), `${x},${z}`).not.toBeNull()
  })
})

describe('pathfinding', () => {
  it('paths only step on walkable tiles and never cut corners', () => {
    const path = findPath(SPAWN, { x: 29, z: 9 - 1 })!
    expect(path[0]).toEqual(SPAWN)
    for (let i = 0; i < path.length; i++) {
      expect(isWalkable(path[i].x, path[i].z)).toBe(true)
      if (i === 0) continue
      const dx = path[i].x - path[i - 1].x, dz = path[i].z - path[i - 1].z
      expect(Math.max(Math.abs(dx), Math.abs(dz))).toBe(1)
      if (dx && dz) {
        expect(isWalkable(path[i - 1].x + dx, path[i - 1].z)).toBe(true)
        expect(isWalkable(path[i - 1].x, path[i - 1].z + dz)).toBe(true)
      }
    }
  })

  it('returns null for an unwalkable goal', () => {
    expect(findPath(SPAWN, { x: 0, z: 0 })).toBeNull()
  })

  it('smoothed routes stay clear of obstacles', () => {
    const r = route({ x: SPAWN.x + 0.2, z: SPAWN.z - 0.1 }, { x: 4, z: 3 })!
    expect(r.length).toBeGreaterThan(1)
    let prev = { x: SPAWN.x + 0.2, z: SPAWN.z - 0.1 }
    for (const p of r) {
      const steps = Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.1)
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        expect(circleFree(prev.x + (p.x - prev.x) * t, prev.z + (p.z - prev.z) * t)).toBe(true)
      }
      prev = p
    }
  })

  it('routes to the nearest walkable tile when the target is blocked', () => {
    const r = route(SPAWN, { x: 12, z: 3.5 })!
    const end = r[r.length - 1]
    expect(isWalkable(end.x, end.z)).toBe(true)
    expect(zoneAt(end.x, end.z)).toBe('councilA')
  })
})
