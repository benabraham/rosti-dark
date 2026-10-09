// Assemble both outputs from one source of truth:
//   dist/rosti-dark.user.css – Stylus UserCSS (scoped with @-moz-document)
//   dist/dark.css            – plain stylesheet for the site itself, everything
//                              inside @media (prefers-color-scheme: dark)
// Each = generated colour mirrors (admin CSS, Ace, inline styles) + the
// hand-written rosti.cz design layer below.
//
//   node scripts/build.mjs
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { PATHS } from './paths.mjs'
import { buildDark } from './gen.mjs'
import { inlineStyleSource, FADED_SELECTOR } from './inline-styles.mjs'
import { parse, converter, formatHex } from 'culori'
import { TARGET, solveLightness } from './contrast.mjs'
import { NEUTRAL, BRAND } from './palette.mjs'

const require = createRequire(import.meta.url)
const toRgb = converter('rgb')
/** rosti.cz chromatic tokens by Tailwind name, read from palette.mjs comments */
const CHROMATIC_BY_NAME = Object.fromEntries([...fs.readFileSync(PATHS.palette, 'utf8')
  .matchAll(/'(#[0-9a-f]{6})', \/\/ ([a-z]+-\d+)/g)].map(([, hex, name]) => [name, hex]))
const files = [PATHS.mainCss, PATHS.styleCss]
const VERSION = require('../package.json').version
// Stylus checks @updateURL for a newer @version; bump package.json version on every release
const REPO_URL = 'https://github.com/benabraham/rosti-dark'
const RAW_URL = 'https://raw.githubusercontent.com/benabraham/rosti-dark/main'

const ACE_DIR = PATHS.aceCssDir
const ACE_VERSION = require('ace-builds/package.json').version
const base64 = (file) => fs.readFileSync(file).toString('base64')
const acePng = (file) => `url("data:image/png;base64,${base64(path.join(ACE_DIR, file))}")`
const logoSvg = `url("data:image/svg+xml;base64,${base64(PATHS.logoSvg)}")`
const fontFaces = fs.readFileSync(PATHS.fontsCss, 'utf8').trim()

const header = `/* ==UserStyle==
@name           Roští admin — Dark (rosti.cz design, APCA)
@namespace      rosti-dark.local
@version        ${VERSION}
@description    Dark mode for admin.rosti.cz + its Ace editor in the rosti.cz design system (neutral palette, rosti.cz menus/buttons/links hover states, Inter / Space Grotesk / JetBrains Mono via fonts.bunny.net, rounded UI). All text meets APCA Lc ${TARGET.text}; input borders Lc ${TARGET.control}.
@author         Dan Srb
@license        MIT
@homepageURL    ${REPO_URL}
@supportURL     ${REPO_URL}/issues
@updateURL      ${RAW_URL}/dist/rosti-dark.user.css
@preprocessor   default
==/UserStyle== */`

// ---- rosti.cz design tokens, solved for APCA ---------------------------------
const solveText = ({ color, against, target = TARGET.text }) =>
  solveLightness({ color, against, target, direction: 1, isText: true }).color

/** sRGB mix of `fg` over `bg` at `alpha` (what a translucent tint composites to). */
const mix = ({ fg, bg, alpha }) => {
  const [f, b] = [toRgb(parse(fg)), toRgb(parse(bg))]
  return formatHex({ mode: 'rgb', r: f.r * alpha + b.r * (1 - alpha), g: f.g * alpha + b.g * (1 - alpha), b: f.b * alpha + b.b * (1 - alpha) })
}
const rgbTriplet = (hex) => {
  const { r, g, b } = toRgb(parse(hex))
  return [r, g, b].map((v) => Math.round(v * 255)).join(' ')
}

