// Palette extracted from rosti.cz (_astro/Layout.*.css, Tailwind v4 tokens)
// plus the brand greens from its markup. Regenerate with extract-palette.mjs.

/** Tailwind neutral scale — rosti.cz dark-mode surfaces, borders and text. */
const NEUTRAL = {
  50: '#fafafa',
  100: '#f5f5f5',
  200: '#e5e5e5',
  300: '#d4d4d4',
  400: '#a1a1a1',
  500: '#737373',
  600: '#525252',
  700: '#404040',
  800: '#262626',
  900: '#171717',
  950: '#0a0a0a',
}

/** Brand greens: bg-[#54b048], hover:bg-[#46943c], dark:text-[#66c459]. */
const BRAND = { base: '#54b048', hover: '#46943c', light: '#66c459' }

/** Chromatic tokens used on rosti.cz — snap targets for coloured text/fills. */
const CHROMATIC = [
  '#fe9a00', // amber-500
  '#8ec5ff', // blue-300
  '#51a2ff', // blue-400
  '#2b7fff', // blue-500
  '#155dfc', // blue-600
  '#00d492', // emerald-400
  '#00bc7d', // emerald-500
  '#009966', // emerald-600
  '#f0fdf4', // green-50
  '#b9f8cf', // green-200
  '#7bf1a8', // green-300
  '#05df72', // green-400
  '#00c950', // green-500
  '#00a63e', // green-600
  '#008236', // green-700
  '#016630', // green-800
  '#0d542b', // green-900
  '#a3b3ff', // indigo-300
  '#ff6900', // orange-500
  '#fb64b6', // pink-400
  '#e60076', // pink-600
  '#ad46ff', // purple-500
  '#fef2f2', // red-50
  '#ffc9c9', // red-200
  '#ffa2a2', // red-300
  '#ff6467', // red-400
  '#fb2c36', // red-500
  '#c10007', // red-700
  '#9f0712', // red-800
  '#82181a', // red-900
  '#00bba7', // teal-500
  '#fdc700', // yellow-400
  BRAND.base,
  BRAND.hover,
  BRAND.light,
]

export { NEUTRAL, BRAND, CHROMATIC }
