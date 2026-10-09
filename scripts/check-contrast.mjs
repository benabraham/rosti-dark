// APCA audit: every visible text node on every fixture page, static and
// hovered, with the theme applied. Exits 1 if any non-disabled text is below Lc 75.
//
//   node scripts/check-contrast.mjs [css-file]       (default: dist/dark.css)
//   SHOW='btn-success' node scripts/check-contrast.mjs   list matching nodes instead of failures
import { APCAcontrast, sRGBtoY, alphaBlend } from 'apca-w3'
import { PATHS, FIXTURE_PAGES } from './paths.mjs'
import { launchBrowser, openFixture, applyTheme, freezeTransitions } from './harness.mjs'
import { TARGET } from './contrast.mjs'

const cssFile = process.argv[2] ?? PATHS.siteCss
const MIN_LC = TARGET.text
const HOVER_SELECTOR = '.btn, a, .list-group-item, .dropdown-menu a, #navigation a, .domain-token-suggestion'

/** Runs in the page: text colour, composited background and opacity for one element. */
const measureInPage = (el) => {
  const rgba = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return [r, g, b, a]
  }
  const layers = []
  let opacity = 1
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n)
    opacity *= Number(cs.opacity)
    const c = rgba(cs.backgroundColor)
    if (c && c[3] > 0 && layers.at(-1)?.[3] !== 1) layers.push(c)
  }
  // canvas fallback ≈ dark UA canvas; body always sets its own background in dark mode
  const bg = layers.reverse().reduce((acc, [r, g, b, a]) => [r * a + acc[0] * (1 - a), g * a + acc[1] * (1 - a), b * a + acc[2] * (1 - a)], [18, 18, 18])
  const cs = getComputedStyle(el)
  const name = (n) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${[...n.classList].map((c) => `.${c}`).join('')}`
  return {
    label: `${el.parentElement ? name(el.parentElement) : ''} > ${name(el)}`,
    text: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 28),
    fg: rgba(cs.color),
    bg: bg.map(Math.round),
    opacity,
    isDisabled: !!el.closest('.disabled, [disabled], :disabled'),
  }
}

/** Absolute Lc; element opacity fades text into the backdrop like text alpha. */
const lcOf = ({ fg: rawFg, bg, opacity = 1 }) => {
  const fg = [...rawFg.slice(0, 3), (rawFg[3] ?? 1) * opacity]
  const fgRgb = fg[3] < 1 ? alphaBlend(fg, bg) : fg.slice(0, 3)
  return Math.abs(APCAcontrast(sRGBtoY(fgRgb), sRGBtoY(bg)))
}

const browser = await launchBrowser()
const results = []
for (const file of FIXTURE_PAGES) {
  const page = await openFixture({ browser, file, colorScheme: 'dark' })
  await applyTheme({ page, cssFile, file })
  await freezeTransitions(page)

  const texts = await page.$$eval('body *', (els, fnSrc) => {
    const measure = new Function(`return (${fnSrc})`)()
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
    return els
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && isVisible(el) && !['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName))
      .map((el) => measure(el))
  }, measureInPage.toString())
  results.push(...texts.map((t) => ({ ...t, file, state: 'static' })))

  for (const handle of await page.$$(HOVER_SELECTOR)) {
    if (!(await handle.isVisible())) continue
    await handle.hover({ force: true }).catch(() => {})
    const measured = await handle.evaluate((el, fnSrc) => {
      const measure = new Function(`return (${fnSrc})`)()
      const textEl = [...el.querySelectorAll('*'), el].find((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      return textEl ? measure(textEl) : null
    }, measureInPage.toString())
    if (measured) results.push({ ...measured, file, state: 'hover' })
  }
  await page.close()
}
await browser.close()

const scored = results.filter((r) => r.fg).map((r) => ({ ...r, lc: lcOf(r) }))
const isListed = (r) => (process.env.SHOW ? new RegExp(process.env.SHOW).test(r.label) : r.lc < MIN_LC && !r.isDisabled)
const listed = scored.filter(isListed)
const fails = scored.filter((r) => r.lc < MIN_LC && !r.isDisabled)
const exempt = scored.filter((r) => r.lc < MIN_LC && r.isDisabled)
const min = scored.filter((r) => !r.isDisabled).reduce((a, b) => (b.lc < a.lc ? b : a))

console.log(`contrast  ${scored.length} text nodes (${scored.filter((r) => r.state === 'hover').length} hovered) on ${FIXTURE_PAGES.length} pages`)
console.log(`          lowest Lc ${min.lc.toFixed(1)} (${min.label}); below Lc ${MIN_LC}: ${fails.length} (+${exempt.length} disabled, APCA-exempt)`)
const seen = new Set()
listed
  .sort((a, b) => a.lc - b.lc)
  .filter((r) => { const k = `${r.label}|${r.state}`; if (seen.has(k)) return false; seen.add(k); return true })
  .forEach((r) => console.log(`  Lc ${r.lc.toFixed(1).padStart(5)}  ${r.file.padEnd(16)} ${r.state.padEnd(6)} ${r.label}  "${r.text}"  fg rgb(${r.fg.slice(0, 3)}) bg rgb(${r.bg})`))
process.exitCode = fails.length ? 1 : 0
