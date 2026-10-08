import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema, t, type SchemaType } from '@colyseus/schema'
import { BEDS } from '@guildhouse/shared'

// One bed in the Focus Garden: the total time someone has spent in shared focus sessions.
// Beds are kept by name and stay in the garden whether or not their owner is online.
export const Plot = schema({ name: t.string(), seconds: t.number() }, 'Plot')
export type Plot = SchemaType<typeof Plot>

// Adds focus time for everyone taking part. A newcomer is given the next free bed; once every bed
// is taken their time is still not lost, it is simply not planted.
export function credit(plots: Plot[], names: Iterable<string>, seconds: number): void {
  for (const name of new Set(names)) {
    let plot = plots.find((p) => p.name === name)
    if (!plot) {
      if (plots.length >= BEDS.length) continue
      plot = new Plot()
      plot.name = name
      plot.seconds = 0
      plots.push(plot)
    }
    plot.seconds += seconds
  }
}

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
      writeFileSync(`${this.file}.tmp`, JSON.stringify(plots.map((p) => ({ name: p.name, seconds: Math.round(p.seconds) }))))
      renameSync(`${this.file}.tmp`, this.file)
    } catch (e) {
      console.warn('Garden could not be saved', e)
    }
  }
}
