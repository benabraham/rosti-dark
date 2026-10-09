# rosti-dark

Dark mode for [admin.rosti.cz](https://admin.rosti.cz) in the look of the public [rosti.cz](https://rosti.cz) site — neutral palette, Inter / Space Grotesk / JetBrains Mono, rounded UI, rosti.cz hover states — with every text colour checked against [APCA](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell) (Lc ≥ 75).

Covers the whole admin (Bootstrap 3 theme + custom styles), the Ace code editor, colours hard-coded in `style=""` attributes, and `<style>` blocks in page templates.

Not affiliated with Roští.cz.

## Use it

Two builds of the same theme are in [`dist/`](dist):

### As a userstyle (Stylus)

1. Install [Stylus](https://add0n.com/stylus.html) for Firefox or Chrome.
2. **[Install rosti-dark](https://raw.githubusercontent.com/benabraham/rosti-dark/main/dist/rosti-dark.user.css)**. Stylus opens an install page for it.
3. Visit admin.rosti.cz. Toggle the style from the Stylus toolbar menu.

Stylus checks that URL for new versions and updates the style automatically.

### On the site itself (`prefers-color-scheme`)

[`dist/dark.css`](dist/dark.css) applies only when the OS/browser prefers dark mode; light mode renders pixel-identical. Link it **after** the existing stylesheets:

```html
<link rel="stylesheet" href="/static/ui/css/main.css">
<link rel="stylesheet" href="/static/css/style.css">
<link rel="stylesheet" href="/static/css/dark.css">
<meta name="color-scheme" content="light dark">
```

The `color-scheme` meta avoids a white flash before CSS loads. If the templates' inline colours (`style="color: #333"`) are replaced by classes, the `!important` attribute-selector rules in the file become unnecessary.

## What it does

| | |
|---|---|
| **Palette** | rosti.cz Tailwind neutrals: page `neutral-900`, cards `neutral-800`, borders/hover `neutral-700`, code `neutral-950` |
| **Text** | headings `neutral-50`, body `neutral-300` (rosti.cz paragraph colour). rosti.cz's muted `neutral-400` and hover `#66c459` fail APCA on dark, so they're lifted to `neutral-300` / `green-300` |
| **Fills** | buttons and badges keep white text on a darkened fill, or (orange, yellow, cyan) dark text on a lightened fill — whichever changes the colour least |
| **Hover** | links and menu items turn green, ghost buttons lift to `neutral-800`, primary buttons darken |
| **Type** | Inter (body), Space Grotesk (anything heading-like), JetBrains Mono (code, Ace) via [fonts.bunny.net](https://fonts.bunny.net) |
| **Shape** | 8 px buttons/inputs, 12 px panels/menus, 16 px cards, pill labels, green focus ring |
| **Logo** | rosti.cz's dark SVG logo replaces the light PNG |

All CSS used is Baseline 2024.

## Rebuild

Needs Node ≥ 22, pnpm and curl.

```sh
pnpm install
pnpm sources    # download admin + rosti.cz CSS, fonts CSS, logo into source/ and assets/
pnpm palette    # only if rosti.cz design tokens changed
pnpm build      # → dist/rosti-dark.user.css + dist/dark.css
pnpm check      # APCA audit in headless Chromium; exits 1 on any failure
```

`pnpm check` uses Playwright's Chromium (`pnpm exec playwright install chromium`). On NixOS, point it at a system browser instead:

```sh
CHROMIUM_PATH=$(which chromium) pnpm check
```

See [AGENTS.md](AGENTS.md) for how the generator works and how to change it.

## License

[MIT](LICENSE) for the code in this repository. The Roští.cz name and logo belong to Roští.cz; the generated CSS mirrors selectors of their stylesheets. Fonts are under the SIL Open Font License; Ace's fold-widget images come from [Ace](https://github.com/ajaxorg/ace) (BSD).
