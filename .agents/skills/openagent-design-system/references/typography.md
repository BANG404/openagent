# Application typography

`src/app.css` owns the font stacks and size tokens. Application text consumes
`--app-font-family` and `--app-font-size`; code and diffs use `--code-font-size`
and the shared monospace stack. Built-in defaults are 14px application text and
13px code. Existing compact menu/list and Settings styles have their own shared
size tokens; preserve that hierarchy rather than imposing a uniform body size.

Selected theme fonts and saved user overrides apply through the shared appearance
owner. Do not hard-code a proprietary font or register FontFace instances in
individual conversation components. Font loading must not block restore or
remount content. Use [semantic themes](semantic-themes.md) and the plugin package
contract for font declarations and lifecycle.

Keep Chinese and English readable at the selected size. Supporting copy must
wrap, labels retain accessible names, and zoom/size changes must not hide actions.
Workspace DESIGN.md font properties follow [the token schema](design-token-schema.md).
