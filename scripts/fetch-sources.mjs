// Refresh every upstream input and report what changed:
//   source/main.css, source/style.css  ← admin.rosti.cz (the CSS being themed)
//   source/rosti-layout.css            ← rosti.cz design tokens (hashed Astro bundle)
//   assets/fonts.css                   ← fonts.bunny.net, latin + latin-ext faces only
//   assets/logo-dark.svg               ← rosti.cz dark logo, svgo-optimised
// Then run `pnpm palette` (if tokens changed) and `pnpm build`.
//
//   node scripts/fetch-sources.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { optimize } from 'svgo'
import { PATHS } from './paths.mjs'

const FONTS_URL = 'https://fonts.bunny.net/css?family=inter:400,500,600,700|jetbrains-mono:400,500,700|space-grotesk:500,700&display=swap'
const KEEP_SUBSETS = ['latin', 'latin-ext'] // Czech needs latin-ext

/** curl keeps this working behind corporate proxies and on any OS. */
const get = (url) => execFileSync('curl', ['-sfL', '--retry', '3', '--max-time', '30', url], { maxBuffer: 32 * 1024 * 1024 }).toString()

const write = ({ file, content }) => {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  fs.writeFileSync(file, content)
  const state = before === null ? 'new' : before === content ? 'unchanged' : 'CHANGED'
  console.log(`  ${state.padEnd(9)} ${file.replace(`${PATHS.root}/`, '')}`)
  return state
}

const fontFaces = (css) => [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face \{[\s\S]*?\})/g)]
  .filter(([, subset]) => KEEP_SUBSETS.includes(subset))
  .map(([, , block]) => block.trim().replace(/\s*\n\s*/g, '\n  ').replace(/\n {2}\}$/, '\n}'))
  .join('\n')

fs.mkdirSync(path.dirname(PATHS.mainCss), { recursive: true })
console.log('fetch')
const results = [
  write({ file: PATHS.mainCss, content: get('https://admin.rosti.cz/static/ui/css/main.css') }),
  write({ file: PATHS.styleCss, content: get('https://admin.rosti.cz/static/css/style.css') }),
]
const home = get('https://rosti.cz/')
const layoutHref = home.match(/href="(\/_astro\/Layout\.[^"]+\.css)"/)?.[1]
if (!layoutHref) throw new Error('rosti.cz: Layout stylesheet link not found — the site structure changed')
const tokensState = write({ file: PATHS.rostiLayoutCss, content: get(`https://rosti.cz${layoutHref}`) })
write({ file: PATHS.fontsCss, content: `/* fonts.bunny.net (GDPR-friendly Google Fonts mirror) — ${KEEP_SUBSETS.join(' + ')} subsets */\n${fontFaces(get(FONTS_URL))}\n` })
const logoHref = home.match(/src="(\/logo[^"]*negative[^"]*\.svg)"/)?.[1] ?? '/logo-green-negative2.svg'
write({ file: PATHS.logoSvg, content: optimize(get(`https://rosti.cz${logoHref}`), { multipass: true }).data })

if (tokensState === 'CHANGED') console.log('→ rosti.cz tokens changed: run `pnpm palette` before `pnpm build`')
if (results.includes('CHANGED')) console.log('→ admin CSS changed: run `pnpm build && pnpm check`')
