import { defineConfig } from 'vitest/config'

// Colyseus reads the repository's .env on start. Tests must not reach a real Supabase, so its
// settings are blanked here, which leaves the server in its no-accounts mode.
export default defineConfig({ test: { env: { SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', INVITE_CODE: '', DATA_DIR: '' } } })
