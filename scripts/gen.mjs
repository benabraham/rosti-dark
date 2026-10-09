// Generates a Stylus UserCSS dark theme by mirroring every colour declaration
// of the source stylesheets (same selectors, same @media nesting, same order)
// with a role-aware OKLCH remap onto the rosti.cz palette, then enforces APCA
// contrast targets.
// Loaded after the page CSS, equal specificity + later position = the mirror
// wins without !important or selector hacks.
import fs from 'node:fs'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { parse, converter, formatHex, formatRgb, clampChroma } from 'culori'
import { NEUTRAL } from './palette.mjs'
import { TARGET, DARK_TEXT, WHITE, LIGHT_TEXT_FLOOR, lc, oklchOf, withLightness, solveLightness, solveFill, snapNeutral } from './contrast.mjs'

const toOklch = converter('oklch')

/** @typedef {'bg'|'fg'|'border'|'shadow'|'icon'} Role */

const NEUTRAL_CHROMA = 0.025
const NEUTRAL_800 = NEUTRAL[800]
const NEUTRAL_700 = NEUTRAL[700]
/** Default text colour (rosti.cz paragraphs) — what inherits onto surfaces without their own colour. */
const BODY_TEXT = NEUTRAL[300]

const clamp = ({ value, min, max }) => Math.min(max, Math.max(min, value))

// ---- Base light → dark remap --------------------------------------------------

// Neutral lightness anchors on the rosti.cz scale (OKLCH L of neutral-N)
const L = { n50: 0.985, n200: 0.922, n300: 0.87, n400: 0.708, n700: 0.371, n800: 0.269, n900: 0.205 }

/**
 * Map one light-theme colour to its dark counterpart. Neutral results are
 * snapped to the rosti.cz neutral scale afterwards (see mapColor).
 * @param {{ l: number, c: number, h?: number, alpha?: number }} color - OKLCH colour
 * @param {Role} role - what the colour paints
 * @returns {{ l: number, c: number, h?: number, alpha?: number }}
 */
const mapOklch = (color, role) => {
  const { l, c = 0, alpha = 1 } = color
  // Pastels carry little chroma (#f2dede ≈ 0.024), so light colours use a lower bar
  const isNeutral = c < (l >= 0.8 ? 0.02 : NEUTRAL_CHROMA)
  const isPaleTint = !isNeutral && l >= 0.8 && c < 0.1 // alert/notice pastels, not yellow brand fills
  const keep = { ...color }
  const grey = (next) => ({ ...color, c: 0, l: next })
  const darkTint = (next) => ({ ...color, l: next, c: clamp({ value: c * 1.2, min: 0.032, max: 0.06 }) })

  // Translucent overlays: black darkens on any surface – keep; white glare dims.
  if (alpha < 1) {
    if (isNeutral && l > 0.9) return { ...color, alpha: alpha * 0.35 }
    if (isNeutral && l < 0.1) return keep
  }

  if (role === 'bg') {
    // white + light greys → neutral-800 (cards, bars); hover/active states are lifted
    // to neutral-700 in enforceContrast; the page itself is neutral-900
    if (isNeutral && l >= 0.8) return grey(L.n800)
    if (isNeutral) return grey(Math.min(l, 0.33 + (0.8 - l) * 0.4))
    if (isPaleTint) return darkTint(0.27)
    return keep // brand fills: buttons, badges, toggles (APCA pass adjusts)
  }

  if (role === 'border') {
    if (isNeutral && l >= 0.7) return grey(L.n700) // rosti.cz: border-neutral-700
    if (isNeutral && l < 0.5) return grey(0.9 - 0.4 * l) // strong outlines / focus rings must flip
    if (isPaleTint) return darkTint(0.4)
    return isNeutral ? grey(l) : keep
  }

  if (role === 'shadow') {
    if (isNeutral && l >= 0.8) return grey(L.n900) // white text-shadows / rings
    return keep
  }

  // fg: rosti.cz text tiers — dark text → neutral-300 (paragraphs), mid greys →
  // neutral-400 (muted); the APCA pass raises anything that falls short
  if (isNeutral && l < 0.45) return grey(L.n300)
  if (isNeutral && l < 0.75) return grey(L.n400)
  if (isNeutral && l < 0.97) return grey(clamp({ value: 1.27 - l, min: 0.34, max: 0.47 }))
  if (isNeutral) return keep // white on coloured fills
  if (l < 0.72) return { ...color, l: 0.75 }
  return keep
}

/** Normalise a colour token so "unchanged" comparisons are exact. */
const normalize = (raw) => {
  if (/^(transparent|currentcolor|inherit|initial|unset|none)$/i.test(raw)) return null
  const parsed = parse(raw)
  if (!parsed) return null
  return (parsed.alpha ?? 1) >= 1 ? formatHex(parsed) : formatRgb(parsed).replace(/\s+/g, ' ')
}

