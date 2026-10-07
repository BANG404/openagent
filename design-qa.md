# Onboarding design QA

Use this checklist for the current first-run and embedding-resource repair
surfaces. Visual ownership lives in the
[design-system overview](.agents/skills/openagent-design-system/references/overview.md);
window and verification requirements live in
[startup windows](.agents/skills/openagent-desktop-host/references/startup-windows.md)
and [native verification](.agents/skills/openagent-desktop-host/references/native-verification.md).

## Current acceptance target

- The dedicated `OpenAgent Setup` window is a centered, frameless, fixed
  **840 × 560 logical pixels**, with resizing and maximizing disabled.
- The body uses a **34% brand/progress rail and 66% setup canvas**. The rail is
  image-free and shows numbered progress. Keep headings, form alignment, and
  footer actions within that compact canvas.
- The flow contains Welcome, Preferences, Model service, Default models, and
  Ready steps. The selected locale and theme apply throughout the flow.
- Full installers prepare the bundled embedding seed; lightweight installers
  download and verify it. A missing or corrupt resource reopens the final repair
  step even when onboarding was previously completed.
- The main application is revealed only after setup completes and the embedding
  resource is verified and loaded. A failed preparation remains actionable in
  the setup surface.

The implementation owners are `src/lib/components/OnboardingFlow.svelte` and
`src-tauri/src/desktop_windows/startup.rs`; resource lifecycle belongs to the SDK.
Use these committed sources and owner contracts as the comparison baseline.

## Verification procedure

1. Start a real debug desktop with a dedicated temporary `OPENAGENT_HOME`.
   Keep screenshots and logs in a task-specific system temporary directory.
2. Select the exact process, setup window, and Pilot socket. Verify title,
   logical client size, non-resizable state, and non-maximizable state; account
   for the display's DPI when comparing physical screenshot dimensions.
3. Exercise Continue, Back, completed-step navigation, locale/theme selection,
   workspace selection, provider connection and model loading, default-model
   selection, and internally scrolling content. Check footer visibility.
4. Capture all four light/dark and Chinese/English combinations. Check text
   clipping, rail proportions, focus states, shared control styling, and window
   material. Inspect the window error log.
5. Exercise resource readiness, download failure/retry, repair-only startup,
   and successful main-window handoff with isolated fixtures. Follow the owning
   resource contract for deterministic failure injection.
6. Record the commit, fixture, command, selected window, artifact paths, and
   assertions in the task handoff. State only results actually observed for that
   revision; a checklist is not a passing verification record.

Browser previews can supplement layout inspection through the workspace
[Playwright skill](.agents/skills/playwright/SKILL.md). They do not establish
native geometry, window behavior, or resource handoff. Keep historical captures
outside the repository and do not use another developer's absolute cache paths
as reusable evidence.
