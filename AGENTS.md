# AGENTS.md

Guide for coding agents working on **rosti-dark**: a generator that turns the light CSS of admin.rosti.cz into an APCA-checked dark theme styled like the public rosti.cz site. Read this before changing anything; the invariants below are what keeps the output correct.

## What gets built

`pnpm build` writes two files from the same rules:

| File | For | Wrapper |
|---|---|---|
| `dist/rosti-dark.user.css` | Stylus browser extension | UserCSS metadata + `@-moz-document domain("admin.rosti.cz")` |
| `dist/dark.css` | linking from the site itself | one `@media (prefers-color-scheme: dark)` block holding everything, including `@font-face` |

Both are **generated**. Never edit `dist/` by hand: change `scripts/` or `assets/`, then rebuild. Commit `dist/` together with the change that produced it.

## Commands

```sh
pnpm install
pnpm sources    # refresh source/ (admin CSS, rosti.cz tokens) and assets/ (fonts CSS, logo) — reports CHANGED files
pnpm palette    # regenerate scripts/palette.mjs from source/rosti-layout.css (only when tokens changed)
pnpm build      # → dist/*
pnpm check      # APCA audit of every fixture page in headless Chromium; exit 1 = failure
```

- `source/` is git-ignored (it's Roští.cz's CSS). After a fresh clone, run `pnpm sources` before `pnpm build`.
- `pnpm check` needs Chromium. Set `CHROMIUM_PATH` to use a system binary (required on NixOS: `CHROMIUM_PATH=$(which chromium)`); otherwise run `pnpm exec playwright install chromium` once.
- Web fonts for checks are cached in `.cache/fonts/`. A failed download falls back silently; re-run if results look font-related.
- Debug one area: `SHOW='btn-success|label' pnpm check` lists every matching text node with its Lc instead of only failures.

## Pipeline

```
source/main.css ─┐                           ┌─ contrast.mjs (APCA solve, palette snap)
source/style.css ┼─▶ gen.mjs: mirror rules ──┤
assets/templates.css                         └─ palette.mjs (rosti.cz tokens)
ace-builds/css/ace.css ─▶ gen.mjs (prefix ":root ")
inline-styles.mjs ─▶ gen.mjs (!important attribute selectors)
                                   │
build.mjs: generated rules + hand-written design layer + fonts + logo ─▶ dist/
```

| File | Responsibility |
|---|---|
| `scripts/gen.mjs` | `buildDark()`: parse CSS with postcss, keep every colour declaration, remap it (`mapOklch` by role: bg / fg / border / shadow), enforce APCA per rule (`enforceContrast`), serialise. |
| `scripts/contrast.mjs` | APCA math (`lc`), `TARGET` values, `solveLightness` (walks the neutral scale or OKLCH lightness until a target is met, then snaps to a rosti.cz token), `solveFill` (picks white-on-dark or dark-on-light for coloured fills). |
| `scripts/palette.mjs` | **Generated** by `extract-palette.mjs`: Tailwind neutral scale, brand greens, chromatic tokens from rosti.cz. Don't hand-edit. |
| `scripts/inline-styles.mjs` | Synthetic CSS for colours hard-coded in `style=""` attributes, plus the faded-text rule. |
| `scripts/build.mjs` | Design tokens (`TEXT`, `ACCENT`, `PILLS`), the hand-written **design layer** (`design`, `aceDesign` template strings), output assembly. |
| `scripts/fetch-sources.mjs` | Downloads upstream inputs; reports what changed. |
| `scripts/check-contrast.mjs` | The audit. Measures computed colours of every visible text node (static and hovered), composites backgrounds and opacity, and fails below Lc 75. |
| `scripts/harness.mjs` | Serves `fixtures/*.html` at `http://admin.rosti.test/` with the current `source/` CSS and ace.css; blocks all other network. |
| `assets/templates.css` | `<style>` blocks found inside admin page templates. Add newly discovered ones here. |
| `fixtures/*.html` | Captured or synthetic admin pages the audit runs on. Listed in `FIXTURE_PAGES` in `paths.mjs`. |

## Invariants: keep these true

