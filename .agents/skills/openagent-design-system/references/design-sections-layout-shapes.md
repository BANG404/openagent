## Layout

Also known as "Layout & Spacing".

This section describes the layout and spacing strategy.

Many design systems follow a grid-based layout. Others, like Liquid Glass, use margins, safe areas, and dynamic padding.

Example:

```markdown
## Layout

The layout follows a **Fluid Grid** model for mobile devices and a
**Fixed-Max-Width Grid** for desktop (max 1200px).

A strict 8px spacing scale (with a 4px half-step for micro-adjustments) is used to maintain a consistent rhythm. Components are grouped using "containment" principles, where related items are housed in cards with generous internal padding (24px) to emphasize the soft, approachable nature of the brand.
```

### Design Tokens

The spacing section defines the spacing design tokens. These may include spacing units that are useful for implementing the layout model. For example, a fixed grid layout may have spacing units for column spans, gutters, and margins.

It is a
map\<string, Dimension | number> that maps the spacing scale identifier to a dimension value or a unitless number (e.g., column counts or ratios).

```yaml
spacing:
  base: 16px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 32px
  xl: 64px
  gutter: 24px
  margin: 32px
```

## Elevation & Depth

Also known as "Elevation".

This section describes how visual hierarchy is conveyed based on the design style. If elevation is used, it defines the required styling (spread, blur, color). For flat designs, this section explains the alternative methods used to convey visual hierarchy (e.g., borders, color contrast).

Example:

```markdown
## Elevation & Depth

Depth is achieved through **Tonal Layers** rather than heavy shadows. The
background uses a soft off-white or very light green, while primary content sits on pure white cards.
```

## Shapes

This section describes how visual elements are shaped.

Example:

```markdown
## Shapes

The shape language is defined by **Architectural Sharpness**. All interactive
elements, containers, and inputs utilize a minimal **4px corner radius**. This
provides just enough softness to feel modern while maintaining a rigid,
engineered aesthetic.
```

### Design Tokens

The `rounded` section defines the design tokens for rounded corners used in
buttons, cards, and other rectangular shapes.

It is a map\<string, Dimension>.

```yaml
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
```
