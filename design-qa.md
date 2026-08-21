# Design QA

**Comparison target**

- Source visual truth: `C:\Users\wyh13\AppData\Local\Temp\codex-clipboard-fP4p3m.png`
- Browser-rendered implementation: `C:\Users\wyh13\AppData\Local\Temp\codex-playwright\page-2026-08-21T18-26-04-023Z.png`
- Full-view comparison evidence: `C:\Users\wyh13\AppData\Local\Temp\codex-playwright\page-2026-08-21T18-27-25-237Z.png`
- Focused shell comparison evidence: `C:\Users\wyh13\AppData\Local\Temp\codex-playwright\page-2026-08-21T18-28-07-233Z.png`
- Viewport: 1440 x 1000 CSS px, device scale factor 1.
- Source pixels: 1488 x 1038. Implementation pixels: 1440 x 1000. The comparison page scales both images to equal display widths; the review compares shell proportions and material hierarchy rather than dashboard-specific content.
- State: expanded sidebar, existing conversation, light theme. Additional browser checks covered collapsed sidebar/new conversation/light/English and expanded sidebar/existing conversation/dark/English; the initial expanded pass used Chinese chrome.
- State alignment note: the source is a generic dashboard rather than OpenAgent, so its charts, tables, labels, and navigation taxonomy are intentionally not treated as copy targets. The shared visual target is the desktop shell relationship named by the user: integrated top/sidebar chrome, a separately framed main canvas, and no shell divider lines.

**Findings**

- No actionable P0, P1, or P2 differences remain for the requested shell treatment.
- [P3] The reference sidebar occupies a larger proportion of its viewport. OpenAgent keeps its existing 220–360px resizable contract so compact conversation navigation and persisted direct manipulation remain unchanged.

**Required fidelity surfaces**

- Fonts and typography: Existing system UI typography, compact menu scale, weights, line height, truncation, and hierarchy remain intact. No new display font was introduced because the reference uses the same neutral system-sans character.
- Spacing and layout rhythm: The conversation canvas now has an 8px outer gutter below the 40px title bar, 12px corners, clipped content, and restrained elevation. The sidebar and title bar meet without perimeter lines. Expanded, collapsed, 1440 x 1000, and 1440 x 900 layouts remain stable.
- Colors and visual tokens: The shell continues to use `--app-chrome-bg`; the conversation canvas uses the existing `--surface` token in both themes. The light and dark captures preserve readable separation without a border.
- Image quality and asset fidelity: The reference contains no app-owned raster asset needed by this shell change. No placeholder, generated image, handcrafted SVG, or CSS illustration was added.
- Copy and content: English and Chinese application chrome render correctly. OpenAgent product copy and conversation fixtures intentionally replace the reference dashboard copy.

**Interaction and runtime evidence**

- Tested sidebar collapse and expand through the real preview control.
- Tested new-conversation and existing-conversation preview states.
- Checked light/dark themes and Chinese/English localization parameters.
- Checked the application preview console after rendering: no errors.
- The comparison-only local HTML emitted a missing-favicon request; it is not part of the application runtime.

**Comparison history**

- Initial review found a residual top border above the fixed Settings action, which weakened the borderless navigation treatment.
- Removed that border and captured the revised light expanded state.
- Post-fix full-view and focused comparisons show one continuous chrome region and a clearly separate rounded conversation canvas without shell divider lines.

**Implementation checklist**

- Keep title bar and sidebar on one uninterrupted chrome background.
- Keep chat framing owned by `ConversationSurface`.
- Preserve the 8px gutter, 12px clipping radius, and theme-aware surface/elevation.
- Preserve existing sidebar resizing, collapse persistence, title-bar controls, and conversation behavior.

**Follow-up polish**

- The accepted P3 sidebar-proportion difference can be revisited only if the product later changes its established 220–360px resizing contract.

final result: passed
