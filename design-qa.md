**Comparison Target**

- Source visual truth: `C:\Users\wyh13\AppData\Local\Temp\codex-clipboard-R7egcK.png`
- Browser-rendered implementation: `C:\Users\wyh13\AppData\Local\Temp\codex-playwright\page-2026-08-11T10-14-11-957Z.png`
- Combined comparison: `C:\Users\wyh13\AppData\Local\Temp\openagent-attachment-comparison.png`
- Viewport: 687 x 280 CSS pixels, `deviceScaleFactor: 1`
- Source pixels: 687 x 280; implementation pixels: 687 x 280; no density normalization was required.
- State: ordinary composer with four pending attachments, light theme, Chinese locale. The source's product-specific model and voice controls are outside the attachment-card scope; the implementation preview isolates the shared OpenAgent composer.

**Full-view Comparison Evidence**

- Both surfaces use one horizontal row of approximately 112 x 112 attachment cards inside a rounded composer.
- Cards retain the source's neutral fill, large radius, top preview/type treatment, bottom filename, horizontally clipped overflow, and hover-revealed top-right remove action.
- OpenAgent intentionally retains its existing Mica composer tokens, attachment filenames including extensions, toolbar icon, and application canvas instead of cloning Gemini product chrome.

**Focused Region Comparison Evidence**

- The attachment row was compared at native 1:1 pixels in the combined image. Card width, height, 8px inter-card gap, 18px radius, filename baseline, preview crop, and hover remove placement were legible without a separate enlarged crop.
- Fonts and typography: existing application family retained; card labels use 11-12px neutral text with single-line ellipsis and match the reference hierarchy.
- Spacing and layout rhythm: 112px cards, 8px gaps, 10-12px composer inset, and bottom-anchored labels match the reference density.
- Colors and visual tokens: neutral card surfaces and subdued labels follow the reference while remaining mapped to OpenAgent light/dark tokens.
- Image quality and asset fidelity: real attachment bytes/URLs continue to drive image previews with `object-fit: cover`; the development fixture uses the existing OpenAgent app image and no placeholder drawing.
- Copy and content: real filenames remain authoritative; Chinese and English labels, tooltips, and input placeholders were verified.

**Findings**

- No actionable P0/P1/P2 mismatches remain.
- P3: the reference canvas is pale blue while OpenAgent uses its existing theme canvas. This is an intentional product-system difference, not attachment-card drift.

**Comparison History**

1. Initial capture: `C:\Users\wyh13\AppData\Local\Temp\codex-playwright\page-2026-08-11T10-08-51-901Z.png`.
   - [P1] The inherited two-column trigger grid compressed image and text previews into a narrow leading column; remove controls also appeared on every idle card.
   - Fix: reset composer-card triggers to one full-width column and reveal the remove control only on card hover or keyboard focus.
2. Post-fix capture: `C:\Users\wyh13\AppData\Local\Temp\codex-playwright\page-2026-08-11T10-09-41-677Z.png`.
   - Evidence: previews fill the card width, filenames align along the bottom, idle cards are quiet, and the hovered image card reveals the top-right remove control.

**Interactions And Coverage**

- Opened an image card and verified the full attachment dialog and localized close control.
- Removed a pending attachment and verified the row reflowed without wrapping.
- Uploaded an image through the browser-backed file chooser and verified a new preview card appeared.
- Uploaded an image in quick-chat preview and verified it retained the 28px strip and did not open the full attachment dialog.
- Verified light/Chinese at 687 x 280 and dark/English at 420 x 280, including horizontal overflow.
- Browser console: 0 errors. Development mode emitted existing Svelte `derived_inert` warnings while attachment tooltip instances were destroyed; no interaction failed.

**Implementation Checklist**

- [x] Match card dimensions, radius, spacing, preview, filename, and remove placement.
- [x] Preserve click-to-preview and browser-backed upload.
- [x] Preserve compact quick-chat attachments.
- [x] Verify light/dark, Chinese/English, removal, preview, upload, and narrow overflow.

**Follow-up Polish**

- None required for this scope.

final result: passed