1. **Mirror, don't rewrite.** Every source rule that has a colour is re-emitted with the **same selector, the same `@media`/`@supports` nesting and the same order**, and loaded after the original CSS. Equal specificity plus later position means it wins without `!important`. Emit **all** colour declarations of a mirrored rule, changed or not. Skipping an unchanged one, e.g. `.btn-success:hover { color: #fff }`, lets an earlier equally-specific mirrored rule (`.btn:hover { color }`) win. That bug happened once.
2. **Longhands only.** Shorthands become longhands (`border` → `border-color`, `background` → `background-color`/`background-image`) so widths, styles and images set by other rules are never clobbered.
3. **APCA targets** (`TARGET` in `contrast.mjs`): all non-disabled text ≥ **Lc 75**, input borders ≥ **Lc 45**. `pnpm check` must exit 0. Disabled controls are exempt, per APCA. Don't lower a target to make a check pass; fix the colour.
4. **Palette discipline.** Neutrals always land on the rosti.cz neutral scale (`snapNeutral`). Chromatic colours snap to a same-hue rosti.cz token within `SNAP_RANGE` when one passes; otherwise the exact OKLCH solution is used. Don't introduce ad-hoc hex values in the design layer; use `NEUTRAL[n]`, `BRAND`, `TEXT`, `ACCENT` or a `--rd-*` custom property.
5. **Surfaces:** page `neutral-900`, cards/bars `neutral-800`, hover/active `neutral-700` (state rules are lifted automatically). Plain text is solved against `neutral-800`. A surface that inherited body text can't meet gets its own text colour pushed into the same rule.
6. **Light mode is untouched.** In `dist/dark.css` *everything* lives inside the single media query, `@font-face` included. Global `@font-face` alone measurably changes text rasterisation.
7. **Ace rules carry a `:root ` prefix** (passed as `prefix` to `buildDark`): Ace injects its CSS at runtime, possibly after this file.
8. **Inline-style overrides match exact values.** `[style*="color: #333;" i]` and `[style$="color: #333" i]`, never a bare prefix, so `#333` doesn't also catch `#333333`. These are the only generated `!important` rules besides ones that already had `!important` in the source.
9. **Baseline 2024 only.** In use: custom properties, `color-scheme`, `:where()`, `:is()`, `:not(<complex>)`, `:has()`, `:focus-visible`, `accent-color`, `object-position`, space-separated `rgb()`, case-insensitive attribute selectors, `@media` nesting. Don't add newer features (e.g. `@scope`, `scrollbar-color`). Flag anything uncertain.
10. **Fonts come from fonts.bunny.net**, latin + latin-ext subsets only (Czech needs latin-ext). No Google Fonts URLs.
11. **Fixtures contain no personal or account data**: no real emails, company IDs or names, tokens, or private configs. Scrub captured HTML before adding it.

## Common tasks

### Upstream CSS changed
`pnpm sources` → if tokens changed, `pnpm palette` → `pnpm build` → `pnpm check` → commit `assets/`, `scripts/palette.mjs` and `dist/`.

### A page has unreadable text
1. Save the page HTML. Strip `<script>`s, CSRF tokens and personal data, and keep stylesheet links as `/static/ui/css/main.css` and `/static/css/style.css`.
2. Add it to `fixtures/` and `FIXTURE_PAGES` in `scripts/paths.mjs`.
3. Run `pnpm check` and read the failing selectors.
4. Fix in the right place:
   - Colour set by a source rule → usually a generator rule (`mapOklch`, `enforceContrast`) or a design-layer override.
   - Colour in a `style=""` attribute → `inline-styles.mjs` (add the value to the collected set).
   - Colour in a template `<style>` block → copy the block into `assets/templates.css`.
   - Text inheriting onto a lifted hover surface → a targeted rule in the design layer (see the `.domain-token-suggestion` example).
5. Run `pnpm build && pnpm check`.

### Change the look
Edit the design layer in `scripts/build.mjs`: tokens in `:root` (`--rd-*`), component sections (ribbon, side menu, buttons, labels, …). **Match the specificity of the source selector you override** (`.btn.btn-default:hover` beats `.btn-default:hover`); find it with
`grep -n 'btn-default' source/main.css`. The design layer comes after the mirrors, so equal specificity wins.

### Make something use the heading font
Add its selector to the Space Grotesk list in the design layer ("Space Grotesk on everything that reads as a heading"). Controls inside heading areas are reset to Inter right after; keep that reset in sync.

### Bump the version
`package.json` `version` is written into the UserCSS `@version`; Stylus uses it for updates. Bump it for every user-visible change.

## Pitfalls already hit

- **Low-chroma pastels** (`#f2dede`, c ≈ 0.024) count as neutral at the default threshold. Light colours use a lower neutral bar (0.02) so alert tints survive.
- **Generic Bootstrap hover rules** (`.btn:hover { color: #333 }`) repaint label text; dark fills are therefore solved against `LIGHT_TEXT_FLOOR` (`neutral-200`), not pure white.
- **rosti.cz's own dark colours fail APCA**: `neutral-400` is Lc ~50, `#66c459` Lc ~57, and `#54b048` + white text Lc ~52. The theme uses the nearest passing tokens; keep it that way unless the owner explicitly relaxes the targets.
- **Forced panel backgrounds**: admin panels have no padding, so giving them a card fill puts text against the edge. Panels keep the source's own look.
- **Screenshot noise**: the login page autofocuses an input, and a blinking caret makes pixel comparisons flaky. The harness hides carets with `freezeTransitions`.

## Code style

Functional and declarative, no classes. Arrow functions, no semicolons, template literals. RORO (receive an object, return an object) for 2+ parameters. Guard clauses first. Descriptive names with auxiliary verbs (`isFill`, `hasState`). JSDoc on exported or non-obvious functions. Lowercase-dash file names. Commit messages describe *why*, not just what.
