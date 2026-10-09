// Synthetic CSS for colours that templates hard-code in style="" attributes.
// Inline styles beat every stylesheet rule, so each override is !important and
// matched by exact value: `color: #333;` or `color: #333` at the end of the
// attribute — never as a prefix, so #333 does not also catch #333333.
import fs from 'node:fs'
import postcss from 'postcss'
import { parse, formatHex, converter } from 'culori'

const toOklch = converter('oklch')

/** All spellings a template might use for one colour (#333 / #333333, any case via the `i` flag). */
const spellings = (hex) => {
  const short = /^#(.)\1(.)\2(.)\3$/i.test(hex) ? `#${hex[1]}${hex[3]}${hex[5]}` : null
  return [hex, short].filter(Boolean)
}

/** Attribute selectors for `prop: value` inside style="" with or without a space. */
const selectorsFor = ({ props, hex }) => props.flatMap((prop) => spellings(hex).flatMap((v) => [
  `[style*="${prop}:${v};" i]`,
  `[style*="${prop}: ${v};" i]`,
  `[style$="${prop}:${v}" i]`,
  `[style$="${prop}: ${v}" i]`,
])).join(',\n')

/** Inline-faded elements that hold text (images/media keep their fade). */
const FADED_SELECTOR = ['0.3', '.3', '0.4', '.4', '0.5', '.5', '0.6', '.6']
  .flatMap((o) => [`[style*="opacity:${o};"]`, `[style*="opacity: ${o};"]`])
  .map((s) => `${s}:not(img, :has(img, svg, canvas, video))`)
  .join(',\n')

const GREYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']
  .map((d) => `#${d.repeat(6)}`)

/**
 * Collect colours from the site CSS and emit !important rules for them.
 * @param {{ files: string[] }} opts
 * @returns {string} CSS source to feed through buildDark
 */
const inlineStyleSource = ({ files }) => {
  const text = new Set(GREYS.filter((g) => g !== '#ffffff'))
  const backgrounds = new Set(['#ffffff', ...GREYS.filter((g) => toOklch(parse(g)).l >= 0.85)])
  files.forEach((file) => postcss.parse(fs.readFileSync(file, 'utf8')).walkDecls((d) => {
    const token = d.value.match(/#[0-9a-f]{3,6}\b/i)?.[0]
    const color = token && parse(token)
    if (!color) return
    const hex = formatHex(color)
    const { l } = toOklch(color)
    if (d.prop === 'color' && l < 0.97) text.add(hex)
    if (/^background(-color)?$/.test(d.prop) && l >= 0.8) backgrounds.add(hex)
  }))
  const textRules = [...text].map((hex) => `${selectorsFor({ props: ['color'], hex })} {\n  color: ${hex} !important;\n}`)
  const bgRules = [...backgrounds].map((hex) => `${selectorsFor({ props: ['background-color', 'background'], hex })} {\n  background-color: ${hex} !important;\n}`)
  // Faded text (version stamps etc.): opacity drags text below any contrast target
  return [...textRules, ...bgRules, `${FADED_SELECTOR} {\n  color: #777777 !important;\n}`].join('\n')
}


export { inlineStyleSource, FADED_SELECTOR }
