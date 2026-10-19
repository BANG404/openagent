# Elevation and depth

Use the established shared surface treatments from `src/app.css` and UI primitives.
Ordinary controls use `--control-shadow` where their shared variant requires depth;
floating menus, dialogs and previews use `--raised-shadow`. Settings cards and
controls use their shadowless Mica treatment with `--mica-divider`, as specified
in [product presentation](overview.md) and [inputs](inputs-and-forms.md).
Do not add ad-hoc perimeter borders or shadows to existing filled variants.
Separators, selection/focus marks, validation and table grids retain state-bearing edges.

Conversation stages use `bg-conversation-surface`; transcript components use the
distinct neutral `bg-conversation-component`. Keep the composer perimeter neutral:
streaming belongs to action/status indicators, without a colored ambient glow,
readability fade or animated background. [Colors](colors.md) owns canvas derivation;
native material belongs to the desktop-host owner.
