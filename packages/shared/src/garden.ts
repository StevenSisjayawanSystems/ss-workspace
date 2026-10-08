// The Focus Garden: every person who takes part in shared focus sessions gets a bed, and each
// 24 hours of focus grows one plant in it. A bed is a record of the hours someone has given.

export const PLANT_SECONDS = 24 * 60 * 60

export const SPECIES = ['oak', 'blossom', 'pine', 'sunflower', 'tulips', 'lavender', 'mushroom', 'bamboo'] as const
export type Species = (typeof SPECIES)[number]

// Beds, in the order they are handed out: two rows either side of the path from the front door.
export const BED_WIDTH = 3
export const BED_DEPTH = 1.7
export const BEDS: { x: number; z: number }[] = [
  { x: 8.6, z: 26.7 },
  { x: 15.4, z: 26.7 },
  { x: 5, z: 26.7 },
  { x: 19, z: 26.7 },
  { x: 8.6, z: 29 },
  { x: 15.4, z: 29 },
  { x: 5, z: 29 },
  { x: 19, z: 29 },
]

// How many plants fit in one bed. Beyond that the oldest are counted on the sign rather than drawn.
export const BED_CAPACITY = 6

export const onBed = (x: number, z: number) => BEDS.some((b) => Math.abs(x - b.x) < BED_WIDTH / 2 + 0.1 && Math.abs(z - b.z) < BED_DEPTH / 2 + 0.1)

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// The species of someone's n-th plant. Each person starts somewhere different in the list and then
// steps through all of it, so no two people grow the same sequence and nobody repeats until they have grown every kind.
export const speciesFor = (name: string, n: number): Species => SPECIES[(hash(name) + n * 3) % SPECIES.length]

export interface GardenPlant {
  species: Species
  // 1 for a finished plant; 0 to 1 for the one still growing.
  growth: number
}

export interface Bed {
  grown: number
  // Seconds of focus put towards the plant in progress.
  towardsNext: number
  plants: GardenPlant[]
  // Finished plants not drawn because the bed is full.
  hidden: number
}

export function bedOf(name: string, seconds: number): Bed {
  const grown = Math.floor(seconds / PLANT_SECONDS)
  const towardsNext = seconds - grown * PLANT_SECONDS
  const total = grown + 1
  const first = Math.max(0, total - BED_CAPACITY)
  const plants: GardenPlant[] = []
  for (let n = first; n < total; n++) plants.push({ species: speciesFor(name, n), growth: n < grown ? 1 : towardsNext / PLANT_SECONDS })
  return { grown, towardsNext, plants, hidden: first }
}
