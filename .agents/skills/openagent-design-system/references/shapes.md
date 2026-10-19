# Shapes

Use the semantic radius scale exposed by `src/app.css`. Application-level surfaces
consume `--app-radius`; theme packages can change the shared control radius.
Circles, pills, compact menu rows and native window edges retain their own semantic
constraints. Do not introduce local intermediate radii to compensate for layout.

Desktop workspace cards retain their fixed 12px `--workspace-card-radius` and 8px
gutters independently of theme control radius, density and typography. The
[semantic theme contract](semantic-themes.md) owns this exception. Native window
clipping and materials follow the desktop-host owner.
