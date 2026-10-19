# DESIGN.md format

Workspace design context is `<workspace>/DESIGN.md`; global design context is
`<OPENAGENT_HOME>/DESIGN.md`. Neither belongs in the workspace `.agents/` tree.
This repository maintains the format directly; there is no `spec:gen` command.

A DESIGN.md file contains optional YAML frontmatter for machine-readable tokens
and Markdown for rationale and usage. Tokens are normative values; prose explains
their application. [Token schema](design-token-schema.md) defines types and
`{path.to.token}` references. Update both references when the format changes.

## Sections

Use level-two headings in this order; omit sections that are irrelevant.
An optional level-one title is not parsed as a section.

| Section | Alias | Content |
| --- | --- | --- |
| Overview | Brand & Style | Product identity, audience and intended density |
| Colors | | Palette roles; define at least the primary palette when supplying colors |
| Typography | | Type hierarchy, font properties and usage |
| Layout | Layout & Spacing | Grid, spacing, safe areas and padding |
| Elevation & Depth | Elevation | Shadow, blur or alternative hierarchy |
| Shapes | | Corner radii and shape grammar |
| Components | | Common component variants, states and tokens |
| Do's and Don'ts | | Product-specific constraints and pitfalls |

Token groups are `colors`, `typography`, `spacing`, `rounded` and `components`.
Names such as `primary`, `body-md`, `sm` or `full` are conventions, not a closed
enumeration. Spacing accepts dimensions or unitless numbers. Component maps
contain string properties, including token references and state variants such
as `button-primary-hover`; references may target composite typography values.
Common component properties are backgroundColor, textColor, typography, rounded,
padding, size, height and width. Additional component kinds remain allowed.

```yaml
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
```

## Unknown content

| Input | Consumer behavior |
| --- | --- |
| Unknown section heading | Preserve without error |
| Unknown color or typography name | Accept when the value is valid |
| Unknown spacing value | Accept; preserve as a string when it is not a dimension |
| Unknown component property | Accept with a warning |
| Duplicate section heading | Reject the file |

Application theme packages use the separate [semantic theme contract](semantic-themes.md).
A workspace DESIGN.md does not replace application CSS ownership or fixed native geometry.
