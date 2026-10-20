// The whole floor plan lives here. Tile (x, z) is centred on world (x, 0, z) and
// spans half a unit either side. Add or move rooms, doors and furniture in this
// file; walls and hedges are derived from the room rectangles.

export type ZoneId =
  | 'entrance'
  | 'workroom'
  | 'councilA'
  | 'councilB'
  | 'library'
  | 'tavern'
  | 'kitchen'
  | 'garden'
  | 'meditation'
  | 'focusGarden'

export type FloorKind = 'wood' | 'darkWood' | 'stone' | 'carpet' | 'tile' | 'grass'

export interface Room {
  id: ZoneId
  name: string
  blurb: string
  x0: number
  z0: number
  x1: number
  z1: number
  floor: FloorKind
  outdoor?: boolean
}

export const GRID_W = 35
export const GRID_H = 32

export const ROOMS: Room[] = [
  { id: 'library', name: 'Library Nooks', blurb: 'Quiet focus', x0: 1, z0: 1, x1: 7, z1: 6, floor: 'carpet' },
  { id: 'councilA', name: 'Council Chamber I', blurb: 'Meetings', x0: 9, z0: 1, x1: 15, z1: 6, floor: 'darkWood' },
  { id: 'councilB', name: 'Council Chamber II', blurb: 'Meetings', x0: 17, z0: 1, x1: 23, z1: 6, floor: 'darkWood' },
  { id: 'workroom', name: 'Main Workroom', blurb: 'Desks', x0: 1, z0: 8, x1: 23, z1: 15, floor: 'wood' },
  { id: 'kitchen', name: 'Kitchen', blurb: 'Tea and chatter', x0: 1, z0: 17, x1: 7, z1: 23, floor: 'tile' },
  { id: 'entrance', name: 'Entrance Hall', blurb: 'Welcome', x0: 9, z0: 17, x1: 15, z1: 23, floor: 'stone' },
  { id: 'tavern', name: 'Tavern Lounge', blurb: 'Music by the hearth', x0: 17, z0: 17, x1: 23, z1: 23, floor: 'darkWood' },
  { id: 'garden', name: 'Garden Terrace', blurb: 'Fresh air', x0: 25, z0: 1, x1: 33, z1: 14, floor: 'grass', outdoor: true },
  { id: 'meditation', name: 'Meditation Grove', blurb: 'Breathe', x0: 25, z0: 16, x1: 33, z1: 23, floor: 'grass', outdoor: true },
  // Out of the front door: a bed for each person, planted by their focus sessions.
  { id: 'focusGarden', name: 'Focus Garden', blurb: 'Grown from focus', x0: 3, z0: 25, x1: 21, z1: 30, floor: 'grass', outdoor: true },
]

export const DOORS: { x: number; z: number }[] = [
  { x: 4, z: 7 },
  { x: 12, z: 7 },
  { x: 20, z: 7 },
  { x: 4, z: 16 },
  { x: 12, z: 16 },
  { x: 20, z: 16 },
  { x: 24, z: 11 },
  { x: 24, z: 12 },
  { x: 24, z: 22 },
  // Garden gate into the meditation grove
  { x: 29, z: 15 },
  // Front door, out to the focus garden
  { x: 12, z: 24 },
]

export const SPAWN = { x: 12, z: 21 }

export type FurnitureType =
  | 'desk'
  | 'chair'
  | 'bookshelf'
  | 'shelfLow'
  | 'nookDesk'
  | 'armchair'
  | 'sofa'
  | 'roundTable'
  | 'table'
  | 'counter'
  | 'stove'
  | 'reception'
  | 'noticeBoard'
  | 'bench'
  | 'hearth'
  | 'gramophone'
  | 'barrel'
  | 'crate'
  | 'plant'
  | 'lantern'
  | 'tree'
  | 'pond'
  | 'picnic'
  | 'flowers'
  | 'rug'
  | 'rugLong'
  | 'meditationCircle'

// Tiles blocked at rot 0 as [width along x, depth along z]; null means walk-through.
export const FOOTPRINTS: Record<FurnitureType, [number, number] | null> = {
  desk: [2, 1],
  chair: null,
  bookshelf: [2, 1],
  shelfLow: [2, 1],
  nookDesk: [1, 1],
  armchair: [1, 1],
  sofa: [2, 1],
  roundTable: [3, 2],
  table: [2, 2],
  counter: [4, 1],
  stove: [1, 1],
  reception: [3, 1],
  noticeBoard: [2, 1],
  bench: [2, 1],
  hearth: [2, 1],
  gramophone: [1, 1],
  barrel: [1, 1],
  crate: [1, 1],
  plant: [1, 1],
  lantern: [1, 1],
  tree: [1, 1],
  pond: [3, 3],
  picnic: [2, 2],
  flowers: null,
  rug: null,
  rugLong: null,
  meditationCircle: [1, 1],
}

