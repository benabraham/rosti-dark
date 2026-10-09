// Headless-Chromium harness shared by every check: serves the fixture pages and
// the *current* source CSS at http://admin.rosti.test/, web fonts from the
// cache, and blocks everything else so runs are deterministic.
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { serveFont } from './fontcache.mjs'
import { PATHS } from './paths.mjs'

const ORIGIN = 'http://admin.rosti.test'
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
// Fixture pages link the live URLs; serve them from source/ and ace-builds.
const STATIC_MAP = {
  '/static/ui/css/main.css': PATHS.mainCss,
  '/static/css/style.css': PATHS.styleCss,
  '/static/ace.css': PATHS.aceCss,
}

/**
 * Launch Chromium. Set CHROMIUM_PATH to use a system browser (needed on NixOS,
 * where Playwright's downloaded browsers cannot run).
 * @returns {Promise<import('playwright').Browser>}
 */
const launchBrowser = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

/**
 * Open one fixture page with routing in place.
 * @param {{ browser: import('playwright').Browser, file: string, colorScheme?: 'light'|'dark', viewport?: { width: number, height: number } }} opts
 * @returns {Promise<import('playwright').Page>}
 */
const openFixture = async ({ browser, file, colorScheme = 'light', viewport = { width: 1200, height: 900 } }) => {
  const page = await browser.newPage({ viewport, colorScheme })
  await page.route('**/*', (route) => {
    const font = serveFont(route)
    if (font) return font
    const url = new URL(route.request().url())
    if (url.origin !== ORIGIN) return route.abort()
    const local = url.pathname === '/' ? path.join(PATHS.fixtures, file) : STATIC_MAP[url.pathname] ?? path.join(PATHS.fixtures, url.pathname)
    if (!fs.existsSync(local) || fs.statSync(local).isDirectory()) return route.abort()
    return route.fulfill({ body: fs.readFileSync(local), contentType: MIME[path.extname(local)] ?? 'application/octet-stream' })
  })
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
  return page
}

/** Strip the UserCSS metadata block and @-moz-document wrapper → plain CSS. */
const userCssBody = (userCss) => {
  const body = userCss.replace(/\/\* ==UserStyle==[\s\S]*?==\/UserStyle== \*\//, '')
  const start = body.indexOf('{', body.indexOf('@-moz-document'))
  return body.slice(start + 1, body.lastIndexOf('}'))
}

/**
 * Apply a built theme to a page the way the browser would.
 * UserCSS is unwrapped (Stylus injects it unconditionally); dark.css is added
 * as-is (its @media query decides). Ace's CSS is re-appended afterwards on the
 * Ace fixture to reproduce Ace injecting its styles at runtime (worst case).
 * @param {{ page: import('playwright').Page, cssFile: string, file: string }} opts
 */
const applyTheme = async ({ page, cssFile, file }) => {
  const css = fs.readFileSync(cssFile, 'utf8')
  await page.addStyleTag({ content: cssFile.endsWith('.user.css') ? userCssBody(css) : css })
  if (file === 'ace.html') await page.addStyleTag({ path: PATHS.aceCss })
  await page.evaluate(() => document.fonts.ready)
}

/** Disable transitions so screenshots/measurements capture final states. */
const freezeTransitions = (page) => page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; caret-color: transparent !important; }' })

export { ORIGIN, launchBrowser, openFixture, applyTheme, freezeTransitions, userCssBody }
