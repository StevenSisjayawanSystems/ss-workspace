const ID = /^[\w-]{11}$/

// Pulls the 11-character video id out of any common YouTube link, or returns null.
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim()
  if (ID.test(raw)) return raw
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') id = url.searchParams.get('v')
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] ?? null
  }
  return id && ID.test(id) ? id : null
}
