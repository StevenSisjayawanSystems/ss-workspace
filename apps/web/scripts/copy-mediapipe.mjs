// Copies the MediaPipe runtime out of node_modules so the app can serve it itself.
// The package does not expose these files to bundlers, and they are too large to keep in git.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const from = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm')
const to = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mediapipe')
mkdirSync(to, { recursive: true })
for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) copyFileSync(join(from, file), join(to, file))
