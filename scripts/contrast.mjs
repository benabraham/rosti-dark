// APCA helpers: measure Lc and move colours along the rosti.cz palette (or
// OKLCH lightness when no palette step fits) until a target is met.
import { APCAcontrast, sRGBtoY, alphaBlend } from 'apca-w3'
import { parse, converter, formatHex, clampChroma } from 'culori'
import { NEUTRAL, CHROMATIC } from './palette.mjs'

const toOklch = converter('oklch')
const toRgb = converter('rgb')

/**
 * Contrast targets (absolute Lc). Body text sits at APCA's body minimum (75) so
 * rosti.cz's neutral-300 paragraph colour can be used as-is (Lc 77–80).
 */
const TARGET = { body: 75, text: 75, control: 45 }

/** Text on light fills: the rosti.cz page colour (neutral-900). */
const DARK_TEXT = NEUTRAL[900]
const WHITE = '#ffffff'
/**
 * Dark fills are solved against this, not pure white: generic rules like
 * Bootstrap's `.btn:hover { color: #333 }` repaint label text as light grey.
 */
const LIGHT_TEXT_FLOOR = NEUTRAL[200]
/**
 * The site's design is white text on fills; keep that unless a lighter fill
 * would need far less change. 2.2 → green/red/blue/grey stay dark + white text,
 * orange/yellow/cyan go light + dark text (the usual warning-colour treatment).
 */
const PREFER_WHITE_TEXT = 2.2
const NEUTRAL_CHROMA = 0.025
/** How far (OKLCH L) a palette step may sit from the exact solution to be used instead. */
const SNAP_RANGE = 0.08

/** @param {string} color @returns {number[]} [r, g, b, a] 0–255 / 0–1 */
const rgba = (color) => {
  const { r, g, b, alpha = 1 } = toRgb(parse(color))
  return [...[r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)), alpha]
}

/**
 * Absolute APCA Lc of text over a background (translucent text is blended first).
 * @param {{ fg: string, bg: string }} pair
 * @returns {number}
 */
const lc = ({ fg, bg }) => {
  const bgRgb = rgba(bg).slice(0, 3)
  const fgRgba = rgba(fg)
  const fgRgb = fgRgba[3] < 1 ? alphaBlend(fgRgba, bgRgb) : fgRgba.slice(0, 3)
  return Math.abs(APCAcontrast(sRGBtoY(fgRgb), sRGBtoY(bgRgb)))
}

/** @param {string} color @returns {{ l: number, c: number, h?: number, alpha?: number }} */
const oklchOf = (color) => {
  const { l, c = 0, h, alpha } = toOklch(parse(color))
  return { l, c, h, alpha }
}

const isNeutral = (color) => oklchOf(color).c < NEUTRAL_CHROMA

/** @param {{ color: string, l: number }} opts @returns {string} hex at the given OKLCH lightness */
const withLightness = ({ color, l }) => formatHex(clampChroma({ mode: 'oklch', ...oklchOf(color), l: Math.min(1, Math.max(0, l)) }, 'oklch'))

const NEUTRAL_STEPS = Object.values(NEUTRAL)
  .map((hex) => ({ hex, l: oklchOf(hex).l }))
  .sort((a, b) => a.l - b.l)

const hueDistance = (a = 0, b = 0) => Math.abs(((a - b + 540) % 360) - 180)

/** Palette steps of the same hue family as `color` (±20°). */
const familyOf = (color) => {
  const { c, h } = oklchOf(color)
  if (c < 0.04) return []
  return CHROMATIC
    .map((hex) => ({ hex, ...oklchOf(hex) }))
    .filter((p) => p.c >= 0.04 && hueDistance(p.h, h) <= 20)
}

/** Nearest neutral-scale step by lightness. @param {string} color @returns {string} */
const snapNeutral = (color) => {
  const { l } = oklchOf(color)
  return NEUTRAL_STEPS.reduce((a, b) => (Math.abs(b.l - l) < Math.abs(a.l - l) ? b : a)).hex
}

/**
 * Closest palette colour to `color` that still satisfies `meets` (or `color`).
 * Neutrals always land on the neutral scale; chromatic colours snap to a
 * same-hue rosti.cz token within SNAP_RANGE.
 */
const snapToPalette = ({ color, meets = () => true, direction = 0 }) => {
  if (isNeutral(color)) {
    const snapped = snapNeutral(color)
    return meets(snapped) ? snapped : color
  }
  const { l } = oklchOf(color)
  const pick = familyOf(color)
    .filter((p) => Math.abs(p.l - l) <= SNAP_RANGE && (direction === 0 || (direction > 0 ? p.l >= l - 0.005 : p.l <= l + 0.005)))
    .filter((p) => meets(p.hex))
    .sort((a, b) => Math.abs(a.l - l) - Math.abs(b.l - l))[0]
  return pick ? pick.hex : color
}

/**
 * Move `color` in `direction` until the pair reaches `target` (palette-aware).
 * @param {{ color: string, against: string, target: number, direction: 1|-1, isText: boolean }} opts
 *   isText – true when `color` is the foreground, false when it's the background
 * @returns {{ color: string, isMet: boolean }}
 */
const solveLightness = ({ color, against, target, direction, isText }) => {
  const meets = (c) => lc(isText ? { fg: c, bg: against } : { fg: against, bg: c }) >= target
  if (meets(color)) return { color: snapToPalette({ color, meets }), isMet: true }

  const { l } = oklchOf(color)
  if (isNeutral(color)) {
    const step = NEUTRAL_STEPS
      .filter((s) => (direction > 0 ? s.l > l + 0.001 : s.l < l - 0.001))
      .sort((a, b) => direction * (a.l - b.l))
      .find((s) => meets(s.hex))
    if (step) return { color: step.hex, isMet: true }
  } else {
    for (let next = l; next >= 0 && next <= 1; next += direction * 0.004) {
      const candidate = withLightness({ color, l: next })
      if (meets(candidate)) return { color: snapToPalette({ color: candidate, meets, direction }), isMet: true }
    }
  }
  const extreme = direction > 0 ? WHITE : '#000000'
  return { color: extreme, isMet: meets(extreme) }
}

/**
 * Pick text polarity for a coloured fill: white text on a darkened fill, or dark
 * text on a lightened fill – whichever needs less change (biased to white text).
 * @param {{ fill: string, target?: number }} opts
 * @returns {{ fill: string, text: string, polarity: 'dark'|'light' }}
 */
const solveFill = ({ fill, target = TARGET.text }) => {
  const { l } = oklchOf(fill)
  const darker = solveLightness({ color: fill, against: LIGHT_TEXT_FLOOR, target, direction: -1, isText: false })
  const lighter = solveLightness({ color: fill, against: DARK_TEXT, target, direction: 1, isText: false })
  const deltaDark = darker.isMet ? Math.abs(l - oklchOf(darker.color).l) : Infinity
  const deltaLight = lighter.isMet ? Math.abs(oklchOf(lighter.color).l - l) : Infinity
  return deltaDark <= deltaLight * PREFER_WHITE_TEXT
    ? { fill: darker.color, text: WHITE, polarity: 'dark' }
    : { fill: lighter.color, text: DARK_TEXT, polarity: 'light' }
}

export { TARGET, DARK_TEXT, WHITE, LIGHT_TEXT_FLOOR, lc, oklchOf, withLightness, solveLightness, solveFill, snapNeutral }
