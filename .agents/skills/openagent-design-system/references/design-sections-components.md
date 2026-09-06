## Components

This section provides style guidance for component atoms within the design system. The following are common component types. Design systems are encouraged to define additional components relevant to their domain.

* **Buttons**: Covers primary, secondary, and tertiary variants, including sizing, padding, and states.
* **Chips**: Covers selection chips, filter chips, and action chips.
* **Lists**: Covers styling for list items, dividers, and leading/trailing elements.
* **Tooltips**: Covers positioning, colors, and timing.
* **Checkboxes**: Covers checked, unchecked, and indeterminate states.
* **Radio buttons**: Covers selected and unselected states.
* **Input fields**: Covers text inputs, text areas, labels, helper text, and error states.

> **Note:** The components specification is actively evolving. The current structure provides intentional flexibility for domain-specific component definitions while the spec matures.

### Design Tokens

The components section defines a collection of design tokens used to ensure consistent styling of common components. It's a map\<string, map\<string, string>> that maps a component identifier to a group of sub token names and values. The design token values may be literal values, or references to previously defined design tokens.

**Variants**. A component may have a variant for different UI states such as active, hover, pressed, etc. Those variant components may be defined under a different but related key, for example, "button-primary", "button-primary-hover", "button-primary-active". The agent will consider all variants and make the appropriate styling decisions.

```yaml
components:
  button-primary:
    backgroundColor: "{colors.primary-60}"
    textColor: "{colors.primary-20}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-70}"
```

### Component Property Tokens

Each component has a set of properties that are themselves design tokens:

- backgroundColor: \<Color\>
- textColor: \<Color\>
- typography: \<Typography\>
- rounded: \<Dimension\>
- padding: \<Dimension\>
- size: \<Dimension\>
- height: \<Dimension\>
- width: \<Dimension\>

## Do's and Don'ts

This section provides practical guidelines and common pitfalls. These act as guardrails when creating designs.

```markdown
## Do's and Don'ts

- Do use the primary color only for the single most important action per screen
- Don't mix rounded and sharp corners in the same view
- Do maintain WCAG AA contrast ratios (4.5:1 for normal text)
- Don't use more than two font weights on a single screen
```