/**
 * @param {string} raw - any CSS colour token
 * @param {Role} role
 * @returns {string|null} mapped colour, or null when not a colour / unchanged
 */
const mapColor = (raw, role) => {
  const before = normalize(raw)
  if (!before) return null
  const oklch = toOklch(parse(raw))
  const mapped = normalize(formatRgb(clampChroma({ mode: 'oklch', ...mapOklch({ ...oklch, c: oklch.c ?? 0 }, role) }, 'oklch')))
  const isOpaqueGrey = (parse(mapped).alpha ?? 1) >= 1 && oklchOf(mapped).c < NEUTRAL_CHROMA
  const out = isOpaqueGrey ? snapNeutral(mapped) : mapped
  return out === before ? null : out
}

const COLOR_FN = /^(rgba?|hsla?|oklch|lab|lch|color)$/i
const isColorWord = (node) => node.type === 'word' && (/^#[0-9a-f]{3,8}$/i.test(node.value) || (!!parse(node.value) && /^[a-z]+$/i.test(node.value)))
const isColorFn = (node) => node.type === 'function' && COLOR_FN.test(node.value)

/**
 * Rewrite every colour inside a value string (gradients, shadows).
 * @returns {{ value: string, hasChanged: boolean }}
 */
const mapValue = ({ value, role }) => {
  const tree = valueParser(value)
  let hasChanged = false
  tree.walk((node) => {
    if (!isColorWord(node) && !isColorFn(node)) return
    const mapped = mapColor(valueParser.stringify(node), role)
    if (!mapped) return false
    Object.assign(node, { type: 'word', value: mapped, nodes: undefined })
    hasChanged = true
    return false
  })
  return { value: valueParser.stringify(tree), hasChanged }
}

/** Pull the single colour token out of a shorthand like `1px solid #ccc`. */
const findColorToken = (value) => valueParser(value).nodes.find((n) => isColorWord(n) || isColorFn(n))

// ---- Declarations → entries ---------------------------------------------------

const SIDES = ['top', 'right', 'bottom', 'left']
const TEXT_PROPS = ['color', 'caret-color', '-webkit-text-fill-color', 'text-decoration-color']
const ICON_PROPS = ['fill', 'stroke']

/**
 * @typedef {object} Entry
 * @property {string} prop - output property (always a longhand)
 * @property {Role} role
 * @property {boolean} isSingle - value is one colour (eligible for contrast solving)
 * @property {string|null} original - normalised source colour (single) or source value
 * @property {string} value - dark value
 * @property {boolean} [important]
 */

/**
 * Describe one source declaration as dark-theme entries (longhands only,
 * so widths/styles/images from other rules aren't clobbered).
 * @returns {Entry[]}
 */
const describeDecl = ({ prop, value }) => {
  const p = prop.toLowerCase()
  const single = ({ outProp, role }) => {
    const token = findColorToken(value)
    const original = token ? normalize(valueParser.stringify(token)) : null
    if (!original) return []
    return [{ prop: outProp, role, isSingle: true, original, value: mapColor(original, role === 'icon' ? 'fg' : role) ?? original }]
  }
  const whole = ({ outProp = p, role }) => {
    const { value: v, hasChanged } = mapValue({ value, role })
    return hasChanged ? [{ prop: outProp, role, isSingle: false, original: value, value: v }] : []
  }
  const isOneColor = valueParser(value).nodes.filter((n) => n.type !== 'space').length === 1

  if (TEXT_PROPS.includes(p)) return single({ outProp: p, role: 'fg' })
  if (ICON_PROPS.includes(p)) return single({ outProp: p, role: 'icon' })
  if (p === 'background-color') return single({ outProp: p, role: 'bg' })
  if (p === 'background-image') return whole({ role: 'bg' })
  if (p === 'background') {
    if (/gradient\(/i.test(value)) return whole({ outProp: 'background-image', role: 'bg' }).map((d) => ({ ...d, value: d.value.replace(/\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*$/i, '') }))
    return single({ outProp: 'background-color', role: 'bg' })
  }
  if (p === 'border') return single({ outProp: 'border-color', role: 'border' })
  if (p === 'border-color') return isOneColor ? single({ outProp: p, role: 'border' }) : whole({ role: 'border' })
  const side = SIDES.find((s) => p === `border-${s}` || p === `border-${s}-color`)
  if (side) return single({ outProp: `border-${side}-color`, role: 'border' })
  if (p === 'outline' || p === 'outline-color') return single({ outProp: 'outline-color', role: 'border' })
  if (['box-shadow', 'text-shadow', '-webkit-box-shadow'].includes(p)) return whole({ role: 'shadow' })
  return []
}

// ---- APCA pass ----------------------------------------------------------------

const STATE_RE = /:(hover|focus|active|focus-within|focus-visible|checked)\b|\.(active|disabled|focus|hover|open|in)\b|\[disabled\]|\[href\]/g
const CONTROL_RE = /form-control|input-group-addon|chosen-(single|choices|drop)|onoffswitch-(label|switch)|domain-token-control|stack-card\b/

const isOpaque = (color) => (parse(color)?.alpha ?? 1) >= 1

/** Coloured or mid-grey fill that carries its own text (button, badge, label…). */
const isFill = (color) => {
  const { l, c } = oklchOf(color)
  return isOpaque(color) && l >= 0.38 && (c >= 0.04 || l < 0.85)
}

/** Body-ish text (originally dark neutral) gets Lc 90, everything else Lc 75. */
const textTier = (original) => {
  if (!original) return TARGET.text
  const { l, c } = oklchOf(original)
  return c < NEUTRAL_CHROMA && l < 0.45 ? TARGET.body : TARGET.text
}

/**
 * Re-solve a state variant (hover/active/disabled) of a fill against its base
 * rule's polarity, keeping the original lightness offset but pointed *away*
 * from the text so states never lose contrast or collapse into the base.
 */
const solveStateFill = ({ fill, base }) => {
  const dir = base.polarity === 'light' ? 1 : -1
  const text = base.polarity === 'light' ? DARK_TEXT : WHITE
  const delta = Math.abs(oklchOf(fill).l - base.origL)
  const start = withLightness({ color: fill, l: base.newL + dir * delta })
  const against = base.polarity === 'light' ? DARK_TEXT : LIGHT_TEXT_FLOOR
  const { color } = solveLightness({ color: start, against, target: TARGET.text, direction: dir, isText: false })
  return { fill: color, text, polarity: base.polarity }
}

/**
 * Enforce APCA targets on one rule's entries (mutates; may append a `color`).
 * @param {{ entries: Entry[], selector: string, ctx: { fills: Map<string, object>, surfaceWorst: string, surfaceBase: string } }} opts
 */
const enforceContrast = ({ entries, selector, ctx }) => {
  const fg = entries.find((e) => e.prop === 'color')
  const bg = entries.find((e) => e.prop === 'background-color')
  const first = selector.split(',')[0].trim()
  const baseKey = first.replace(STATE_RE, '').trim()
  const hasState = baseKey !== first

  // rosti.cz: surfaces are neutral-800, hover/active surfaces neutral-700
  if (bg && hasState && bg.value === NEUTRAL_800 && oklchOf(bg.original).l >= 0.8) bg.value = NEUTRAL_700

  if (bg && isFill(bg.value)) {
    const base = hasState ? ctx.fills.get(baseKey) : null
    const solved = base ? solveStateFill({ fill: bg.value, base }) : solveFill({ fill: bg.value })
    if (!hasState) ctx.fills.set(baseKey, { polarity: solved.polarity, origL: oklchOf(bg.value).l, newL: oklchOf(solved.fill).l })
    bg.value = solved.fill
    entries
      .filter((e) => e.role === 'border' && e.isSingle && oklchOf(e.original).c >= 0.04)
      .forEach((e) => { e.value = solved.fill })
    if (fg) fg.value = solved.text
    if (!fg && solved.polarity === 'light') entries.push({ prop: 'color', role: 'fg', isSingle: true, original: null, value: solved.text, important: bg.important })
    return
  }

  // Surfaces that the inherited body text can't meet (hover rows, tinted bars)
  // carry their own text colour, like rosti.cz's hover:text-white
  if (bg && !fg && isOpaque(bg.value) && !isFill(bg.value) && lc({ fg: BODY_TEXT, bg: bg.value }) < TARGET.text) {
    const { color } = solveLightness({ color: BODY_TEXT, against: bg.value, target: TARGET.text, direction: 1, isText: true })
    entries.push({ prop: 'color', role: 'fg', isSingle: true, original: null, value: color, important: bg.important })
  }

  if (fg && isOpaque(fg.value)) {
    const surface = bg && isOpaque(bg.value) ? bg.value : ctx.surfaceWorst
    const isOnFillAlready = !bg && oklchOf(fg.value).l >= 0.95 // white label text; its fill rule is solved
    if (!isOnFillAlready) fg.value = solveLightness({ color: fg.value, against: surface, target: textTier(fg.original), direction: 1, isText: true }).color
  }

  if (CONTROL_RE.test(selector)) {
    entries
      .filter((e) => e.role === 'border' && e.isSingle && isOpaque(e.value) && oklchOf(e.value).c < NEUTRAL_CHROMA)
      .forEach((e) => { e.value = solveLightness({ color: e.value, against: ctx.surfaceBase, target: TARGET.control, direction: 1, isText: true }).color })
  }
}

// ---- Output -------------------------------------------------------------------

const tidySelector = (selector) => selector.split(',').map((s) => s.trim()).join(',\n')

/**
 * Plain, predictable serializer (2-space indent, one decl per line).
 * @param {{ nodes: import('postcss').ChildNode[], depth?: number }} opts
 * @returns {string}
 */
const serialize = ({ nodes, depth = 0 }) => {
  const pad = '  '.repeat(depth)
  return nodes.map((node) => {
    if (node.type === 'atrule') return `${pad}@${node.name} ${node.params} {\n${serialize({ nodes: node.nodes, depth: depth + 1 })}\n${pad}}`
    const selector = tidySelector(node.selector).replace(/\n/g, `\n${pad}`)
    const decls = node.nodes.map((d) => `${pad}  ${d.prop}: ${d.value}${d.important ? ' !important' : ''};`).join('\n')
    return `${pad}${selector} {\n${decls}\n${pad}}`
  }).join('\n')
}

const isMirroredAtRule = (node) => node.type === 'atrule' && /^(media|supports)$/i.test(node.name) && !/^print$/i.test(node.params.trim())

/**
 * Build the mirrored dark stylesheet from source CSS.
 * @param {object} opts
 * @param {string[]} [opts.files] - CSS file paths
 * @param {Array<{ css: string, from: string }>} [opts.sources] - inline CSS sources
 * @param {string} [opts.prefix] - prepended to every selector (e.g. ':root ' to outrank late-injected CSS)
 * @param {RegExp} [opts.skip] - rules whose selector matches are not mirrored
 * @param {string} [opts.surfaceWorst] - force the worst-case text surface (share it across builds)
 * @returns {{ css: string, stats: { rules: number, decls: number, surfaceWorst: string } }}
 */
const buildDark = ({ files = [], sources = [], prefix = '', skip, surfaceWorst: forcedSurface }) => {
  const roots = [
    ...files.map((file) => ({ css: fs.readFileSync(file, 'utf8'), from: file })),
    ...sources,
  ].map(({ css, from }) => postcss.parse(css, { from }))
  const withPrefix = (selector) => (prefix ? selector.split(',').map((s) => `${prefix}${s.trim()}`).join(', ') : selector)
  const isMirrored = (rule) => {
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) if (!isMirroredAtRule(p)) return false
    return true
  }
  const entriesOf = (rule) => rule.nodes
    .filter((d) => d.type === 'decl' && !/filter$/i.test(d.prop))
    .flatMap((d) => describeDecl(d).map((e) => ({ ...e, important: d.important })))

  // Pass 1: lightest dark surface text may sit on = worst case for fg-only rules
  const surfaces = []
  roots.forEach((root) => root.walkRules((rule) => {
    if (!isMirrored(rule) || skip?.test(rule.selector)) return
    entriesOf(rule)
      .filter((e) => e.prop === 'background-color' && isOpaque(e.value) && !isFill(e.value))
      .forEach((e) => surfaces.push(e.value))
  }))
  const surfaceWorst = forcedSurface ?? surfaces.reduce((a, b) => (oklchOf(b).l > oklchOf(a).l ? b : a), '#000000')
  const ctx = { fills: new Map(), surfaceWorst, surfaceBase: mapColor('#ffffff', 'bg') }

  // Pass 2: mirror + APCA
  const out = postcss.root()
  const stats = { rules: 0, decls: 0, surfaceWorst }
  const mirror = ({ source, target }) => {
    source.each((node) => {
      if (node.type === 'rule') {
        if (skip?.test(node.selector)) return
        const entries = entriesOf(node)
        if (!entries.length) return
        enforceContrast({ entries, selector: node.selector, ctx })
        // Emit every colour declaration, changed or not: skipping an unchanged
        // one (e.g. .btn-success:hover { color: #fff }) would let an earlier,
        // equally specific mirrored rule (.btn:hover) override it.
        const decls = entries
          .map((e) => postcss.decl({ prop: e.prop, value: e.value, important: e.important }))
        if (!decls.length) return
        target.append(postcss.rule({ selector: withPrefix(node.selector), nodes: decls }))
        stats.rules += 1
        stats.decls += decls.length
        return
      }
      if (isMirroredAtRule(node)) {
        const wrap = postcss.atRule({ name: node.name, params: node.params })
        mirror({ source: node, target: wrap })
        if (wrap.nodes?.length) target.append(wrap)
      }
    })
  }
  roots.forEach((root) => mirror({ source: root, target: out }))
  return { css: serialize({ nodes: out.nodes }), stats }
}

export { buildDark, mapColor }
