export interface AvatarLook {
  robe: string
  trim: string
  hair: string
  skin: string
  // Kept so older saves and the server stay compatible; the hat is not offered while the wizard has none.
  hat: boolean
}

// The wizard exactly as she was modelled: purple cloak, chestnut hair, her own skin tone.
export const DEFAULT_LOOK: AvatarLook = { robe: '#4c2c6b', trim: '#dba842', hair: '#74543c', skin: '#f0c6b3', hat: false }

export const ROBES = ['#3d5a8a', '#9c3b34', '#2f6f6c', '#4c2c6b', '#4f7d4a', '#b07a34', '#8a4a66', '#3f4352']
export const HAIRS = ['#74543c', '#262326', '#d8b765', '#a8542f', '#ddd8cf', '#4f6fa8']
// Light to deep. The third is the wizard's own.
export const SKINS = ['#f7dac8', '#f3cfbb', '#f0c6b3', '#d9a07f', '#a8714f', '#6e452f']

const GOLD = '#dba842'
const SILVER = '#c9ced6'
const CREAM = '#efe1c2'
// Each cloak comes with the trim that suits it, so every choice looks designed.
const TRIMS: Record<string, string> = {
  '#3d5a8a': SILVER,
  '#9c3b34': GOLD,
  '#2f6f6c': SILVER,
  '#4c2c6b': GOLD,
  '#4f7d4a': GOLD,
  '#b07a34': CREAM,
  '#8a4a66': GOLD,
  '#3f4352': SILVER,
}
export const trimFor = (robe: string) => TRIMS[robe.toLowerCase()] ?? GOLD
