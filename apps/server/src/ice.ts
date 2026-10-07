import { config } from './config'

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

// Address discovery only: enough when both people are on ordinary home networks.
const STUN: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

const CLOUDFLARE_TTL_SECONDS = 24 * 60 * 60

// Cloudflare issues short-lived relay credentials per request, so the long-lived token never leaves the server.
async function cloudflare(keyId: string, token: string): Promise<IceServer[] | null> {
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: CLOUDFLARE_TTL_SECONDS }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.warn(`TURN: Cloudflare refused the request (${res.status}); calls fall back to direct connections only`)
      return null
    }
    const body = (await res.json()) as { iceServers?: IceServer | IceServer[] }
    const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : []
    return servers.length ? servers : null
  } catch (e) {
    console.warn('TURN: could not reach Cloudflare; calls fall back to direct connections only', e)
    return null
  }
}

// The servers a browser should use to set up calls: a relay when one is configured, plain STUN otherwise.
export async function iceServers(turn = config.turn): Promise<IceServer[]> {
  if (turn.cloudflareKeyId && turn.cloudflareApiToken) {
    const servers = await cloudflare(turn.cloudflareKeyId, turn.cloudflareApiToken)
    if (servers) return servers
  }
  if (turn.urls?.length && turn.username && turn.credential)
    return [...STUN, { urls: turn.urls, username: turn.username, credential: turn.credential }]
  return STUN
}

export const relayConfigured = (turn = config.turn) =>
  !!(turn.cloudflareKeyId && turn.cloudflareApiToken) || !!(turn.urls?.length && turn.username && turn.credential)
