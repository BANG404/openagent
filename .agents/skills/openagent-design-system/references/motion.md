# Motion and interaction continuity

OpenAgent uses motion to preserve the relationship between an action and the
surface it changes. Motion is feedback, not decoration: controls respond
immediately, floating surfaces enter from their trigger, and content changes
never create a blank frame or an unexpected layout jump.

## Shared grammar

The duration and easing tokens live in `src/app.css`:

- `--motion-fast` is for color, focus, and compact control states.
- `--motion-panel` is for menus, selects, palettes, and side panels.
- `--motion-surface` is for dialogs and management surfaces.
- `--motion-layout` is for persistent shell geometry such as the sidebar.
- `--ease-enter` decelerates into the resting state; `--ease-exit` leaves
  quickly without an overshoot.

Bits UI portal surfaces use `data-starting-style` and `data-ending-style` so
the presence manager can keep the DOM mounted until the exit animation ends.
Do not animate the trigger, alter a select's resting dimensions, or stack a
second lifecycle animation in a child component.

Transient menus, floating application surfaces and management backdrops do not
use backdrop filters. Opening or removing them must not switch the underlying
transcript's blur or text rendering; retain the semantic surface color, shadow,
backdrop tint and opacity/transform transitions. The persistent composer keeps
its own material. Verify repeated open/close, unchanged underlying text bounds,
focus restoration and absence of backdrop filters in light/dark and English/Chinese.
Run `tauri-pilot run tests/blackbox/topbar-surface-stability.toml` in an isolated
debug window on `?desktop-shell-preview`, selecting each appearance with
`desktop-shell-preview-theme` and `desktop-shell-preview-locale`. The scenario
mounts the real management surface without settings or conversation persistence;
call `window.__topbarSurfaceCleanup()` after capturing the open surface.
Keep menu cycles in separate eval steps: a background WebView can throttle
timers enough for a combined pass to exceed Pilot's per-eval deadline.

## Interaction rules

- Keep pointer and keyboard feedback immediate; animation must never block the
  action or focus transfer.
- Use opacity and transform for floating surfaces. Animate width or height
  only for an intentional shell boundary such as the sidebar.
- Keep loading skeletons geometrically identical to their destination, then
  cross-fade the settled content without replacing the surrounding shell.
- Do not animate each streamed token or continuously reorder a conversation
  list. Animate only the state marker or the newly introduced row.
- Native window geometry and material stay outside the motion system; animate
  the WebView content inside the window.
- Desktop teardown uses a non-dismissible, localized status surface over inert
  application content. Its progress follows native cleanup stages without a
  timer animation; keep the stage text and progress accessible in reduced motion.
- Management surfaces that switch between compact and expanded modes animate
  explicit viewport geometry (`top`, `left`, `width`, and `height`) so the shell
  and its content stay aligned; avoid `auto` dimensions for that transition.

Shared `ui/SegmentedControl.svelte` owns segmented selection motion. Keep a
single sliding background behind the buttons, driven by the selected index and
the actual item count; use it for management views and list filters as well as
forms. Selection and keyboard focus change immediately, while the background
uses the panel duration. Arrow keys, Home, and End move selection and focus;
rapid switching retargets the existing CSS transition. Reduced motion disables
the transition without hiding the selected background.

Use its `fitContent` option for compact scope and filter controls whose labels
do not need to fill a wider layout column.

## Reduced motion

`prefers-reduced-motion: reduce` collapses shared durations and removes
translation and scale. Focus rings, error states, progress status, and
screen-reader live regions remain available and do not depend on animation.

Review visible changes in light and dark themes, Chinese and English, normal
motion, and reduced motion. Verify rapid open/close and focus restoration so a
cancelled transition cannot leave a stale overlay or trap focus.
