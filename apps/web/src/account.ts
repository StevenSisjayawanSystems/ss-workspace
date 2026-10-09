import { createClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { Profile } from './game'
import { DEFAULT_LOOK } from './look'

// Signing in, with an email address and a password kept by Supabase Auth. A guildhouse built without
// these two settings has no accounts and lets guests in.
const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const key: string | undefined = import.meta.env.VITE_SUPABASE_KEY
const supabase = url && key ? createClient(url, key) : null

export const accounts = !!supabase

interface AccountState {
  // False until we know whether this browser is already signed in.
  ready: boolean
  email: string | null
}
export const useAccount = create<AccountState>(() => ({ ready: !supabase, email: null }))
supabase?.auth.onAuthStateChange((_event, session) => useAccount.setState({ ready: true, email: session?.user.email ?? null }))

// Both resolve to a message for the person when something went wrong, or to null once signed in.
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (!error) return null
  if (error.code === 'email_not_confirmed') return 'Confirm your email with the link we sent, then sign in.'
  return error.status === 400 ? 'That email and password do not match an account.' : 'Could not sign in just now. Try again in a moment.'
}
export async function signUp(email: string, password: string): Promise<string | null> {
  const { data, error } = await supabase!.auth.signUp({ email, password })
  if (error?.code === 'user_already_exists') return 'That email already has an account. Sign in instead.'
  if (error?.code === 'weak_password') return 'Choose a longer password.'
  if (error) return 'Could not create the account. Check the address and try again.'
  // A project that confirms addresses first sends a link and signs nobody in yet.
  return data.session ? null : 'Nearly there: confirm your email with the link we sent, then sign in.'
}

export const signOut = () => supabase?.auth.signOut()

// The proof of sign-in the game server asks for at the door. Refreshed here when it has run out.
export async function accessToken(): Promise<string> {
  if (!supabase) return ''
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

// The name and look last used on this account, for a browser that has not seen them yet.
export async function savedProfile(): Promise<Profile | null> {
  if (!supabase) return null
  const { data } = await supabase.from('members').select('name, robe, trim, hair, hat').maybeSingle()
  return data?.name ? { name: data.name, look: { ...DEFAULT_LOOK, robe: data.robe, trim: data.trim, hair: data.hair, hat: data.hat } } : null
}