const TEXT = {
  strong: NEUTRAL[50], // headings, titles — rosti dark:text-white / neutral-50
  body: NEUTRAL[300], // paragraphs, menus — rosti dark:text-neutral-300 (Lc 77–80)
  // rosti's muted neutral-400 is Lc ~50 on dark: below APCA 75, so muted text
  // shares neutral-300 and keeps its smaller size as the hierarchy cue
}
// rosti hover green #66c459 is Lc ~57 on neutral-800 → nearest passing rosti token
const ACCENT = solveText({ color: BRAND.light, against: NEUTRAL[800] })
const ACCENT_HOVER = solveText({ color: ACCENT, against: NEUTRAL[800], target: 88 })

/** rosti.cz pill: colour/20 fill, colour/40 border, light text solved against the tint. */
const pill = ({ base, alpha = 0.2 }) => {
  const worstBg = mix({ fg: base, bg: NEUTRAL[800], alpha: alpha + 0.1 }) // hovered link pills are 10% denser
  return { rgb: rgbTriplet(base), alpha, text: solveText({ color: base, against: worstBg }) }
}
const PILLS = {
  'primary, .label-success': pill({ base: BRAND.base }),
  info: pill({ base: CHROMATIC_BY_NAME['blue-400'] }),
  warning: pill({ base: CHROMATIC_BY_NAME['amber-500'] }),
  danger: pill({ base: CHROMATIC_BY_NAME['red-500'] }),
}
const pillCss = Object.entries(PILLS).map(([variant, { rgb, alpha, text }]) => {
  const names = variant.split(', ').map((v) => (v.startsWith('.') ? v : `.label-${v}`))
  return `${names.join(',\n')} {
  background-color: rgb(${rgb} / ${alpha});
  border: 1px solid rgb(${rgb} / 0.4);
  color: ${text};
}
${names.map((n) => `${n}[href]:hover,\n${n}[href]:focus`).join(',\n')} {
  background-color: rgb(${rgb} / ${alpha + 0.1});
  color: ${text};
}`
}).join('\n')

const fonts = `/* ---- Fonts: rosti.cz families via fonts.bunny.net (latin + latin-ext) -- */
${fontFaces}
`

