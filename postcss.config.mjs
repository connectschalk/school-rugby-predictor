import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Project root — fixes "Can't resolve 'tailwindcss'" when `process.cwd()` is not the app folder (wrong terminal cwd / Turbopack). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const config = {
  plugins: {
    '@tailwindcss/postcss': {
      base: projectRoot,
    },
  },
}

export default config
