# Orbita design system (extracted from the prototype)

The real app must look exactly like the Orbita prototype. These tokens were read out of the prototype's compiled CSS so we can rebuild them in `packages/ui` without guessing.

## How the prototype is styled

- **React** components styled with **Tailwind CSS** utility classes.
- **Colour tokens are CSS variables holding bare RGB triplets** (`--accent: 79 70 229`), used as `rgb(var(--accent) / <alpha>)`. That is what lets one token produce solid fills, 12% tints and 10% rings.
- **Dark mode** swaps the same variables under `[data-theme=dark]` on the root element (a manual toggle, not only the OS setting).
- **Icons:** Lucide.
- **Font:** Inter, falling back to the platform UI font.

## Colour tokens

| Token | Meaning | Light (RGB) | Dark (RGB) |
| --- | --- | --- | --- |
| `--bg` | Page background | 245 245 247 | 14 14 17 |
| `--card` | Card / panel surface | 255 255 255 | 28 28 32 |
| `--ink` | Primary text | 29 29 31 | 245 245 247 |
| `--mute` | Secondary text | 110 110 115 | 160 160 170 |
| `--line` | Borders and dividers | 229 229 234 | 50 50 58 |
| `--soft` | Subtle fills, hover, chips | 242 242 247 | 38 38 44 |
| `--accent` | Brand indigo: primary actions, selection | 79 70 229 | 138 130 255 |
| `--ai` | Violet: anything AI-generated or AI-suggested | 126 58 209 | 190 135 255 |
| `--ok` | Success, verified, passed | 22 128 66 | 74 205 124 |
| `--warn` | Needs attention, recommended | 168 94 0 | 245 180 70 |
| `--bad` | Blocking error, rejected | 196 38 38 | 255 110 110 |
| `--onaccent` | Text on accent fills | 255 255 255 | 14 12 38 |

The **AI colour is a separate token on purpose**: every AI suggestion, confidence chip and AI panel uses `--ai`, so users can always tell machine-proposed values from confirmed ones. Keep this rule in every new screen (category drafter, reviewer co-pilot, opportunity cards).

## Shape, depth and type

| Element | Prototype value | Usage in the prototype |
| --- | --- | --- |
| Radius | `rounded-xl` (most common), `rounded-2xl` for cards, `rounded-full` for pills and avatars | Buttons and inputs xl, cards 2xl |
| Shadow `lift` | `0 2px 4px #0000000d, 0 16px 40px -12px #00000029` | Raised cards, dialogs |
| Shadow `soft` | `0 1px 2px <soft>, 0 8px 24px -8px <soft>` | Resting cards |
| Body text | `text-sm` most common, `text-xs` for meta and chips | Dense, calm admin-style UI |
| Headings | `text-xl` / `text-2xl`, occasionally `text-3xl` | Page titles |
| Secondary text | `text-mute` is by far the most used text colour | Explanations under every field |

## Tailwind setup to reproduce it

```ts
// packages/ui/tailwind-preset.ts (planned)
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: rgb('--bg'), card: rgb('--card'), ink: rgb('--ink'), mute: rgb('--mute'),
        line: rgb('--line'), soft: rgb('--soft'), accent: rgb('--accent'), ai: rgb('--ai'),
        ok: rgb('--ok'), warn: rgb('--warn'), bad: rgb('--bad'), onaccent: rgb('--onaccent'),
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        lift: '0 2px 4px #0000000d, 0 16px 40px -12px #00000029',
        soft: '0 1px 2px rgb(var(--soft)), 0 8px 24px -8px rgb(var(--soft))',
      },
    },
  },
};
```

```css
/* packages/ui/tokens.css (planned) */
:root {
  --bg: 245 245 247; --card: 255 255 255; --ink: 29 29 31; --mute: 110 110 115;
  --line: 229 229 234; --soft: 242 242 247; --accent: 79 70 229; --ai: 126 58 209;
  --ok: 22 128 66; --warn: 168 94 0; --bad: 196 38 38; --onaccent: 255 255 255;
}
[data-theme='dark'] {
  --bg: 14 14 17; --card: 28 28 32; --ink: 245 245 247; --mute: 160 160 170;
  --line: 50 50 58; --soft: 38 38 44; --accent: 138 130 255; --ai: 190 135 255;
  --ok: 74 205 124; --warn: 245 180 70; --bad: 255 110 110; --onaccent: 14 12 38;
}
```

## UX patterns to keep

These recur across the prototype and should become shared components:

- **Step journey with a context panel:** every wizard step shows *You are here / Why you are here / What Orbita did / What you do / What happens next*.
- **Confidence chips:** High confidence / Review recommended / Seller confirmation required, in `--ai`, with a 75% default bar.
- **Check lists with three severities:** blocking (`--bad`), recommended (`--warn`), passed (`--ok`). Recommendations never block.
- **"Never silent" rule:** AI never overwrites a user value. Accept / Edit / Keep mine is always explicit.
- **Command palette and Ask Orbit AI** (⌘K style) available everywhere.
- **Readiness score** with one clear next recommendation.