const design = `
/* ---- rosti.cz tokens -------------------------------------------------- */
:root {
  color-scheme: dark; /* native scrollbars, checkboxes, date pickers */
  --rd-bg: ${NEUTRAL[900]};
  --rd-surface: ${NEUTRAL[800]};
  --rd-raised: ${NEUTRAL[700]};
  --rd-border: ${NEUTRAL[700]};
  --rd-border-strong: ${NEUTRAL[600]};
  --rd-code: ${NEUTRAL[950]};
  --rd-text-strong: ${TEXT.strong};
  --rd-text: ${TEXT.body};
  --rd-icon: ${NEUTRAL[400]}; /* non-text: icons only */
  --rd-accent: ${ACCENT};       /* rosti hover green, APCA-lifted */
  --rd-accent-hover: ${ACCENT_HOVER};
  --rd-brand: ${BRAND.base};
  --rd-font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --rd-font-heading: 'Space Grotesk', 'Inter', ui-sans-serif, sans-serif;
  --rd-font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --rd-radius-sm: 6px;  /* rounded-md: small buttons */
  --rd-radius: 8px;     /* rounded-lg: buttons, inputs */
  --rd-radius-lg: 12px; /* rounded-xl: alerts, menus, editor */
  --rd-radius-xl: 16px; /* rounded-2xl: cards, panels */
  --rd-ring: 0 0 0 3px rgb(84 176 72 / 0.35);
  --rd-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.35);
  --rd-shadow-lg: 0 12px 32px rgb(0 0 0 / 0.45);
  --rd-ease: 0.15s ease;
}
::selection {
  background-color: rgb(84 176 72 / 0.35);
  color: #ffffff;
}

/* ---- Page + typography ------------------------------------------------ */
body {
  background-color: var(--rd-bg); /* neutral-900, below neutral-800 cards */
  font-family: var(--rd-font-sans);
}
input,
select,
textarea,
button,
.tooltip,
.popover {
  font-family: var(--rd-font-sans);
}
/* Space Grotesk on everything that reads as a heading, however small */
h1, h2, h3, h4, h5, h6,
.h1, .h2, .h3, .h4, .h5, .h6,
legend,
th,
dt,
.page-header,
.dropdown-header,
.modal-title,
.popover-title,
.panel-title,
.panel-heading,
.list-group-item-heading,
.heading > div.strong,
.heading-title,
.danger-section-header,
.company-switcher ul.dropdown-menu li.title,
.stack-title,
.dashboard-credit,
.dashboard-credit-sub,
.credit span,
.credits-sub,
.credit-minus span,
.status,
.postoffice-dns-status .dns-status-label,
strong[style*="font-size"] {
  font-family: var(--rd-font-heading);
  letter-spacing: -0.01em;
}
/* …but controls inside heading areas stay Inter */
.btn,
.label,
.badge,
.form-control,
.dropdown-menu > li > a {
  font-family: var(--rd-font-sans);
  letter-spacing: normal;
}
/* Heading colour; :where() keeps specificity 0 so coloured classes still win */
:where(h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6, strong, b, legend,
  .heading-title, .panel-title, .stack-title, .modal-title):where(:not(.alert *, .btn *, .label *, .badge *, .text-muted)) {
  color: var(--rd-text-strong);
}
code,
kbd,
pre,
samp,
.dns-value-preview {
  font-family: var(--rd-font-mono);
}

/* ---- Links: neutral at rest, rosti green on hover --------------------- */
a {
  transition: color var(--rd-ease);
}
a:hover,
a:focus {
  color: var(--rd-accent);
}
a.link,
a.alert-link {
  color: var(--rd-accent);
}
a.link:hover,
a.link:focus,
a.alert-link:hover,
a.alert-link:focus {
  color: var(--rd-accent-hover);
}

/* ---- Logo: rosti.cz dark SVG painted in the raster logo's box --------- */
img[src*="/gfx/logo"] {
  object-position: -99999px 0; /* pushes the light PNG out of its own box */
  background: ${logoSvg} center / contain no-repeat;
}

/* ---- Top ribbon (rosti header: neutral-900, border-b neutral-800) ----- */
.ribbon {
  background-color: var(--rd-bg);
  border-bottom: 1px solid var(--rd-surface);
  color: var(--rd-text);
}
.ribbon button.btn {
  color: var(--rd-text);
}
.ribbon button.btn:focus,
.ribbon button.btn:hover {
  color: var(--rd-accent);
}
.ribbon .dropdown-menu > li a {
  color: var(--rd-text);
}
.ribbon .dropdown-menu > li a:hover {
  color: var(--rd-text-strong);
  background-color: var(--rd-raised);
}

/* ---- Side menu (rosti nav: font-medium, neutral-300 → green) ---------- */
#navigation {
  font-weight: 500;
}
#navigation ul.main-menu li a,
.secondary-menu a {
  color: var(--rd-text);
  border-radius: var(--rd-radius);
  transition: color var(--rd-ease), background-color var(--rd-ease);
}
#navigation ul.main-menu li a:hover,
.secondary-menu a:hover {
  color: var(--rd-accent);
  background-color: transparent;
}
#navigation ul.main-menu li.active a {
  color: var(--rd-accent);
  background-color: var(--rd-surface);
}
#navigation ul.main-menu li a .fa:first-child,
.secondary-menu a .fa:first-child,
.secondary-menu a .external-link-icon {
  color: var(--rd-icon);
  transition: color var(--rd-ease);
}
#navigation ul.main-menu li a:hover .fa:first-child,
#navigation ul.main-menu li.active a .fa:first-child,
.secondary-menu a:hover .fa:first-child,
.secondary-menu a:hover .external-link-icon {
  color: inherit;
}

/* ---- Buttons ---------------------------------------------------------- */
.btn {
  border-radius: var(--rd-radius);
  font-weight: 500;
  transition: color var(--rd-ease), background-color var(--rd-ease), border-color var(--rd-ease), box-shadow var(--rd-ease);
}
.btn-sm,
.btn-xs,
.btn-group-sm > .btn,
.btn-group-xs > .btn {
  border-radius: var(--rd-radius-sm);
}
.btn-lg,
.btn-group-lg > .btn {
  border-radius: 10px;
}
.btn-primary,
.btn-success,
.btn-danger {
  box-shadow: var(--rd-shadow-sm);
}
/* Ghost (rosti: transparent, border neutral-700 → hover bg neutral-800, white) */
.btn.btn-default {
  background-color: transparent;
  border-color: var(--rd-border);
  color: var(--rd-text);
}
.btn.btn-default:hover,
.btn.btn-default:focus,
.btn.btn-default:active,
.btn.btn-default.active,
.open > .dropdown-toggle.btn.btn-default {
  background-color: var(--rd-surface);
  border-color: var(--rd-border-strong);
  color: var(--rd-text-strong);
}
/* Select-like (rosti language switcher: neutral-800 → neutral-700) */
.btn.btn-gray,
.btn.btn-cancel {
  background-color: var(--rd-surface);
  border-color: var(--rd-border);
  color: ${NEUTRAL[200]};
}
.btn.btn-gray:hover,
.btn.btn-gray:focus,
.btn.btn-gray.active,
.btn.btn-cancel:hover,
.btn.btn-cancel:focus,
.open > .dropdown-toggle.btn.btn-gray {
  background-color: var(--rd-raised);
  border-color: var(--rd-border-strong);
  color: var(--rd-text-strong);
}
.btn:focus,
.btn:active:focus,
.btn.active:focus {
  outline: 0;
}
.btn:focus-visible {
  box-shadow: var(--rd-ring);
}

/* ---- Form controls ---------------------------------------------------- */
.form-control,
.input-group-addon,
.chosen-container-single .chosen-single,
.chosen-container-multi .chosen-choices,
.domain-token-enhanced .domain-token-control {
  border-radius: var(--rd-radius);
}
.form-control {
  background-color: var(--rd-bg); /* recessed field inside neutral-800 cards */
  transition: border-color var(--rd-ease), box-shadow var(--rd-ease);
}
.domain-token-entry {
  background-color: transparent; /* bare input that relied on the UA's white field */
}
.form-control:focus,
.domain-token-enhanced .domain-token-control:focus-within {
  border-color: var(--rd-brand);
  box-shadow: var(--rd-ring);
  outline: 0;
}
input[type="checkbox"],
input[type="radio"] {
  accent-color: var(--rd-brand);
}
.domain-token-menu:not([hidden]),
.chosen-container .chosen-drop {
  border-radius: var(--rd-radius-lg);
  box-shadow: var(--rd-shadow-lg);
}

/* ---- Cards & surfaces (rosti: neutral-800, border neutral-700, 2xl) --- */
.login-card {
  border: 1px solid var(--rd-border);
  border-radius: var(--rd-radius-xl);
  box-shadow: var(--rd-shadow-lg);
}
.panel {
  border-radius: var(--rd-radius-xl);
  box-shadow: var(--rd-shadow-sm);
}
.panel > .panel-heading {
  border-top-left-radius: 15px;
  border-top-right-radius: 15px;
}
.panel > .panel-footer {
  border-bottom-left-radius: 15px;
  border-bottom-right-radius: 15px;
}
.heading,
.alert,
.well,
.popover,
.modal-content,
.apps-transition-note {
  border-radius: var(--rd-radius-lg);
}
.apps-transition-note {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.stack-card {
  border-radius: var(--rd-radius-xl);
  border-width: 2px;
  transition: border-color var(--rd-ease);
}
.stack-card:hover {
  border-width: 2px;
}
.stack-card-selected {
  border-width: 2px !important; /* source sets the 4px border with !important */
}
.status {
  border-radius: var(--rd-radius);
}

/* ---- Menus, tabs, pagination ------------------------------------------ */
.dropdown-menu {
  background-color: var(--rd-surface);
  border-color: var(--rd-border);
  border-radius: var(--rd-radius-lg);
  padding: 6px;
  box-shadow: var(--rd-shadow-lg);
}
.dropdown-menu > li > a {
  color: var(--rd-text);
  border-radius: var(--rd-radius-sm);
  transition: color var(--rd-ease), background-color var(--rd-ease);
}
.dropdown-menu > li > a:hover,
.dropdown-menu > li > a:focus {
  background-color: var(--rd-raised);
  color: var(--rd-text-strong);
}
.dropdown-menu .divider {
  background-color: var(--rd-border);
}
.nav-tabs > li > a {
  border-radius: var(--rd-radius) var(--rd-radius) 0 0;
}
.nav-pills > li > a {
  border-radius: var(--rd-radius);
}
.pagination > li:first-child > a,
.pagination > li:first-child > span {
  border-top-left-radius: var(--rd-radius);
  border-bottom-left-radius: var(--rd-radius);
}
.pagination > li:last-child > a,
.pagination > li:last-child > span {
  border-top-right-radius: var(--rd-radius);
  border-bottom-right-radius: var(--rd-radius);
}
.list-group-item:first-child {
  border-top-left-radius: var(--rd-radius-lg);
  border-top-right-radius: var(--rd-radius-lg);
}
.list-group-item:last-child {
  border-bottom-left-radius: var(--rd-radius-lg);
  border-bottom-right-radius: var(--rd-radius-lg);
}

/* Muted text inside highlighted (neutral-700) rows */
.domain-token-suggestion:hover .domain-token-suggestion-description,
.domain-token-suggestion.active .domain-token-suggestion-description {
  color: ${NEUTRAL[200]};
}

/* ---- Labels: rosti.cz tinted pills ------------------------------------ */
.label {
  border-radius: 999px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.label-default {
  background-color: var(--rd-raised);
  border: 1px solid var(--rd-border-strong);
  color: ${NEUTRAL[100]};
}
${pillCss}
.badge,
.progress,
.onoffswitch-label,
.onoffswitch-switch {
  border-radius: 999px;
}
.tooltip-inner {
  border-radius: var(--rd-radius);
}

/* ---- Inline opacity fades on text (version stamp etc.) ---------------- */
${FADED_SELECTOR} {
  opacity: 1 !important; /* colour comes from the generated inline rules */
}

/* ---- Inline styles in templates (need !important to beat style="") ---- */
.login-card hr[style] {
  border-top-color: var(--rd-border) !important;
}
`

