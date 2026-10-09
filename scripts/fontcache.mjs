// Serve web-font files (fonts.bunny.net, fonts.gstatic.com) to headless Chromium
// from a curl-filled cache in .cache/fonts, so repeated runs work offline.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { PATHS } from './paths.mjs'

const FONT_HOSTS = ['fonts.bunny.net', 'fonts.gstatic.com']

/**
 * Fulfil a Playwright route from the font cache (fetching on first use).
 * @param {import('playwright').Route} route
 * @returns {Promise<void>|null} a promise when the request was a web font, else null
 */
const serveFont = (route) => {
  const url = new URL(route.request().url())
  if (!FONT_HOSTS.includes(url.hostname)) return null
  fs.mkdirSync(PATHS.fontCache, { recursive: true })
  const file = path.join(PATHS.fontCache, url.pathname.replace(/[^a-z0-9.]+/gi, '_'))
  if (!fs.existsSync(file)) {
    try {
      execFileSync('curl', ['-sfL', '--retry', '4', '--retry-all-errors', '--max-time', '20', '-o', file, url.href])
    } catch {
      fs.rmSync(file, { force: true })
      return route.abort() // font falls back; the run continues
    }
  }
  return route.fulfill({ body: fs.readFileSync(file), contentType: url.pathname.endsWith('.woff') ? 'font/woff' : 'font/woff2' })
}

export { serveFont }
