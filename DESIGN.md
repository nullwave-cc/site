# nullwave web design

Every nullwave page (home, FM-1, installer, emulator, quick start, manual, editor) uses the same look. Link
`/style.css` and build from the pieces below instead of adding new styles.

## Rules

- Colours: black, white and red only. Greys (`--dim`, `--faint`, `--line`, `--edge`) are tints of
  black and white. Red (`--red`, #E5202E) marks what matters: the current step, a status, an
  active part. Never use it for large fills.
- Both themes: the page follows `prefers-color-scheme`. Use the variables, never raw colours.
- Lines, not boxes: sections are split by 1px rules (`--line`), groups by 1px dividers (`--edge`).
  No shadows, gradients or card backgrounds.
- Type: Baloo Da 2, the font of the "wave" in the logo, for everything (headings, nav, buttons, body),
  self-hosted from `/assets/fonts/BalooDa2-latin.woff2` (variable, weights 400–800, SIL OFL; licence in
  `assets/fonts/OFL.txt`). Never load it from Google. Headings are weight 500 with near-zero letter
  spacing so they read like the wordmark. Small labels (`.kicker`, numbers, statuses, versions) stay
  monospace. Body text is `--dim`.
- The name is always written `nullwave`, in lowercase. The red `wave` is rare: only in page hero
  titles (h1), the product names in the products list, and the opening line of About, as `null<span class="w">wave</span>` with no gap.
  Everywhere else (h2, leads, cards, footer, small text) it is
  `<b class="nb">nullwave</b>`: weight 600 in pure `--fg`, no red. `<title>` and meta tags stay plain.
- Product names: `<span class="pn">null<span class="w">wave</span></span> <span class="sfx">fm1</span>`.
  `nullwave` is weight 600 with the red `wave`; the suffix (fm1, learn, create) is weight 400 in
  `--text`, after a normal space. The FM-1 hero h1 follows the same pattern.
- Text colour: `--text` (#C4C4C4 dark, #3A3A3A light) is the default for headings, body, nav and
  footer; `--dim` for secondary copy; `--faint` for small labels. Pure `--fg` (#FFF / #000) means
  highlighted: the word nullwave, the solid button, hovered and current nav items, hovered links,
  and key labels such as channel names. Every text colour passes WCAG AA in both themes.
- Text links (nav, footer, inline) never change colour. A thin red underline draws in from left to
  right on hover and keyboard focus (0.25s); inline links rest with a faint `--edge` underline.
  Pill buttons are not text links.

## Pieces in style.css

| Class | Use |
|---|---|
| `nav > .wrap` | Sticky top bar: logo on the left, up to four links on the right |
| `.hero`, `.hero-2` | Page header; `.hero-2` puts text and the FM-1 drawing side by side |
| `.kicker` | Small monospace label above a heading |
| `.lead` | Intro paragraph |
| `.btn`, `.btn.solid` | Pill buttons; one `.solid` per screen at most. `aria-disabled` greys one out |
| `.split` | Heading on the left, text on the right |
| `.rows > .row` | Numbered list (projects, versions, files) |
| `.cols`, `.steps` | Three columns divided by lines |
| `.shots` | Grid of firmware screenshots |
| `.reveal` | Children fade and rise in one after another when scrolled into view |

## The FM-1 drawing

`/device.js` draws the FM-1 in 3D with lines only (no images except the display, no libraries)
and colours it from the page's CSS variables. Any page can use it: link `/style.css`, add one or
more `<div class="fm1-3d">`, then `<script src="/device.js"></script>`. Give the div a size with
CSS (it defaults to `aspect-ratio: 16/9`).

### Data attributes

| Attribute | Meaning |
|---|---|
| `data-mode` | `hero` (draws in, drifts, drag to turn, tilts on scroll), `tour` (driven by `[data-feature]` blocks in a `.tour`), `still` (fixed camera). Default: `still` when `data-steps` is set, otherwise `hero`. |
| `data-view` | A preset (`three`, `front`, `top`, `left`, `right`, `low`) or `yaw,pitch[,distance,x,z]` in degrees and panel units. The whole unit always stays in frame. |
| `data-on` | Comma-separated groups to light red (see below). |
| `data-screen` | One screen to show on the display, e.g. `LOOP_MAIN`. |
| `data-screens` | Screens to cycle through, e.g. `PLAY_MAIN,PLAY_FM6,LOOP_MAIN`. The splash shows first. |
| `data-steps` | A JSON list of steps, played on a timer once the drawing is in view. Each step: `{"on": "REC", "screen": "LOOP_MAIN", "press": "REC", "view": "front"}` (all optional). |
| `data-interval`, `data-loop` | Step timing in ms (default 2600) and whether to loop (default `true`). |

In a `.tour`, each `[data-feature]` block takes `data-on`, `data-screen`, `data-press` and
`data-view`, and the drawing follows whichever block is in the middle of the screen.

### Groups

`KEYS`, `KNOBS` (all eight), `MASTER`, `SELECT`, `PRESETS`, `ALGORITHM`, `KNOB1`–`KNOB4`, `OCT-`,
`OCT+`, `SHIFT` (lights OCT− and OCT+, since holding either is SHIFT), `FX`, `SEL`, `ENV`, `LFO`,
`EDIT`, `GLO`, `HOME`, `SAVE`, `ARP`, `SEQ`, `PLAY STOP` (also `PLAY`, `STOP`, `PLAY/STOP`), `REC`,
`BUTTONS` (all twelve), `SCREEN` (also `DISPLAY`). Names are case-insensitive.

A `press` makes a button dip and flash once. Keys are never pressed or animated, only lit.

### JavaScript

```html
<div class="fm1-3d" id="howto"></div>
<script src="/device.js"></script>
<script>
  const fm1 = FM1.mount(document.getElementById('howto'), { view: 'three', screen: 'PLAY_MAIN' });
  fm1.set({ on: 'SHIFT,HOME', press: 'HOME', screen: 'PLAY_MAIN' });
  fm1.play([
    { on: 'REC', press: 'REC' },
    { on: 'REC,SCREEN', screen: 'LOOP_MAIN' },
    { on: 'SHIFT,HOME', press: 'HOME', screen: 'PLAY_MAIN' },
  ], { interval: 2800, loop: true });
  // fm1.stop(); the element fires 'fm1step' events with { index, step } for captions
</script>
```

Divs with class `fm1-3d` are mounted automatically; `FM1.mount` on one of them returns the same
controller. `FM1.groups` and `FM1.views` list the names.

### Screens

In `/assets/screens/`, each as `NAME-dark` and `NAME-light`, 960×960 `.webp` and `.png`:
`PLAY_MAIN` (home), `PLAY_ANALOG`, `PLAY_FM6`, `PLAY_DRUM`, `PLAY_CHORD`, `LOOP_MAIN`,
`MAIN_PLAYING`, `SEQ_DRUMS`, `LAYER_GLO`, `LAYER_FX`, `LAYER_SAVE`, `SAVE_CHAIN` (the CHAIN page),
`FM6_OPERATOR`, `graph-env`,
`NAME`, `SET_SCREEN` and `SET_SYSTEM` (settings), and for the installer and quick start only:
`UPDATE_MODE`, `SAFE_MODE`, `INSTALLING`, `INSTALLED`, `FACTORY_RESET`. PLAY is the sound wave of
what is playing, with the chord name under it. The drawing uses the
`.webp` in the current theme. Pages showing screens as images use `<picture>` with WebP and a PNG
fallback per theme.

Under `prefers-reduced-motion` nothing draws in, drifts, cycles or presses: a steps drawing
shows its first step, a tour cuts between features, and the camera never moves on its own.

## Motion

Slow and eased (`--ease`), 0.6–1s. Only the camera, the knobs and the screen move; the keys stay
still. Everything turns off under `prefers-reduced-motion`.