// Ace (ace-tm / TextMate): rosti.cz terminal look + Ace's own dark fold art.
const aceDesign = `
/* ---- Ace: rosti.cz terminal look (bg #0a0a0a, rounded-xl, JetBrains Mono) */
:root .ace_editor {
  border-radius: var(--rd-radius-lg);
  font-family: var(--rd-font-mono) !important; /* beats setOptions({ fontFamily }) inline style */
  font-variant-ligatures: none; /* keeps Ace's cursor maths exact */
}
:root .ace-tm {
  background-color: var(--rd-code);
}
:root .ace-tm .ace_gutter {
  background-color: var(--rd-bg);
}
:root .ace-tm .ace_gutter-active-line {
  background-color: var(--rd-surface);
}
:root .ace-tm .ace_print-margin {
  background-color: var(--rd-surface);
}
:root .ace-tm .ace_marker-layer .ace_active-line {
  background-color: rgb(255 255 255 / 0.04);
}
:root .ace-tm .ace_indent-guide {
  background: linear-gradient(${NEUTRAL[800]}, ${NEUTRAL[800]}) right / 1px 100% no-repeat;
}
:root .ace-tm .ace_indent-guide-active {
  background: linear-gradient(${NEUTRAL[600]}, ${NEUTRAL[600]}) right / 1px 100% no-repeat;
}
:root .ace-tm .ace_fold-widget {
  background-image: ${acePng('main-20.png')};
}
:root .ace-tm .ace_fold-widget.ace_end {
  background-image: ${acePng('main-21.png')};
}
:root .ace-tm .ace_fold-widget.ace_closed {
  background-image: ${acePng('main-22.png')};
}
:root .ace-tm .ace_fold-widget:hover {
  border-color: rgb(255 255 255 / 0.3);
  background-color: rgb(255 255 255 / 0.1);
  box-shadow: 0 1px 1px rgb(255 255 255 / 0.2);
}
:root .ace-tm .ace_fold-widget:active {
  border-color: rgb(255 255 255 / 0.4);
  box-shadow: 0 1px 1px rgb(255 255 255 / 0.2);
}
`

