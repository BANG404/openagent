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
- Management surfaces that switch between compact and expanded modes animate
  explicit viewport geometry (`top`, `left`, `width`, and `height`) so the shell
  and its content stay aligned; avoid `auto` dimensions for that transition.

## Reduced motion

`prefers-reduced-motion: reduce` collapses shared durations and removes
translation and scale. Focus rings, error states, progress status, and
screen-reader live regions remain available and do not depend on animation.

Review visible changes in light and dark themes, Chinese and English, normal
motion, and reduced motion. Verify rapid open/close and focus restoration so a
cancelled transition cannot leave a stale overlay or trap focus.
