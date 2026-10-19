# Design constraints

- Reuse semantic color/foreground pairs, shared UI components and the existing
  typography hierarchy; honor theme and saved appearance overrides.
- Keep conversation canvases and composers neutral. Use existing control/overlay
  depth and the shadowless Settings surface rather than one-off decorations.
- Keep keyboard focus visible, purpose labels accessible, and loading/error states
  readable in light/dark and Chinese/English.
- Use the existing press treatment for ordinary actions. Select/dropdown triggers
  retain their size while opening; background-terminal accordion actions deepen
  their fill rather than scaling the row under the pointer.
- Avoid duplicate visible titles when host chrome already names the embedded
  surface; keep its accessible region/dialog/frame name.

Detailed form restrictions live in [inputs and forms](inputs-and-forms.md), motion
in [motion](motion.md), and token composition in [semantic themes](semantic-themes.md).
