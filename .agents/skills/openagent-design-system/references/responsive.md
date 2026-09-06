## Responsive Behavior

### Breakpoints

| Name             | Width       | Key Changes                                                                                               |
| ---------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| Small phone      | ≤ 419px     | Single-column tiles; sub-nav collapses to category name + primary CTA only; hero typography drops to 28px |
| Phone            | 420–640px   | Single-column stack; product renders scale to 80% of tile width; hero h1 drops to 34px                    |
| Large phone      | 641–735px   | Tiles transition to tighter padding (48px vertical vs 80px); fine-print wraps                             |
| Tablet portrait  | 736–833px   | Global nav collapses to hamburger; sub-nav hides category chips, keeps primary CTA                        |
| Tablet landscape | 834–1023px  | Global nav returns fully expanded; 3-column utility grids become 2-column                                 |
| Small desktop    | 1024–1068px | Product tiles use 2/3 width with margin gutters; hero h1 stays at 40px                                    |
| Desktop          | 1069–1440px | Full layout; 4–5 column store grids; 1440px content max                                                   |
| Wide desktop     | ≥ 1441px    | Content locks at 1440px, margins absorb extra width                                                       |

The structural breakpoints that matter for agents: 1440px (content lock), 1068px (small-desktop), 833px (tablet landscape switch), 734px (tablet portrait), 640px (phone), 480px (small phone).

### Touch Targets

- Minimum 44 × 44px. `{component.button-primary}` lands at ~44 × 100px (with the full-pill radius making the visible hit area more generous than the label suggests).
- `{component.button-icon-circular}` is exactly 44 × 44px.
- Global nav utility links are smaller (~32 × 80px) — they deliberately sit at a tighter target because they're precision desktop actions, and the mobile hamburger replaces them at ≤ 833px.

### Collapsing Strategy

- **Global nav**: full horizontal link row on desktop → collapses to Apple logo + hamburger + bag icon at 834px and below.
- **Sub-nav**: category name + inline links + primary CTA → category name + primary CTA only at mobile; inline links move into a hamburger tray.
- **Product tiles**: stack from 2-column to 1-column at 834px; vertical padding tightens from 80px → 48px at small-phone.
- **Utility grids** (store, accessories): 5-col → 4-col (1440px) → 3-col (1068px) → 2-col (834px) → 1-col (640px).
- **Hero typography**: `{typography.hero-display}` (56px) → `{typography.display-lg}` (40px) at 1068px → 34px at 640px → 28px at 419px.

### Image Behavior

- All product imagery uses responsive `srcset` with breakpoint-matched crops.
- Hero photography may switch art direction at mobile (e.g., the environment page's vista crops to a taller aspect ratio on mobile, framing the subject differently).
- Product renders maintain their 1:1 or 4:3 aspect ratios across breakpoints; only scale changes.
- Lazy-loading is default; the above-fold hero loads eagerly.
