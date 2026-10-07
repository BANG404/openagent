# DESIGN.md Format

This workspace maintains the format guidance directly in this reference and
the design-section and token references. There is no local `spec:gen` command.
Update these owner documents together when the supported format changes.

Workspace design context is `<workspace>/DESIGN.md`; global design context is
`<OPENAGENT_HOME>/DESIGN.md`. Neither location is the workspace `.agents/` tree.

DESIGN.md is a self-contained, plain-text representation of a design system. It defines the visual identity of a brand and product, thereby ensuring that these stylistic choices can be followed across design sessions and between different AI agents and tools.  As a human-readable, open-format document, it serves as a living source of truth that both humans and AI can understand and refine.

A DESIGN.md file contains two parts: An optional YAML frontmatter, and a markdown body. The YAML front matter contains machine-readable design tokens. The markdown body sections provide human-readable design rationale and guidance. Prose may use descriptive color names (e.g., "Midnight Forest Green") that correspond to systematic token names (e.g., `primary`). The tokens are the normative values; the prose provides context for how to apply them.
