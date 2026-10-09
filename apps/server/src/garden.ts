import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { BEDS } from '@guildhouse/shared'

// One bed in the Focus Garden: the total time someone has spent in shared focus sessions.
// A bed belongs to an account (`member`) and stays in the garden whether or not its owner is
// online. On a server without accounts `member` is empty and the bed goes by name instead.
export const Plot = schema({ name: t.string(), seconds: t.number(), member: t.string() }, 'Plot')
export type Plot = SchemaType<typeof Plot>

export interface Gardener {
  // Account id, or '' for a guest.
  member: string
  name: string
}

export const plotOf = (plots: Plot[], who: Gardener) => plots.find((p) => (who.member ? p.member === who.member : !p.member && p.name === who.name))

// Adds focus time for everyone taking part. A newcomer is given the next free bed; once every bed
// is taken their time is still not lost, it is simply not planted.
export function credit(plots: Plot[], people: Iterable<Gardener>, seconds: number): void {
  const seen = new Set<string>()
  for (const who of people) {
    const id = who.member || `name:${who.name}`
    if (seen.has(id)) continue
    seen.add(id)
    let plot = plotOf(plots, who)
    if (!plot) {
      if (plots.length >= BEDS.length) continue
      plot = new Plot()
      plot.name = who.name
      plot.member = who.member
      plot.seconds = 0
      plots.push(plot)
    }
    plot.seconds += seconds
  }
}

// Used when the server runs without Supabase: beds are written to a small JSON file in DATA_DIR.
export class GardenStore {
  private file: string | null
  constructor(dir: string | undefined) {
    this.file = dir ? join(dir, 'garden.json') : null
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true })
      } catch {
        this.file = null
      }
    }
  }

  load(): { name: string; seconds: number }[] {
    if (!this.file) return []
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!Array.isArray(raw)) return []
      return raw
        .filter((p) => p && typeof p.name === 'string' && p.name && Number.isFinite(p.seconds) && p.seconds >= 0)
        .map((p) => ({ name: p.name.slice(0, 20), seconds: p.seconds }))
        .slice(0, BEDS.length)
    } catch {
      return []
    }
  }

  save(plots: Plot[]) {
    if (!this.file) return
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify(plots.filter((p) => !p.member).map((p) => ({ name: p.name, seconds: Math.round(p.seconds) }))))
      renameSync(`${this.file}.tmp`, this.file)
    } catch (e) {
      console.warn('Garden could not be saved', e)
    }
  }
}
