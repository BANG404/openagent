## Typography

### Font Family

- **Display**: `SF Pro Display, system-ui, -apple-system, sans-serif` — Apple's proprietary display face, optimized for sizes ≥ 19px. Defines the voice of every headline.
- **Body / UI**: `SF Pro Text, system-ui, -apple-system, sans-serif` — the text-optimized variant used for body copy, captions, buttons, and links below 20px.
- **OpenType features**: `font-variant-numeric: numerator` is enabled on numeric links (pricing tables, spec sheets). Display sizes rely on tight tracking rather than contextual ligatures.

### Hierarchy

| Token                         | Size | Weight | Line Height | Letter Spacing | Use                                                    |
| ----------------------------- | ---- | ------ | ----------- | -------------- | ------------------------------------------------------ |
| `{typography.hero-display}`   | 56px | 600    | 1.07        | -0.28px        | Hero headline; the signature "Apple tight" tracking    |
| `{typography.display-lg}`     | 40px | 600    | 1.10        | 0              | Tile headlines atop every product tile                 |
| `{typography.display-md}`     | 34px | 600    | 1.47        | -0.374px       | Section heads (SF Pro Text at display proportions)     |
| `{typography.lead}`           | 28px | 400    | 1.14        | 0.196px        | Product tile subcopy                                   |
| `{typography.lead-airy}`      | 24px | 300    | 1.5         | 0              | Environment-page lead paragraphs (the rare weight 300) |
| `{typography.tagline}`        | 21px | 600    | 1.19        | 0.231px        | Sub-tile tagline; sub-nav category name                |
| `{typography.body-strong}`    | 17px | 600    | 1.24        | -0.374px       | Inline strong emphasis                                 |
| `{typography.body}`           | 17px | 400    | 1.47        | -0.374px       | Default paragraph                                      |
| `{typography.dense-link}`     | 17px | 400    | 2.41        | 0              | Footer / store utility link lists (relaxed leading)    |
| `{typography.caption}`        | 14px | 400    | 1.43        | -0.224px       | Secondary captions, button text                        |
| `{typography.caption-strong}` | 14px | 600    | 1.29        | -0.224px       | Emphasized captions                                    |
| `{typography.button-large}`   | 18px | 300    | 1.0         | 0              | Store hero CTAs (the rare weight 300)                  |
| `{typography.button-utility}` | 14px | 400    | 1.29        | -0.224px       | Utility/nav button labels                              |
| `{typography.fine-print}`     | 12px | 400    | 1.0         | -0.12px        | Fine-print, footer body                                |
| `{typography.micro-legal}`    | 10px | 400    | 1.3         | -0.08px        | Micro legal disclaimers                                |
| `{typography.nav-link}`       | 12px | 400    | 1.0         | -0.12px        | Global nav menu items                                  |

### Principles

- **Negative letter-spacing at display sizes.** Every headline at 17px and up carries a slight tracking tighten (`-0.12 → -0.374px`). This produces the iconic "Apple tight" headline cadence. Never used at 12px or below.
- **Body copy at 17px, not 16px.** Apple breaks the SaaS convention and runs paragraph text at 17px. The extra pixel gives the page an unmistakable "reading, not scanning" pace.
- **Weight 300 is real and rare.** Used deliberately on a handful of large-size reads (`{typography.button-large}` at 18px/300 and `{typography.lead-airy}` at 24px/300). It's not an accident — it's a light-atmosphere cue reserved for moments where the content should feel airy.
- **Weight 600, not 700, for headlines.** Apple's headlines sit at weight 600. Weight 700 is used sparingly for `{typography.tagline}` (21px) when a touch more assertion is needed.
- **Line-height is context-specific.** Display sizes use 1.07–1.19 (tight). Body uses 1.47. Utility link stacks in the footer/store use an unusually relaxed 2.41 (`{typography.dense-link}`). The 2.41 is not a bug — it's how the footer's dense link columns breathe.
- **Weight 500 is deliberately absent.** The ladder is 300 / 400 / 600 / 700. Mid-weight readings always use 600.

### Note on Font Substitutes

SF Pro is Apple's proprietary system font. When building off-system:

- Use `system-ui, -apple-system, BlinkMacSystemFont` as the first stack entry — on macOS/iOS/Safari this resolves to the real SF Pro.
- For non-Apple platforms, **Inter** (Google Fonts, variable) is the closest open-source equivalent. Inter at weight 600 with `font-feature-settings: "ss03"` approximates SF Pro's rounded "a" character.
- Nudge `letter-spacing` down by `-0.01em` on display sizes to re-create the Apple tight feel; Inter's default tracking runs slightly wider than SF Pro.
- For body text, tighten line-height by `0.03` (from 1.47 → 1.44) when substituting Inter — Inter's taller x-height needs less leading.
