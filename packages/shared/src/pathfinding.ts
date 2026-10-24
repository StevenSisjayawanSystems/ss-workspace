import { GRID_H, GRID_W, isWalkable } from './office'

export interface Point {
  x: number
  z: number
}

export const PLAYER_RADIUS = 0.3
export const WALK_SPEED = 4.2

// True when a circle of radius r at world (x, z) overlaps no blocked tile.
export function circleFree(x: number, z: number, r = PLAYER_RADIUS): boolean {
  return (
    isWalkable(Math.round(x - r), Math.round(z - r)) &&
    isWalkable(Math.round(x + r), Math.round(z - r)) &&
    isWalkable(Math.round(x - r), Math.round(z + r)) &&
    isWalkable(Math.round(x + r), Math.round(z + r))
  )
}

export function lineClear(a: Point, b: Point, r = PLAYER_RADIUS): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(dist / 0.2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!circleFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r)) return false
  }
  return true
}

// Closest walkable tile to (x, z), searching outwards in rings.
export function nearestWalkable(x: number, z: number): Point | null {
  x = Math.round(x)
  z = Math.round(z)
  for (let ring = 0; ring < Math.max(GRID_W, GRID_H); ring++) {
    let best: Point | null = null
    let bestD = Infinity
    for (let dx = -ring; dx <= ring; dx++)
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
        if (!isWalkable(x + dx, z + dz)) continue
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          best = { x: x + dx, z: z + dz }
        }
      }
    if (best) return best
  }
  return null
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

// A* over tiles, 8-way without cutting corners. Returns tile centres from start to goal, or null.
export function findPath(start: Point, goal: Point): Point[] | null {
  const sx = Math.round(start.x), sz = Math.round(start.z)
  const gx = Math.round(goal.x), gz = Math.round(goal.z)
  if (!isWalkable(sx, sz) || !isWalkable(gx, gz)) return null
  const n = GRID_W * GRID_H
  const g = new Float32Array(n).fill(Infinity)
  const f = new Float32Array(n).fill(Infinity)
  const from = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const id = (x: number, z: number) => z * GRID_W + x
  const h = (x: number, z: number) => {
    const dx = Math.abs(x - gx), dz = Math.abs(z - gz)
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
  }
  const open: number[] = [id(sx, sz)]
  g[id(sx, sz)] = 0
  f[id(sx, sz)] = h(sx, sz)
  while (open.length) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i
    const cur = open.splice(bi, 1)[0]
    const cx = cur % GRID_W, cz = (cur - cx) / GRID_W
    if (cx === gx && cz === gz) {
      const path: Point[] = []
      for (let c = cur; c !== -1; c = from[c]) path.push({ x: c % GRID_W, z: Math.floor(c / GRID_W) })
      return path.reverse()
    }
    closed[cur] = 1
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz
      if (!isWalkable(nx, nz)) continue
      if (dx && dz && (!isWalkable(cx + dx, cz) || !isWalkable(cx, cz + dz))) continue
      const ni = id(nx, nz)
      if (closed[ni]) continue
      const ng = g[cur] + (dx && dz ? Math.SQRT2 : 1)
      if (ng >= g[ni]) continue
      if (g[ni] === Infinity) open.push(ni)
      g[ni] = ng
      f[ni] = ng + h(nx, nz)
      from[ni] = cur
    }
  }
  return null
}

// Drops waypoints that can be skipped in a straight line, so walking looks natural rather than grid-locked.
export function smoothPath(path: Point[]): Point[] {
  if (path.length <= 2) return path
  const out: Point[] = [path[0]]
  let i = 0
  while (i < path.length - 1) {
    let j = path.length - 1
    while (j > i + 1 && !lineClear(path[i], path[j])) j--
    out.push(path[j])
    i = j
  }
  return out
}

// Full route from a free-standing world position to the walkable tile nearest the target.
export function route(from: Point, to: Point): Point[] | null {
  const start = nearestWalkable(from.x, from.z)
  const goal = nearestWalkable(to.x, to.z)
  if (!start || !goal) return null
  const tiles = findPath(start, goal)
  if (!tiles) return null
  return smoothPath([{ x: from.x, z: from.z }, ...tiles.slice(1)]).slice(1)
}
