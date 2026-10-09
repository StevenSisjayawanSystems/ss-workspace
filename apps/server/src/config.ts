import { timingSafeEqual } from 'node:crypto'

// All deployment settings come from the environment; see .env.example at the repo root.
const env = (name: string) => process.env[name]?.trim() || undefined

export const config = {
  port: Number(env('PORT') ?? 2567),
  // When set, joining requires this code. Leave unset only for local development.
  inviteCode: env('INVITE_CODE'),
  // Folder for the few things kept across restarts (bulletin board notes). Point it at a mounted volume in production.
  dataDir: env('DATA_DIR'),
  // With both set, people sign in, and their progress, the board and the chat are kept in Supabase.
  supabase: { url: env('SUPABASE_URL'), secretKey: env('SUPABASE_SECRET_KEY') },
  turn: {
    cloudflareKeyId: env('CLOUDFLARE_TURN_KEY_ID'),
    cloudflareApiToken: env('CLOUDFLARE_TURN_API_TOKEN'),
    urls: env('TURN_URLS')?.split(',').map((u) => u.trim()).filter(Boolean),
    username: env('TURN_USERNAME'),
    credential: env('TURN_CREDENTIAL'),
  },
}

// Compared in constant time so the code cannot be guessed from response timing.
export function inviteAccepted(given: unknown, expected = config.inviteCode): boolean {
  if (!expected) return true
  if (typeof given !== 'string') return false
  const a = Buffer.from(given.trim())
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