const templates = { css: fs.readFileSync(PATHS.templatesCss, 'utf8'), from: 'templates.css' }
// Plain text is solved against cards (neutral-800); darker hover/raised surfaces
// carry their own text colour (see enforceContrast), like rosti's hover:text-white
const site = buildDark({ files, sources: [templates], surfaceWorst: NEUTRAL[800] })
const inline = buildDark({
  sources: [{ css: inlineStyleSource({ files }), from: 'inline-styles' }],
  surfaceWorst: NEUTRAL[800], // inline text sits on the same surfaces
})
const ace = buildDark({
  sources: [{ css: fs.readFileSync(PATHS.aceCss, 'utf8'), from: 'ace.css' }],
  prefix: ':root ', // Ace injects its CSS at runtime, possibly after Stylus – outrank it
  skip: /\.ace_dark|\.ace_indent-guide|\.ace_active-line/,
})

const body = `/* ---- Generated: colour rules mirrored from main.css + style.css ------- */
${site.css}

/* ---- Generated: Ace ${ACE_VERSION} core incl. TextMate theme (ace-tm) ------- */
${ace.css}

/* ---- Generated: colours hard-coded in style="" attributes (!important) - */
${inline.css}

/* ==== rosti.cz design layer (after the mirrors so it wins ties) ======== */
${design}${aceDesign}`