export interface Furniture {
  type: FurnitureType
  // Centre of the piece in world units (x.5 for even-width footprints).
  x: number
  z: number
  // Quarter turns about Y. At 0 the piece faces +z (towards the camera).
  rot?: 0 | 1 | 2 | 3
}

const deskRow = (z: number, rot: 0 | 2, chairZ: number): Furniture[] =>
  [4.5, 9.5, 14.5, 19.5].flatMap((x) => [
    { type: 'desk' as const, x, z, rot },
    { type: 'chair' as const, x, z: chairZ, rot: rot === 0 ? (2 as const) : (0 as const) },
  ])

export const FURNITURE: Furniture[] = [
  // Main workroom
  ...deskRow(9, 0, 10),
  ...deskRow(14, 2, 13),
  { type: 'rugLong', x: 12, z: 11.5 },
  { type: 'plant', x: 1, z: 8 },
  { type: 'plant', x: 23, z: 8 },
  { type: 'plant', x: 1, z: 15 },
  { type: 'plant', x: 23, z: 15 },
  { type: 'lantern', x: 8, z: 8 },
  { type: 'lantern', x: 16, z: 8 },
  { type: 'lantern', x: 8, z: 15 },
  { type: 'lantern', x: 16, z: 15 },

  // Library nooks
  { type: 'bookshelf', x: 1.5, z: 1 },
  { type: 'bookshelf', x: 3.5, z: 1 },
  { type: 'bookshelf', x: 5.5, z: 1 },
  { type: 'plant', x: 7, z: 1 },
  { type: 'nookDesk', x: 1, z: 3, rot: 1 },
  { type: 'nookDesk', x: 1, z: 5, rot: 1 },
  { type: 'nookDesk', x: 7, z: 3, rot: 3 },
  { type: 'nookDesk', x: 7, z: 5, rot: 3 },
  { type: 'shelfLow', x: 1.5, z: 4 },
  { type: 'shelfLow', x: 6.5, z: 4 },
  { type: 'armchair', x: 4, z: 3 },
  { type: 'rug', x: 4, z: 4.2 },

  // Council chambers
  { type: 'roundTable', x: 12, z: 3.5 },
  { type: 'plant', x: 9, z: 1 },
  { type: 'plant', x: 15, z: 1 },
  { type: 'roundTable', x: 20, z: 3.5 },
  { type: 'plant', x: 17, z: 1 },
  { type: 'plant', x: 23, z: 1 },

  // Kitchen
  { type: 'stove', x: 1, z: 17, rot: 1 },
  { type: 'counter', x: 1, z: 19.5, rot: 1 },
  { type: 'plant', x: 1, z: 23 },
  { type: 'table', x: 4.5, z: 20.5 },
  { type: 'barrel', x: 7, z: 23 },
  { type: 'barrel', x: 6, z: 23 },
  { type: 'crate', x: 7, z: 17 },

  // Entrance hall
  { type: 'reception', x: 10, z: 19, rot: 1 },
  { type: 'noticeBoard', x: 14.5, z: 17 },
  { type: 'rug', x: 12, z: 20.5 },
  { type: 'plant', x: 9, z: 23 },
  { type: 'plant', x: 15, z: 23 },
  { type: 'bench', x: 15, z: 20.5, rot: 3 },
  { type: 'lantern', x: 9, z: 17 },

  // Tavern lounge
  { type: 'hearth', x: 21.5, z: 17 },
  { type: 'rug', x: 21.5, z: 18.7 },
  { type: 'sofa', x: 21.5, z: 20, rot: 2 },
  { type: 'armchair', x: 23, z: 19, rot: 3 },
  { type: 'gramophone', x: 17, z: 17 },
  { type: 'table', x: 18.5, z: 21.5 },
  { type: 'barrel', x: 23, z: 23 },
  { type: 'barrel', x: 22, z: 23 },
  { type: 'plant', x: 17, z: 23 },

  // Garden terrace
  { type: 'pond', x: 29, z: 6 },
  { type: 'bench', x: 28.5, z: 9, rot: 2 },
  { type: 'tree', x: 26, z: 8 },
  { type: 'tree', x: 26, z: 2 },
  { type: 'tree', x: 32, z: 3 },
  { type: 'tree', x: 33, z: 9 },
  { type: 'picnic', x: 29.5, z: 12.5 },
  { type: 'lantern', x: 25, z: 10 },
  { type: 'lantern', x: 25, z: 13 },

  // Focus garden: the beds themselves are drawn from who has grown what
  { type: 'bench', x: 12, z: 30, rot: 2 },
  { type: 'lantern', x: 3, z: 25 },
  { type: 'lantern', x: 21, z: 25 },

  // Meditation grove: cushions in a ring around a quiet stone
  { type: 'meditationCircle', x: 29, z: 20 },
  { type: 'tree', x: 26, z: 17 },
  { type: 'tree', x: 33, z: 16 },
  { type: 'lantern', x: 27, z: 16 },
  { type: 'lantern', x: 31, z: 16 },
  { type: 'flowers', x: 26, z: 5 },
  { type: 'flowers', x: 32, z: 7 },
  { type: 'flowers', x: 27, z: 13 },
  { type: 'flowers', x: 31, z: 11 },
  { type: 'flowers', x: 33, z: 18 },
  { type: 'flowers', x: 26, z: 21 },
  { type: 'flowers', x: 29, z: 22 },
]

