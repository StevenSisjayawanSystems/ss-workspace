// The invite code can arrive in a shared link as `#invite=CODE`. The fragment is never sent to any server,
// and it is removed from the address bar once read. After a successful join the code is remembered locally.
const KEY = 'guildhouse.invite'

export function loadInvite(): string {
  try {
    const fromLink = new URLSearchParams(location.hash.slice(1)).get('invite')
    if (fromLink) {
      history.replaceState(null, '', location.pathname + location.search)
      return fromLink
    }
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberInvite(code: string) {
  try {
    if (code) localStorage.setItem(KEY, code)
    else localStorage.removeItem(KEY)
  } catch {
    // Not being able to remember the code only means typing it again.
  }
}
