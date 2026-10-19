---
name: openagent-design-system
description: Use when changing OpenAgent visual design, layout, typography, colors, component surfaces, responsive behavior, or DESIGN.md format and token handling.
metadata:
  category: product-design
---

# Design system

Reuse `src/lib/components/ui/`, Bits UI and semantic tokens from `src/app.css`.
Product behavior stays with its subsystem owner; these references own appearance and interaction presentation.

| Task | Read |
| --- | --- |
| Product shell, Settings and onboarding presentation | [Overview](references/overview.md) |
| Theme pairs, overrides and composition | [Semantic themes](references/semantic-themes.md) |
| Native canvas and conversation colors | [Colors](references/colors.md) |
| Typography and font sizing | [Typography](references/typography.md) |
| Spacing, embedded titles and scrolling | [Layout](references/layout.md) |
| Card and control depth | [Elevation](references/elevation.md) |
| Corners and panel geometry | [Shapes](references/shapes.md) |
| Navigation, buttons and cards | [Components](references/navigation-buttons-cards.md) |
| Forms and shared control contracts | [Inputs and forms](references/inputs-and-forms.md) |
| Loading states | [Skeletons](references/skeletons.md) |
| Responsive surfaces | [Responsive behavior](references/responsive.md) |
| Motion and reduced motion | [Motion](references/motion.md) |
| Design review constraints | [Do's and don'ts](references/dos-and-donts.md) |
| Implementation and verification workflow | [Iteration](references/iteration.md) |
| Workspace DESIGN.md authoring or parsing | [File format](references/design-format.md) and [token schema](references/design-token-schema.md) |

Verify changed visible states in light/dark and Chinese/English through the owning desktop scenario.
