// Extract rosti.cz design tokens (Tailwind v4 `--color-*` vars) from
// source/rosti-layout.css into scripts/palette.mjs.
//
//   node scripts/extract-palette.mjs
import fs from 'node:fs'
import { parse, formatHex } from 'culori'
import { PATHS } from './paths.mjs'

const css = fs.readFileSync(PATHS.rostiLayoutCss, 'utf8')
const tokens = [...css.matchAll(/--color-([a-z]+)-(\d+):(oklch\([^)]+\))/g)]
  .map(([, family, step, value]) => ({ family, step: Number(step), hex: formatHex(parse(value)) }))
const unique = [...new Map(tokens.map((t) => [`${t.family}-${t.step}`, t])).values()]
  .sort((a, b) => a.family.localeCompare(b.family) || a.step - b.step)

const neutral = unique.filter((t) => t.family === 'neutral')
const chromatic = unique.filter((t) => !['neutral', 'slate'].includes(t.family))

fs.writeFileSync(PATHS.palette, `// Palette extracted from rosti.cz (_astro/Layout.*.css, Tailwind v4 tokens)
// plus the brand greens from its markup. Regenerate with extract-palette.mjs.

/** Tailwind neutral scale — rosti.cz dark-mode surfaces, borders and text. */
const NEUTRAL = {
${neutral.map((t) => `  ${t.step}: '${t.hex}',`).join('\n')}
}

/** Brand greens: bg-[#54b048], hover:bg-[#46943c], dark:text-[#66c459]. */
const BRAND = { base: '#54b048', hover: '#46943c', light: '#66c459' }

/** Chromatic tokens used on rosti.cz — snap targets for coloured text/fills. */
const CHROMATIC = [
${chromatic.map((t) => `  '${t.hex}', // ${t.family}-${t.step}`).join('\n')}
  BRAND.base,
  BRAND.hover,
  BRAND.light,
]

export { NEUTRAL, BRAND, CHROMATIC }
`)
console.log(`palette   ${neutral.length} neutral + ${chromatic.length} chromatic tokens → scripts/palette.mjs`)