export type WallDecorType = 'window' | 'stainedGlass' | 'mirror' | 'frontDoor'

// Mounted on the south ('s') or east ('e') face of the wall tile at (x, z).
export const WALL_DECOR: { type: WallDecorType; x: number; z: number; face: 's' | 'e' }[] = [
  { type: 'window', x: 4, z: 0, face: 's' },
  { type: 'mirror', x: 10, z: 0, face: 's' },
  { type: 'stainedGlass', x: 12, z: 0, face: 's' },
  { type: 'window', x: 14, z: 0, face: 's' },
  { type: 'mirror', x: 18, z: 0, face: 's' },
  { type: 'stainedGlass', x: 20, z: 0, face: 's' },
  { type: 'window', x: 22, z: 0, face: 's' },
  { type: 'window', x: 0, z: 3, face: 'e' },
  { type: 'window', x: 0, z: 10, face: 'e' },
  { type: 'window', x: 0, z: 13, face: 'e' },
  { type: 'window', x: 0, z: 20, face: 'e' },
]

export type Tile = 'void' | 'floor' | 'wall' | 'hedge' | 'door'

const idx = (x: number, z: number) => z * GRID_W + x
const inGrid = (x: number, z: number) => x >= 0 && z >= 0 && x < GRID_W && z < GRID_H

export function footprintTiles(f: Furniture): { x: number; z: number }[] {
  const fp = FOOTPRINTS[f.type]
  if (!fp) return []
  const [w, d] = (f.rot ?? 0) % 2 === 1 ? [fp[1], fp[0]] : fp
  const out: { x: number; z: number }[] = []
  for (let x = Math.round(f.x - (w - 1) / 2); x <= Math.round(f.x + (w - 1) / 2); x++)
    for (let z = Math.round(f.z - (d - 1) / 2); z <= Math.round(f.z + (d - 1) / 2); z++) out.push({ x, z })
  return out
}

function build() {
  const tiles: Tile[] = new Array(GRID_W * GRID_H).fill('void')
  const zones: (ZoneId | null)[] = new Array(GRID_W * GRID_H).fill(null)
  for (const r of ROOMS)
    for (let x = r.x0; x <= r.x1; x++)
      for (let z = r.z0; z <= r.z1; z++) {
        tiles[idx(x, z)] = 'floor'
        zones[idx(x, z)] = r.id
      }
  const outdoor = new Set(ROOMS.filter((r) => r.outdoor).map((r) => r.id))
  // Any empty tile touching a room becomes its boundary: wall for indoor rooms, hedge for outdoor ones.
  for (let x = 0; x < GRID_W; x++)
    for (let z = 0; z < GRID_H; z++) {
      if (zones[idx(x, z)]) continue
      let indoor = false
      let any = false
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          if (!inGrid(x + dx, z + dz)) continue
          const zone = zones[idx(x + dx, z + dz)]
          if (!zone) continue
          any = true
          if (!outdoor.has(zone)) indoor = true
        }
      if (any) tiles[idx(x, z)] = indoor ? 'wall' : 'hedge'
    }
  for (const d of DOORS) tiles[idx(d.x, d.z)] = 'door'
  const blocked = new Uint8Array(GRID_W * GRID_H)
  for (const f of FURNITURE) for (const t of footprintTiles(f)) if (inGrid(t.x, t.z)) blocked[idx(t.x, t.z)] = 1
  return { tiles, zones, blocked }
}

const built = build()

export function tileAt(x: number, z: number): Tile {
  return inGrid(x, z) ? built.tiles[idx(x, z)] : 'void'
}

export function zoneAt(x: number, z: number): ZoneId | null {
  return inGrid(x, z) ? built.zones[idx(x, z)] : null
}

export function isWalkable(x: number, z: number): boolean {
  if (!inGrid(x, z)) return false
  const t = built.tiles[idx(x, z)]
  return (t === 'floor' || t === 'door') && !built.blocked[idx(x, z)]
}

export const roomById = (id: ZoneId): Room => ROOMS.find((r) => r.id === id)!