const indent = (css) => css.replace(/^(?=.)/gm, '  ')

const userCss = `${header}

@-moz-document domain("admin.rosti.cz") {
${fonts}
${body}}
`

const siteHeader = `/*!
 * Roští admin — dark mode v${VERSION} (rosti.cz design system, APCA contrast)
 *
 * Plain CSS for admin.rosti.cz itself. Everything below applies only when the
 * OS/browser prefers a dark colour scheme; light mode is untouched.
 *
 *   <link rel="stylesheet" href="/static/ui/css/main.css">
 *   <link rel="stylesheet" href="/static/css/style.css">
 *   <link rel="stylesheet" href="/static/css/dark.css">      <- after both
 *   <meta name="color-scheme" content="light dark">          <- no white flash
 *
 * Rules mirror main.css + style.css selectors 1:1 (same specificity, later in
 * the cascade), so keep this file last. Ace rules carry a :root prefix because
 * Ace injects its own CSS at runtime. Generated by the rosti-dark package
 * (pnpm build); regenerate whenever main.css or style.css change.
 *
 * Text: APCA Lc ${TARGET.text} for all text; input borders Lc ${TARGET.control}.
 * Fonts: Inter, Space Grotesk, JetBrains Mono (fonts.bunny.net, latin + latin-ext),
 * declared inside the media query too, so light mode is byte-for-byte unaffected.
 */`

const siteCss = `${siteHeader}

@media (prefers-color-scheme: dark) {
${indent(fonts)}
${indent(body)}}
`

fs.mkdirSync(path.dirname(PATHS.userCss), { recursive: true })
fs.writeFileSync(PATHS.userCss, userCss)
fs.writeFileSync(PATHS.siteCss, siteCss)
const kb = (css) => `${(css.length / 1024).toFixed(1)} KB`
console.log(`build     v${VERSION}: ${site.stats.rules} admin + ${ace.stats.rules} Ace + ${inline.stats.rules} inline-style rules mirrored`)
console.log(`          dist/${path.basename(PATHS.userCss)} ${kb(userCss)}, dist/${path.basename(PATHS.siteCss)} ${kb(siteCss)}`)
